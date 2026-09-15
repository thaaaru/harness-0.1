import { randomUUID } from "node:crypto";
/**
 * A conservative baseline planner. It creates a reviewable plan from structured
 * discovery evidence and deliberately leaves unknown state-changing actions for
 * a human-approved LLM planner in a later milestone.
 */
export class HeuristicTestPlanner {
    async createPlan({ runId, goal, snapshot }) {
        const startPage = snapshot.pages[0];
        if (!startPage) {
            throw new Error("Cannot create a test plan without a discovered page.");
        }
        const loginPage = snapshot.pages.find((page) => page.controls.some((control) => {
            const text = `${control.label ?? ""} ${control.name ?? ""} ${control.inputType ?? ""}`.toLowerCase();
            return text.includes("password") || text.includes("sign in") || text.includes("log in");
        }));
        const steps = [
            {
                id: "review-discovery",
                title: "Review the discovered application map",
                rationale: "Confirm that the pages and controls discovered without interaction match the intended test scope.",
                risk: "read_only",
                requiresApproval: false,
                actions: [
                    {
                        kind: "inspect",
                        description: `Review ${snapshot.pages.length} discovered route(s) and their captured evidence.`,
                    },
                ],
                expectedResult: "The target application and the proposed scope are understood before execution.",
            },
            {
                id: "open-start-page",
                title: `Open ${startPage.path}`,
                rationale: "Begin from the initial page observed during read-only discovery.",
                risk: "read_only",
                requiresApproval: false,
                actions: [
                    { kind: "navigate", description: `Navigate to ${startPage.url}.` },
                    {
                        kind: "assert",
                        description: `Verify the page title contains \"${startPage.title || "the expected title"}\".`,
                    },
                ],
                expectedResult: "The initial application page is reachable and renders its expected primary content.",
            },
        ];
        if (loginPage) {
            steps.push({
                id: "authenticate-test-user",
                title: "Authenticate with an approved test account",
                rationale: "The discovery map indicates an authentication boundary that may be required for the requested journey.",
                risk: "session_change",
                requiresApproval: true,
                actions: [
                    { kind: "navigate", description: `Navigate to ${loginPage.url}.` },
                    {
                        kind: "authenticate",
                        description: "Use the named test-account secrets through the browser adapter; never expose their values to the model.",
                        secretReference: "TEST_ACCOUNT_<ROLE>",
                    },
                ],
                expectedResult: "The test session reaches the intended authenticated state without exposing credentials.",
            });
        }
        steps.push({
            id: "exercise-requested-journey",
            title: `Exercise requested journey: ${goal}`,
            rationale: "The user goal is not executed until this proposed state-changing scope has been explicitly approved.",
            risk: "state_change",
            requiresApproval: true,
            actions: [
                {
                    kind: "interact",
                    description: "Translate the approved journey into constrained Playwright tool calls using only controls found in the app map.",
                },
                {
                    kind: "assert",
                    description: "Verify the expected result with deterministic Playwright assertions and capture evidence.",
                },
            ],
            expectedResult: `The approved behavior for \"${goal}\" is verified with reproducible evidence.`,
            cleanup: "Define a test-data cleanup action before any persistent state is created.",
        });
        return {
            id: randomUUID(),
            runId,
            createdAt: new Date().toISOString(),
            summary: `Read-only discovery found ${snapshot.pages.length} route(s). The requested goal is proposed for approval, not executed.`,
            discoveredRoutes: snapshot.pages.map((page) => page.path),
            steps,
            warnings: [
                ...snapshot.warnings,
                "This initial planner is deterministic. Replace it with a schema-validated LLM planner only after a provider and evaluation suite are configured.",
            ],
        };
    }
}
