import "dotenv/config";

import { resolve } from "node:path";
import { Command } from "commander";

import { PlaywrightAppDiscoverer } from "./discovery/playwright-app-discoverer.js";
import { RunRepository } from "./storage/run-repository.js";
import { HarnessWorkflow, type WorkflowResult } from "./workflow/harness-workflow.js";

const program = new Command();
program.name("harness").description("Governed AI-assisted Playwright test automation harness.");

program
  .command("discover")
  .description("Discover an application and generate a reviewable test plan without executing it.")
  .requiredOption("--url <url>", "application URL")
  .requiredOption("--goal <goal>", "test objective")
  .option("--allow-origin <origin...>", "additional permitted origins", [])
  .option("--max-pages <count>", "maximum routes to inspect", parsePositiveInteger, 10)
  .option("--allow-insecure-http", "permit HTTP for a local or isolated test environment", false)
  .option("--database <path>", "SQLite database path", "data/harness.sqlite")
  .option("--artifacts <path>", "artifact directory", "artifacts")
  .action(async (options) => {
    await withWorkflow(options.database, async (workflow) => {
      const result = await workflow.start({
        targetUrl: options.url,
        goal: options.goal,
        artifactsDirectory: resolve(options.artifacts),
        policy: {
          allowedOrigins: options.allowOrigin,
          maxPages: options.maxPages,
          allowInsecureHttp: options.allowInsecureHttp,
        },
      });
      printResult(result);
    });
  });

program
  .command("approve <runId>")
  .description("Approve a persisted test plan. This does not yet execute browser actions.")
  .option("--approver <name>", "approval actor", "local-operator")
  .option("--note <note>", "approval note")
  .option("--database <path>", "SQLite database path", "data/harness.sqlite")
  .action(async (runId, options) => {
    await withWorkflow(options.database, async (workflow) => {
      printResult(await workflow.approve(runId, options.approver, options.note));
    });
  });

program
  .command("reject <runId>")
  .description("Reject a persisted test plan before browser execution.")
  .option("--approver <name>", "approval actor", "local-operator")
  .option("--note <note>", "rejection note")
  .option("--database <path>", "SQLite database path", "data/harness.sqlite")
  .action(async (runId, options) => {
    await withWorkflow(options.database, async (workflow) => {
      printResult(await workflow.reject(runId, options.approver, options.note));
    });
  });

program
  .command("status <runId>")
  .description("Show a run, its app snapshot, and its approved or pending test plan.")
  .option("--database <path>", "SQLite database path", "data/harness.sqlite")
  .action(async (runId, options) => {
    await withWorkflow(options.database, async (workflow) => {
      printResult(workflow.getResult(runId));
    });
  });

void program.parseAsync();

async function withWorkflow<T>(
  databasePath: string,
  action: (workflow: HarnessWorkflow) => Promise<T>,
): Promise<T> {
  const resolvedDatabasePath = resolve(databasePath);
  const repository = new RunRepository(resolvedDatabasePath);
  const workflow = new HarnessWorkflow({
    databasePath: resolvedDatabasePath,
    repository,
    discoverer: new PlaywrightAppDiscoverer(),
  });

  try {
    return await action(workflow);
  } finally {
    workflow.close();
    repository.close();
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error("Expected a positive integer.");
  }
  return parsed;
}

function printResult(result: WorkflowResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
