import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join, resolve } from "node:path";

import type { BrandConfig } from "../brand.js";
import { reportUsageEvent } from "../licensing/activate.js";
import type { LicensePayload } from "../licensing/verify-license.js";
import { renderReportHtml, renderReportPdf } from "../reporting/report.js";
import type { HarnessWorkflow, WorkflowResult } from "../workflow/harness-workflow.js";
import { openInBrowser } from "./browser.js";
import { renderApprovedPage, renderRejectedPage, renderReviewPage } from "./review-html.js";

export type InteractiveReviewOptions = {
  workflow: HarnessWorkflow;
  result: WorkflowResult;
  brand: BrandConfig;
  license: LicensePayload;
  controlPlaneUrl: string;
  onStatus: (message: string) => void;
};

// Report/PDF links are same-origin http:// (not file://, which browsers
// block from an http:// page), so the server has to stay up briefly after
// the run completes. Closes shortly after a report link is actually used,
// or after this grace window if neither is.
const DEFAULT_CLOSE_GRACE_MS = 20_000;
const POST_LINK_CLOSE_GRACE_MS = 2_000;

/**
 * Opens a browser-based review UI for a discovered run and resolves once the
 * QA reviewer has approved+executed or rejected it. Bound to 127.0.0.1 only
 * — this never needs to be reachable from outside the machine.
 */
export function runInteractiveReview(options: InteractiveReviewOptions): Promise<WorkflowResult> {
  const { workflow, brand, license, controlPlaneUrl, onStatus } = options;
  let current = options.result;
  let reportHtmlPath: string | undefined;
  let reportPdfPath: string | undefined;

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

      if (request.method === "GET" && request.url === "/execute-stream") {
        response.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        });
        const send = (event: string, data: unknown): void => {
          response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
        };

        onStatus("Running checks…");
        current = await workflow.execute(current.runId, {
          onCheckStart: (page) => send("check-start", { url: page.url }),
          onCheckComplete: (check) =>
            send("check-complete", { url: check.url, status: check.status, error: check.error }),
        });
        reportUsageEvent(controlPlaneUrl, { runId: current.runId, orgId: license.orgId, kind: "execute" });

        const artifactsDirectory = resolve(`artifacts/${current.runId}`);
        mkdirSync(artifactsDirectory, { recursive: true });
        const html = renderReportHtml(current, brand);
        reportHtmlPath = join(artifactsDirectory, "report.html");
        writeFileSync(reportHtmlPath, html);
        reportPdfPath = join(artifactsDirectory, "report.pdf");
        await renderReportPdf(html, reportPdfPath);

        const passed = current.execution?.checks.filter((check) => check.status === "passed").length ?? 0;
        const total = current.execution?.checks.length ?? 0;
        onStatus(`${passed} of ${total} check(s) passed.`);
        onStatus("Report saved to:");
        onStatus(`  ${reportHtmlPath}`);
        onStatus(`  ${reportPdfPath}`);
        onStatus("(the browser links stay live for a few more seconds)");

        send("done", { passed, total, status: current.status });
        response.end();
        scheduleClose(DEFAULT_CLOSE_GRACE_MS);
        return;
      }

      if (request.method === "GET" && request.url === "/report.html" && reportHtmlPath) {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        response.end(readFileSync(reportHtmlPath));
        scheduleClose(POST_LINK_CLOSE_GRACE_MS);
        return;
      }

      if (request.method === "GET" && request.url === "/report.pdf" && reportPdfPath) {
        response.writeHead(200, { "content-type": "application/pdf" });
        response.end(readFileSync(reportPdfPath));
        scheduleClose(POST_LINK_CLOSE_GRACE_MS);
        return;
      }

      response.writeHead(404, { "content-type": "text/plain" });
      response.end("Not found");
    }

    let closeTimer: ReturnType<typeof setTimeout> | undefined;

    function scheduleClose(delayMs: number): void {
      if (closeTimer) {
        clearTimeout(closeTimer);
      }
      closeTimer = setTimeout(closeAndResolve, delayMs);
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
