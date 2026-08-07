import type { AssistantTaskDraftDto } from "@/lib/assistant-draft";
import { parseAssistantPptPayoutPreview } from "@/lib/assistant-payout-preview";
import type { AssistantReferenceDto } from "@/lib/assistant-types";

const ISSUE_REFERENCE_TOOLS = new Set([
  "search_tasks",
  "get_task",
  "list_my_tasks",
  "list_open_ppts",
]);

function linearImageUrl(description: string | null) {
  const raw = description?.match(/!\[.*?\]\((https?:\/\/.*?)\)/)?.[1];
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return ["uploads.linear.app", "linear.app"].includes(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function descriptionExcerpt(description: string | null) {
  if (!description) return null;
  const cleaned = description
    .replace(/!\[.*?\]\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return null;
  return cleaned.length <= 280 ? cleaned : `${cleaned.slice(0, 277)}…`;
}

export function assistantReferencesFromToolResult(
  name: string,
  result: unknown,
): AssistantReferenceDto[] {
  if (name === "task_draft") {
    if (!result || typeof result !== "object" || Array.isArray(result))
      return [];
    const item = (
      "draft" in result ? (result as { draft: unknown }).draft : result
    ) as Record<string, unknown>;
    if (
      !item ||
      typeof item !== "object" ||
      typeof item.title !== "string" ||
      typeof item.scope !== "string"
    ) {
      return [];
    }
    return [
      {
        kind: "task_draft" as const,
        id: typeof item.id === "string" ? item.id : `draft-${Date.now()}`,
        title: item.title,
        scope: item.scope,
        acceptanceCriteria: Array.isArray(item.acceptanceCriteria)
          ? item.acceptanceCriteria.filter(
              (c): c is string => typeof c === "string",
            )
          : [],
        exclusions: Array.isArray(item.exclusions)
          ? item.exclusions.filter((e): e is string => typeof e === "string")
          : [],
        destination:
          (item.destination as AssistantTaskDraftDto["destination"]) ?? {
            teamId: null,
            teamKey: null,
            teamName: null,
            projectId: null,
            projectName: null,
          },
        owner: (item.owner as AssistantTaskDraftDto["owner"]) ?? {
          userId: null,
          linearId: null,
          name: null,
          isSelf: true,
        },
        complexity: typeof item.complexity === "number" ? item.complexity : 3,
        targetDate:
          typeof item.targetDate === "string"
            ? item.targetDate
            : new Date().toISOString().slice(0, 10),
        assumptions: Array.isArray(item.assumptions)
          ? item.assumptions.filter((a): a is string => typeof a === "string")
          : [],
        provenance:
          (item.provenance as AssistantTaskDraftDto["provenance"]) ?? {
            title: "INFERRED",
            scope: "INFERRED",
            complexity: "INFERRED",
            targetDate: "INFERRED",
            destination: "INFERRED",
          },
        routeOptions: Array.isArray(item.routeOptions)
          ? (item.routeOptions as AssistantTaskDraftDto["routeOptions"])
          : ["PPT", "TASK", "BONUS"],
      },
    ];
  }

  if (!ISSUE_REFERENCE_TOOLS.has(name)) return [];
  const rows = Array.isArray(result) ? result : [result];
  return rows.slice(0, 6).flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const issue = item as Record<string, unknown>;
    if (
      typeof issue.id !== "string" ||
      typeof issue.identifier !== "string" ||
      typeof issue.title !== "string" ||
      typeof issue.url !== "string"
    ) {
      return [];
    }
    const description =
      typeof issue.description === "string" ? issue.description : null;
    return [
      {
        kind: "linear_issue" as const,
        id: issue.id,
        identifier: issue.identifier,
        title: issue.title,
        url: issue.url,
        description: descriptionExcerpt(description),
        estimate: typeof issue.estimate === "number" ? issue.estimate : null,
        stateName:
          typeof issue.stateName === "string" ? issue.stateName : "Unknown",
        labelNames: Array.isArray(issue.labelNames)
          ? issue.labelNames.filter(
              (label): label is string => typeof label === "string",
            )
          : [],
        imageUrl: linearImageUrl(description),
        payout: parseAssistantPptPayoutPreview(issue.payout),
      },
    ];
  });
}
