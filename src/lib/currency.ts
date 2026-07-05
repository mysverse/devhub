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

export function estimateToAmount(
  estimate: number,
  currency: CurrencyCode,
): number {
  return estimate * CURRENCY_CONFIG[currency].multiplier;
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
