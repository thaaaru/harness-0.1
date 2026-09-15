import { type ApprovalDecision, type AppSnapshot, type ExecutionResult, type HarnessRunInput, type RunRecord, type RunStatus, type TestPlan } from "../domain.js";
export type NewRun = {
    id: string;
    input: HarnessRunInput;
    status: RunStatus;
    createdAt: string;
};
export declare class RunRepository {
    private readonly db;
    constructor(databasePath: string);
    createRun(run: NewRun): RunRecord;
    getRun(runId: string): RunRecord;
    updateStatus(runId: string, status: RunStatus, updatedAt: string): void;
    saveSnapshot(runId: string, snapshot: AppSnapshot, savedAt: string): void;
    getSnapshot(runId: string): AppSnapshot | undefined;
    savePlan(runId: string, plan: TestPlan, savedAt: string): void;
    getPlan(runId: string): TestPlan | undefined;
    saveExecution(runId: string, execution: ExecutionResult, savedAt: string): void;
    getExecution(runId: string): ExecutionResult | undefined;
    saveApproval(runId: string, approval: ApprovalDecision, savedAt: string): void;
    appendEvent(runId: string, type: string, payload: Record<string, unknown>, createdAt: string): void;
    listEvents(runId: string): Array<{
        type: string;
        payload: Record<string, unknown>;
        createdAt: string;
    }>;
    close(): void;
    private migrate;
    private assertRunWasUpdated;
}
