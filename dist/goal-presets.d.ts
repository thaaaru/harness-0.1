export declare const WEB_APP_BASELINE_PRESET = "web-app-baseline";
export declare const WEB_APP_BASELINE_GOAL = "Assess the web application's public baseline: safe route reachability, page titles and primary headings, discovered navigation coverage, and form or authentication boundaries. Propose separate approval scopes for interaction journeys, authentication, form submission, accessibility, responsiveness, performance, and security checks.";
export type GoalPreset = typeof WEB_APP_BASELINE_PRESET;
export type ResolvedGoal = {
    preset?: GoalPreset;
    text: string;
};
export declare function resolveGoal(goal: string): ResolvedGoal;
export declare function isWebAppBaselineGoal(goal: string): boolean;
