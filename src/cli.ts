#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { Command } from "commander";
import { config as loadDotenv } from "dotenv";

import { WEB_APP_BASELINE_PRESET } from "./goal-presets.js";

import { loadBrandConfig } from "./brand.js";
import { PlaywrightAppDiscoverer } from "./discovery/playwright-app-discoverer.js";
import { activateLicense, reportUsageEvent, requireValidLicense } from "./licensing/activate.js";
import { LicenseError, type LicensePayload } from "./licensing/verify-license.js";
import { RunRepository } from "./storage/run-repository.js";
import { HarnessWorkflow, type WorkflowResult } from "./workflow/harness-workflow.js";

// Runs after all imports resolve; none of them read env vars at import time
// (only inside function bodies called below), so loading .env here — quietly,
// since printResult() writes JSON to the same stdout — is safe.
loadDotenv({ quiet: true });

const brand = loadBrandConfig();
const CONTROL_PLANE_URL = process.env.TEKASSURE_CONTROL_PLANE_URL ?? "https://license.teklab.dev";

const program = new Command();
program
  .name(brand.cliDisplayName)
  .description(`${brand.productName} governed AI-assisted Playwright test automation.`);

program
  .command("license")
  .description("Manage the local TekAssure license.")
  .command("activate <key>")
  .description("Activate a license key issued by the control plane.")
  .action(async (key: string) => {
    await withLicenseErrorHandling(async () => {
      const stored = await activateLicense(key, CONTROL_PLANE_URL);
      process.stdout.write(
        `License ${stored.payload.licenseId} activated for org ${stored.payload.orgId}.\n`,
      );
    });
  });

program
  .command("discover")
  .description("Discover an application and generate a reviewable test plan without executing it.")
  .requiredOption("--url <url>", "application URL")
  .option("--goal <goal>", "test objective", WEB_APP_BASELINE_PRESET)
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
    await withWorkflow(options.database, async (workflow, license) => {
      const result = await workflow.execute(runId, { headless: options.headless });
      reportUsageEvent(CONTROL_PLANE_URL, { runId, orgId: license.orgId, kind: "execute" });
      printResult(result);
    });
  });

program
  .command("install-browser")
  .description(`Install the matching Chromium browser used by ${brand.productName}.`)
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

void program.parseAsync().catch((error: unknown) => {
  if (error instanceof LicenseError) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

async function withLicenseErrorHandling(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (error instanceof LicenseError) {
      process.stderr.write(`${error.message}\n`);
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

async function withWorkflow<T>(
  databasePath: string,
  action: (workflow: HarnessWorkflow, license: LicensePayload) => Promise<T>,
): Promise<T> {
  const license = await requireValidLicense();

  const resolvedDatabasePath = resolve(databasePath);
  const repository = new RunRepository(resolvedDatabasePath);
  const workflow = new HarnessWorkflow({
    databasePath: resolvedDatabasePath,
    repository,
    discoverer: new PlaywrightAppDiscoverer(),
  });

  try {
    return await action(workflow, license);
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
