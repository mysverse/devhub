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
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { type CurrencyCode, formatAmount } from "@/lib/currency";
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

function statusColor(status: string) {
  if (status === "PAID" || status === "SETTLED_BY_CLAWBACK") return "green";
  if (status === "HELD" || status === "CLAWBACK_REQUESTED") return "orange";
  if (status === "CANCELLED") return "red";
  if (status === "TRANSACTION_PENDING" || status === "RELEASING") {
    return "blue";
  }
  return "yellow";
}

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
  const router = useRouter();
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
    router.refresh();
  }

  async function handleRunWeek() {
    setRunning(true);
    const result = await retriggerWeeklyIncentives(weekKey.trim());
    setRunning(false);

    if ("error" in result) {
      toast.error(result.error);
      return;
    }

    toast.success(`Evaluation complete for ${result.weekKey}`);
    router.refresh();
  }

  async function handleRelease() {
    setReleasing(true);
    const result = await releasePendingIncentives();
    setReleasing(false);
    toast.success(
      `Released ${result.released} award${result.released === 1 ? "" : "s"}`,
    );
    router.refresh();
  }

  async function handleApproveHeld(awardId: string) {
    const result = await approveHeldIncentiveAward(awardId);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Award approved");
    router.refresh();
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
    router.refresh();
  }

  return (
    <>
      <Stack gap="lg">
        <Card withBorder radius="md" padding="lg">
          <Stack gap="md">
            <Group justify="space-between" align="center">
              <Title order={3}>Incentive Program</Title>
              {form.activatedAt && (
                <Badge variant="light" color="blue">
                  Active since {new Date(form.activatedAt).toLocaleDateString()}
                </Badge>
              )}
            </Group>

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
              <NumberInput
                label="Min estimate"
                value={form.minEstimateToCount}
                min={1}
                onChange={(value) =>
                  setField("minEstimateToCount", Number(value) || 1)
                }
              />
              <NumberInput
                label="Dispute window (hours)"
                value={form.disputeWindowHours}
                min={0}
                onChange={(value) =>
                  setField("disputeWindowHours", Number(value) || 0)
                }
              />
            </SimpleGrid>

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
                  setField("leaderboardEnabled", event.currentTarget.checked)
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
                  setField("programWeeklyBudgetRobux", Number(value) || 0)
                }
              />
              <NumberInput
                label="Program monthly MYR"
                value={form.programMonthlyBudgetMyr}
                min={0}
                decimalScale={2}
                onChange={(value) =>
                  setField("programMonthlyBudgetMyr", Number(value) || 0)
                }
              />
              <NumberInput
                label="Program monthly Robux"
                value={form.programMonthlyBudgetRobux}
                min={0}
                onChange={(value) =>
                  setField("programMonthlyBudgetRobux", Number(value) || 0)
                }
              />
            </SimpleGrid>

            <SimpleGrid cols={{ base: 1, md: 4 }} spacing="md">
              <NumberInput
                label="Stability minutes"
                value={form.stabilityMinutes}
                min={0}
                onChange={(value) =>
                  setField("stabilityMinutes", Number(value) || 0)
                }
              />
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

            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              <Switch
                label="Milestones"
                checked={form.milestoneEnabled}
                onChange={(event) =>
                  setField("milestoneEnabled", event.currentTarget.checked)
                }
              />
              <TextInput
                label="Excluded labels"
                value={excludedLabels}
                onChange={(event) =>
                  setExcludedLabels(event.currentTarget.value)
                }
              />
              <Select
                label="Clawback mode"
                value={form.clawbackMode}
                data={[
                  { value: "NET_NEXT", label: "Net next award" },
                  { value: "MANUAL_ADJUSTMENT", label: "Manual adjustment" },
                ]}
                onChange={(value) =>
                  setField(
                    "clawbackMode",
                    (value as "NET_NEXT" | "MANUAL_ADJUSTMENT") || "NET_NEXT",
                  )
                }
              />
            </SimpleGrid>

            <Textarea
              label="Milestones JSON"
              minRows={3}
              value={form.milestonesText}
              onChange={(event) =>
                setField("milestonesText", event.currentTarget.value)
              }
            />

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
          </Stack>
        </Card>

        <Stack gap="md">
          <Title order={3}>Recent Awards</Title>
          {awards.length === 0 ? (
            <Card withBorder radius="md" padding="xl" ta="center">
              <Text c="dimmed">No incentive awards yet.</Text>
            </Card>
          ) : (
            awards.map((award) => (
              <Card key={award.id} withBorder radius="md" padding="lg">
                <Stack gap="sm">
                  <Group justify="space-between" align="flex-start">
                    <Stack gap={4}>
                      <Group gap="xs">
                        <Text fw={700}>{award.developerName}</Text>
                        <Badge
                          size="sm"
                          variant="light"
                          color={statusColor(award.status)}
                        >
                          {award.status.replaceAll("_", " ")}
                        </Badge>
                      </Group>
                      <Text size="sm" c="dimmed">
                        {formatType(award.type)} - {award.period} - threshold{" "}
                        {award.thresholdMet}
                      </Text>
                    </Stack>
                    <Text fw={700}>
                      {formatAmount(
                        award.netAmount ?? award.amount,
                        award.currency as CurrencyCode,
                      )}
                    </Text>
                  </Group>

                  {award.heldReason && (
                    <Box
                      bg="var(--mantine-color-orange-light)"
                      p="sm"
                      style={{ borderRadius: "var(--mantine-radius-md)" }}
                    >
                      <Text size="sm" fw={600} c="orange">
                        {award.heldReason.replaceAll("_", " ")}
                      </Text>
                    </Box>
                  )}

                  {award.issues.length > 0 && (
                    <Stack gap={4}>
                      {award.issues.slice(0, 6).map((issue) => (
                        <Text key={issue.id} size="xs" c="dimmed">
                          {issue.url ? (
                            <Anchor href={issue.url} target="_blank" size="xs">
                              {issue.identifier || issue.title || issue.id}
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
            ))
          )}
        </Stack>
      </Stack>

      <Modal
        opened={modalOpened}
        onClose={actionLoading ? () => {} : closeModal}
        title={actionKind === "clawback" ? "Request clawback" : "Cancel award"}
        centered
        radius="md"
      >
        <Stack gap="md">
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
