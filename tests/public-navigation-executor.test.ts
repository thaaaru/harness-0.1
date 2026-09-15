import { mkdtemp, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import type { AppSnapshot, TargetPolicy } from "../src/domain.js";
import { PlaywrightNavigationExecutor } from "../src/execution/public-navigation-executor.js";

function listen(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
}

describe("PlaywrightNavigationExecutor", () => {
  it("uses only GET navigation and read-only assertions", async () => {
    const methods: string[] = [];
    const paths: string[] = [];
    const server = createServer((request, response) => {
      methods.push(request.method ?? "");
      paths.push(new URL(request.url ?? "/", "http://fixture.test").pathname);
      response.writeHead(200, { "content-type": "text/html" });
      response.end(
        '<!doctype html><title>Read-only example</title><h1>Welcome</h1><img src="/delete"><form method=post><button>Submit</button></form>',
      );
    });
    const directory = await mkdtemp(join(tmpdir(), "harness-executor-"));

    try {
      await listen(server);
      const { port } = server.address() as AddressInfo;
      const origin = `http://127.0.0.1:${port}`;
      const snapshot: AppSnapshot = {
        id: "00000000-0000-4000-8000-000000000001",
        targetUrl: `${origin}/`,
        discoveredAt: "2026-01-01T00:00:00.000Z",
        warnings: [],
        pages: [
          {
            url: `${origin}/`,
            path: "/",
            title: "Read-only example",
            headings: ["Welcome"],
            controls: [],
            links: [],
            consoleErrors: [],
            pageErrors: [],
            fingerprint: "fixture",
          },
        ],
      };
      const policy: TargetPolicy = {
        allowedOrigins: [origin],
        maxPages: 1,
        maxControlsPerPage: 20,
        maxLinksPerPage: 20,
        allowInsecureHttp: true,
      };

      const result = await new PlaywrightNavigationExecutor().execute({
        runId: "00000000-0000-4000-8000-000000000002",
        snapshot,
        policy,
        artifactsDirectory: directory,
      });

      expect(result.status).toBe("passed");
      expect(result.checks).toHaveLength(1);
      expect(methods).not.toHaveLength(0);
      expect(methods.every((method) => method === "GET")).toBe(true);
      expect(paths).not.toContain("/delete");
      expect((await stat(join(directory, result.runId, "execution", "home.png"))).isFile()).toBe(true);
    } finally {
      await close(server);
      await rm(directory, { recursive: true, force: true });
    }
  });
});
