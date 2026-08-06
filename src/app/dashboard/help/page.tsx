import {
  Alert,
  Badge,
  Card,
  Group,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { Sparkles } from "lucide-react";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PolicyPage from "@/components/PolicyPage";
import { formatAmount, getRateMultiplier } from "@/lib/currency";
import { getGuideTemplate, renderTemplate } from "@/lib/documents";
import { NOTIFICATION_CATALOG } from "@/lib/notifications/catalog";
import {
  describeCampaignRemaining,
  describeCampaignScopes,
  formatMultiplier,
  getCampaignWindowState,
} from "@/lib/payout-campaign";
import { getCampaignRows } from "@/lib/payout-campaign-server";
import { buildGlossary, WEEKLY_CREDIT_LIMITS } from "@/lib/payout-policy";
import { getResolvedPayoutPolicy } from "@/lib/payout-policy-server";
import { buildSocialMetadata } from "@/lib/social-previews";

export const metadata: Metadata = buildSocialMetadata("/dashboard/help");

/**
 * The rate table above is the permanent rate. When a campaign is live the
 * numbers developers actually see on the board are higher, so say so here
 * rather than letting the guide quietly contradict the dashboard.
 *
 * Cache Components: this subtree reads uncached Prisma data and no request
 * data of its own, so it must defer to request time first (AGENTS.md).
 */
async function LiveCampaignNotice() {
  await connection();

  const rows = await getCampaignRows();
  const live = rows.filter((row) => getCampaignWindowState(row).active);
  if (live.length === 0) return null;

  return (
    <Stack gap="sm">
      {live.map((campaign) => (
        <Alert
          key={campaign.id}
          variant="light"
          color={campaign.accentColor}
          icon={<Sparkles size={16} />}
          title={`${formatMultiplier(campaign.multiplier)} — ${campaign.headline}`}
        >
          <Text fz="sm">
            {campaign.body ??
              `${describeCampaignScopes(campaign.scopes)} are multiplied while this campaign runs.`}{" "}
            The rates below are the normal ones; this campaign{" "}
            {describeCampaignRemaining(campaign.endsAt)}. The multiplier is
            locked in when a payout becomes eligible, so work finished during
            the campaign still pays the promoted rate.
          </Text>
        </Alert>
      ))}
    </Stack>
  );
}

export default function HelpPage() {
  const policy = getResolvedPayoutPolicy();
  const guide = getGuideTemplate("EARNING");
  const rateVars = Object.fromEntries(
    [1, 2, 3, 4, 5].flatMap((points) => [
      [
        `rate${points}Myr`,
        formatAmount(points * getRateMultiplier("MYR"), "MYR"),
      ],
      [
        `rate${points}Robux`,
        formatAmount(points * getRateMultiplier("ROBUX"), "ROBUX"),
      ],
    ]),
  );
  const content = renderTemplate(guide.content, {
    stabilityMinutes: String(policy.stabilityMinutes),
    warnHours: String(policy.warnHours),
    unassignHours: String(policy.unassignHours),
    selfBlockHours: String(policy.selfBlockHours),
    weeklyLimitMyr: formatAmount(WEEKLY_CREDIT_LIMITS.MYR, "MYR"),
    weeklyLimitRobux: formatAmount(WEEKLY_CREDIT_LIMITS.ROBUX, "ROBUX"),
    ...rateVars,
  });
  const glossary = buildGlossary(policy);
  const developerNotifications = NOTIFICATION_CATALOG.filter(
    (entry) => entry.audience === "developer",
  );

  return (
    <PageContainer>
      <PageHeader
        title="Help & Guide"
        subtitle="How earning works on DevHub — the full lifecycle, the fairness rules, and every term explained."
      />
      <Suspense fallback={null}>
        <LiveCampaignNotice />
      </Suspense>

      <PolicyPage title="" content={content} />

      <Stack gap="md">
        <Text fz="xl" fw={700}>
          Glossary
        </Text>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
          {Object.entries(glossary).map(([key, entry]) => (
            <Card key={key} withBorder radius="md" padding="md">
              <Text fw={700} fz="sm" mb={4}>
                {entry.term}
              </Text>
              <Text fz="sm" c="dimmed">
                {entry.definition}
              </Text>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>

      <Stack gap="md">
        <Text fz="xl" fw={700}>
          What we&apos;ll notify you about
        </Text>
        <Text fz="sm" c="dimmed">
          Every notification DevHub can send you. Most are configurable in{" "}
          <Text component="span" fw={600}>
            HR Settings → Notification Preferences
          </Text>
          ; money and compliance updates are always sent.
        </Text>
        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="sm">
          {developerNotifications.map((entry) => (
            <Card
              key={`${entry.domain}:${entry.type}`}
              withBorder
              radius="md"
              padding="sm"
            >
              <Group justify="space-between" align="flex-start" wrap="nowrap">
                <Stack gap={2}>
                  <Text fw={600} fz="sm">
                    {entry.title}
                  </Text>
                  <Text fz="xs" c="dimmed">
                    {entry.description}
                  </Text>
                </Stack>
                <Badge
                  size="xs"
                  variant="light"
                  color={entry.configurable ? "blue" : "gray"}
                  style={{ flexShrink: 0 }}
                >
                  {entry.configurable ? "Configurable" : "Always sent"}
                </Badge>
              </Group>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>
    </PageContainer>
  );
}
