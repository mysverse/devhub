"use client";

import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Card,
  Group,
  Stack,
  Switch,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
} from "@mantine/core";
import dayjs from "dayjs";
import { Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import ConfirmModal from "@/components/ConfirmModal";
import EmptyState from "@/components/EmptyState";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  CAMPAIGN_SCOPE_LABELS,
  describeCampaignRemaining,
  formatMultiplier,
  getCampaignWindowState,
} from "@/lib/payout-campaign";
import {
  deleteCampaign,
  loadCampaignLedger,
  setCampaignEnabled,
} from "./actions";
import CampaignForm, { type CampaignFormData } from "./CampaignForm";

type LedgerRow = {
  id: string;
  scope: string;
  currency: string;
  baseAmount: number;
  multiplier: number;
  upliftAmount: number;
  reverted: boolean;
  createdAt: string;
  developer: string;
};

function blankCampaign(): CampaignFormData {
  const start = new Date();
  const end = new Date(start.getTime() + 14 * 24 * 60 * 60 * 1000);
  return {
    id: null,
    slug: "",
    name: "",
    headline: "",
    body: "",
    accentColor: "violet",
    multiplier: 2,
    scopes: ["PPT"],
    enabled: false,
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    includedLabels: [],
    excludedLabels: [],
    ranks: [],
    participantUserIds: [],
    upliftPoolMyr: 0,
    upliftPoolRobux: 0,
    perUserUpliftCapMyr: 0,
    perUserUpliftCapRobux: 0,
    creditLimitOnBaseAmount: true,
  };
}

function currencyCode(currency: string): CurrencyCode {
  return currency === "ROBUX" ? "ROBUX" : "MYR";
}

export default function CampaignsAdmin({
  campaigns,
}: {
  campaigns: CampaignFormData[];
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(campaigns.length === 0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [ledgers, setLedgers] = useState<Record<string, LedgerRow[]>>({});
  const [pendingDelete, setPendingDelete] = useState<CampaignFormData | null>(
    null,
  );

  async function toggle(campaign: CampaignFormData, enabled: boolean) {
    if (!campaign.id) return;
    setBusyId(campaign.id);
    try {
      const result = await setCampaignEnabled(campaign.id, enabled);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(
        enabled
          ? `${campaign.name} is live — payouts now pay ${formatMultiplier(campaign.multiplier)}`
          : `${campaign.name} paused`,
      );
      router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  async function openLedger(campaignId: string) {
    if (ledgers[campaignId]) return;
    const result = await loadCampaignLedger(campaignId);
    setLedgers((current) => ({
      ...current,
      [campaignId]: result.applications,
    }));
  }

  async function confirmDelete() {
    if (!pendingDelete?.id) return;
    const result = await deleteCampaign(pendingDelete.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Campaign deleted");
    setPendingDelete(null);
    router.refresh();
  }

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Text c="dimmed" size="sm">
          Campaigns multiply payouts for a fixed window. They never stack — when
          more than one applies, the highest multiplier wins.
        </Text>
        <Button
          leftSection={<Plus size={16} />}
          variant={creating ? "subtle" : "filled"}
          onClick={() => setCreating((value) => !value)}
        >
          {creating ? "Cancel" : "New campaign"}
        </Button>
      </Group>

      {creating && (
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Title order={3}>New campaign</Title>
            <CampaignForm
              campaign={blankCampaign()}
              onSaved={() => {
                setCreating(false);
                router.refresh();
              }}
            />
          </Stack>
        </Card>
      )}

      {campaigns.length === 0 && !creating && (
        <EmptyState description="No campaigns yet. Create one to run a limited-time payout multiplier." />
      )}

      {campaigns.length > 0 && (
        <Accordion variant="separated" onChange={(id) => id && openLedger(id)}>
          {campaigns.map((campaign) => {
            const state = getCampaignWindowState({
              enabled: campaign.enabled,
              startsAt: new Date(campaign.startsAt),
              endsAt: new Date(campaign.endsAt),
            });
            return (
              <AccordionItem
                key={campaign.id ?? campaign.slug}
                value={campaign.id ?? campaign.slug}
              >
                <AccordionControl>
                  <Group justify="space-between" wrap="nowrap" pr="md">
                    <Group gap="sm" wrap="nowrap">
                      <Badge color={campaign.accentColor} variant="filled">
                        {formatMultiplier(campaign.multiplier)}
                      </Badge>
                      <div>
                        <Text fw={500}>{campaign.name}</Text>
                        <Text size="xs" c="dimmed">
                          {campaign.scopes
                            .map(
                              (scope) =>
                                CAMPAIGN_SCOPE_LABELS[
                                  scope as keyof typeof CAMPAIGN_SCOPE_LABELS
                                ] ?? scope,
                            )
                            .join(", ")}
                          {" · "}
                          {dayjs(campaign.startsAt).format("D MMM")} –{" "}
                          {dayjs(campaign.endsAt).format("D MMM YYYY")}
                        </Text>
                      </div>
                    </Group>
                    <Badge
                      variant="light"
                      color={
                        state.active
                          ? "green"
                          : state.reason === "not-yet-started"
                            ? "yellow"
                            : "gray"
                      }
                    >
                      {state.active
                        ? describeCampaignRemaining(state.endsAt)
                        : state.reason === "disabled"
                          ? "Paused"
                          : state.reason === "not-yet-started"
                            ? "Scheduled"
                            : "Ended"}
                    </Badge>
                  </Group>
                </AccordionControl>

                <AccordionPanel>
                  <Stack gap="lg">
                    <Group justify="space-between">
                      <Switch
                        label="Live"
                        checked={campaign.enabled}
                        disabled={busyId === campaign.id}
                        onChange={(e) =>
                          toggle(campaign, e.currentTarget.checked)
                        }
                      />
                      <Button
                        variant="subtle"
                        color="red"
                        leftSection={<Trash2 size={16} />}
                        onClick={() => setPendingDelete(campaign)}
                      >
                        Delete
                      </Button>
                    </Group>

                    <CampaignForm
                      campaign={campaign}
                      onSaved={() => router.refresh()}
                    />

                    <CampaignLedger rows={ledgers[campaign.id ?? ""]} />
                  </Stack>
                </AccordionPanel>
              </AccordionItem>
            );
          })}
        </Accordion>
      )}

      <ConfirmModal
        opened={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="Delete campaign"
        description={`Delete "${pendingDelete?.name}"? Campaigns that have already paid uplift cannot be deleted — disable those instead, so the payout audit trail survives.`}
        tone="danger"
        confirmLabel="Delete"
      />
    </Stack>
  );
}

function CampaignLedger({ rows }: { rows: LedgerRow[] | undefined }) {
  if (!rows) {
    return (
      <Text size="sm" c="dimmed">
        Loading uplift ledger…
      </Text>
    );
  }
  if (rows.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No uplift paid under this campaign yet.
      </Text>
    );
  }

  return (
    <Stack gap="xs">
      <Title order={5}>Uplift ledger</Title>
      <Table striped highlightOnHover>
        <TableThead>
          <TableTr>
            <TableTh>Developer</TableTh>
            <TableTh>Type</TableTh>
            <TableTh>Base</TableTh>
            <TableTh>Uplift</TableTh>
            <TableTh>When</TableTh>
          </TableTr>
        </TableThead>
        <TableTbody>
          {rows.map((row) => (
            <TableTr key={row.id} opacity={row.reverted ? 0.5 : 1}>
              <TableTd>{row.developer}</TableTd>
              <TableTd>
                {CAMPAIGN_SCOPE_LABELS[
                  row.scope as keyof typeof CAMPAIGN_SCOPE_LABELS
                ] ?? row.scope}
              </TableTd>
              <TableTd>
                {formatAmount(row.baseAmount, currencyCode(row.currency))}
              </TableTd>
              <TableTd>
                {row.reverted ? (
                  <Text size="sm" c="dimmed" td="line-through">
                    {formatAmount(row.upliftAmount, currencyCode(row.currency))}
                  </Text>
                ) : (
                  <Text size="sm" fw={500}>
                    +
                    {formatAmount(row.upliftAmount, currencyCode(row.currency))}
                  </Text>
                )}
              </TableTd>
              <TableTd>
                {dayjs(row.createdAt).format("D MMM YYYY, HH:mm")}
              </TableTd>
            </TableTr>
          ))}
        </TableTbody>
      </Table>
    </Stack>
  );
}
