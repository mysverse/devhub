import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { listCampaigns } from "@/lib/payout-campaign-server";
import { buildSocialMetadata } from "@/lib/social-previews";
import type { CampaignFormData } from "./CampaignForm";
import CampaignsAdmin from "./CampaignsAdmin";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/campaigns",
);

export default function AdminCampaignsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Payout Campaigns"
        subtitle="Run a limited-time multiplier on PPT payouts, bonus caps, and incentive awards."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminCampaignsContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminCampaignsContent() {
  await requireAdminPage();

  const campaigns = await listCampaigns();
  const data: CampaignFormData[] = campaigns.map((campaign) => ({
    id: campaign.id,
    slug: campaign.slug,
    name: campaign.name,
    headline: campaign.headline,
    body: campaign.body ?? "",
    accentColor: campaign.accentColor,
    multiplier: campaign.multiplier,
    scopes: campaign.scopes,
    enabled: campaign.enabled,
    startsAt: campaign.startsAt.toISOString(),
    endsAt: campaign.endsAt.toISOString(),
    includedLabels: campaign.includedLabels,
    excludedLabels: campaign.excludedLabels,
    ranks: campaign.ranks,
    participantUserIds: campaign.participantUserIds,
    upliftPoolMyr: campaign.upliftPoolMyr,
    upliftPoolRobux: campaign.upliftPoolRobux,
    perUserUpliftCapMyr: campaign.perUserUpliftCapMyr,
    perUserUpliftCapRobux: campaign.perUserUpliftCapRobux,
    creditLimitOnBaseAmount: campaign.creditLimitOnBaseAmount,
  }));

  return <CampaignsAdmin campaigns={data} />;
}
