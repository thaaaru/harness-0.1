import { z } from "zod";

export const RunStatusSchema = z.enum([
  "discovering",
  "planning",
  "awaiting_approval",
  "ready_to_execute",
  "executing",
  "passed",
  "rejected",
  "failed",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RiskLevelSchema = z.enum(["read_only", "session_change", "state_change"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const ControlKindSchema = z.enum([
  "link",
  "button",
  "textbox",
  "textarea",
  "select",
  "checkbox",
  "radio",
  "dialog",
  "heading",
  "form",
  "other",
]);

export const DiscoveredControlSchema = z.object({
  kind: ControlKindSchema,
  role: z.string().optional(),
  label: z.string().optional(),
  name: z.string().optional(),
  inputType: z.string().optional(),
  disabled: z.boolean(),
});
export type DiscoveredControl = z.infer<typeof DiscoveredControlSchema>;

export const PageSnapshotSchema = z.object({
  url: z.string().url(),
  path: z.string(),
  title: z.string(),
  headings: z.array(z.string()),
  controls: z.array(DiscoveredControlSchema),
  links: z.array(z.string().url()),
  consoleErrors: z.array(z.string()),
  pageErrors: z.array(z.string()),
  fingerprint: z.string(),
  screenshotPath: z.string().optional(),
});
export type PageSnapshot = z.infer<typeof PageSnapshotSchema>;

export const AppSnapshotSchema = z.object({
  id: z.string().uuid(),
  targetUrl: z.string().url(),
  discoveredAt: z.string().datetime(),
  pages: z.array(PageSnapshotSchema),
  warnings: z.array(z.string()),
});
export type AppSnapshot = z.infer<typeof AppSnapshotSchema>;

export const TargetPolicySchema = z.object({
  allowedOrigins: z.array(z.string().url()).default([]),
  maxPages: z.number().int().min(1).max(50).default(10),
  maxControlsPerPage: z.number().int().min(1).max(200).default(100),
  maxLinksPerPage: z.number().int().min(1).max(200).default(100),
  allowInsecureHttp: z.boolean().default(false),
});
export type TargetPolicy = z.infer<typeof TargetPolicySchema>;

export const HarnessRunInputSchema = z.object({
  targetUrl: z.string().url(),
  goal: z.string().trim().min(5).max(2_000),
  policy: TargetPolicySchema.default({
    allowedOrigins: [],
    maxPages: 10,
    maxControlsPerPage: 100,
    maxLinksPerPage: 100,
    allowInsecureHttp: false,
  }),
  artifactsDirectory: z.string().min(1).default("artifacts"),
  headless: z.boolean().default(true),
});
export type HarnessRunInput = z.infer<typeof HarnessRunInputSchema>;

export const PlannedActionSchema = z.object({
  kind: z.enum(["navigate", "inspect", "authenticate", "interact", "assert", "cleanup"]),
  description: z.string(),
  secretReference: z.string().optional(),
});
export type PlannedAction = z.infer<typeof PlannedActionSchema>;

export const TestPlanStepSchema = z.object({
  id: z.string(),
  title: z.string(),
  rationale: z.string(),
  risk: RiskLevelSchema,
  requiresApproval: z.boolean(),
  actions: z.array(PlannedActionSchema).min(1),
  expectedResult: z.string(),
  cleanup: z.string().optional(),
});
export type TestPlanStep = z.infer<typeof TestPlanStepSchema>;

export const TestPlanSchema = z.object({
  id: z.string().uuid(),
  runId: z.string().uuid(),
  createdAt: z.string().datetime(),
  summary: z.string(),
  discoveredRoutes: z.array(z.string()),
  steps: z.array(TestPlanStepSchema).min(1),
  warnings: z.array(z.string()),
});
export type TestPlan = z.infer<typeof TestPlanSchema>;

export const NavigationCheckSchema = z.object({
  url: z.string().url(),
  expectedTitle: z.string(),
  observedTitle: z.string().optional(),
  expectedHeading: z.string().optional(),
  observedHeading: z.string().optional(),
  status: z.enum(["passed", "failed"]),
  screenshotPath: z.string().optional(),
  error: z.string().optional(),
});
export type NavigationCheck = z.infer<typeof NavigationCheckSchema>;

export const ExecutionResultSchema = z.object({
  runId: z.string().uuid(),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime(),
  status: z.enum(["passed", "failed"]),
  checks: z.array(NavigationCheckSchema).min(1),
});
export type ExecutionResult = z.infer<typeof ExecutionResultSchema>;

export const ApprovalDecisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  approver: z.string().trim().min(1).max(200),
  note: z.string().trim().max(2_000).optional(),
  decidedAt: z.string().datetime(),
});
export type ApprovalDecision = z.infer<typeof ApprovalDecisionSchema>;

export const ApprovalRequestSchema = z.object({
  type: z.literal("test_plan_approval"),
  runId: z.string().uuid(),
  plan: TestPlanSchema,
});
export type ApprovalRequest = z.infer<typeof ApprovalRequestSchema>;

export const RunRecordSchema = z.object({
  id: z.string().uuid(),
  targetUrl: z.string().url(),
  goal: z.string(),
  status: RunStatusSchema,
  input: HarnessRunInputSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  approval: ApprovalDecisionSchema.optional(),
});
export type RunRecord = z.infer<typeof RunRecordSchema>;
