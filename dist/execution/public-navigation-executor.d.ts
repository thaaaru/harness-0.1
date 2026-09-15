import type { AppSnapshot, ExecutionResult, TargetPolicy } from "../domain.js";
export interface NavigationExecutionInput {
    runId: string;
    snapshot: AppSnapshot;
    policy: TargetPolicy;
    headless?: boolean;
    artifactsDirectory: string;
}
export interface NavigationExecutor {
    execute(input: NavigationExecutionInput): Promise<ExecutionResult>;
}
/**
 * Executes only direct GET navigations and read-only title/heading assertions.
 * It deliberately exposes no click, fill, submit, upload, or credential capability.
 */
export declare class PlaywrightNavigationExecutor implements NavigationExecutor {
    execute(input: NavigationExecutionInput): Promise<ExecutionResult>;
    private checkPage;
}
