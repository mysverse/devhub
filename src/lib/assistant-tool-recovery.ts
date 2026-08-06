export const ASSISTANT_TOOL_FAILURE = {
  error:
    "This check is unavailable right now. Continue from the conversation context or offer a manual choice.",
} as const;

export async function recoverAssistantToolCall<T>(
  call: () => Promise<T>,
  onFailure?: (error: unknown) => void,
): Promise<T | typeof ASSISTANT_TOOL_FAILURE> {
  try {
    return await call();
  } catch (error) {
    onFailure?.(error);
    return ASSISTANT_TOOL_FAILURE;
  }
}
