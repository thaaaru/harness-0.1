import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import type { AppSnapshot } from "../src/domain.js";
import type { AppDiscoverer, DiscoveryRequest } from "../src/discovery/contracts.js";
import { RunRepository } from "../src/storage/run-repository.js";
import { HarnessWorkflow } from "../src/workflow/harness-workflow.js";

class FakeDiscoverer implements AppDiscoverer {
  requests: DiscoveryRequest[] = [];

  async discover(request: DiscoveryRequest): Promise<AppSnapshot> {
    this.requests.push(request);
    return {
      id: randomUUID(),
      targetUrl: request.targetUrl,
      discoveredAt: new Date().toISOString(),
      warnings: [],
      pages: [
        {
          url: request.targetUrl,
          path: "/",
          title: "Example application",
          headings: ["Welcome"],
          controls: [
            { kind: "textbox", label: "Email", disabled: false, inputType: "email" },
            { kind: "textbox", label: "Password", disabled: false, inputType: "password" },
          ],
          links: [],
          consoleErrors: [],
          pageErrors: [],
          fingerprint: "fixture-fingerprint",
        },
      ],
    };
  }
}

describe("HarnessWorkflow", () => {
  const resources: Array<{ workflow: HarnessWorkflow; repository: RunRepository; directory: string }> = [];

  afterEach(async () => {
    for (const resource of resources.splice(0)) {
      resource.workflow.close();
      resource.repository.close();
      await rm(resource.directory, { recursive: true, force: true });
    }
  });

  it("persists discovery and pauses until the plan is explicitly approved", async () => {
    const directory = await mkdtemp(join(tmpdir(), "harness-workflow-"));
    const databasePath = join(directory, "harness.sqlite");
    const repository = new RunRepository(databasePath);
    const discoverer = new FakeDiscoverer();
    const workflow = new HarnessWorkflow({ databasePath, repository, discoverer });
    resources.push({ workflow, repository, directory });

    const pending = await workflow.start({
      targetUrl: "https://staging.example.test",
      goal: "Verify a user can sign in and create a draft order.",
      artifactsDirectory: join(directory, "artifacts"),
      policy: {
        allowedOrigins: [],
        maxPages: 5,
        maxControlsPerPage: 20,
        maxLinksPerPage: 20,
        allowInsecureHttp: false,
      },
    });

    expect(pending.status).toBe("awaiting_approval");
    expect(pending.plan?.steps.some((step) => step.requiresApproval)).toBe(true);
    expect(discoverer.requests).toHaveLength(1);
    expect(repository.getSnapshot(pending.runId)?.pages).toHaveLength(1);

    const approved = await workflow.approve(pending.runId, "test-operator", "The test scope is safe.");
    expect(approved.status).toBe("ready_to_execute");
    expect(repository.getRun(pending.runId).approval?.decision).toBe("approved");
    expect(repository.listEvents(pending.runId).map((event) => event.type)).toContain("plan_approved");
  });
});
