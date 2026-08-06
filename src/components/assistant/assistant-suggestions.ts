import type { AssistantMessageDto } from "@/lib/assistant-types";

export function assistantReplySuggestions(message: AssistantMessageDto) {
  if (
    message.role !== "assistant" ||
    message.status !== "COMPLETE" ||
    message.actions.length > 0
  ) {
    return [];
  }
  if (/\bworking draft\b/i.test(message.content)) {
    return ["Make this a PPT", "Create an ordinary task"];
  }
  return [];
}
