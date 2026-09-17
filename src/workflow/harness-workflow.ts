import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

import { resolveGoal } from "../goal-presets.js";

import {
  ApprovalDecisionSchema,
  HarnessRunInputSchema,
  type ApprovalDecision,
  type AppSnapshot,
  type HarnessRunInput,
  type RunRecord,
  type RunStatus,
  type ExecutionResult,
  type NavigationCheck,
  type PageSnapshot,
  type TestPlan,
} from "../domain.js";
import type { AppDiscoverer } from "../discovery/contracts.js";
import {
  PlaywrightNavigationExecutor,
  type NavigationExecutor,
} from "../execution/public-navigation-executor.js";
import { runLighthouseAudit } from "../lighthouse/lighthouse-audit.js";
import { HeuristicTestPlanner, type TestPlanner } from "../planning/heuristic-planner.js";
import { RunRepository } from "../storage/run-repository.js";

export type HarnessWorkflowDependencies = {
  repository: RunRepository;
  discoverer: AppDiscoverer;
  planner?: TestPlanner;
  executor?: NavigationExecutor;
  /** Injectable for tests — defaults to the real runLighthouseAudit. */
  lighthouseAuditor?: typeof runLighthouseAudit;
};

export type WorkflowResult = {
  runId: string;
  status: RunStatus;
  plan?: TestPlan;
  snapshot?: AppSnapshot;
  execution?: ExecutionResult;
};

export type ExecutionOptions = {
  headless?: boolean;
  onCheckStart?: (page: PageSnapshot) => void;
  onCheckComplete?: (check: NavigationCheck) => void;
};

const DISCOVER_MAX_ATTEMPTS = 2;

/**
 * Runs discover -> plan -> (pause for approval) -> finish as a plain
 * sequence of calls against RunRepository, which is the single source of
 * truth for run state. There is no separate orchestration engine or
 * checkpoint store: every step below persists its own state transition
 * directly, and approve()/reject() resume purely by reading the persisted
 * run back out of the repository.
 */
export class HarnessWorkflow {
  private readonly planner: TestPlanner;
  private readonly executor: NavigationExecutor;
  private readonly lighthouseAuditor: typeof runLighthouseAudit;

  constructor(private readonly dependencies: HarnessWorkflowDependencies) {
    this.planner = dependencies.planner ?? new HeuristicTestPlanner();
    this.executor = dependencies.executor ?? new PlaywrightNavigationExecutor();
    this.lighthouseAuditor = dependencies.lighthouseAuditor ?? runLighthouseAudit;
  }

  async start(rawInput: unknown): Promise<WorkflowResult> {
    const parsedInput = HarnessRunInputSchema.parse(rawInput);
    const input = { ...parsedInput, goal: resolveGoal(parsedInput.goal).text };
    if (input.storageStatePath && !existsSync(input.storageStatePath)) {
      throw new Error(`Storage state file not found: ${input.storageStatePath}`);
    }
    const runId = randomUUID();
    const now = new Date().toISOString();

    this.dependencies.repository.createRun({ id: runId, input, status: "discovering", createdAt: now });
    this.dependencies.repository.appendEvent(
      runId,
      "run_started",
      { targetUrl: input.targetUrl, goal: input.goal },
      now,
    );

    try {
      const snapshot = await this.discover(runId, input);
      const plan = await this.plan(runId, input, snapshot);
      return { runId, status: "awaiting_approval", plan, snapshot };
    } catch (error) {
      this.markFailed(runId, error);
      throw error;
    }
  }

  async approve(runId: string, approver: string, note?: string): Promise<WorkflowResult> {
    const run = this.dependencies.repository.getRun(runId);
    if (run.status !== "awaiting_approval") {
      throw new Error(
        `Run ${runId} is ${run.status}; only awaiting_approval runs can be approved or rejected.`,
      );
    }

    const approval = ApprovalDecisionSchema.parse({
      decision: "approved",
      approver,
      note,
      decidedAt: new Date().toISOString(),
    });
    return this.finalizeApproval(runId, approval);
  }

  async reject(runId: string, approver: string, note?: string): Promise<WorkflowResult> {
    const run = this.dependencies.repository.getRun(runId);
    if (run.status !== "awaiting_approval") {
      throw new Error(
        `Run ${runId} is ${run.status}; only awaiting_approval runs can be approved or rejected.`,
      );
    }

    const approval = ApprovalDecisionSchema.parse({
      decision: "rejected",
      approver,
      note,
      decidedAt: new Date().toISOString(),
    });
    return this.finalizeApproval(runId, approval);
  }

  async execute(runId: string, options: ExecutionOptions = {}): Promise<WorkflowResult> {
    const run = this.dependencies.repository.getRun(runId);
    const retryingApprovedFailure = run.status === "failed" && run.approval?.decision === "approved";
    if (run.status !== "ready_to_execute" && !retryingApprovedFailure) {
      throw new Error(
        `Run ${runId} is ${run.status}; only approved runs that are ready or previously failed can be executed.`,
      );
    }

    const snapshot = this.dependencies.repository.getSnapshot(runId);
    if (!snapshot || snapshot.pages.length === 0) {
      throw new Error(`Run ${runId} has no discovered pages to execute.`);
    }

    const headless = options.headless ?? run.input.headless;

    const startedAt = new Date().toISOString();
    this.dependencies.repository.updateStatus(runId, "executing", startedAt);
    this.dependencies.repository.appendEvent(
      runId,
      "execution_started",
      {
        mode: "approved_read_only_navigation",
        pageCount: snapshot.pages.length,
        headless,
      },
      startedAt,
    );

    try {
      const [execution, lighthouse] = await Promise.all([
        this.executor.execute({
          runId,
          snapshot,
          policy: run.input.policy,
          artifactsDirectory: run.input.artifactsDirectory,
          storageStatePath: run.input.storageStatePath,
          headless,
          onCheckStart: options.onCheckStart,
          onCheckComplete: options.onCheckComplete,
        }),
        this.lighthouseAuditor(snapshot.targetUrl),
      ]);
      if (lighthouse) {
        execution.lighthouse = lighthouse;
      }
      const completedAt = new Date().toISOString();
      this.dependencies.repository.saveExecution(runId, execution, completedAt);
      this.dependencies.repository.updateStatus(runId, execution.status, completedAt);
      this.dependencies.repository.appendEvent(
        runId,
        "execution_completed",
        {
          status: execution.status,
          checkedPageCount: execution.checks.length,
          failedPageCount: execution.checks.filter((check) => check.status === "failed").length,
        },
        completedAt,
      );

      return {
        runId,
        status: execution.status,
        plan: this.dependencies.repository.getPlan(runId),
        snapshot,
        execution,
      };
    } catch (error) {
      this.markFailed(runId, error);
      throw error;
    }
  }

  getResult(runId: string): WorkflowResult {
    const run = this.dependencies.repository.getRun(runId);
    return {
      runId,
      status: run.status,
      plan: this.dependencies.repository.getPlan(runId),
      snapshot: this.dependencies.repository.getSnapshot(runId),
      execution: this.dependencies.repository.getExecution(runId),
    };
  }

  getRun(runId: string): RunRecord {
    return this.dependencies.repository.getRun(runId);
  }

  close(): void {
    // No separate engine/checkpoint store to close — RunRepository owns
    // the only database connection, closed independently by the caller.
  }

  private async discover(runId: string, input: HarnessRunInput): Promise<AppSnapshot> {
    const now = new Date().toISOString();
    this.dependencies.repository.updateStatus(runId, "discovering", now);

    let lastError: unknown;
    for (let attempt = 1; attempt <= DISCOVER_MAX_ATTEMPTS; attempt += 1) {
      try {
        const snapshot = await this.dependencies.discoverer.discover({
          runId,
          targetUrl: input.targetUrl,
          policy: input.policy,
          artifactsDirectory: input.artifactsDirectory,
          storageStatePath: input.storageStatePath,
          headless: input.headless,
        });

        this.dependencies.repository.saveSnapshot(runId, snapshot, new Date().toISOString());
        this.dependencies.repository.appendEvent(
          runId,
          "app_discovered",
          { pageCount: snapshot.pages.length, warningCount: snapshot.warnings.length },
          new Date().toISOString(),
        );
        this.dependencies.repository.updateStatus(runId, "planning", new Date().toISOString());
        return snapshot;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  private async plan(runId: string, input: HarnessRunInput, snapshot: AppSnapshot): Promise<TestPlan> {
    const plan = await this.planner.createPlan({ runId, goal: input.goal, snapshot });
    const now = new Date().toISOString();
    this.dependencies.repository.savePlan(runId, plan, now);
    this.dependencies.repository.updateStatus(runId, "awaiting_approval", now);
    this.dependencies.repository.appendEvent(
      runId,
      "plan_ready_for_approval",
      { planId: plan.id, stepCount: plan.steps.length },
      now,
    );
    return plan;
  }

  private finalizeApproval(runId: string, approval: ApprovalDecision): WorkflowResult {
    let now = new Date().toISOString();
    this.dependencies.repository.saveApproval(runId, approval, now);
    this.dependencies.repository.appendEvent(
      runId,
      approval.decision === "approved" ? "plan_approved" : "plan_rejected",
      { approver: approval.approver, note: approval.note },
      now,
    );

    const status: RunStatus = approval.decision === "approved" ? "ready_to_execute" : "rejected";
    now = new Date().toISOString();
    this.dependencies.repository.updateStatus(runId, status, now);
    this.dependencies.repository.appendEvent(
      runId,
      status === "ready_to_execute" ? "execution_available" : "run_closed",
      status === "ready_to_execute"
        ? { reason: "The approved plan is ready for constrained read-only navigation execution." }
        : { reason: "The test plan was rejected before execution." },
      now,
    );

    return {
      runId,
      status,
      plan: this.dependencies.repository.getPlan(runId),
      snapshot: this.dependencies.repository.getSnapshot(runId),
    };
  }

  private markFailed(runId: string, error: unknown): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    this.dependencies.repository.updateStatus(runId, "failed", now);
    this.dependencies.repository.appendEvent(runId, "run_failed", { message }, now);
  }
}
