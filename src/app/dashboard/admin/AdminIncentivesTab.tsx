"use client";

import {
  Accordion,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Collapse,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Check, Play, RefreshCw, Save, ShieldAlert, X } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { MODAL_TRANSITION, OVERLAY_PROPS } from "@/components/animations";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
import {
  buildAdminIncentiveSummary,
  incentiveActionConsequence,
  incentiveHeldReasonCopy,
  incentiveStatusCopy,
} from "@/lib/incentive-copy";
import AdminIncentiveMechanicsDrawer from "./AdminIncentiveMechanicsDrawer";
import {
  approveHeldIncentiveAward,
  disputeIncentiveAward,
  releasePendingIncentives,
  requestIncentiveClawback,
  retriggerWeeklyIncentives,
  updateIncentiveConfig,
} from "./incentive-actions";

export type IncentiveConfigData = {
  enabled: boolean;
  activatedAt: string | null;
  weeklyEnabled: boolean;
  weeklyThreshold: number;
  weeklyMyrAmount: number;
  weeklyRobuxAmount: number;
  streakEnabled: boolean;
  streakThresholdWeeks: number;
  streakMyrAmount: number;
  streakRobuxAmount: number;
  milestoneEnabled: boolean;
  milestonesText: string;
  leaderboardEnabled: boolean;
  leaderboardTopN: number;
  leaderboardMyrAmount: number;
  leaderboardRobuxAmount: number;
  activeDayKickerEnabled: boolean;
  activeDayThreshold: number;
  activeDayKickerMyr: number;
  activeDayKickerRobux: number;
  minEstimateToCount: number;
  excludedLabels: string[];
  stabilityMinutes: number;
  disputeWindowHours: number;
  autoPayout: boolean;
  perUserWeeklyCapMyr: number;
  perUserWeeklyCapRobux: number;
  perUserMonthlyCapMyr: number;
  perUserMonthlyCapRobux: number;
  programWeeklyBudgetMyr: number;
  programWeeklyBudgetRobux: number;
  programMonthlyBudgetMyr: number;
  programMonthlyBudgetRobux: number;
  anomalyMultiplier: number;
  anomalyMinBaselineWeeks: number;
  noEstimateRatioFlag: number;
  clawbackMode: "NET_NEXT" | "MANUAL_ADJUSTMENT";
};

export type AdminIncentiveAwardData = {
  id: string;
  developerName: string;
  type: string;
  period: string;
  thresholdMet: number;
  amount: number;
  netAmount: number | null;
  clawbackApplied: number;
  currency: string;
  status: string;
  heldReason: string | null;
  releaseAt: string | null;
  createdAt: string;
  transactionId: string | null;
  issues: {
    id: string;
    identifier: string | null;
    title: string | null;
    url: string | null;
  }[];
};

function formatType(type: string) {
  if (type === "WEEKLY_THROUGHPUT") return "Weekly throughput";
  if (type === "STREAK") return "Streak";
  if (type === "MILESTONE") return "Milestone";
  if (type === "LEADERBOARD") return "Leaderboard";
  return type;
}

export default function AdminIncentivesTab({
  config,
  awards,
}: {
  config: IncentiveConfigData;
  awards: AdminIncentiveAwardData[];
}) {
  const [form, setForm] = useState(config);
  const [excludedLabels, setExcludedLabels] = useState(
    config.excludedLabels.join(", "),
  );
  const [saving, setSaving] = useState(false);
  const [weekKey, setWeekKey] = useState("");
  const [running, setRunning] = useState(false);
  const [releasing, setReleasing] = useState(false);
  const [actionAwardId, setActionAwardId] = useState<string | null>(null);
  const [actionKind, setActionKind] = useState<"cancel" | "clawback" | null>(
    null,
  );
  const [actionReason, setActionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [modalOpened, { open: openModal, close: closeModal }] =
    useDisclosure(false);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [weekFilter, setWeekFilter] = useState<string | null>(null);
  const [expandedAwardId, setExpandedAwardId] = useState<string | null>(null);
  const [lastReleaseResult, setLastReleaseResult] = useState<{
    released: number;
    skipped: number;
  } | null>(null);
  const [lastRunResult, setLastRunResult] = useState<{
    created: number;
    held: number;
    weekKey: string;
    skipped: boolean;
  } | null>(null);

  const summary = buildAdminIncentiveSummary(form);
  const enabledRewards = summary.activeRewards.filter(
    (reward) => reward.enabled,
  );

  const statusOptions = useMemo(
    () =>
      Array.from(new Set(awards.map((award) => award.status))).map(
        (status) => ({
          value: status,
          label: incentiveStatusCopy(status).label,
        }),
      ),
    [awards],
  );
  const typeOptions = useMemo(
    () =>
      Array.from(new Set(awards.map((award) => award.type))).map((type) => ({
        value: type,
        label: formatType(type),
      })),
    [awards],
  );
  const weekOptions = useMemo(
    () =>
      Array.from(new Set(awards.map((award) => award.period))).map(
        (period) => ({
          value: period,
          label: period,
        }),
      ),
    [awards],
  );
  const filteredAwards = useMemo(
    () =>
      awards.filter(
        (award) =>
          (!statusFilter || award.status === statusFilter) &&
          (!typeFilter || award.type === typeFilter) &&
          (!weekFilter || award.period === weekFilter),
      ),
    [awards, statusFilter, typeFilter, weekFilter],
  );
  const filtersActive = Boolean(statusFilter || typeFilter || weekFilter);

  const actionAward = actionAwardId
    ? awards.find((award) => award.id === actionAwardId)
    : undefined;

  function setField<K extends keyof IncentiveConfigData>(
    key: K,
    value: IncentiveConfigData[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const result = await updateIncentiveConfig({
      ...form,
      excludedLabels: excludedLabels.split(","),
    });
    setSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success("Incentive config saved");
  }

  async function handleRunWeek() {
    setRunning(true);
    const result = await retriggerWeeklyIncentives(weekKey.trim());
    setRunning(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    setLastRunResult(result);
    toast.success(`Evaluation complete for ${result.weekKey}`);
  }

  async function handleRelease() {
    setReleasing(true);
    const result = await releasePendingIncentives();
    setReleasing(false);
    setLastReleaseResult(result);
    toast.success(
      `Released ${result.released} award${result.released === 1 ? "" : "s"}`,
    );
  }

  async function handleApproveHeld(awardId: string) {
    const result = await approveHeldIncentiveAward(awardId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Award approved");
  }

  function requestAction(awardId: string, kind: "cancel" | "clawback") {
    setActionAwardId(awardId);
    setActionKind(kind);
    setActionReason("");
    openModal();
  }

  async function handleAction() {
    if (!actionAwardId || !actionKind) return;
    setActionLoading(true);
    const result =
      actionKind === "clawback"
        ? await requestIncentiveClawback(
            actionAwardId,
            actionReason.trim() || undefined,
          )
        : await disputeIncentiveAward(
            actionAwardId,
            actionReason.trim() || undefined,
          );
    setActionLoading(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success(
      actionKind === "clawback" ? "Clawback queued" : "Award cancelled",
    );
    closeModal();
  }

  return (
    <>
      <Stack gap="lg">
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Group gap="sm">
                <Title order={3}>Incentive Program</Title>
                <Badge variant="light" color={summary.programState.color}>
                  {summary.programState.label}
                </Badge>
              </Group>
              <AdminIncentiveMechanicsDrawer summary={summary} />
            </Group>
            <Text size="sm" c="dimmed">
              {summary.activatedLabel}
            </Text>

            <SimpleGrid cols={{ base: 1, sm: 2, md: 3 }} spacing="md">
              <Stack gap={4}>
                <Text size="xs" c="dimmed">
                  Active rewards
                </Text>
                {enabledRewards.length > 0 ? (
                  <Group gap={4}>
                    {enabledRewards.map((reward) => (
                      <Badge
                        key={reward.key}
                        size="sm"
                        variant="light"
                        color="blue"
                      >
                        {reward.label}
                      </Badge>
                    ))}
                  </Group>
                ) : (
                  <Text size="sm" c="dimmed">
                    None enabled
                  </Text>
                )}
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Weekly target
                </Text>
                <Text fw={600}>{summary.weekly.threshold} tasks</Text>
                <Text size="xs" c="dimmed">
                  {summary.weekly.myrFormatted} /{" "}
                  {summary.weekly.robuxFormatted}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Review window
                </Text>
                <Text fw={600}>{summary.disputeWindowHours} hours</Text>
                <Text size="xs" c="dimmed">
                  {summary.payoutMode.label}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Per-user weekly cap
                </Text>
                <Text fw={600}>{summary.caps.perUserWeeklyMyrFormatted}</Text>
                <Text size="xs" c="dimmed">
                  {summary.caps.perUserWeeklyRobuxFormatted}
                </Text>
              </Stack>
              <Stack gap={0}>
                <Text size="xs" c="dimmed">
                  Per-user monthly cap
                </Text>
                <Text fw={600}>{summary.caps.perUserMonthlyMyrFormatted}</Text>
                <Text size="xs" c="dimmed">
                  {summary.caps.perUserMonthlyRobuxFormatted}
                </Text>
              </Stack>
            </SimpleGrid>

            <Card
              withBorder
              radius="md"
              padding="md"
              bg="var(--mantine-color-default-hover)"
            >
              <Text size="xs" tt="uppercase" fw={700} c="dimmed" mb={4}>
                What developers see
              </Text>
              <Text size="sm">{summary.developerPreview}</Text>
            </Card>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Title order={3}>Configuration</Title>
            <Accordion multiple defaultValue={["program", "rewards"]}>
              <Accordion.Item value="program">
                <Accordion.Control>Program</Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                    <Switch
                      label="Enabled"
                      checked={form.enabled}
                      onChange={(event) =>
                        setField("enabled", event.currentTarget.checked)
                      }
                    />
                    <Switch
                      label="Auto-payout"
                      checked={form.autoPayout}
                      onChange={(event) =>
                        setField("autoPayout", event.currentTarget.checked)
                      }
                    />
                  </SimpleGrid>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="rewards">
                <Accordion.Control>Rewards</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <Switch
                        label="Weekly"
                        checked={form.weeklyEnabled}
                        onChange={(event) =>
                          setField("weeklyEnabled", event.currentTarget.checked)
                        }
                      />
                      <NumberInput
                        label="Weekly threshold"
                        value={form.weeklyThreshold}
                        min={1}
                        onChange={(value) =>
                          setField("weeklyThreshold", Number(value) || 1)
                        }
                      />
                      <NumberInput
                        label="Weekly MYR"
                        value={form.weeklyMyrAmount}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("weeklyMyrAmount", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Weekly Robux"
                        value={form.weeklyRobuxAmount}
                        min={0}
                        onChange={(value) =>
                          setField("weeklyRobuxAmount", Number(value) || 0)
                        }
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <Switch
                        label="Streak"
                        checked={form.streakEnabled}
                        onChange={(event) =>
                          setField("streakEnabled", event.currentTarget.checked)
                        }
                      />
                      <NumberInput
                        label="Streak weeks"
                        value={form.streakThresholdWeeks}
                        min={1}
                        onChange={(value) =>
                          setField("streakThresholdWeeks", Number(value) || 1)
                        }
                      />
                      <NumberInput
                        label="Streak MYR"
                        value={form.streakMyrAmount}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("streakMyrAmount", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Streak Robux"
                        value={form.streakRobuxAmount}
                        min={0}
                        onChange={(value) =>
                          setField("streakRobuxAmount", Number(value) || 0)
                        }
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <Switch
                        label="Leaderboard"
                        checked={form.leaderboardEnabled}
                        onChange={(event) =>
                          setField(
                            "leaderboardEnabled",
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <NumberInput
                        label="Top N"
                        value={form.leaderboardTopN}
                        min={1}
                        onChange={(value) =>
                          setField("leaderboardTopN", Number(value) || 1)
                        }
                      />
                      <NumberInput
                        label="Leaderboard MYR"
                        value={form.leaderboardMyrAmount}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("leaderboardMyrAmount", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Leaderboard Robux"
                        value={form.leaderboardRobuxAmount}
                        min={0}
                        onChange={(value) =>
                          setField("leaderboardRobuxAmount", Number(value) || 0)
                        }
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <Switch
                        label="Active-day kicker"
                        checked={form.activeDayKickerEnabled}
                        onChange={(event) =>
                          setField(
                            "activeDayKickerEnabled",
                            event.currentTarget.checked,
                          )
                        }
                      />
                      <NumberInput
                        label="Active days"
                        value={form.activeDayThreshold}
                        min={1}
                        onChange={(value) =>
                          setField("activeDayThreshold", Number(value) || 1)
                        }
                      />
                      <NumberInput
                        label="Kicker MYR"
                        value={form.activeDayKickerMyr}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("activeDayKickerMyr", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Kicker Robux"
                        value={form.activeDayKickerRobux}
                        min={0}
                        onChange={(value) =>
                          setField("activeDayKickerRobux", Number(value) || 0)
                        }
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <Switch
                        label="Milestones"
                        checked={form.milestoneEnabled}
                        onChange={(event) =>
                          setField(
                            "milestoneEnabled",
                            event.currentTarget.checked,
                          )
                        }
                      />
                    </SimpleGrid>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="eligibility">
                <Accordion.Control>Eligibility</Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                    <NumberInput
                      label="Min estimate"
                      value={form.minEstimateToCount}
                      min={1}
                      onChange={(value) =>
                        setField("minEstimateToCount", Number(value) || 1)
                      }
                    />
                    <NumberInput
                      label="Stability minutes"
                      value={form.stabilityMinutes}
                      min={0}
                      onChange={(value) =>
                        setField("stabilityMinutes", Number(value) || 0)
                      }
                    />
                    <TextInput
                      label="Excluded labels"
                      value={excludedLabels}
                      onChange={(event) =>
                        setExcludedLabels(event.currentTarget.value)
                      }
                    />
                  </SimpleGrid>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="release-review">
                <Accordion.Control>Release &amp; Review</Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                    <NumberInput
                      label="Dispute window (hours)"
                      value={form.disputeWindowHours}
                      min={0}
                      onChange={(value) =>
                        setField("disputeWindowHours", Number(value) || 0)
                      }
                    />
                    <Select
                      label="Clawback mode"
                      value={form.clawbackMode}
                      data={[
                        { value: "NET_NEXT", label: "Net next award" },
                        {
                          value: "MANUAL_ADJUSTMENT",
                          label: "Manual adjustment",
                        },
                      ]}
                      onChange={(value) =>
                        setField(
                          "clawbackMode",
                          (value as "NET_NEXT" | "MANUAL_ADJUSTMENT") ||
                            "NET_NEXT",
                        )
                      }
                    />
                  </SimpleGrid>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="caps-budgets">
                <Accordion.Control>Caps &amp; Budgets</Accordion.Control>
                <Accordion.Panel>
                  <Stack gap="md">
                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <NumberInput
                        label="Weekly MYR cap"
                        value={form.perUserWeeklyCapMyr}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("perUserWeeklyCapMyr", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Weekly Robux cap"
                        value={form.perUserWeeklyCapRobux}
                        min={0}
                        onChange={(value) =>
                          setField("perUserWeeklyCapRobux", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Monthly MYR cap"
                        value={form.perUserMonthlyCapMyr}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("perUserMonthlyCapMyr", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Monthly Robux cap"
                        value={form.perUserMonthlyCapRobux}
                        min={0}
                        onChange={(value) =>
                          setField("perUserMonthlyCapRobux", Number(value) || 0)
                        }
                      />
                    </SimpleGrid>

                    <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                      <NumberInput
                        label="Program weekly MYR"
                        value={form.programWeeklyBudgetMyr}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField("programWeeklyBudgetMyr", Number(value) || 0)
                        }
                      />
                      <NumberInput
                        label="Program weekly Robux"
                        value={form.programWeeklyBudgetRobux}
                        min={0}
                        onChange={(value) =>
                          setField(
                            "programWeeklyBudgetRobux",
                            Number(value) || 0,
                          )
                        }
                      />
                      <NumberInput
                        label="Program monthly MYR"
                        value={form.programMonthlyBudgetMyr}
                        min={0}
                        decimalScale={2}
                        onChange={(value) =>
                          setField(
                            "programMonthlyBudgetMyr",
                            Number(value) || 0,
                          )
                        }
                      />
                      <NumberInput
                        label="Program monthly Robux"
                        value={form.programMonthlyBudgetRobux}
                        min={0}
                        onChange={(value) =>
                          setField(
                            "programMonthlyBudgetRobux",
                            Number(value) || 0,
                          )
                        }
                      />
                    </SimpleGrid>
                  </Stack>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="risk">
                <Accordion.Control>Risk Controls</Accordion.Control>
                <Accordion.Panel>
                  <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
                    <NumberInput
                      label="Anomaly multiplier"
                      value={form.anomalyMultiplier}
                      min={1}
                      decimalScale={2}
                      onChange={(value) =>
                        setField("anomalyMultiplier", Number(value) || 1)
                      }
                    />
                    <NumberInput
                      label="Baseline weeks"
                      value={form.anomalyMinBaselineWeeks}
                      min={0}
                      onChange={(value) =>
                        setField("anomalyMinBaselineWeeks", Number(value) || 0)
                      }
                    />
                    <NumberInput
                      label="No-estimate ratio"
                      value={form.noEstimateRatioFlag}
                      min={0}
                      max={1}
                      decimalScale={2}
                      onChange={(value) =>
                        setField("noEstimateRatioFlag", Number(value) || 0)
                      }
                    />
                  </SimpleGrid>
                </Accordion.Panel>
              </Accordion.Item>

              <Accordion.Item value="advanced">
                <Accordion.Control>Advanced</Accordion.Control>
                <Accordion.Panel>
                  <Textarea
                    label="Milestones JSON"
                    minRows={3}
                    autosize
                    value={form.milestonesText}
                    onChange={(event) =>
                      setField("milestonesText", event.currentTarget.value)
                    }
                  />
                </Accordion.Panel>
              </Accordion.Item>
            </Accordion>

            <Group justify="flex-end">
              <Button
                leftSection={<Save size={16} />}
                onClick={handleSave}
                loading={saving}
              >
                Save Incentives
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>Operations</Title>
              <Button
                variant="light"
                leftSection={<Play size={16} />}
                onClick={handleRelease}
                loading={releasing}
              >
                Release Due
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Releases every award whose review window has elapsed. When
              auto-payout is on, payout transactions are created automatically.
            </Text>
            {lastReleaseResult && (
              <Alert
                variant="light"
                color={lastReleaseResult.released > 0 ? "green" : "gray"}
              >
                {lastReleaseResult.released > 0
                  ? `Released ${lastReleaseResult.released} award${lastReleaseResult.released === 1 ? "" : "s"}${
                      lastReleaseResult.skipped > 0
                        ? `, ${lastReleaseResult.skipped} group${lastReleaseResult.skipped === 1 ? "" : "s"} skipped`
                        : ""
                    }.`
                  : `No awards were due for release${
                      lastReleaseResult.skipped > 0
                        ? ` (${lastReleaseResult.skipped} group${lastReleaseResult.skipped === 1 ? "" : "s"} skipped)`
                        : ""
                    }.`}
              </Alert>
            )}
            <Group align="flex-end">
              <TextInput
                label="Week key"
                placeholder="2026-W23"
                value={weekKey}
                onChange={(event) => setWeekKey(event.currentTarget.value)}
              />
              <Button
                leftSection={<RefreshCw size={16} />}
                onClick={handleRunWeek}
                loading={running}
                disabled={!weekKey.trim()}
              >
                Re-run Week
              </Button>
            </Group>
            <Text size="xs" c="dimmed">
              Re-evaluates the given ISO week (e.g. 2026-W23). Idempotent —
              developers already awarded for that week are skipped, not
              double-paid.
            </Text>
            {lastRunResult && (
              <Alert
                variant="light"
                color={lastRunResult.skipped ? "gray" : "blue"}
              >
                {lastRunResult.skipped
                  ? `Week ${lastRunResult.weekKey} was skipped (program disabled or before activation).`
                  : lastRunResult.created > 0
                    ? `Created ${lastRunResult.created} award${lastRunResult.created === 1 ? "" : "s"} for ${lastRunResult.weekKey}${
                        lastRunResult.held > 0
                          ? `, ${lastRunResult.held} held for review`
                          : ""
                      }.`
                    : `No new awards for ${lastRunResult.weekKey} — all qualifying developers were already evaluated.`}
              </Alert>
            )}
          </Stack>
        </Card>

        <Stack gap="md">
          <Title order={3}>Recent Awards</Title>
          {awards.length > 0 && (
            <Group gap="sm" align="flex-end" wrap="wrap">
              <Select
                label="Status"
                placeholder="All"
                clearable
                value={statusFilter}
                data={statusOptions}
                onChange={setStatusFilter}
              />
              <Select
                label="Reward type"
                placeholder="All"
                clearable
                value={typeFilter}
                data={typeOptions}
                onChange={setTypeFilter}
              />
              <Select
                label="Week"
                placeholder="All"
                clearable
                value={weekFilter}
                data={weekOptions}
                onChange={setWeekFilter}
              />
              <Text size="sm" c="dimmed" pb={6}>
                Showing {filteredAwards.length} of {awards.length}
              </Text>
            </Group>
          )}
          {awards.length === 0 ? (
            <Card withBorder radius="md" padding="xl" ta="center">
              <Text c="dimmed">No incentive awards yet.</Text>
            </Card>
          ) : filteredAwards.length === 0 ? (
            <Card withBorder radius="md" padding="xl" ta="center">
              <Stack gap="sm" align="center">
                <Text c="dimmed">No awards match these filters.</Text>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => {
                    setStatusFilter(null);
                    setTypeFilter(null);
                    setWeekFilter(null);
                  }}
                  disabled={!filtersActive}
                >
                  Clear filters
                </Button>
              </Stack>
            </Card>
          ) : (
            filteredAwards.map((award) => {
              const statusCopy = incentiveStatusCopy(award.status);
              const heldCopy =
                award.status === "HELD" || award.heldReason
                  ? incentiveHeldReasonCopy(award.heldReason)
                  : null;
              const expanded = expandedAwardId === award.id;
              return (
                <Card key={award.id} withBorder radius="md" padding="lg">
                  <Stack gap="sm">
                    <Group justify="space-between" align="flex-start">
                      <Stack gap={4}>
                        <Group gap="xs">
                          <Text fw={700}>{award.developerName}</Text>
                          <Badge
                            size="sm"
                            variant="light"
                            color={statusCopy.color}
                          >
                            {statusCopy.label}
                          </Badge>
                        </Group>
                        <Text size="sm" c="dimmed">
                          {formatType(award.type)} - {award.period} - threshold{" "}
                          {award.thresholdMet}
                        </Text>
                        {award.releaseAt &&
                          (award.status === "PENDING" ||
                            award.status === "HELD") && (
                            <Text size="xs" c="dimmed">
                              Releases{" "}
                              {new Date(award.releaseAt).toLocaleString()}
                            </Text>
                          )}
                      </Stack>
                      <Stack gap={2} align="flex-end">
                        <Text fw={700}>
                          {formatAmount(
                            award.netAmount ?? award.amount,
                            award.currency as CurrencyCode,
                          )}
                        </Text>
                        {award.clawbackApplied > 0 && (
                          <Text size="xs" c="orange">
                            Clawback applied{" "}
                            {formatAmount(
                              award.clawbackApplied,
                              award.currency as CurrencyCode,
                            )}
                          </Text>
                        )}
                      </Stack>
                    </Group>

                    {heldCopy && (
                      <Box
                        bg="var(--mantine-color-orange-light)"
                        p="sm"
                        style={{ borderRadius: "var(--mantine-radius-md)" }}
                      >
                        <Text size="sm" fw={600} c="orange">
                          {heldCopy.title}
                        </Text>
                        <Text size="xs" c="dimmed">
                          {heldCopy.explanation}
                        </Text>
                      </Box>
                    )}

                    {award.transactionId && (
                      <Text size="xs" c="dimmed">
                        Linked payout transaction{" "}
                        {award.transactionId.slice(-8)}
                      </Text>
                    )}

                    {award.issues.length > 0 && (
                      <Stack gap={4}>
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          w="fit-content"
                          onClick={() =>
                            setExpandedAwardId(expanded ? null : award.id)
                          }
                        >
                          {expanded
                            ? "Hide counted issues"
                            : `Show ${award.issues.length} counted issue${award.issues.length === 1 ? "" : "s"}`}
                        </Button>
                        <Collapse expanded={expanded}>
                          <Stack gap={4}>
                            {award.issues.map((issue) => (
                              <Text key={issue.id} size="xs" c="dimmed">
                                {issue.url ? (
                                  <Anchor
                                    href={issue.url}
                                    target="_blank"
                                    size="xs"
                                  >
                                    {issue.identifier ||
                                      issue.title ||
                                      issue.id}
                                  </Anchor>
                                ) : (
                                  issue.identifier || issue.title || issue.id
                                )}
                                {issue.title && issue.identifier
                                  ? ` - ${issue.title}`
                                  : ""}
                              </Text>
                            ))}
                          </Stack>
                        </Collapse>
                      </Stack>
                    )}

                    <Group justify="flex-end">
                      {award.status === "HELD" && (
                        <Button
                          size="xs"
                          variant="light"
                          color="green"
                          leftSection={<Check size={14} />}
                          onClick={() => handleApproveHeld(award.id)}
                        >
                          Approve Held
                        </Button>
                      )}
                      {["PENDING", "HELD"].includes(award.status) && (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          leftSection={<X size={14} />}
                          onClick={() => requestAction(award.id, "cancel")}
                        >
                          Cancel
                        </Button>
                      )}
                      {award.status === "PAID" && (
                        <Button
                          size="xs"
                          variant="light"
                          color="orange"
                          leftSection={<ShieldAlert size={14} />}
                          onClick={() => requestAction(award.id, "clawback")}
                        >
                          Clawback
                        </Button>
                      )}
                    </Group>
                  </Stack>
                </Card>
              );
            })
          )}
        </Stack>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={actionLoading ? () => {} : closeModal}
        title={actionKind === "clawback" ? "Request clawback" : "Cancel award"}
        centered
        radius="md"
        transitionProps={MODAL_TRANSITION}
        overlayProps={OVERLAY_PROPS}
      >
        <Stack gap="md">
          {actionAward && actionKind && (
            <Alert
              variant="light"
              color={actionKind === "clawback" ? "orange" : "red"}
            >
              {incentiveActionConsequence(actionKind, {
                amountFormatted: formatAmount(
                  actionAward.netAmount ?? actionAward.amount,
                  actionAward.currency as CurrencyCode,
                ),
                clawbackMode: form.clawbackMode,
              })}
            </Alert>
          )}
          <Textarea
            label="Reason"
            value={actionReason}
            onChange={(event) => setActionReason(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button
              variant="default"
              onClick={closeModal}
              disabled={actionLoading}
            >
              Back
            </Button>
            <Button
              color={actionKind === "clawback" ? "orange" : "red"}
              loading={actionLoading}
              onClick={handleAction}
            >
              {actionKind === "clawback" ? "Request clawback" : "Cancel award"}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
