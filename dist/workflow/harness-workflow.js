import { randomUUID } from "node:crypto";
import { Annotation, Command, END, START, StateGraph, interrupt } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { ApprovalDecisionSchema, HarnessRunInputSchema, } from "../domain.js";
import { PlaywrightNavigationExecutor, } from "../execution/public-navigation-executor.js";
import { HeuristicTestPlanner } from "../planning/heuristic-planner.js";
const HarnessState = Annotation.Root({
    runId: (Annotation),
    input: (Annotation),
    snapshot: (Annotation),
    plan: (Annotation),
    status: (Annotation),
    approval: (Annotation),
});
export class HarnessWorkflow {
    dependencies;
    planner;
    checkpointer;
    graph;
    executor;
    constructor(dependencies) {
        this.dependencies = dependencies;
        this.planner = dependencies.planner ?? new HeuristicTestPlanner();
        this.executor = dependencies.executor ?? new PlaywrightNavigationExecutor();
        this.checkpointer = SqliteSaver.fromConnString(dependencies.databasePath);
        this.graph = createGraph(this);
    }
    async start(rawInput) {
        const input = HarnessRunInputSchema.parse(rawInput);
        const runId = randomUUID();
        const now = new Date().toISOString();
        this.dependencies.repository.createRun({ id: runId, input, status: "discovering", createdAt: now });
        this.dependencies.repository.appendEvent(runId, "run_started", { targetUrl: input.targetUrl, goal: input.goal }, now);
        try {
            const result = await this.graph.invoke({ runId, input, status: "discovering" }, { configurable: { thread_id: runId } });
            return toWorkflowResult(result);
        }
        catch (error) {
            this.markFailed(runId, error);
            throw error;
        }
    }
    async approve(runId, approver, note) {
        const run = this.dependencies.repository.getRun(runId);
        if (run.status !== "awaiting_approval") {
            throw new Error(`Run ${runId} is ${run.status}; only awaiting_approval runs can be approved or rejected.`);
        }
        const approval = ApprovalDecisionSchema.parse({
            decision: "approved",
            approver,
            note,
            decidedAt: new Date().toISOString(),
        });
        return this.resume(runId, approval);
    }
    async reject(runId, approver, note) {
        const run = this.dependencies.repository.getRun(runId);
        if (run.status !== "awaiting_approval") {
            throw new Error(`Run ${runId} is ${run.status}; only awaiting_approval runs can be approved or rejected.`);
        }
        const approval = ApprovalDecisionSchema.parse({
            decision: "rejected",
            approver,
            note,
            decidedAt: new Date().toISOString(),
        });
        return this.resume(runId, approval);
    }
    async execute(runId, options = {}) {
        const run = this.dependencies.repository.getRun(runId);
        const retryingFailedExecution = run.status === "failed" &&
            run.approval?.decision === "approved" &&
            this.dependencies.repository.getExecution(runId)?.status === "failed";
        if (run.status !== "ready_to_execute" && !retryingFailedExecution) {
            throw new Error(`Run ${runId} is ${run.status}; only approved ready or previously failed read-only runs can be executed.`);
        }
        const snapshot = this.dependencies.repository.getSnapshot(runId);
        if (!snapshot || snapshot.pages.length === 0) {
            throw new Error(`Run ${runId} has no discovered pages to execute.`);
        }
        const headless = options.headless ?? run.input.headless;
        const startedAt = new Date().toISOString();
        this.dependencies.repository.updateStatus(runId, "executing", startedAt);
        this.dependencies.repository.appendEvent(runId, "execution_started", {
            mode: "approved_read_only_navigation",
            pageCount: snapshot.pages.length,
            headless,
        }, startedAt);
        try {
            const execution = await this.executor.execute({
                runId,
                snapshot,
                policy: run.input.policy,
                artifactsDirectory: run.input.artifactsDirectory,
                headless,
            });
            const completedAt = new Date().toISOString();
            this.dependencies.repository.saveExecution(runId, execution, completedAt);
            this.dependencies.repository.updateStatus(runId, execution.status, completedAt);
            this.dependencies.repository.appendEvent(runId, "execution_completed", {
                status: execution.status,
                checkedPageCount: execution.checks.length,
                failedPageCount: execution.checks.filter((check) => check.status === "failed").length,
            }, completedAt);
            return {
                runId,
                status: execution.status,
                plan: this.dependencies.repository.getPlan(runId),
                snapshot,
                execution,
            };
        }
        catch (error) {
            this.markFailed(runId, error);
            throw error;
        }
    }
    getResult(runId) {
        const run = this.dependencies.repository.getRun(runId);
        return {
            runId,
            status: run.status,
            plan: this.dependencies.repository.getPlan(runId),
            snapshot: this.dependencies.repository.getSnapshot(runId),
            execution: this.dependencies.repository.getExecution(runId),
        };
    }
    close() {
        this.checkpointer.db.close();
    }
    async discover(state) {
        const now = new Date().toISOString();
        this.dependencies.repository.updateStatus(state.runId, "discovering", now);
        const snapshot = await this.dependencies.discoverer.discover({
            runId: state.runId,
            targetUrl: state.input.targetUrl,
            policy: state.input.policy,
            artifactsDirectory: state.input.artifactsDirectory,
            headless: state.input.headless,
        });
        this.dependencies.repository.saveSnapshot(state.runId, snapshot, new Date().toISOString());
        this.dependencies.repository.appendEvent(state.runId, "app_discovered", { pageCount: snapshot.pages.length, warningCount: snapshot.warnings.length }, new Date().toISOString());
        this.dependencies.repository.updateStatus(state.runId, "planning", new Date().toISOString());
        return { snapshot, status: "planning" };
    }
    async plan(state) {
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
        this.dependencies.repository.appendEvent(state.runId, "plan_ready_for_approval", { planId: plan.id, stepCount: plan.steps.length }, now);
        return { plan, status: "awaiting_approval" };
    }
    async requestApproval(state) {
        if (!state.plan) {
            throw new Error("Cannot request approval without a test plan.");
        }
        const request = { type: "test_plan_approval", runId: state.runId, plan: state.plan };
        const approval = ApprovalDecisionSchema.parse(interrupt(request));
        const now = new Date().toISOString();
        this.dependencies.repository.saveApproval(state.runId, approval, now);
        this.dependencies.repository.appendEvent(state.runId, approval.decision === "approved" ? "plan_approved" : "plan_rejected", { approver: approval.approver, note: approval.note }, now);
        return { approval, status: approval.decision === "approved" ? "ready_to_execute" : "rejected" };
    }
    async finish(state) {
        const status = state.approval?.decision === "approved" ? "ready_to_execute" : "rejected";
        const now = new Date().toISOString();
        this.dependencies.repository.updateStatus(state.runId, status, now);
        this.dependencies.repository.appendEvent(state.runId, status === "ready_to_execute" ? "execution_available" : "run_closed", status === "ready_to_execute"
            ? { reason: "The approved plan is ready for constrained read-only navigation execution." }
            : { reason: "The test plan was rejected before execution." }, now);
        return { status };
    }
    async resume(runId, approval) {
        try {
            const result = await this.graph.invoke(new Command({ resume: approval }), {
                configurable: { thread_id: runId },
            });
            return toWorkflowResult(result);
        }
        catch (error) {
            this.markFailed(runId, error);
            throw error;
        }
    }
    markFailed(runId, error) {
        const now = new Date().toISOString();
        const message = error instanceof Error ? error.message : String(error);
        this.dependencies.repository.updateStatus(runId, "failed", now);
        this.dependencies.repository.appendEvent(runId, "run_failed", { message }, now);
    }
}
function createGraph(workflow) {
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
function toWorkflowResult(state) {
    return {
        runId: state.runId,
        status: state.status,
        plan: state.plan,
        snapshot: state.snapshot,
    };
}
