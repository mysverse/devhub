import { zodResponsesFunction } from "openai/helpers/zod";
import type { Tool } from "openai/resources/responses/responses";
import { ASSISTANT_TOOLS } from "@/lib/assistant-tool-definitions";

export function openAiAssistantTools(): Tool[] {
  return ASSISTANT_TOOLS.map((tool) =>
    zodResponsesFunction({
      name: tool.name,
      description: tool.description,
      parameters: tool.schema,
    }),
  );
}
