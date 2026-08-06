"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/authz";
import { TAGS } from "@/lib/cache-tags";
import { resolveDisplayName } from "@/lib/display-name";
import {
  type CampaignCostPreview,
  getCampaignLedger,
  previewCampaignCost,
} from "@/lib/payout-campaign-server";
import {
  type CampaignFieldsInput,
  parseCampaignFields,
} from "@/lib/payout-campaign-validation";
import prisma from "@/lib/prisma";

// Campaigns move real money, so every mutation here is admin-guarded, parsed
// through the shared zod schema (never trusting the client form), and followed
// by a cache-tag invalidation — otherwise a newly enabled campaign would take
// up to the getCampaignRows revalidate window to reach the payout paths.

function revalidateCampaignPaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/ppts");
  revalidatePath("/dashboard/bonuses");
  revalidatePath("/dashboard/admin");
  revalidatePath("/dashboard/admin/campaigns");
  updateTag(TAGS.payoutCampaigns);
}

export async function saveCampaign(input: {
  id?: string | null;
  fields: CampaignFieldsInput;
}) {
  const adminUserId = await requireAdmin();

  const parsed = parseCampaignFields(input.fields);
  if (!parsed.ok) return { error: parsed.error };
  const fields = parsed.fields;

  try {
    const data = {
      slug: fields.slug,
      name: fields.name,
      headline: fields.headline,
      body: fields.body || null,
      accentColor: fields.accentColor,
      multiplier: fields.multiplier,
      scopes: fields.scopes,
      enabled: fields.enabled,
      startsAt: fields.startsAt,
      endsAt: fields.endsAt,
      includedLabels: fields.includedLabels,
      excludedLabels: fields.excludedLabels,
      ranks: fields.ranks,
      participantUserIds: fields.participantUserIds,
      upliftPoolMyr: fields.upliftPoolMyr,
      upliftPoolRobux: fields.upliftPoolRobux,
      perUserUpliftCapMyr: fields.perUserUpliftCapMyr,
      perUserUpliftCapRobux: fields.perUserUpliftCapRobux,
      creditLimitOnBaseAmount: fields.creditLimitOnBaseAmount,
    };

    const campaign = input.id
      ? await prisma.payoutCampaign.update({
          where: { id: input.id },
          data,
        })
      : await prisma.payoutCampaign.create({
          data: { ...data, createdById: adminUserId },
        });

    revalidateCampaignPaths();
    return { success: true, id: campaign.id };
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      return { error: "That slug is already used by another campaign" };
    }
    return {
      error: error instanceof Error ? error.message : "Failed to save campaign",
    };
  }
}

/**
 * The kill switch. Kept separate from saveCampaign so pausing a runaway
 * campaign is one click and cannot fail validation on some unrelated field.
 */
export async function setCampaignEnabled(id: string, enabled: boolean) {
  await requireAdmin();

  try {
    await prisma.payoutCampaign.update({ where: { id }, data: { enabled } });
    revalidateCampaignPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to update campaign",
    };
  }
}

/**
 * Deleting cascades the ledger, so it is only allowed while a campaign has
 * never paid anything. A campaign with history is disabled, not erased —
 * those rows are the audit trail for money that actually moved.
 */
export async function deleteCampaign(id: string) {
  await requireAdmin();

  const applied = await prisma.payoutCampaignApplication.count({
    where: { campaignId: id },
  });
  if (applied > 0) {
    return {
      error:
        "This campaign has already paid uplift. Disable it instead — deleting would erase the payout audit trail.",
    };
  }

  try {
    await prisma.payoutCampaign.delete({ where: { id } });
    revalidateCampaignPaths();
    return { success: true };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to delete campaign",
    };
  }
}

/** Back-test a draft against real history before it is switched on. */
export async function previewCampaign(
  fields: CampaignFieldsInput,
  lookbackDays = 30,
): Promise<{ preview: CampaignCostPreview } | { error: string }> {
  await requireAdmin();

  const parsed = parseCampaignFields(fields);
  if (!parsed.ok) return { error: parsed.error };

  try {
    const preview = await previewCampaignCost(
      {
        multiplier: parsed.fields.multiplier,
        scopes: parsed.fields.scopes,
        includedLabels: parsed.fields.includedLabels,
        excludedLabels: parsed.fields.excludedLabels,
        ranks: parsed.fields.ranks,
        participantUserIds: parsed.fields.participantUserIds,
        upliftPoolMyr: parsed.fields.upliftPoolMyr,
        upliftPoolRobux: parsed.fields.upliftPoolRobux,
      },
      lookbackDays,
    );
    return { preview };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to preview campaign",
    };
  }
}

export async function loadCampaignLedger(campaignId: string) {
  await requireAdmin();
  const { applications, spendByCurrency } = await getCampaignLedger(campaignId);

  return {
    spend: [...spendByCurrency.entries()].map(([currency, amount]) => ({
      currency,
      amount,
    })),
    applications: applications.map((application) => ({
      id: application.id,
      scope: application.scope,
      currency: application.currency,
      baseAmount: application.baseAmount,
      multiplier: application.multiplier,
      upliftAmount: application.upliftAmount,
      reverted: application.reverted,
      createdAt: application.createdAt.toISOString(),
      // Never the legal name: this list is rendered in the admin console.
      developer: resolveDisplayName({ profile: application.user }),
    })),
  };
}
