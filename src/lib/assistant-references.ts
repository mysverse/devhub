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
