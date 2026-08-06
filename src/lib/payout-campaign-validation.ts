import { z } from "zod";
import { DEVELOPER_RANKS } from "@/lib/developer-access";
import {
  CAMPAIGN_LIMITS,
  type CampaignScope,
  campaignScopeSupportsLabels,
} from "@/lib/payout-campaign";

/**
 * Shared client/server validation for payout campaigns. The admin form derives
 * inline errors from `collectCampaignFieldErrors`; the server action parses the
 * whole schema so the client can never outrun it.
 *
 * Dates cross the action boundary as ISO strings (the welcome-pack convention —
 * a Mantine DateTimePicker holds local wall-clock time and is serialized with
 * toISOString before it leaves the client), and come out of the schema as Date
 * objects ready for Prisma.
 */

const CAMPAIGN_SCOPES = ["PPT", "BONUS", "INCENTIVE"] as const;

/** Mantine palette names only — this value is interpolated into a `color` prop. */
export const CAMPAIGN_ACCENT_COLORS = [
  "violet",
  "grape",
  "blue",
  "teal",
  "green",
  "orange",
  "red",
  "pink",
] as const;

const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function trimmed(max: number) {
  return z
    .string()
    .transform((v) => v.trim())
    .pipe(z.string().max(max));
}

/** Trimmed, de-duplicated, blank-free label/id list. */
const labelList = z
  .array(z.string())
  .default([])
  .transform((values) => [
    ...new Set(values.map((value) => value.trim()).filter(Boolean)),
  ]);

const isoDateTime = z
  .string()
  .min(1, "Required")
  .transform((value) => new Date(value))
  .refine((date) => !Number.isNaN(date.getTime()), {
    message: "Enter a valid date and time",
  });

const nonNegative = (label: string) =>
  z
    .number()
    .refine((value) => Number.isFinite(value) && value >= 0, {
      message: `${label} cannot be negative`,
    })
    .default(0);

export const campaignSchema = z
  .object({
    slug: trimmed(CAMPAIGN_LIMITS.slug)
      .pipe(z.string().min(2, "Slug is required"))
      .refine((value) => SLUG_REGEX.test(value), {
        message: "Use lowercase words joined by hyphens, e.g. raya-sprint",
      }),
    name: trimmed(CAMPAIGN_LIMITS.name).pipe(
      z.string().min(2, "Name is required"),
    ),
    headline: trimmed(CAMPAIGN_LIMITS.headline).pipe(
      z.string().min(4, "Headline is required — developers read this first"),
    ),
    body: trimmed(CAMPAIGN_LIMITS.body).optional(),
    accentColor: z.enum(CAMPAIGN_ACCENT_COLORS).default("violet"),

    multiplier: z.number(),
    scopes: z
      .array(z.enum(CAMPAIGN_SCOPES))
      .min(1, "Pick at least one payout type to boost")
      .transform((scopes) => [...new Set(scopes)]),
    enabled: z.boolean().default(false),
    startsAt: isoDateTime,
    endsAt: isoDateTime,

    includedLabels: labelList,
    excludedLabels: labelList,
    ranks: z
      .array(z.enum(DEVELOPER_RANKS))
      .default([])
      .transform((ranks) => [...new Set(ranks)]),
    participantUserIds: labelList,

    upliftPoolMyr: nonNegative("MYR uplift pool"),
    upliftPoolRobux: nonNegative("Robux uplift pool"),
    perUserUpliftCapMyr: nonNegative("Per-developer MYR cap"),
    perUserUpliftCapRobux: nonNegative("Per-developer Robux cap"),
    creditLimitOnBaseAmount: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    if (!Number.isFinite(data.multiplier)) {
      ctx.addIssue({
        code: "custom",
        path: ["multiplier"],
        message: "Enter a multiplier",
      });
    } else if (data.multiplier <= CAMPAIGN_LIMITS.minMultiplier) {
      ctx.addIssue({
        code: "custom",
        path: ["multiplier"],
        message: "A multiplier of 1x or less pays nothing extra",
      });
    } else if (data.multiplier > CAMPAIGN_LIMITS.maxMultiplier) {
      ctx.addIssue({
        code: "custom",
        path: ["multiplier"],
        message: `Multipliers are capped at ${CAMPAIGN_LIMITS.maxMultiplier}x`,
      });
    }

    if (data.endsAt <= data.startsAt) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: "The end time must be after the start time",
      });
      return;
    }

    const days = (data.endsAt.getTime() - data.startsAt.getTime()) / DAY_MS;
    if (days > CAMPAIGN_LIMITS.maxDurationDays) {
      ctx.addIssue({
        code: "custom",
        path: ["endsAt"],
        message: `A campaign can run for at most ${CAMPAIGN_LIMITS.maxDurationDays} days — a permanent multiplier belongs in the rate, not a promo`,
      });
    }
  });

export type CampaignFields = z.infer<typeof campaignSchema>;
export type CampaignFieldsInput = z.input<typeof campaignSchema>;
export type CampaignFieldName = keyof CampaignFieldsInput;

export function parseCampaignFields(
  input: CampaignFieldsInput,
): { ok: true; fields: CampaignFields } | { ok: false; error: string } {
  const parsed = campaignSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid campaign" };
  }
  return { ok: true, fields: parsed.data };
}

/**
 * One schema parse → first error message per field, so the admin form derives
 * every inline error from a single call per render.
 */
export function collectCampaignFieldErrors(
  draft: CampaignFieldsInput,
): Partial<Record<CampaignFieldName, string>> {
  const parsed = campaignSchema.safeParse(draft);
  if (parsed.success) return {};
  const errors: Partial<Record<CampaignFieldName, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as CampaignFieldName | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/**
 * Non-blocking advice shown next to the form. These are configurations that
 * are legal but will not do what the admin probably expects — surfacing them
 * beats silently ignoring the setting.
 */
export function campaignConfigWarnings(draft: {
  scopes: CampaignScope[];
  includedLabels: string[];
  excludedLabels: string[];
  upliftPoolMyr: number;
  upliftPoolRobux: number;
  multiplier: number;
}): string[] {
  const warnings: string[] = [];
  const hasLabelFilter =
    draft.includedLabels.length > 0 || draft.excludedLabels.length > 0;
  const labelAwareScopes = draft.scopes.filter(campaignScopeSupportsLabels);

  if (hasLabelFilter && labelAwareScopes.length === 0) {
    warnings.push(
      "Label filters do nothing here: incentive awards span a whole period rather than one issue, so there are no labels to match.",
    );
  } else if (hasLabelFilter && draft.scopes.includes("INCENTIVE")) {
    warnings.push(
      "Label filters apply to PPT and bonus amounts only. Incentive awards under this campaign are multiplied regardless of labels.",
    );
  }

  if (draft.upliftPoolMyr === 0 && draft.upliftPoolRobux === 0) {
    warnings.push(
      `No uplift pool is set, so spend on this campaign is uncapped at ${draft.multiplier}x. Run the cost preview before enabling it.`,
    );
  }

  return warnings;
}
