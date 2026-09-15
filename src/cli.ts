#!/usr/bin/env node

import "dotenv/config";

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Command } from "commander";

import { PlaywrightAppDiscoverer } from "./discovery/playwright-app-discoverer.js";
import { RunRepository } from "./storage/run-repository.js";
import { HarnessWorkflow, type WorkflowResult } from "./workflow/harness-workflow.js";

const program = new Command();
program.name("tekassure").description("TekLab governed AI-assisted Playwright test automation.");

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
  .option("--headless <boolean>", "run Chromium headlessly (true or false)", parseBoolean, true)
  .action(async (options) => {
    await withWorkflow(options.database, async (workflow) => {
      const result = await workflow.start({
        targetUrl: options.url,
        goal: options.goal,
        artifactsDirectory: resolve(options.artifacts),
        headless: options.headless,
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
  .description("Approve a persisted test plan. Run the constrained read-only checks separately with execute.")
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
  .command("execute <runId>")
  .description("Execute the approved plan using only constrained read-only GET navigation and assertions.")
  .option("--database <path>", "SQLite database path", "data/harness.sqlite")
  .option(
    "--headless <boolean>",
    "override the run's Chromium headless setting (true or false)",
    parseBoolean,
  )
  .action(async (runId, options) => {
    await withWorkflow(options.database, async (workflow) => {
      printResult(await workflow.execute(runId, { headless: options.headless }));
    });
  });

program
  .command("install-browser")
  .description("Install the matching Chromium browser used by TekAssure.")
  .action(async () => {
    await installChromium();
  });

program
  .command("status <runId>")
  .description("Show a run, its app snapshot, test plan, and any execution result.")
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

function parseBoolean(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  throw new Error("Expected true or false.");
}

async function installChromium(): Promise<void> {
  const require = createRequire(import.meta.url);
  const playwrightPackagePath = require.resolve("playwright/package.json");
  const playwrightCliPath = resolve(dirname(playwrightPackagePath), "cli.js");
  const processHandle = spawn(process.execPath, [playwrightCliPath, "install", "chromium"], {
    stdio: "inherit",
  });

  await new Promise<void>((resolveInstall, reject) => {
    processHandle.once("error", reject);
    processHandle.once("exit", (code) => {
      if (code === 0) {
        resolveInstall();
        return;
      }
      reject(new Error(`Chromium installation exited with code ${code ?? "unknown"}.`));
    });
  });
}

function printResult(result: WorkflowResult): void {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
