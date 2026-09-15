import type { AppSnapshot, TestPlan } from "../domain.js";
export type PlanRequest = {
    runId: string;
    goal: string;
    snapshot: AppSnapshot;
};
export interface TestPlanner {
    createPlan(request: PlanRequest): Promise<TestPlan>;
}
/**
 * A conservative baseline planner. It creates a reviewable plan from structured
 * discovery evidence and deliberately leaves unknown state-changing actions for
 * a human-approved LLM planner in a later milestone.
 */
export declare class HeuristicTestPlanner implements TestPlanner {
    createPlan({ runId, goal, snapshot }: PlanRequest): Promise<TestPlan>;
}
