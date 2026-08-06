import type {
  ParsedResponseOutputItem,
  ResponseInputItem,
} from "openai/resources/responses/responses";

export function openAiResponseOutputAsInput(
  output: Array<ParsedResponseOutputItem<unknown>>,
): ResponseInputItem[] {
  return output.map((item) => {
    if (item.type === "function_call") {
      const { parsed_arguments: _parsedArguments, ...call } = item;
      return call;
    }
    if (item.type === "message") {
      return {
        ...item,
        content: item.content.map((part) => {
          if (part.type !== "output_text") return part;
          const { parsed: _parsed, ...content } = part;
          return content;
        }),
      };
    }
    return item as ResponseInputItem;
  });
}
