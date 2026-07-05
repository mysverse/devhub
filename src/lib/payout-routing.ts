import {
  isBillplzSupported,
  isXenditSupported,
  requiresKycForAutoPayout,
} from "@/lib/payment-validation";

export type PayoutRouteStatus =
  | "provider_processing"
  | "provider_eligible"
  | "manual_eligible"
  | "missing_details"
  | "unsupported";

export type PayoutRouteProvider = "BILLPLZ" | "XENDIT" | "ROBLOX" | null;

export type PayoutRouteInput = {
  transactionStatus: string;
  currency: string;
  paymentMethod: string;
  paypalEmail?: string | null;
  duitNowId?: string | null;
  bankName?: string | null;
  bankAccountNumber?: string | null;
  bankAccountName?: string | null;
  robloxId?: string | null;
  payout?: { status: string; provider?: string | null } | null;
  xenditEnabled?: boolean | null;
};

export type PayoutRouteClassification = {
  status: PayoutRouteStatus;
  provider: PayoutRouteProvider;
  reason: string;
};

function hasBankDetails(input: PayoutRouteInput) {
  return Boolean(
    input.bankName && input.bankAccountNumber && input.bankAccountName,
  );
}

export function classifyPayoutRoute(
  input: PayoutRouteInput,
): PayoutRouteClassification {
  if (
    input.payout?.status === "PENDING" ||
    input.payout?.status === "PROCESSING"
  ) {
    return {
      status: "provider_processing",
      provider: (input.payout.provider as PayoutRouteProvider) ?? null,
      reason: "A provider payout is already processing.",
    };
  }

  if (input.transactionStatus !== "PENDING") {
    return {
      status: "unsupported",
      provider: null,
      reason: "Only pending transactions can be paid.",
    };
  }

  if (input.currency === "ROBUX" || input.paymentMethod === "ROBUX") {
    if (input.currency === "ROBUX" && input.paymentMethod === "ROBUX") {
      return input.robloxId
        ? {
            status: "provider_eligible",
            provider: "ROBLOX",
            reason: "Robux payouts are routed through Roblox.",
          }
        : {
            status: "missing_details",
            provider: "ROBLOX",
            reason: "A linked Roblox account is required.",
          };
    }
    return {
      status: "unsupported",
      provider: null,
      reason: "Robux payout settings are inconsistent.",
    };
  }

  if (input.currency !== "MYR") {
    return {
      status: "manual_eligible",
      provider: null,
      reason: "This currency is handled manually.",
    };
  }

  if (input.paymentMethod === "PAYPAL") {
    return input.paypalEmail
      ? {
          status: "manual_eligible",
          provider: null,
          reason: "PayPal payouts are confirmed manually.",
        }
      : {
          status: "missing_details",
          provider: null,
          reason: "A PayPal email is required.",
        };
  }

  if (input.paymentMethod === "BANK_TRANSFER") {
    return hasBankDetails(input)
      ? {
          status: "manual_eligible",
          provider: null,
          reason: "International bank transfers are confirmed manually.",
        }
      : {
          status: "missing_details",
          provider: null,
          reason: "Bank account details are required.",
        };
  }

  if (input.paymentMethod !== "DUITNOW") {
    return {
      status: "unsupported",
      provider: null,
      reason: "This payment method is not supported.",
    };
  }

  if (hasBankDetails(input)) {
    if (isBillplzSupported(input.bankName)) {
      return {
        status: "provider_eligible",
        provider: "BILLPLZ",
        reason: "This bank transfer should be routed through Billplz.",
      };
    }

    if (
      input.xenditEnabled &&
      requiresKycForAutoPayout(input.bankName) &&
      isXenditSupported(input.bankName)
    ) {
      return {
        status: "provider_eligible",
        provider: "XENDIT",
        reason: "This eWallet payout should be routed through Xendit.",
      };
    }

    return {
      status: "manual_eligible",
      provider: null,
      reason: "This DuitNow institution needs manual confirmation.",
    };
  }

  if (input.duitNowId) {
    return {
      status: "manual_eligible",
      provider: null,
      reason: "DuitNow ID payouts are confirmed manually.",
    };
  }

  return {
    status: "missing_details",
    provider: null,
    reason: "Payment details are incomplete.",
  };
}

export function canConfirmManualPayment(route: PayoutRouteClassification) {
  return route.status === "manual_eligible";
}
