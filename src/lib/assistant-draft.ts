import * as z from "zod/v4";

export type TaskDraftProvenance = "EXPLICIT" | "INFERRED";

export const TASK_DRAFT_SCHEMA = z.object({
  title: z
    .string()
    .trim()
    .min(3)
    .max(120)
    .describe("Imperative, specific title for the task."),
  scope: z
    .string()
    .trim()
    .min(10)
    .max(1500)
    .describe("Compact scope description in 2-3 sentences."),
  acceptanceCriteria: z
    .array(z.string().trim().min(3))
    .min(1)
    .max(8)
    .describe("Checkable acceptance criteria for completion."),
  exclusions: z
    .array(z.string().trim())
    .default([])
    .describe("Explicit out-of-scope items."),
  destination: z.object({
    teamId: z.string().nullable().default(null),
    teamKey: z.string().nullable().default(null),
    teamName: z.string().nullable().default(null),
    projectId: z.string().nullable().default(null),
    projectName: z.string().nullable().default(null),
  }),
  owner: z.object({
    userId: z.string().nullable().default(null),
    linearId: z.string().nullable().default(null),
    name: z.string().nullable().default(null),
    isSelf: z.boolean().default(true),
  }),
  complexity: z.number().int().min(1).max(5).default(3),
  targetDate: z.string().describe("Target due date in YYYY-MM-DD format."),
  assumptions: z
    .array(z.string().trim())
    .default([])
    .describe("Reversible assumptions made."),
  provenance: z.object({
    title: z.enum(["EXPLICIT", "INFERRED"]).default("INFERRED"),
    scope: z.enum(["EXPLICIT", "INFERRED"]).default("INFERRED"),
    complexity: z.enum(["EXPLICIT", "INFERRED"]).default("INFERRED"),
    targetDate: z.enum(["EXPLICIT", "INFERRED"]).default("INFERRED"),
    destination: z.enum(["EXPLICIT", "INFERRED"]).default("INFERRED"),
  }),
  routeOptions: z
    .array(z.enum(["PPT", "TASK", "BONUS"]))
    .default(["PPT", "TASK", "BONUS"]),
});

export type AssistantTaskDraftDto = z.infer<typeof TASK_DRAFT_SCHEMA> & {
  kind: "task_draft";
  id: string;
};
