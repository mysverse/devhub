"use client";

import {
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Group,
  Select,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Textarea,
  TextInput,
  Title,
} from "@mantine/core";
import type { ShippingRegion, WelcomePackOrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  approveWelcomePackOrder,
  fetchLiveEligibilityEvidence,
  type LiveEligibilityResult,
  markWelcomePackOrderDelivered,
  markWelcomePackOrderShipped,
  rejectWelcomePackOrder,
} from "./actions";

export type AdminQualifyingIssue = {
  id: string;
  identifier: string;
  title: string;
  url: string;
  completedAt: string;
};

export type AdminEligibilitySnapshot = {
  wave: 1 | 2;
  capturedAt: string;
  lookbackMonths: number;
  qualifyingIssues: AdminQualifyingIssue[];
  truncated: boolean;
  note: string;
} | null;

export type AdminOrderRow = {
  id: string;
  status: WelcomePackOrderStatus;
  wave: number;
  recipientName: string;
  developerName: string;
  developerEmail: string | null;
  region: ShippingRegion;
  idCardName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string;
  country: string;
  notes: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  selections: { itemName: string; selectedSize: string | null }[];
  eligibility: AdminEligibilitySnapshot;
};

const STATUS_COLORS: Record<WelcomePackOrderStatus, string> = {
  PENDING: "yellow",
  APPROVED: "blue",
  SHIPPED: "indigo",
  DELIVERED: "green",
  CANCELLED: "gray",
  REJECTED: "red",
};

const FILTERS: { value: string; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
  { value: "REJECTED", label: "Rejected" },
];

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("en-MY", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatAddress(order: AdminOrderRow) {
  return [
    order.addressLine1,
    order.addressLine2,
    [order.city, order.stateProvince].filter(Boolean).join(", "),
    [order.postalCode, order.country].filter(Boolean).join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

export default function OrdersTable({ orders }: { orders: AdminOrderRow[] }) {
  const [filter, setFilter] = useState<string>("ALL");

  const filtered =
    filter === "ALL" ? orders : orders.filter((o) => o.status === filter);

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={4}>Orders</Title>
          <Text c="dimmed" size="sm">
            Manage incoming welcome pack orders.
          </Text>
        </div>
        <Select
          label="Filter status"
          data={FILTERS}
          value={filter}
          onChange={(v) => setFilter(v ?? "ALL")}
          w={200}
        />
      </Group>

      {filtered.length === 0 ? (
        <Card withBorder radius="md" p="xl" ta="center">
          <Text c="dimmed">No orders match this filter.</Text>
        </Card>
      ) : (
        <Stack gap="sm">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </Stack>
      )}
    </Stack>
  );
}

function OrderCard({ order }: { order: AdminOrderRow }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [showShip, setShowShip] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");

  async function run(
    action: string,
    fn: () => Promise<{ error?: string } | undefined>,
  ) {
    setBusy(action);
    try {
      const res = await fn();
      if (res?.error) {
        toast.error(res.error);
        return false;
      }
      toast.success("Order updated");
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <Badge color={STATUS_COLORS[order.status]} variant="light">
              {order.status}
            </Badge>
            <Badge variant="light" color="grape">
              Wave {order.wave}
            </Badge>
            <Badge variant="light" color="cyan">
              {order.region === "DOMESTIC" ? "Malaysia" : "International"}
            </Badge>
            <Text size="sm" c="dimmed">
              Submitted {formatDate(order.createdAt)}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {order.developerEmail ?? "—"}
          </Text>
        </Group>

        <Group align="flex-start" gap="xl" wrap="wrap">
          <Stack gap={4} style={{ minWidth: 220 }}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Developer
            </Text>
            <Text fw={600}>{order.developerName}</Text>
            <Text size="sm">ID card: {order.idCardName}</Text>
          </Stack>

          <Stack gap={4} style={{ minWidth: 240 }}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Shipping
            </Text>
            <Text size="sm" fw={500}>
              {order.recipientName}
            </Text>
            <Text size="sm" c="dimmed">
              {order.phone}
            </Text>
            <Text size="sm" style={{ whiteSpace: "pre-line" }}>
              {formatAddress(order)}
            </Text>
          </Stack>

          <Stack gap={4} style={{ minWidth: 220 }}>
            <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
              Items
            </Text>
            {order.selections.length === 0 ? (
              <Text size="sm" c="dimmed">
                —
              </Text>
            ) : (
              <Box>
                <Table withRowBorders={false} verticalSpacing={2}>
                  <TableThead>
                    <TableTr>
                      <TableTh>Item</TableTh>
                      <TableTh>Size</TableTh>
                    </TableTr>
                  </TableThead>
                  <TableTbody>
                    {order.selections.map((s) => (
                      <TableTr key={`${order.id}-${s.itemName}`}>
                        <TableTd>{s.itemName}</TableTd>
                        <TableTd>{s.selectedSize ?? "—"}</TableTd>
                      </TableTr>
                    ))}
                  </TableTbody>
                </Table>
              </Box>
            )}
          </Stack>
        </Group>

        {order.eligibility && (
          <EligibilityPanel
            orderId={order.id}
            eligibility={order.eligibility}
            wave={order.wave}
          />
        )}

        {order.notes && (
          <Box
            p="xs"
            style={{
              backgroundColor: "var(--mantine-color-dark-6)",
              borderRadius: "var(--mantine-radius-sm)",
              borderLeft: "3px solid var(--mantine-color-dark-3)",
            }}
          >
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={2}>
              Notes
            </Text>
            <Text size="sm" c="dimmed">
              {order.notes}
            </Text>
          </Box>
        )}

        {order.rejectionReason && (
          <Box
            p="xs"
            style={{
              backgroundColor: "var(--mantine-color-dark-6)",
              borderRadius: "var(--mantine-radius-sm)",
              borderLeft: "3px solid var(--mantine-color-red-7)",
            }}
          >
            <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={2}>
              Rejection reason
            </Text>
            <Text size="sm" c="dimmed">
              {order.rejectionReason}
            </Text>
          </Box>
        )}

        {order.trackingNumber && (
          <Group gap="xs">
            <Text size="sm" fw={500}>
              Tracking:
            </Text>
            {order.trackingUrl ? (
              <Anchor href={order.trackingUrl} target="_blank">
                {order.trackingNumber}
              </Anchor>
            ) : (
              <Text size="sm">{order.trackingNumber}</Text>
            )}
          </Group>
        )}

        <Group gap="xs" wrap="wrap">
          {order.status === "PENDING" && !showReject && (
            <>
              <Button
                color="green"
                loading={busy === "approve"}
                onClick={() =>
                  run("approve", () => approveWelcomePackOrder(order.id))
                }
              >
                Approve
              </Button>
              <Button
                color="red"
                variant="light"
                onClick={() => setShowReject(true)}
              >
                Reject
              </Button>
            </>
          )}

          {order.status === "PENDING" && showReject && (
            <Stack gap="xs" w="100%">
              <Textarea
                placeholder="Reason for rejection (optional)"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={4}
              />
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={() => setShowReject(false)}
                  disabled={busy === "reject"}
                >
                  Cancel
                </Button>
                <Button
                  color="red"
                  loading={busy === "reject"}
                  onClick={async () => {
                    const ok = await run("reject", () =>
                      rejectWelcomePackOrder(
                        order.id,
                        rejectReason.trim() || undefined,
                      ),
                    );
                    if (ok) {
                      setShowReject(false);
                      setRejectReason("");
                    }
                  }}
                >
                  Confirm reject
                </Button>
              </Group>
            </Stack>
          )}

          {order.status === "APPROVED" && !showShip && (
            <Button onClick={() => setShowShip(true)}>Mark shipped</Button>
          )}

          {order.status === "APPROVED" && showShip && (
            <Stack gap="xs" w="100%">
              <TextInput
                label="Tracking number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Tracking URL (optional)"
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.currentTarget.value)}
              />
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={() => setShowShip(false)}
                  disabled={busy === "ship"}
                >
                  Cancel
                </Button>
                <Button
                  loading={busy === "ship"}
                  onClick={async () => {
                    const ok = await run("ship", () =>
                      markWelcomePackOrderShipped(
                        order.id,
                        trackingNumber,
                        trackingUrl.trim() || undefined,
                      ),
                    );
                    if (ok) {
                      setShowShip(false);
                      setTrackingNumber("");
                      setTrackingUrl("");
                    }
                  }}
                >
                  Confirm shipped
                </Button>
              </Group>
            </Stack>
          )}

          {order.status === "SHIPPED" && (
            <Button
              loading={busy === "deliver"}
              onClick={() =>
                run("deliver", () => markWelcomePackOrderDelivered(order.id))
              }
            >
              Mark delivered
            </Button>
          )}
        </Group>
      </Stack>
    </Card>
  );
}

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function IssueList({ issues }: { issues: AdminQualifyingIssue[] }) {
  if (issues.length === 0) return null;
  return (
    <Stack gap={4}>
      {issues.map((issue) => (
        <Group key={issue.id} gap="xs" wrap="nowrap" align="baseline">
          <Anchor
            href={issue.url}
            target="_blank"
            rel="noreferrer"
            size="sm"
            fw={600}
            style={{ flexShrink: 0 }}
          >
            {issue.identifier}
          </Anchor>
          <Text size="sm" lineClamp={1} style={{ flex: 1, minWidth: 0 }}>
            {issue.title}
          </Text>
          <Text size="xs" c="dimmed" style={{ flexShrink: 0 }}>
            {new Date(issue.completedAt).toLocaleDateString("en-MY", {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </Text>
        </Group>
      ))}
    </Stack>
  );
}

function EligibilityPanel({
  orderId,
  eligibility,
  wave,
}: {
  orderId: string;
  eligibility: NonNullable<AdminEligibilitySnapshot>;
  wave: number;
}) {
  const [live, setLive] = useState<LiveEligibilityResult | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const issues = eligibility.qualifyingIssues;
  const accent =
    eligibility.wave === 1
      ? "var(--mantine-color-green-7)"
      : "var(--mantine-color-blue-7)";

  async function handleRecheck() {
    setLoadingLive(true);
    const result = await fetchLiveEligibilityEvidence(orderId);
    setLoadingLive(false);
    setLive(result);
    if (!result.ok) {
      toast.error(result.message);
    }
  }

  return (
    <Box
      p="xs"
      style={{
        backgroundColor: "var(--mantine-color-dark-6)",
        borderRadius: "var(--mantine-radius-sm)",
        borderLeft: `3px solid ${accent}`,
      }}
    >
      <Group justify="space-between" align="center" mb={4} wrap="wrap" gap="xs">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
          Eligibility at submission
        </Text>
        <Group gap="xs">
          <Text size="xs" c="dimmed">
            Captured {formatTimestamp(eligibility.capturedAt)}
          </Text>
          <Button
            size="compact-xs"
            variant="subtle"
            loading={loadingLive}
            onClick={handleRecheck}
          >
            {live ? "Re-check" : "Verify with Linear"}
          </Button>
        </Group>
      </Group>
      <Group gap="xs" mb={6} wrap="wrap">
        <Badge
          variant="light"
          color={eligibility.wave === 1 ? "green" : "blue"}
        >
          Wave {eligibility.wave}
        </Badge>
        {wave !== eligibility.wave && (
          <Badge variant="light" color="orange">
            Order wave: {wave}
          </Badge>
        )}
        {eligibility.wave === 1 && (
          <Text size="xs" c="dimmed">
            Last {eligibility.lookbackMonths} months · {issues.length} issue
            {issues.length === 1 ? "" : "s"}
            {eligibility.truncated ? "+" : ""}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb={issues.length > 0 ? "xs" : 0}>
        {eligibility.note}
      </Text>
      <IssueList issues={issues} />

      {live && <LivePanel result={live} snapshotWave={eligibility.wave} />}
    </Box>
  );
}

function LivePanel({
  result,
  snapshotWave,
}: {
  result: LiveEligibilityResult;
  snapshotWave: 1 | 2;
}) {
  if (!result.ok) {
    return (
      <Box
        mt="xs"
        p="xs"
        style={{
          backgroundColor: "var(--mantine-color-dark-7)",
          borderRadius: "var(--mantine-radius-sm)",
          borderLeft: "3px solid var(--mantine-color-yellow-7)",
        }}
      >
        <Text size="xs" tt="uppercase" c="dimmed" fw={600} mb={2}>
          Live check
        </Text>
        <Text size="sm" c="dimmed">
          {result.message}
        </Text>
      </Box>
    );
  }

  const snapshot = result.snapshot;
  const issues = snapshot.qualifyingIssues;
  const stillQualifies = snapshot.wave === 1;
  const drift = stillQualifies !== (snapshotWave === 1);

  return (
    <Box
      mt="xs"
      p="xs"
      style={{
        backgroundColor: "var(--mantine-color-dark-7)",
        borderRadius: "var(--mantine-radius-sm)",
        borderLeft: `3px solid ${
          drift
            ? "var(--mantine-color-orange-7)"
            : "var(--mantine-color-teal-7)"
        }`,
      }}
    >
      <Group justify="space-between" align="center" mb={4} wrap="wrap" gap="xs">
        <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
          Live check
        </Text>
        <Text size="xs" c="dimmed">
          Just now · {formatTimestamp(snapshot.capturedAt)}
        </Text>
      </Group>
      <Group gap="xs" mb={6} wrap="wrap">
        <Badge variant="light" color={stillQualifies ? "teal" : "gray"}>
          Currently: Wave {snapshot.wave}
        </Badge>
        {drift && (
          <Badge variant="light" color="orange">
            Differs from snapshot
          </Badge>
        )}
        {stillQualifies && (
          <Text size="xs" c="dimmed">
            Last {snapshot.lookbackMonths} months · {issues.length} issue
            {issues.length === 1 ? "" : "s"}
            {snapshot.truncated ? "+" : ""}
          </Text>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb={issues.length > 0 ? "xs" : 0}>
        {snapshot.note}
      </Text>
      <IssueList issues={issues} />
    </Box>
  );
}
