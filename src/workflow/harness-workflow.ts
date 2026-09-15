import { randomUUID } from "node:crypto";

import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";

import {
  ApprovalDecisionSchema,
  HarnessRunInputSchema,
  type ApprovalDecision,
  type ApprovalRequest,
  type AppSnapshot,
  type HarnessRunInput,
  type RunStatus,
  type TestPlan,
} from "../domain.js";
import type { AppDiscoverer } from "../discovery/contracts.js";
import { HeuristicTestPlanner, type TestPlanner } from "../planning/heuristic-planner.js";
import { RunRepository } from "../storage/run-repository.js";

const HarnessState = Annotation.Root({
  runId: Annotation<string>,
  input: Annotation<HarnessRunInput>,
  snapshot: Annotation<AppSnapshot | undefined>,
  plan: Annotation<TestPlan | undefined>,
  status: Annotation<RunStatus>,
  approval: Annotation<ApprovalDecision | undefined>,
});

type WorkflowState = typeof HarnessState.State;

export type HarnessWorkflowDependencies = {
  databasePath: string;
  repository: RunRepository;
  discoverer: AppDiscoverer;
  planner?: TestPlanner;
};

export type WorkflowResult = {
  runId: string;
  status: RunStatus;
  plan?: TestPlan;
  snapshot?: AppSnapshot;
};

export class HarnessWorkflow {
  private readonly planner: TestPlanner;
  private readonly checkpointer: SqliteSaver;
  private readonly graph: ReturnType<typeof createGraph>;

  constructor(private readonly dependencies: HarnessWorkflowDependencies) {
    this.planner = dependencies.planner ?? new HeuristicTestPlanner();
    this.checkpointer = SqliteSaver.fromConnString(dependencies.databasePath);
    this.graph = createGraph(this);
  }

  async start(rawInput: unknown): Promise<WorkflowResult> {
    const input = HarnessRunInputSchema.parse(rawInput);
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
      const result = await this.graph.invoke(
        { runId, input, status: "discovering" },
        { configurable: { thread_id: runId } },
      );
      return toWorkflowResult(result);
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
    return this.resume(runId, approval);
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
    return this.resume(runId, approval);
  }

  getResult(runId: string): WorkflowResult {
    const run = this.dependencies.repository.getRun(runId);
    return {
      runId,
      status: run.status,
      plan: this.dependencies.repository.getPlan(runId),
      snapshot: this.dependencies.repository.getSnapshot(runId),
    };
  }

  close(): void {
    this.checkpointer.db.close();
  }

  private async discover(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const now = new Date().toISOString();
    this.dependencies.repository.updateStatus(state.runId, "discovering", now);

    const snapshot = await this.dependencies.discoverer.discover({
      runId: state.runId,
      targetUrl: state.input.targetUrl,
      policy: state.input.policy,
      artifactsDirectory: state.input.artifactsDirectory,
    });

    this.dependencies.repository.saveSnapshot(state.runId, snapshot, new Date().toISOString());
    this.dependencies.repository.appendEvent(
      state.runId,
      "app_discovered",
      { pageCount: snapshot.pages.length, warningCount: snapshot.warnings.length },
      new Date().toISOString(),
    );
    this.dependencies.repository.updateStatus(state.runId, "planning", new Date().toISOString());

    return { snapshot, status: "planning" };
  }

  private async plan(state: WorkflowState): Promise<Partial<WorkflowState>> {
    if (!state.snapshot) {
      throw new Error("Cannot plan without an app snapshot.");
    }

    const plan = await this.planner.createPlan({
      runId: state.runId,
      goal: state.input.goal,
      snapshot: state.snapshot,
    });
    const now = new Date().toISOString();
    this.dependencies.repository.savePlan(state.runId, plan, now);
    this.dependencies.repository.updateStatus(state.runId, "awaiting_approval", now);
    this.dependencies.repository.appendEvent(
      state.runId,
      "plan_ready_for_approval",
      { planId: plan.id, stepCount: plan.steps.length },
      now,
    );

    return { plan, status: "awaiting_approval" };
  }

  private async requestApproval(state: WorkflowState): Promise<Partial<WorkflowState>> {
    if (!state.plan) {
      throw new Error("Cannot request approval without a test plan.");
    }

    const request: ApprovalRequest = { type: "test_plan_approval", runId: state.runId, plan: state.plan };
    const approval = ApprovalDecisionSchema.parse(interrupt<ApprovalRequest, ApprovalDecision>(request));
    const now = new Date().toISOString();

    this.dependencies.repository.saveApproval(state.runId, approval, now);
    this.dependencies.repository.appendEvent(
      state.runId,
      approval.decision === "approved" ? "plan_approved" : "plan_rejected",
      { approver: approval.approver, note: approval.note },
      now,
    );

    return { approval, status: approval.decision === "approved" ? "ready_to_execute" : "rejected" };
  }

  private async finish(state: WorkflowState): Promise<Partial<WorkflowState>> {
    const status = state.approval?.decision === "approved" ? "ready_to_execute" : "rejected";
    const now = new Date().toISOString();
    this.dependencies.repository.updateStatus(state.runId, status, now);
    this.dependencies.repository.appendEvent(
      state.runId,
      status === "ready_to_execute" ? "execution_not_started" : "run_closed",
      status === "ready_to_execute"
        ? {
            reason:
              "The approved plan is persisted. The constrained execution adapter is the next milestone.",
          }
        : { reason: "The test plan was rejected before execution." },
      now,
    );

    return { status };
  }

  private async resume(runId: string, approval: ApprovalDecision): Promise<WorkflowResult> {
    try {
      const result = await this.graph.invoke(new Command({ resume: approval }), {
        configurable: { thread_id: runId },
      });
      return toWorkflowResult(result);
    } catch (error) {
      this.markFailed(runId, error);
      throw error;
    }
  }

  private markFailed(runId: string, error: unknown): void {
    const now = new Date().toISOString();
    const message = error instanceof Error ? error.message : String(error);
    this.dependencies.repository.updateStatus(runId, "failed", now);
    this.dependencies.repository.appendEvent(runId, "run_failed", { message }, now);
  }
}

function createGraph(workflow: HarnessWorkflow) {
  return new StateGraph(HarnessState)
    .addNode("discover", workflow["discover"].bind(workflow), { retryPolicy: { maxAttempts: 2 } })
    .addNode("create_plan", workflow["plan"].bind(workflow))
    .addNode("request_approval", workflow["requestApproval"].bind(workflow))
    .addNode("finish", workflow["finish"].bind(workflow))
    .addEdge(START, "discover")
    .addEdge("discover", "create_plan")
    .addEdge("create_plan", "request_approval")
    .addEdge("request_approval", "finish")
    .addEdge("finish", END)
    .compile({ checkpointer: workflow["checkpointer"] });
}

function toWorkflowResult(state: WorkflowState): WorkflowResult {
  return {
    runId: state.runId,
    status: state.status,
    plan: state.plan,
    snapshot: state.snapshot,
  };
}
