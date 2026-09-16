import { createInterface } from "node:readline/promises";

import type { WorkflowResult } from "../workflow/harness-workflow.js";

/** Prints everything discovery found as readable text — no screenshots, no browser. */
export function printDiscoverySummary(result: WorkflowResult): void {
  const pages = result.snapshot?.pages ?? [];
  process.stdout.write(`\nDiscovered ${pages.length} page(s):\n`);

  for (const page of pages) {
    process.stdout.write(`\n- ${page.title}\n`);
    process.stdout.write(`  ${page.url}\n`);
    if (page.headings.length > 0) {
      process.stdout.write(`  Headings: ${page.headings.join(", ")}\n`);
    }
    process.stdout.write(`  ${page.controls.length} control(s), ${page.links.length} link(s)\n`);
    const errors = [...page.consoleErrors, ...page.pageErrors];
    if (errors.length > 0) {
      process.stdout.write(`  ${errors.length} console/page error(s): ${errors.join("; ")}\n`);
    }
  }

  if (result.plan) {
    process.stdout.write(`\nPlan: ${result.plan.summary}\n`);
    for (const step of result.plan.steps) {
      const approval = step.requiresApproval ? " [requires approval]" : "";
      process.stdout.write(`  - (${step.risk}) ${step.title}${approval}\n`);
    }
  }
}

export type ReviewDecision = { approved: boolean; approver: string };

export async function promptApproval(defaultApprover: string): Promise<ReviewDecision> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const decision = (await rl.question("\nApprove this plan and run the checks? [y/N] "))
      .trim()
      .toLowerCase();
    if (decision !== "y" && decision !== "yes") {
      return { approved: false, approver: defaultApprover };
    }
    const approverInput = (await rl.question(`Your name [${defaultApprover}]: `)).trim();
    return { approved: true, approver: approverInput || defaultApprover };
  } catch {
    // stdin closed/aborted mid-prompt (e.g. Ctrl+D) — fail closed rather
    // than crash with a raw stack trace.
    process.stdout.write("\nNo response received.\n");
    return { approved: false, approver: defaultApprover };
  } finally {
    rl.close();
  }
}
