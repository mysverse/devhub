export type PptWebhookEvaluationHint = {
  stateType?: string | null;
  stateName?: string | null;
  canceledAt?: Date | null;
  archivedAt?: Date | null;
  trashed?: boolean | null;
  previousCompletionEpisode?: number | null;
  previousTransactionId?: string | null;
};

export function shouldEvaluatePptWebhookHint(hint: PptWebhookEvaluationHint) {
  const stateType = hint.stateType?.toLowerCase() ?? null;
  const stateName = hint.stateName?.toLowerCase() ?? null;
  if (stateType === "completed") return true;
  if (
    hint.canceledAt ||
    stateType === "canceled" ||
    stateName === "canceled" ||
    stateName === "cancelled"
  ) {
    return true;
  }
  if (hint.archivedAt || hint.trashed) return true;
  return Boolean(
    (hint.previousCompletionEpisode ?? 0) > 0 || hint.previousTransactionId,
  );
}
