import { z } from "zod";
export declare const RunStatusSchema: z.ZodEnum<{
    discovering: "discovering";
    planning: "planning";
    awaiting_approval: "awaiting_approval";
    ready_to_execute: "ready_to_execute";
    executing: "executing";
    passed: "passed";
    rejected: "rejected";
    failed: "failed";
}>;
export type RunStatus = z.infer<typeof RunStatusSchema>;
export declare const RiskLevelSchema: z.ZodEnum<{
    read_only: "read_only";
    session_change: "session_change";
    state_change: "state_change";
}>;
export type RiskLevel = z.infer<typeof RiskLevelSchema>;
export declare const ControlKindSchema: z.ZodEnum<{
    link: "link";
    button: "button";
    textbox: "textbox";
    textarea: "textarea";
    select: "select";
    checkbox: "checkbox";
    radio: "radio";
    dialog: "dialog";
    heading: "heading";
    form: "form";
    other: "other";
}>;
export declare const DiscoveredControlSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        link: "link";
        button: "button";
        textbox: "textbox";
        textarea: "textarea";
        select: "select";
        checkbox: "checkbox";
        radio: "radio";
        dialog: "dialog";
        heading: "heading";
        form: "form";
        other: "other";
    }>;
    role: z.ZodOptional<z.ZodString>;
    label: z.ZodOptional<z.ZodString>;
    name: z.ZodOptional<z.ZodString>;
    inputType: z.ZodOptional<z.ZodString>;
    disabled: z.ZodBoolean;
}, z.core.$strip>;
export type DiscoveredControl = z.infer<typeof DiscoveredControlSchema>;
export declare const PageSnapshotSchema: z.ZodObject<{
    url: z.ZodString;
    path: z.ZodString;
    title: z.ZodString;
    headings: z.ZodArray<z.ZodString>;
    controls: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            link: "link";
            button: "button";
            textbox: "textbox";
            textarea: "textarea";
            select: "select";
            checkbox: "checkbox";
            radio: "radio";
            dialog: "dialog";
            heading: "heading";
            form: "form";
            other: "other";
        }>;
        role: z.ZodOptional<z.ZodString>;
        label: z.ZodOptional<z.ZodString>;
        name: z.ZodOptional<z.ZodString>;
        inputType: z.ZodOptional<z.ZodString>;
        disabled: z.ZodBoolean;
    }, z.core.$strip>>;
    links: z.ZodArray<z.ZodString>;
    consoleErrors: z.ZodArray<z.ZodString>;
    pageErrors: z.ZodArray<z.ZodString>;
    fingerprint: z.ZodString;
    screenshotPath: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;
export declare const AppSnapshotSchema: z.ZodObject<{
    id: z.ZodString;
    targetUrl: z.ZodString;
    discoveredAt: z.ZodString;
    pages: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        path: z.ZodString;
        title: z.ZodString;
        headings: z.ZodArray<z.ZodString>;
        controls: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                link: "link";
                button: "button";
                textbox: "textbox";
                textarea: "textarea";
                select: "select";
                checkbox: "checkbox";
                radio: "radio";
                dialog: "dialog";
                heading: "heading";
                form: "form";
                other: "other";
            }>;
            role: z.ZodOptional<z.ZodString>;
            label: z.ZodOptional<z.ZodString>;
            name: z.ZodOptional<z.ZodString>;
            inputType: z.ZodOptional<z.ZodString>;
            disabled: z.ZodBoolean;
        }, z.core.$strip>>;
        links: z.ZodArray<z.ZodString>;
        consoleErrors: z.ZodArray<z.ZodString>;
        pageErrors: z.ZodArray<z.ZodString>;
        fingerprint: z.ZodString;
        screenshotPath: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type AppSnapshot = z.infer<typeof AppSnapshotSchema>;
export declare const TargetPolicySchema: z.ZodObject<{
    allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString>>;
    maxPages: z.ZodDefault<z.ZodNumber>;
    maxControlsPerPage: z.ZodDefault<z.ZodNumber>;
    maxLinksPerPage: z.ZodDefault<z.ZodNumber>;
    allowInsecureHttp: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type TargetPolicy = z.infer<typeof TargetPolicySchema>;
export declare const HarnessRunInputSchema: z.ZodObject<{
    targetUrl: z.ZodString;
    goal: z.ZodDefault<z.ZodString>;
    policy: z.ZodDefault<z.ZodObject<{
        allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString>>;
        maxPages: z.ZodDefault<z.ZodNumber>;
        maxControlsPerPage: z.ZodDefault<z.ZodNumber>;
        maxLinksPerPage: z.ZodDefault<z.ZodNumber>;
        allowInsecureHttp: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>>;
    artifactsDirectory: z.ZodDefault<z.ZodString>;
    headless: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export type HarnessRunInput = z.infer<typeof HarnessRunInputSchema>;
export declare const PlannedActionSchema: z.ZodObject<{
    kind: z.ZodEnum<{
        navigate: "navigate";
        inspect: "inspect";
        authenticate: "authenticate";
        interact: "interact";
        assert: "assert";
        cleanup: "cleanup";
    }>;
    description: z.ZodString;
    secretReference: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type PlannedAction = z.infer<typeof PlannedActionSchema>;
export declare const TestPlanStepSchema: z.ZodObject<{
    id: z.ZodString;
    title: z.ZodString;
    rationale: z.ZodString;
    risk: z.ZodEnum<{
        read_only: "read_only";
        session_change: "session_change";
        state_change: "state_change";
    }>;
    requiresApproval: z.ZodBoolean;
    actions: z.ZodArray<z.ZodObject<{
        kind: z.ZodEnum<{
            navigate: "navigate";
            inspect: "inspect";
            authenticate: "authenticate";
            interact: "interact";
            assert: "assert";
            cleanup: "cleanup";
        }>;
        description: z.ZodString;
        secretReference: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    expectedResult: z.ZodString;
    cleanup: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type TestPlanStep = z.infer<typeof TestPlanStepSchema>;
export declare const TestPlanSchema: z.ZodObject<{
    id: z.ZodString;
    runId: z.ZodString;
    createdAt: z.ZodString;
    summary: z.ZodString;
    discoveredRoutes: z.ZodArray<z.ZodString>;
    steps: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        title: z.ZodString;
        rationale: z.ZodString;
        risk: z.ZodEnum<{
            read_only: "read_only";
            session_change: "session_change";
            state_change: "state_change";
        }>;
        requiresApproval: z.ZodBoolean;
        actions: z.ZodArray<z.ZodObject<{
            kind: z.ZodEnum<{
                navigate: "navigate";
                inspect: "inspect";
                authenticate: "authenticate";
                interact: "interact";
                assert: "assert";
                cleanup: "cleanup";
            }>;
            description: z.ZodString;
            secretReference: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        expectedResult: z.ZodString;
        cleanup: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type TestPlan = z.infer<typeof TestPlanSchema>;
export declare const NavigationCheckSchema: z.ZodObject<{
    url: z.ZodString;
    expectedTitle: z.ZodString;
    observedTitle: z.ZodOptional<z.ZodString>;
    expectedHeading: z.ZodOptional<z.ZodString>;
    observedHeading: z.ZodOptional<z.ZodString>;
    status: z.ZodEnum<{
        passed: "passed";
        failed: "failed";
    }>;
    screenshotPath: z.ZodOptional<z.ZodString>;
    error: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type NavigationCheck = z.infer<typeof NavigationCheckSchema>;
export declare const ExecutionResultSchema: z.ZodObject<{
    runId: z.ZodString;
    startedAt: z.ZodString;
    completedAt: z.ZodString;
    status: z.ZodEnum<{
        passed: "passed";
        failed: "failed";
    }>;
    checks: z.ZodArray<z.ZodObject<{
        url: z.ZodString;
        expectedTitle: z.ZodString;
        observedTitle: z.ZodOptional<z.ZodString>;
        expectedHeading: z.ZodOptional<z.ZodString>;
        observedHeading: z.ZodOptional<z.ZodString>;
        status: z.ZodEnum<{
            passed: "passed";
            failed: "failed";
        }>;
        screenshotPath: z.ZodOptional<z.ZodString>;
        error: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;
export declare const ApprovalDecisionSchema: z.ZodObject<{
    decision: z.ZodEnum<{
        rejected: "rejected";
        approved: "approved";
    }>;
    approver: z.ZodString;
    note: z.ZodOptional<z.ZodString>;
    decidedAt: z.ZodString;
}, z.core.$strip>;
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;
export declare const ApprovalRequestSchema: z.ZodObject<{
    type: z.ZodLiteral<"test_plan_approval">;
    runId: z.ZodString;
    plan: z.ZodObject<{
        id: z.ZodString;
        runId: z.ZodString;
        createdAt: z.ZodString;
        summary: z.ZodString;
        discoveredRoutes: z.ZodArray<z.ZodString>;
        steps: z.ZodArray<z.ZodObject<{
            id: z.ZodString;
            title: z.ZodString;
            rationale: z.ZodString;
            risk: z.ZodEnum<{
                read_only: "read_only";
                session_change: "session_change";
                state_change: "state_change";
            }>;
            requiresApproval: z.ZodBoolean;
            actions: z.ZodArray<z.ZodObject<{
                kind: z.ZodEnum<{
                    navigate: "navigate";
                    inspect: "inspect";
                    authenticate: "authenticate";
                    interact: "interact";
                    assert: "assert";
                    cleanup: "cleanup";
                }>;
                description: z.ZodString;
                secretReference: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            expectedResult: z.ZodString;
            cleanup: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
        warnings: z.ZodArray<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;
export declare const RunRecordSchema: z.ZodObject<{
    id: z.ZodString;
    targetUrl: z.ZodString;
    goal: z.ZodString;
    status: z.ZodEnum<{
        discovering: "discovering";
        planning: "planning";
        awaiting_approval: "awaiting_approval";
        ready_to_execute: "ready_to_execute";
        executing: "executing";
        passed: "passed";
        rejected: "rejected";
        failed: "failed";
    }>;
    input: z.ZodObject<{
        targetUrl: z.ZodString;
        goal: z.ZodDefault<z.ZodString>;
        policy: z.ZodDefault<z.ZodObject<{
            allowedOrigins: z.ZodDefault<z.ZodArray<z.ZodString>>;
            maxPages: z.ZodDefault<z.ZodNumber>;
            maxControlsPerPage: z.ZodDefault<z.ZodNumber>;
            maxLinksPerPage: z.ZodDefault<z.ZodNumber>;
            allowInsecureHttp: z.ZodDefault<z.ZodBoolean>;
        }, z.core.$strip>>;
        artifactsDirectory: z.ZodDefault<z.ZodString>;
        headless: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strip>;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
    approval: z.ZodOptional<z.ZodObject<{
        decision: z.ZodEnum<{
            rejected: "rejected";
            approved: "approved";
        }>;
        approver: z.ZodString;
        note: z.ZodOptional<z.ZodString>;
        decidedAt: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
