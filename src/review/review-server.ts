import { createServer } from "node:http";

import type { BrandConfig } from "../brand.js";
import { reportUsageEvent } from "../licensing/activate.js";
import type { LicensePayload } from "../licensing/verify-license.js";
import type { HarnessWorkflow, WorkflowResult } from "../workflow/harness-workflow.js";
import { openInBrowser } from "./browser.js";
import {
  renderApprovedPage,
  renderRejectedPage,
  renderResultsPage,
  renderReviewPage,
} from "./review-html.js";

export type InteractiveReviewOptions = {
  workflow: HarnessWorkflow;
  result: WorkflowResult;
  brand: BrandConfig;
  license: LicensePayload;
  controlPlaneUrl: string;
  onStatus: (message: string) => void;
};

/**
 * Opens a browser-based review UI for a discovered run and resolves once the
 * QA reviewer has approved+executed or rejected it. Bound to 127.0.0.1 only
 * — this never needs to be reachable from outside the machine.
 */
export function runInteractiveReview(options: InteractiveReviewOptions): Promise<WorkflowResult> {
  const { workflow, brand, license, controlPlaneUrl, onStatus } = options;
  let current = options.result;

  return new Promise((resolvePromise, rejectPromise) => {
    const server = createServer((request, response) => {
      void handleRequest(request, response).catch((error: unknown) => {
        response.writeHead(500, { "content-type": "text/plain" });
        response.end(String(error));
      });
    });

    async function handleRequest(
      request: import("node:http").IncomingMessage,
      response: import("node:http").ServerResponse,
    ): Promise<void> {
      if (request.method === "GET" && request.url === "/") {
        respondHtml(response, renderReviewPage(current, brand));
        return;
      }

      if (request.method === "POST" && request.url === "/approve") {
        const body = await readJsonBody(request);
        current = await workflow.approve(current.runId, body.approver ?? "QA reviewer");
        onStatus(`Approved by ${body.approver ?? "QA reviewer"}.`);
        respondHtml(response, renderApprovedPage(current, brand));
        return;
      }

      if (request.method === "POST" && request.url === "/reject") {
        const body = await readJsonBody(request);
        current = await workflow.reject(current.runId, body.approver ?? "QA reviewer");
        onStatus("Rejected. No checks were executed.");
        respondHtml(response, renderRejectedPage(current, brand));
        closeAndResolve();
        return;
      }

      if (request.method === "POST" && request.url === "/execute") {
        onStatus("Running checks…");
        current = await workflow.execute(current.runId, {});
        reportUsageEvent(controlPlaneUrl, { runId: current.runId, orgId: license.orgId, kind: "execute" });
        const passed = current.execution?.checks.filter((check) => check.status === "passed").length ?? 0;
        const total = current.execution?.checks.length ?? 0;
        onStatus(`${passed} of ${total} check(s) passed.`);
        respondHtml(response, renderResultsPage(current, brand));
        closeAndResolve();
        return;
      }

      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
    }

    function closeAndResolve(): void {
      server.close();
      resolvePromise(current);
    }

    server.on("error", rejectPromise);

    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        rejectPromise(new Error("Failed to determine the review server's port."));
        return;
      }
      const url = `http://127.0.0.1:${address.port}/`;
      onStatus(`Opening review in your browser: ${url}`);
      openInBrowser(url);
    });
  });
}

function respondHtml(response: import("node:http").ServerResponse, html: string): void {
  response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  response.end(html);
}

async function readJsonBody(request: import("node:http").IncomingMessage): Promise<{ approver?: string }> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(chunk as Buffer);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) {
    return {};
  }
  try {
    return JSON.parse(raw) as { approver?: string };
  } catch {
    return {};
  }
}
