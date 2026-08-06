"use client";

import {
  Alert,
  Badge,
  Button,
  Card,
  Group,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TagsInput,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import { DateTimePicker } from "@mantine/dates";
import dayjs from "dayjs";
import { Save, Sparkles, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { formatAmount } from "@/lib/currency";
import { DEVELOPER_RANK_LABELS, DEVELOPER_RANKS } from "@/lib/developer-access";
import {
  CAMPAIGN_LIMITS,
  CAMPAIGN_SCOPE_LABELS,
  campaignDeveloperPreview,
  formatMultiplier,
  getCampaignWindowState,
} from "@/lib/payout-campaign";
import {
  CAMPAIGN_ACCENT_COLORS,
  type CampaignFieldsInput,
  campaignConfigWarnings,
  collectCampaignFieldErrors,
} from "@/lib/payout-campaign-validation";
import { previewCampaign, saveCampaign } from "./actions";

export type CampaignFormData = {
  id: string | null;
  slug: string;
  name: string;
  headline: string;
  body: string;
  accentColor: string;
  multiplier: number;
  scopes: string[];
  enabled: boolean;
  /** ISO strings — serialized across the RSC boundary. */
  startsAt: string;
  endsAt: string;
  includedLabels: string[];
  excludedLabels: string[];
  ranks: string[];
  participantUserIds: string[];
  upliftPoolMyr: number;
  upliftPoolRobux: number;
  perUserUpliftCapMyr: number;
  perUserUpliftCapRobux: number;
  creditLimitOnBaseAmount: boolean;
};

type CostPreviewRow = {
  currency: string;
  matchedCount: number;
  baseSpend: number;
  projectedUplift: number;
  pool: number;
  exceedsPool: boolean;
};

const SCOPE_OPTIONS = (["PPT", "BONUS", "INCENTIVE"] as const).map((scope) => ({
  value: scope,
  label: CAMPAIGN_SCOPE_LABELS[scope],
}));

const RANK_OPTIONS = DEVELOPER_RANKS.map((rank) => ({
  value: rank,
  label: DEVELOPER_RANK_LABELS[rank],
}));

export default function CampaignForm({
  campaign,
  onSaved,
}: {
  campaign: CampaignFormData;
  onSaved?: () => void;
}) {
  const [draft, setDraft] = useState<CampaignFormData>(campaign);
  const [saving, setSaving] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState<CostPreviewRow[] | null>(null);

  function set<K extends keyof CampaignFormData>(
    key: K,
    value: CampaignFormData[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    // Any edit invalidates a previous cost estimate.
    setPreview(null);
  }

  const fields = useMemo<CampaignFieldsInput>(
    () => ({
      slug: draft.slug,
      name: draft.name,
      headline: draft.headline,
      body: draft.body,
      accentColor: draft.accentColor as CampaignFieldsInput["accentColor"],
      multiplier: draft.multiplier,
      scopes: draft.scopes as CampaignFieldsInput["scopes"],
      enabled: draft.enabled,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt,
      includedLabels: draft.includedLabels,
      excludedLabels: draft.excludedLabels,
      ranks: draft.ranks as CampaignFieldsInput["ranks"],
      participantUserIds: draft.participantUserIds,
      upliftPoolMyr: draft.upliftPoolMyr,
      upliftPoolRobux: draft.upliftPoolRobux,
      perUserUpliftCapMyr: draft.perUserUpliftCapMyr,
      perUserUpliftCapRobux: draft.perUserUpliftCapRobux,
      creditLimitOnBaseAmount: draft.creditLimitOnBaseAmount,
    }),
    [draft],
  );

  // One parse per render feeds every inline error, mirroring the welcome-pack
  // order form.
  const errors = useMemo(() => collectCampaignFieldErrors(fields), [fields]);
  const warnings = useMemo(
    () =>
      campaignConfigWarnings({
        scopes: draft.scopes as CampaignFieldsInput["scopes"],
        includedLabels: draft.includedLabels,
        excludedLabels: draft.excludedLabels,
        upliftPoolMyr: draft.upliftPoolMyr,
        upliftPoolRobux: draft.upliftPoolRobux,
        multiplier: draft.multiplier,
        startsAt: draft.startsAt ? new Date(draft.startsAt) : null,
        endsAt: draft.endsAt ? new Date(draft.endsAt) : null,
      }),
    [draft],
  );

  async function handleSave() {
    setSaving(true);
    try {
      const result = await saveCampaign({ id: draft.id, fields });
      if ("error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      toast.success(draft.id ? "Campaign saved" : "Campaign created");
      onSaved?.();
    } finally {
      setSaving(false);
    }
  }

  async function handlePreview() {
    setPreviewing(true);
    try {
      const result = await previewCampaign(fields, 30);
      if ("error" in result) {
        toast.error(result.error);
        return;
      }
      setPreview(result.preview.perCurrency);
    } finally {
      setPreviewing(false);
    }
  }

  return (
    <Stack gap="lg">
      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Campaign</Title>
              <Text c="dimmed" size="sm">
                What developers see, and how much extra every eligible payout
                pays while it runs.
              </Text>
            </div>
            <CampaignStatusBadge
              enabled={draft.enabled}
              startsAt={draft.startsAt}
              endsAt={draft.endsAt}
            />
          </Group>

          <SimpleGrid cols={{ base: 1, md: 3 }}>
            <TextInput
              label="Name"
              description="Internal and ledger label"
              value={draft.name}
              onChange={(e) => set("name", e.currentTarget.value)}
              error={errors.name}
              maxLength={CAMPAIGN_LIMITS.name}
            />
            <TextInput
              label="Slug"
              description="Stable key, e.g. raya-sprint"
              value={draft.slug}
              onChange={(e) => set("slug", e.currentTarget.value)}
              error={errors.slug}
              maxLength={CAMPAIGN_LIMITS.slug}
            />
            <NumberInput
              label="Multiplier"
              description={`Above 1x, up to ${CAMPAIGN_LIMITS.maxMultiplier}x`}
              value={draft.multiplier}
              onChange={(value) => set("multiplier", Number(value))}
              error={errors.multiplier}
              min={1}
              max={CAMPAIGN_LIMITS.maxMultiplier}
              step={0.5}
              decimalScale={2}
            />
          </SimpleGrid>

          <TextInput
            label="Headline"
            description={`The first thing developers read, on the dashboard banner. The banner already shows "${formatMultiplier(draft.multiplier)}" beside it — don't repeat the multiplier here.`}
            placeholder="Every PPT task pays extra this sprint"
            value={draft.headline}
            onChange={(e) => set("headline", e.currentTarget.value)}
            error={errors.headline}
            maxLength={CAMPAIGN_LIMITS.headline}
          />

          <Textarea
            label="Details"
            description="Optional second line — the rules, in plain language"
            value={draft.body}
            onChange={(e) => set("body", e.currentTarget.value)}
            error={errors.body}
            maxLength={CAMPAIGN_LIMITS.body}
            autosize
            minRows={2}
          />

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Select
              label="Boosts"
              description="Which payout types this multiplies"
              data={SCOPE_OPTIONS}
              value={null}
              placeholder="Add a payout type"
              searchable={false}
              error={errors.scopes}
              onChange={(value) => {
                if (!value || draft.scopes.includes(value)) return;
                set("scopes", [...draft.scopes, value]);
              }}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Selected
              </Text>
              <Group gap="xs">
                {draft.scopes.length === 0 && (
                  <Text size="sm" c="dimmed">
                    None yet
                  </Text>
                )}
                {draft.scopes.map((scope) => (
                  <Badge
                    key={scope}
                    variant="light"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      set(
                        "scopes",
                        draft.scopes.filter((item) => item !== scope),
                      )
                    }
                  >
                    {CAMPAIGN_SCOPE_LABELS[
                      scope as keyof typeof CAMPAIGN_SCOPE_LABELS
                    ] ?? scope}{" "}
                    ×
                  </Badge>
                ))}
              </Group>
            </Stack>
          </SimpleGrid>

          <Switch
            label="Campaign is live"
            description="Master switch — turn off to stop the multiplier immediately, regardless of the schedule"
            checked={draft.enabled}
            onChange={(e) => set("enabled", e.currentTarget.checked)}
          />

          <Group grow align="flex-start">
            <DateTimePicker
              label="Starts at"
              description="Inclusive"
              value={draft.startsAt ? new Date(draft.startsAt) : null}
              onChange={(value) =>
                set("startsAt", value ? new Date(value).toISOString() : "")
              }
              error={errors.startsAt}
            />
            <DateTimePicker
              label="Ends at"
              description="Exclusive — the multiplier stops at this moment"
              value={draft.endsAt ? new Date(draft.endsAt) : null}
              onChange={(value) =>
                set("endsAt", value ? new Date(value).toISOString() : "")
              }
              error={errors.endsAt}
            />
          </Group>

          <Select
            label="Accent colour"
            data={CAMPAIGN_ACCENT_COLORS.map((color) => ({
              value: color,
              label: color,
            }))}
            value={draft.accentColor}
            onChange={(value) => set("accentColor", value ?? "violet")}
          />

          <Alert
            variant="light"
            color={draft.accentColor}
            icon={<Sparkles size={16} />}
            title="What developers will see"
          >
            {campaignDeveloperPreview({
              enabled: draft.enabled,
              multiplier: draft.multiplier,
              scopes: draft.scopes as CampaignFieldsInput["scopes"],
              headline: draft.headline,
              startsAt: new Date(draft.startsAt || Date.now()),
              endsAt: new Date(draft.endsAt || Date.now()),
            })}
          </Alert>
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Who and what it applies to</Title>
            <Text c="dimmed" size="sm">
              Leave a field empty for "no restriction". Label filters apply to
              PPT and bonus amounts only — an incentive award spans a whole
              week, so it has no single label to match.
            </Text>
          </div>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <TagsInput
              label="Only these Linear labels"
              description="Empty = every issue qualifies"
              value={draft.includedLabels}
              onChange={(value) => set("includedLabels", value)}
            />
            <TagsInput
              label="Never these Linear labels"
              description="Always wins over the list on the left"
              value={draft.excludedLabels}
              onChange={(value) => set("excludedLabels", value)}
            />
          </SimpleGrid>

          <SimpleGrid cols={{ base: 1, md: 2 }}>
            <Select
              label="Only these ranks"
              description="Empty = every rank"
              data={RANK_OPTIONS}
              value={null}
              placeholder="Add a rank"
              onChange={(value) => {
                if (!value || draft.ranks.includes(value)) return;
                set("ranks", [...draft.ranks, value]);
              }}
            />
            <Stack gap={4}>
              <Text size="sm" fw={500}>
                Selected ranks
              </Text>
              <Group gap="xs">
                {draft.ranks.length === 0 && (
                  <Text size="sm" c="dimmed">
                    Every rank
                  </Text>
                )}
                {draft.ranks.map((rank) => (
                  <Badge
                    key={rank}
                    variant="light"
                    style={{ cursor: "pointer" }}
                    onClick={() =>
                      set(
                        "ranks",
                        draft.ranks.filter((item) => item !== rank),
                      )
                    }
                  >
                    {DEVELOPER_RANK_LABELS[
                      rank as keyof typeof DEVELOPER_RANK_LABELS
                    ] ?? rank}{" "}
                    ×
                  </Badge>
                ))}
              </Group>
            </Stack>
          </SimpleGrid>

          <TagsInput
            label="Only these developers"
            description="DevHub user IDs. Empty = everyone."
            value={draft.participantUserIds}
            onChange={(value) => set("participantUserIds", value)}
          />
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <div>
            <Title order={4}>Guardrails</Title>
            <Text c="dimmed" size="sm">
              0 means unlimited. When a pool or cap runs out the payout is made
              at the normal rate rather than being blocked — nobody's earnings
              wait on a marketing budget.
            </Text>
          </div>

          <SimpleGrid cols={{ base: 1, md: 4 }}>
            <NumberInput
              label="MYR uplift pool"
              description="Total extra MYR this campaign may pay"
              value={draft.upliftPoolMyr}
              onChange={(value) => set("upliftPoolMyr", Number(value))}
              error={errors.upliftPoolMyr}
              min={0}
            />
            <NumberInput
              label="Robux uplift pool"
              value={draft.upliftPoolRobux}
              onChange={(value) => set("upliftPoolRobux", Number(value))}
              error={errors.upliftPoolRobux}
              min={0}
            />
            <NumberInput
              label="Per-developer MYR cap"
              value={draft.perUserUpliftCapMyr}
              onChange={(value) => set("perUserUpliftCapMyr", Number(value))}
              error={errors.perUserUpliftCapMyr}
              min={0}
            />
            <NumberInput
              label="Per-developer Robux cap"
              value={draft.perUserUpliftCapRobux}
              onChange={(value) => set("perUserUpliftCapRobux", Number(value))}
              error={errors.perUserUpliftCapRobux}
              min={0}
            />
          </SimpleGrid>

          <Switch
            label="Weekly credit limit ignores the multiplier"
            description="Recommended. The weekly auto-approval limit is one level-5 task; counting multiplied amounts would push every promo payout into manual review."
            checked={draft.creditLimitOnBaseAmount}
            onChange={(e) =>
              set("creditLimitOnBaseAmount", e.currentTarget.checked)
            }
          />

          {warnings.map((warning) => (
            <Alert
              key={warning}
              variant="light"
              color="yellow"
              icon={<TriangleAlert size={16} />}
            >
              {warning}
            </Alert>
          ))}
        </Stack>
      </Card>

      <Card withBorder radius="md" padding="lg">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={4}>Cost preview</Title>
              <Text c="dimmed" size="sm">
                What this campaign would have cost over the last 30 days of real
                payouts. Run it before switching a multiplier on.
              </Text>
            </div>
            <Button
              variant="light"
              loading={previewing}
              onClick={handlePreview}
            >
              Estimate cost
            </Button>
          </Group>

          {preview && (
            <Stack gap="xs">
              {preview.map((row) => (
                <Group key={row.currency} justify="space-between">
                  <Text size="sm">
                    {row.currency} — {row.matchedCount} matching payout
                    {row.matchedCount === 1 ? "" : "s"}
                  </Text>
                  <Group gap="sm">
                    <Text size="sm" c="dimmed">
                      {formatAmount(
                        row.baseSpend,
                        row.currency === "ROBUX" ? "ROBUX" : "MYR",
                      )}{" "}
                      base
                    </Text>
                    <Badge
                      variant="light"
                      color={row.exceedsPool ? "red" : "green"}
                    >
                      +
                      {formatAmount(
                        row.projectedUplift,
                        row.currency === "ROBUX" ? "ROBUX" : "MYR",
                      )}{" "}
                      uplift
                    </Badge>
                  </Group>
                </Group>
              ))}
              {preview.some((row) => row.exceedsPool) && (
                <Alert
                  variant="light"
                  color="red"
                  icon={<TriangleAlert size={16} />}
                >
                  At this rate the pool would be exhausted before the campaign
                  ends, and later payouts would fall back to the normal rate.
                </Alert>
              )}
            </Stack>
          )}
        </Stack>
      </Card>

      <Group justify="flex-end">
        <Button
          leftSection={<Save size={16} />}
          loading={saving}
          disabled={Object.keys(errors).length > 0}
          onClick={handleSave}
        >
          {draft.id
            ? "Save changes"
            : `Create ${formatMultiplier(draft.multiplier)} campaign`}
        </Button>
      </Group>
    </Stack>
  );
}

function CampaignStatusBadge({
  enabled,
  startsAt,
  endsAt,
}: {
  enabled: boolean;
  startsAt: string;
  endsAt: string;
}) {
  // Reflects the *unsaved* form values so admins see the effect before
  // committing. Client time is fine here — enforcement is server-side.
  if (!startsAt || !endsAt) {
    return (
      <Badge variant="light" color="gray">
        Not scheduled
      </Badge>
    );
  }

  const state = getCampaignWindowState({
    enabled,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  });

  if (state.active) {
    return (
      <Stack gap={2} align="flex-end">
        <Badge variant="light" color="green">
          Live
        </Badge>
        <Text size="xs" c="dimmed">
          Ends {dayjs(state.endsAt).format("D MMM YYYY, HH:mm")}
        </Text>
      </Stack>
    );
  }

  const copy =
    state.reason === "disabled"
      ? "Paused by switch"
      : state.reason === "not-yet-started"
        ? `Starts ${dayjs(state.startsAt).format("D MMM YYYY, HH:mm")}`
        : `Ended ${dayjs(state.endsAt).format("D MMM YYYY, HH:mm")}`;

  return (
    <Stack gap={2} align="flex-end">
      <Badge
        variant="light"
        color={state.reason === "not-yet-started" ? "yellow" : "gray"}
      >
        {state.reason === "not-yet-started" ? "Scheduled" : "Not live"}
      </Badge>
      <Text size="xs" c="dimmed">
        {copy}
      </Text>
    </Stack>
  );
}
