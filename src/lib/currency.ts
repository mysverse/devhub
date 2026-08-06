export type CurrencyCode = "MYR" | "ROBUX";

export type ComplexityLevel = 1 | 2 | 3 | 4 | 5;

const LINEAR_ESTIMATE_TO_COMPLEXITY = new Map<number, ComplexityLevel>([
  [1, 1],
  [2, 2],
  [3, 3],
  [5, 4],
  [8, 5],
]);

const COMPLEXITY_TO_LINEAR_ESTIMATE: Record<ComplexityLevel, number> = {
  1: 1,
  2: 2,
  3: 3,
  4: 5,
  5: 8,
};

const CURRENCY_CONFIG: Record<
  CurrencyCode,
  {
    multiplier: number;
    decimals: number;
    format: (amount: number) => string;
    fallbackRange: string;
  }
> = {
  MYR: {
    multiplier: 20,
    decimals: 2,
    format: (amount) => `RM${amount.toFixed(2)}`,
    fallbackRange: "RM20 - RM100",
  },
  ROBUX: {
    multiplier: 1200,
    decimals: 0,
    format: (amount) =>
      `${amount.toLocaleString("en-US", { maximumFractionDigits: 0 })} Robux`,
    fallbackRange: "1,200 - 6,000 Robux",
  },
};

export function normalizeComplexityLevel(
  estimate: number | null | undefined,
): ComplexityLevel | null {
  if (!Number.isFinite(estimate)) return null;
  const rounded = Math.round(Number(estimate));
  if (rounded >= 1 && rounded <= 5) return rounded as ComplexityLevel;
  return null;
}

export function linearEstimateToComplexityLevel(
  estimate: number | null | undefined,
): ComplexityLevel | null {
  if (!Number.isFinite(estimate)) return null;
  const rounded = Math.round(Number(estimate));
  return (
    LINEAR_ESTIMATE_TO_COMPLEXITY.get(rounded) ??
    normalizeComplexityLevel(rounded)
  );
}

export function complexityLevelToLinearEstimate(
  estimate: number | null | undefined,
): number | null {
  const level = normalizeComplexityLevel(estimate);
  return level == null ? null : COMPLEXITY_TO_LINEAR_ESTIMATE[level];
}

export function getCurrencyForPaymentMethod(method: string): CurrencyCode {
  return method === "ROBUX" ? "ROBUX" : "MYR";
}

/** Per-point payout rate for a currency. The only sanctioned way to show a
 * rate in copy — never hardcode 20/1200 at a call site. */
export function getRateMultiplier(currency: CurrencyCode): number {
  return CURRENCY_CONFIG[currency].multiplier;
}

export function estimateToAmount(
  estimate: number,
  currency: CurrencyCode,
): number {
  return estimate * CURRENCY_CONFIG[currency].multiplier;
}

/**
 * Clamp a computed amount to what the currency can actually pay out: whole
 * Robux (FinSys takes an integer) and two decimals for MYR (Billplz takes
 * cents). Negative results are floored at 0 — no caller has a legitimate
 * reason to produce one, and a negative payout would be sent as a real
 * disbursement.
 *
 * Always route amounts through this after any multiplication that is not by a
 * whole number — the base `estimate * rate` math happens to be integral, but a
 * campaign multiplier (1.5x) is not.
 */
export function roundAmount(amount: number, currency: CurrencyCode): number {
  if (!Number.isFinite(amount)) return 0;
  if (currency === "ROBUX") return Math.max(0, Math.round(amount));
  return Math.max(0, Math.round(amount * 100) / 100);
}

export function formatAmount(amount: number, currency: CurrencyCode): string {
  return CURRENCY_CONFIG[currency].format(amount);
}

export function formatEstimate(
  estimate: number | null | undefined,
  currency: CurrencyCode,
): string {
  if (!estimate) return CURRENCY_CONFIG[currency].fallbackRange;
  return formatAmount(estimateToAmount(estimate, currency), currency);
}
