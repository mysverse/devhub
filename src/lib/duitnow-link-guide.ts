/**
 * Where "link this ID to DuitNow" lives in each app.
 *
 * Once a developer has named the bank or e-wallet, the form can point at that
 * app's own menu instead of listing five apps and hoping one is theirs. The
 * known entries came from the confirmation modal this replaced; anything not
 * listed gets the generic line, which is still true of every participant.
 */

import { getBankDisplayName } from "@/lib/payment-validation";

export type DuitNowLinkGuide = {
  /** The app as its users call it. */
  app: string;
  /** One line: where the DuitNow ID screen is in that app. */
  line: string;
};

const KNOWN: Record<string, DuitNowLinkGuide> = {
  MBBEMYKL: {
    app: "Maybank MAE / Maybank2u",
    line: "In Maybank MAE or Maybank2u: Settings → Pay & Transfer → Transfer → DuitNow",
  },
  CIBBMYKL: {
    app: "CIMB OCTO",
    line: "In CIMB OCTO: More → Services → Manage DuitNow → DuitNow ID",
  },
  TNGDMYNB: {
    app: "Touch ’n Go eWallet",
    line: "In Touch ’n Go eWallet: Profile → DuitNow → Link eWallet with DuitNow",
  },
  BOSTMYNB: {
    app: "Boost",
    line: "In Boost: Profile → DuitNow (verified accounts only)",
  },
  ARPYMYNB: {
    app: "ShopeePay",
    line: "In the standalone ShopeePay app, not the main Shopee app: look for DuitNow",
  },
};

export function linkGuideFor(
  bic: string | null | undefined,
): DuitNowLinkGuide | null {
  if (!bic) return null;
  const known = KNOWN[bic];
  if (known) return known;
  const app = getBankDisplayName(bic);
  return {
    app,
    line: `Look for “DuitNow” or “Manage DuitNow ID” in the ${app} app, or ask them.`,
  };
}
