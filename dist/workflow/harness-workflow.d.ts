import { type AppSnapshot, type RunStatus, type ExecutionResult, type TestPlan } from "../domain.js";
import type { AppDiscoverer } from "../discovery/contracts.js";
import { type NavigationExecutor } from "../execution/public-navigation-executor.js";
import { type TestPlanner } from "../planning/heuristic-planner.js";
import { RunRepository } from "../storage/run-repository.js";
export type HarnessWorkflowDependencies = {
    databasePath: string;
    repository: RunRepository;
    discoverer: AppDiscoverer;
    planner?: TestPlanner;
    executor?: NavigationExecutor;
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
};
export declare class HarnessWorkflow {
    private readonly dependencies;
    private readonly planner;
    private readonly checkpointer;
    private readonly graph;
    private readonly executor;
    constructor(dependencies: HarnessWorkflowDependencies);
    start(rawInput: unknown): Promise<WorkflowResult>;
    approve(runId: string, approver: string, note?: string): Promise<WorkflowResult>;
    reject(runId: string, approver: string, note?: string): Promise<WorkflowResult>;
    execute(runId: string, options?: ExecutionOptions): Promise<WorkflowResult>;
    getResult(runId: string): WorkflowResult;
    close(): void;
    private discover;
    private plan;
    private requestApproval;
    private finish;
    private resume;
    private markFailed;
}
