"use client";

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Modal,
  NumberInput,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Check, RefreshCw, Save, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  approveMonthlyBonus,
  refreshBonusCandidatesFromLinear,
  rejectBonusCandidate,
  updateBonusConfig,
} from "./bonus-actions";

export type BonusConfigData = {
  enabled: boolean;
  myrRatePerPoint: number;
  robuxRatePerPoint: number;
  excludedLabels: string[];
};

export type BonusReviewCandidate = {
  id: string;
  userId: string;
  developerName: string;
  developerEmail: string | null;
  currency: string;
  period: string;
  linearIssueIdentifier: string | null;
  linearIssueTitle: string | null;
  linearIssueUrl: string | null;
  labels: string[];
  estimate: number | null;
  maxAmount: number;
  completedAt: string | null;
};

type GroupedCandidates = {
  key: string;
  userId: string;
  developerName: string;
  developerEmail: string | null;
  currency: string;
  period: string;
  candidates: BonusReviewCandidate[];
};

function formatPeriod(period: string) {
  const [year, month] = period.split("-").map((part) => Number(part));
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function currentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${`${now.getMonth() + 1}`.padStart(2, "0")}`;
}

function groupCandidates(candidates: BonusReviewCandidate[]) {
  const grouped = new Map<string, GroupedCandidates>();

  for (const candidate of candidates) {
    const key = `${candidate.userId}:${candidate.currency}:${candidate.period}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.candidates.push(candidate);
    } else {
      grouped.set(key, {
        key,
        userId: candidate.userId,
        developerName: candidate.developerName,
        developerEmail: candidate.developerEmail,
        currency: candidate.currency,
        period: candidate.period,
        candidates: [candidate],
      });
    }
  }

  return [...grouped.values()].sort((a, b) =>
    `${a.period}:${a.developerName}`.localeCompare(
      `${b.period}:${b.developerName}`,
    ),
  );
}

export default function AdminBonusesTab({
  config,
  candidates,
}: {
  config: BonusConfigData;
  candidates: BonusReviewCandidate[];
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(config.enabled);
  const [myrRate, setMyrRate] = useState(config.myrRatePerPoint);
  const [robuxRate, setRobuxRate] = useState(config.robuxRatePerPoint);
  const [excludedLabels, setExcludedLabels] = useState(
    config.excludedLabels.join(", "),
  );
  const [savingConfig, setSavingConfig] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [approvingKey, setApprovingKey] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(
      candidates.map((candidate) => [candidate.id, candidate.maxAmount]),
    ),
  );
  const [periodFilter, setPeriodFilter] = useState(currentPeriod());
  const [
    rejectModalOpened,
    { open: openRejectModal, close: closeRejectModal },
  ] = useDisclosure(false);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);

  const visibleCandidates = useMemo(
    () =>
      periodFilter
        ? candidates.filter((candidate) => candidate.period === periodFilter)
        : candidates,
    [candidates, periodFilter],
  );
  const groups = useMemo(
    () => groupCandidates(visibleCandidates),
    [visibleCandidates],
  );

  async function handleSaveConfig() {
    setSavingConfig(true);
    const result = await updateBonusConfig({
      enabled,
      myrRatePerPoint: Number(myrRate),
      robuxRatePerPoint: Number(robuxRate),
      excludedLabels: excludedLabels.split(","),
    });
    setSavingConfig(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Bonus scale saved");
    router.refresh();
  }

  async function handleRefresh() {
    setRefreshing(true);
    const result = await refreshBonusCandidatesFromLinear();
    setRefreshing(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(`Checked ${result.count ?? 0} Linear tasks`);
    router.refresh();
  }

  async function handleApprove(group: GroupedCandidates) {
    setApprovingKey(group.key);
    const result = await approveMonthlyBonus({
      userId: group.userId,
      currency: group.currency,
      period: group.period,
      items: group.candidates.map((candidate) => ({
        candidateId: candidate.id,
        amount: Number(amounts[candidate.id] ?? candidate.maxAmount),
      })),
    });
    setApprovingKey(null);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Bonus payout queued");
    router.refresh();
  }

  function requestReject(candidateId: string) {
    setRejectingId(candidateId);
    setRejectReason("");
    openRejectModal();
  }

  async function handleReject() {
    if (!rejectingId) return;
    setRejecting(true);
    const result = await rejectBonusCandidate(
      rejectingId,
      rejectReason.trim() || undefined,
    );
    setRejecting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Bonus item rejected");
    setRejectingId(null);
    closeRejectModal();
    router.refresh();
  }

  return (
    <>
      <Stack gap="lg">
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>Bonus Scale</Title>
              <Button
                variant="light"
                leftSection={<RefreshCw size={16} />}
                onClick={handleRefresh}
                loading={refreshing}
              >
                Refresh from Linear
              </Button>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
              <Switch
                label="Enabled"
                checked={enabled}
                onChange={(event) => setEnabled(event.currentTarget.checked)}
              />
              <NumberInput
                label="MYR per point"
                value={myrRate}
                min={1}
                decimalScale={2}
                onChange={(value) => setMyrRate(Number(value) || 0)}
              />
              <NumberInput
                label="Robux per point"
                value={robuxRate}
                min={1}
                decimalScale={0}
                onChange={(value) => setRobuxRate(Number(value) || 0)}
              />
              <TextInput
                label="Excluded labels"
                value={excludedLabels}
                onChange={(event) =>
                  setExcludedLabels(event.currentTarget.value)
                }
              />
            </SimpleGrid>
            <Group justify="flex-end">
              <Button
                leftSection={<Save size={16} />}
                onClick={handleSaveConfig}
                loading={savingConfig}
              >
                Save Scale
              </Button>
            </Group>
          </Stack>
        </Card>

        <Group justify="space-between" align="end">
          <div>
            <Title order={3}>Monthly Review</Title>
            <Text size="sm" c="dimmed">
              Completed eligible bonus work waiting for manual amounts.
            </Text>
          </div>
          <TextInput
            label="Month"
            type="month"
            value={periodFilter}
            onChange={(event) => setPeriodFilter(event.currentTarget.value)}
          />
        </Group>

        {groups.length === 0 ? (
          <Card withBorder radius="md" padding="xl" ta="center">
            <Text c="dimmed">
              No completed bonus candidates for this month.
            </Text>
          </Card>
        ) : (
          <Stack gap="lg">
            {groups.map((group) => {
              const currency = group.currency === "ROBUX" ? "ROBUX" : "MYR";
              const total = group.candidates.reduce(
                (sum, candidate) =>
                  sum + Number(amounts[candidate.id] ?? candidate.maxAmount),
                0,
              );

              return (
                <Card key={group.key} withBorder radius="md" padding="lg">
                  <Stack gap="md">
                    <Group justify="space-between" align="flex-start">
                      <div>
                        <Group gap="xs">
                          <Title order={4}>{group.developerName}</Title>
                          <Badge variant="light" color="gray">
                            {formatPeriod(group.period)}
                          </Badge>
                          <Badge variant="light" color="blue">
                            {group.currency}
                          </Badge>
                        </Group>
                        {group.developerEmail && (
                          <Text size="sm" c="dimmed">
                            {group.developerEmail}
                          </Text>
                        )}
                      </div>
                      <Text fw={700} c="green">
                        {formatAmount(total, currency as CurrencyCode)}
                      </Text>
                    </Group>

                    <Stack gap="sm">
                      {group.candidates.map((candidate) => (
                        <Box
                          key={candidate.id}
                          p="sm"
                          style={{
                            borderRadius: "var(--mantine-radius-md)",
                            background: "var(--mantine-color-dark-6)",
                          }}
                        >
                          <Group
                            justify="space-between"
                            align="flex-start"
                            wrap="nowrap"
                          >
                            <Stack gap={4} style={{ minWidth: 0, flex: 1 }}>
                              <Group gap="xs">
                                {candidate.linearIssueIdentifier && (
                                  <Badge variant="light" color="gray">
                                    {candidate.linearIssueIdentifier}
                                  </Badge>
                                )}
                                {candidate.estimate && (
                                  <Badge variant="outline" color="blue">
                                    {candidate.estimate} pt
                                  </Badge>
                                )}
                                {candidate.labels.slice(0, 3).map((label) => (
                                  <Badge key={label} variant="dot" color="gray">
                                    {label}
                                  </Badge>
                                ))}
                              </Group>
                              <Text fw={600} lineClamp={2}>
                                {candidate.linearIssueTitle ||
                                  "Untitled Linear issue"}
                              </Text>
                              {candidate.linearIssueUrl && (
                                <Anchor
                                  href={candidate.linearIssueUrl}
                                  target="_blank"
                                  size="sm"
                                >
                                  Open in Linear
                                </Anchor>
                              )}
                            </Stack>
                            <Group gap="sm" wrap="nowrap" align="end">
                              <NumberInput
                                label="Approved"
                                value={
                                  amounts[candidate.id] ?? candidate.maxAmount
                                }
                                min={1}
                                max={candidate.maxAmount}
                                decimalScale={currency === "MYR" ? 2 : 0}
                                w={140}
                                onChange={(value) =>
                                  setAmounts((current) => ({
                                    ...current,
                                    [candidate.id]: Number(value) || 0,
                                  }))
                                }
                              />
                              <Text size="sm" c="dimmed" w={110}>
                                Cap{" "}
                                {formatAmount(
                                  candidate.maxAmount,
                                  currency as CurrencyCode,
                                )}
                              </Text>
                              <Button
                                variant="light"
                                color="red"
                                leftSection={<X size={14} />}
                                onClick={() => requestReject(candidate.id)}
                              >
                                Reject
                              </Button>
                            </Group>
                          </Group>
                        </Box>
                      ))}
                    </Stack>

                    <Group justify="flex-end">
                      <Button
                        color="green"
                        leftSection={<Check size={16} />}
                        onClick={() => handleApprove(group)}
                        loading={approvingKey === group.key}
                      >
                        Approve Monthly Bonus
                      </Button>
                    </Group>
                  </Stack>
                </Card>
              );
            })}
          </Stack>
        )}
      </Stack>

      <Modal
        opened={rejectModalOpened}
        onClose={closeRejectModal}
        title="Reject bonus item"
        centered
      >
        <Stack>
          <Textarea
            label="Reason"
            placeholder="Optional note for the review record"
            value={rejectReason}
            onChange={(event) => setRejectReason(event.currentTarget.value)}
            autosize
            minRows={3}
          />
          <Group justify="flex-end">
            <Button variant="light" onClick={closeRejectModal}>
              Cancel
            </Button>
            <Button color="red" onClick={handleReject} loading={rejecting}>
              Reject
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
