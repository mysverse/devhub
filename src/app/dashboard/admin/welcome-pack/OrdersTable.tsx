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
  markWelcomePackOrderDelivered,
  markWelcomePackOrderShipped,
  rejectWelcomePackOrder,
} from "./actions";

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
