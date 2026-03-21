export type CurrencyCode = "MYR" | "ROBUX";

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
