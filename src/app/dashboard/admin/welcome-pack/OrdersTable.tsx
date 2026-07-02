"use client";

import {
  Accordion,
  AccordionControl,
  AccordionItem,
  AccordionPanel,
  ActionIcon,
  Alert,
  Anchor,
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  Drawer,
  Group,
  Menu,
  MenuDropdown,
  MenuItem,
  MenuTarget,
  Select,
  SimpleGrid,
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
import { DateTimePicker } from "@mantine/dates";
import type { ShippingRegion, WelcomePackOrderStatus } from "@prisma/client";
import dayjs from "dayjs";
import {
  CalendarClock,
  Check,
  ClipboardCopy,
  Copy,
  Download,
  Eye,
  FileSpreadsheet,
  Package,
  Search,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import StatusBadge from "@/components/StatusBadge";
import { statusCopy, WELCOME_PACK_ORDER_STATUS } from "@/lib/status-copy";
import type { EligibilitySnapshot } from "@/lib/welcome-pack-eligibility";
import {
  approveWelcomePackOrder,
  cancelWelcomePackOrderAdmin,
  fetchLiveEligibilityEvidence,
  fetchOrderEligibilitySnapshot,
  type LiveEligibilityResult,
  markWelcomePackOrderDelayed,
  markWelcomePackOrderDelivered,
  markWelcomePackOrderShipped,
  rejectWelcomePackOrder,
  reopenWelcomePackOrder,
  resendOrderNotification,
} from "./actions";
import { EditParcelCustomsModal } from "./EditParcelCustomsModal";
import { ExportEasyParcelModal } from "./ExportEasyParcelModal";
import FulfillmentSummary from "./FulfillmentSummary";
import {
  EditLogisticsModal,
  EditSelectionsModal,
  EditShippingModal,
  EditTrackingModal,
} from "./OrderEditModals";

export type AdminPackItem = {
  id: string;
  name: string;
  requiresSize: boolean;
  sizeOptions: string[];
  isActive: boolean;
};

export type PackParcelDefaults = {
  weightKg: number | null;
  lengthCm: number | null;
  widthCm: number | null;
  heightCm: number | null;
  currency: string | null;
};

export type AdminOrderEvent = {
  id: string;
  type: string;
  actorRole: string;
  actorName: string | null;
  message: string | null;
  metadata: unknown;
  createdAt: string;
};

export type AdminOrderRow = {
  id: string;
  status: WelcomePackOrderStatus;
  wave: number;
  packName: string;
  packIsActive: boolean;
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
  addressIsResidential: boolean | null;
  taxId: string | null;
  parcelWeightKg: number | null;
  parcelLengthCm: number | null;
  parcelWidthCm: number | null;
  parcelHeightCm: number | null;
  easyParcelExportCount: number;
  easyParcelExportedAt: string | null;
  exportReady: boolean;
  exportIssues: string[];
  notes: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  carrierName: string | null;
  estimatedFulfillmentAt: string | null;
  estimatedDeliveryAt: string | null;
  logisticsNote: string | null;
  delayedAt: string | null;
  delayReason: string | null;
  rejectionReason: string | null;
  createdAt: string;
  approvedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  selections: {
    itemId: string;
    itemName: string;
    selectedSize: string | null;
  }[];
  events: AdminOrderEvent[];
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

const STALE_APPROVED_DAYS = 14;

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

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <ActionIcon
      variant="subtle"
      color={copied ? "green" : "gray"}
      size="xs"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success(`Copied ${label}`);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          toast.error(`Failed to copy ${label}`);
        }
      }}
      title={`Copy ${label}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </ActionIcon>
  );
}

// ── CSV export ──────────────────────────────────────────────────────────────

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Notes and eligibility evidence are deliberately excluded — the export is
// for shipping labels, not a data dump.
const CSV_COLUMNS: {
  header: string;
  value: (o: AdminOrderRow) => string;
}[] = [
  { header: "Status", value: (o) => o.status },
  { header: "Wave", value: (o) => String(o.wave) },
  { header: "Developer", value: (o) => o.developerName },
  { header: "Email", value: (o) => o.developerEmail ?? "" },
  { header: "Recipient", value: (o) => o.recipientName },
  { header: "Phone", value: (o) => o.phone },
  { header: "Address 1", value: (o) => o.addressLine1 },
  { header: "Address 2", value: (o) => o.addressLine2 ?? "" },
  { header: "City", value: (o) => o.city },
  { header: "State", value: (o) => o.stateProvince ?? "" },
  { header: "Postcode", value: (o) => o.postalCode },
  { header: "Country", value: (o) => o.country },
  { header: "Region", value: (o) => o.region },
  {
    header: "Residential",
    value: (o) =>
      o.addressIsResidential === null
        ? "Yes (default)"
        : o.addressIsResidential
          ? "Yes"
          : "No",
  },
  { header: "Tax ID", value: (o) => o.taxId ?? "" },
  {
    header: "Parcel weight (kg)",
    value: (o) => (o.parcelWeightKg ?? "").toString(),
  },
  {
    header: "Parcel L×W×H (cm)",
    value: (o) =>
      [o.parcelLengthCm, o.parcelWidthCm, o.parcelHeightCm].some(
        (v) => v != null,
      )
        ? `${o.parcelLengthCm ?? ""}×${o.parcelWidthCm ?? ""}×${o.parcelHeightCm ?? ""}`
        : "",
  },
  {
    header: "EasyParcel exports",
    value: (o) => String(o.easyParcelExportCount),
  },
  { header: "Last exported", value: (o) => o.easyParcelExportedAt ?? "" },
  { header: "ID card name", value: (o) => o.idCardName },
  {
    header: "Items",
    value: (o) =>
      o.selections
        .map(
          (s) => `${s.itemName}${s.selectedSize ? ` (${s.selectedSize})` : ""}`,
        )
        .join("; "),
  },
  { header: "Carrier", value: (o) => o.carrierName ?? "" },
  { header: "Tracking number", value: (o) => o.trackingNumber ?? "" },
  { header: "Tracking URL", value: (o) => o.trackingUrl ?? "" },
  {
    header: "Estimated fulfilment",
    value: (o) => o.estimatedFulfillmentAt ?? "",
  },
  { header: "Estimated delivery", value: (o) => o.estimatedDeliveryAt ?? "" },
  { header: "Delayed at", value: (o) => o.delayedAt ?? "" },
  { header: "Delay reason", value: (o) => o.delayReason ?? "" },
  { header: "Logistics note", value: (o) => o.logisticsNote ?? "" },
  { header: "Submitted", value: (o) => o.createdAt },
  { header: "Approved", value: (o) => o.approvedAt ?? "" },
  { header: "Shipped", value: (o) => o.shippedAt ?? "" },
  { header: "Delivered", value: (o) => o.deliveredAt ?? "" },
];

function downloadCsv(orders: AdminOrderRow[]) {
  const lines = [
    CSV_COLUMNS.map((c) => csvEscape(c.header)).join(","),
    ...orders.map((o) =>
      CSV_COLUMNS.map((c) => csvEscape(c.value(o))).join(","),
    ),
  ];
  // Prefix a UTF-8 BOM so Excel opens names/addresses with the right encoding.
  const blob = new Blob(["﻿", lines.join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `welcome-pack-orders-${dayjs().format("YYYY-MM-DD")}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

// Tab-separated shipping rows for pasting straight into a spreadsheet.
const TSV_COLUMNS: { header: string; value: (o: AdminOrderRow) => string }[] = [
  { header: "Recipient", value: (o) => o.recipientName },
  { header: "Phone", value: (o) => o.phone },
  { header: "Address 1", value: (o) => o.addressLine1 },
  { header: "Address 2", value: (o) => o.addressLine2 ?? "" },
  { header: "City", value: (o) => o.city },
  { header: "State", value: (o) => o.stateProvince ?? "" },
  { header: "Postcode", value: (o) => o.postalCode },
  { header: "Country", value: (o) => o.country },
];

async function copyShippingTsv(orders: AdminOrderRow[]) {
  const sanitize = (v: string) => v.replace(/[\t\r\n]+/g, " ").trim();
  const rows = [
    TSV_COLUMNS.map((c) => c.header).join("\t"),
    ...orders.map((o) =>
      TSV_COLUMNS.map((c) => sanitize(c.value(o))).join("\t"),
    ),
  ].join("\n");
  try {
    await navigator.clipboard.writeText(rows);
    toast.success(`Copied ${orders.length} shipping row(s)`);
  } catch {
    toast.error("Could not copy to clipboard");
  }
}

// ── Table ───────────────────────────────────────────────────────────────────

const REGION_FILTERS = [
  { value: "ALL", label: "All regions" },
  { value: "DOMESTIC", label: "Domestic" },
  { value: "INTERNATIONAL", label: "International" },
];
const READINESS_FILTERS = [
  { value: "ALL", label: "Any readiness" },
  { value: "READY", label: "Export-ready" },
  { value: "NOT_READY", label: "Not export-ready" },
];

export default function OrdersTable({
  orders,
  packItems,
  packDefaults,
}: {
  orders: AdminOrderRow[];
  packItems: AdminPackItem[];
  packDefaults: PackParcelDefaults;
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [region, setRegion] = useState<string>("ALL");
  const [readiness, setReadiness] = useState<string>("ALL");
  const [priorOnly, setPriorOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showExport, setShowExport] = useState(false);

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const o of orders) {
      counts.set(o.status, (counts.get(o.status) ?? 0) + 1);
    }
    return counts;
  }, [orders]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (filter !== "ALL" && o.status !== filter) return false;
      if (region !== "ALL" && o.region !== region) return false;
      if (readiness === "READY" && !o.exportReady) return false;
      if (readiness === "NOT_READY" && o.exportReady) return false;
      if (priorOnly && o.easyParcelExportCount === 0) return false;
      if (
        query &&
        ![
          o.developerName,
          o.developerEmail ?? "",
          o.recipientName,
          o.trackingNumber ?? "",
        ].some((v) => v.toLowerCase().includes(query))
      ) {
        return false;
      }
      return true;
    });
  }, [orders, filter, region, readiness, priorOnly, search]);

  const selectedOrder =
    orders.find((order) => order.id === selectedOrderId) ?? null;
  const selectedOrders = useMemo(
    () => orders.filter((o) => selectedIds.has(o.id)),
    [orders, selectedIds],
  );
  // EasyParcel export is limited to approved, unshipped orders.
  const exportableSelected = selectedOrders.filter(
    (o) => o.status === "APPROVED",
  );
  const csvTargets = selectedOrders.length > 0 ? selectedOrders : filtered;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const allFilteredSelected =
    filtered.length > 0 && filtered.every((o) => selectedIds.has(o.id));
  function selectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        for (const o of filtered) next.delete(o.id);
      } else {
        for (const o of filtered) next.add(o.id);
      }
      return next;
    });
  }
  function selectReadyApproved() {
    setSelectedIds(
      new Set(
        filtered
          .filter((o) => o.status === "APPROVED" && o.exportReady)
          .map((o) => o.id),
      ),
    );
  }
  const clearSelection = () => setSelectedIds(new Set());

  return (
    <Stack gap="md">
      <FulfillmentSummary orders={orders} packItems={packItems} />

      <Group justify="space-between" align="flex-end" wrap="wrap" gap="sm">
        <div>
          <Title order={4}>Orders</Title>
          <Group gap={6} mt={4} wrap="wrap">
            {FILTERS.filter(
              (f) => f.value !== "ALL" && statusCounts.get(f.value),
            ).map((f) => (
              <Badge
                key={f.value}
                variant="light"
                color={
                  WELCOME_PACK_ORDER_STATUS[f.value as WelcomePackOrderStatus]
                    .color
                }
                size="sm"
              >
                {statusCounts.get(f.value)} {f.label.toLowerCase()}
              </Badge>
            ))}
          </Group>
        </div>
        <Group gap="xs" align="flex-end" wrap="wrap">
          <TextInput
            label="Search"
            placeholder="Name, email, tracking…"
            leftSection={<Search size={14} />}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            w={200}
          />
          <Select
            label="Status"
            data={FILTERS}
            value={filter}
            onChange={(v) => setFilter(v ?? "ALL")}
            w={130}
          />
          <Select
            label="Region"
            data={REGION_FILTERS}
            value={region}
            onChange={(v) => setRegion(v ?? "ALL")}
            w={130}
          />
          <Select
            label="Readiness"
            data={READINESS_FILTERS}
            value={readiness}
            onChange={(v) => setReadiness(v ?? "ALL")}
            w={150}
          />
          <Checkbox
            label="Exported before"
            checked={priorOnly}
            onChange={(e) => setPriorOnly(e.currentTarget.checked)}
            mb={8}
          />
        </Group>
      </Group>

      <Group justify="space-between" wrap="wrap" gap="xs">
        <Group gap="xs">
          <Button
            variant="default"
            size="compact-sm"
            onClick={selectAllFiltered}
            disabled={filtered.length === 0}
          >
            {allFilteredSelected ? "Deselect filtered" : "Select all filtered"}
          </Button>
          <Button
            variant="default"
            size="compact-sm"
            onClick={selectReadyApproved}
          >
            Select ready approved
          </Button>
          {selectedIds.size > 0 && (
            <Button variant="subtle" size="compact-sm" onClick={clearSelection}>
              Clear ({selectedIds.size})
            </Button>
          )}
        </Group>
        <Group gap="xs">
          <Button
            leftSection={<FileSpreadsheet size={14} />}
            onClick={() => setShowExport(true)}
            disabled={exportableSelected.length === 0}
          >
            Export EasyParcel ({exportableSelected.length})
          </Button>
          <Menu position="bottom-end" withinPortal>
            <MenuTarget>
              <Button variant="light" leftSection={<Download size={14} />}>
                More exports
              </Button>
            </MenuTarget>
            <MenuDropdown>
              <MenuItem
                leftSection={<Download size={14} />}
                onClick={() => downloadCsv(csvTargets)}
                disabled={csvTargets.length === 0}
              >
                Export internal CSV ({csvTargets.length})
              </MenuItem>
              <MenuItem
                leftSection={<ClipboardCopy size={14} />}
                onClick={() => copyShippingTsv(csvTargets)}
                disabled={csvTargets.length === 0}
              >
                Copy shipping rows ({csvTargets.length})
              </MenuItem>
            </MenuDropdown>
          </Menu>
        </Group>
      </Group>

      {filtered.length === 0 ? (
        <Card withBorder radius="md" p="xl" ta="center">
          <Text c="dimmed">No orders match this filter.</Text>
        </Card>
      ) : (
        <>
          {/* Mobile view: stack of cards */}
          <Stack gap="sm" hiddenFrom="md">
            {filtered.map((order) => (
              <OrderListRow
                key={order.id}
                order={order}
                selected={selectedIds.has(order.id)}
                onToggle={() => toggle(order.id)}
                onOpen={() => setSelectedOrderId(order.id)}
              />
            ))}
          </Stack>

          {/* Desktop view: high-density selectable table */}
          <Box visibleFrom="md">
            <Card withBorder radius="md" p={0} style={{ overflow: "auto" }}>
              <Table
                verticalSpacing="sm"
                horizontalSpacing="md"
                highlightOnHover
              >
                <TableThead>
                  <TableTr>
                    <TableTh style={{ width: 40 }}>
                      <Checkbox
                        checked={allFilteredSelected}
                        onChange={selectAllFiltered}
                        aria-label="Select all filtered orders"
                      />
                    </TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>Status</TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>Wave</TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>
                      Developer
                    </TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>
                      Recipient / Destination
                    </TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>Items</TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>
                      EasyParcel
                    </TableTh>
                    <TableTh style={{ whiteSpace: "nowrap" }}>
                      Logistics
                    </TableTh>
                    <TableTh style={{ width: 80 }} />
                  </TableTr>
                </TableThead>
                <TableTbody>
                  {filtered.map((order) => {
                    const overdue =
                      order.status === "APPROVED" &&
                      order.estimatedFulfillmentAt !== null &&
                      dayjs(order.estimatedFulfillmentAt).isBefore(
                        dayjs(),
                        "day",
                      );
                    return (
                      <TableTr key={order.id}>
                        <TableTd>
                          <Checkbox
                            checked={selectedIds.has(order.id)}
                            onChange={() => toggle(order.id)}
                            aria-label={`Select order for ${order.recipientName}`}
                          />
                        </TableTd>
                        <TableTd>
                          <StatusBadge
                            copy={statusCopy(
                              WELCOME_PACK_ORDER_STATUS,
                              order.status,
                            )}
                          />
                        </TableTd>
                        <TableTd>
                          <Badge variant="light" color="grape" size="sm">
                            Wave {order.wave}
                          </Badge>
                        </TableTd>
                        <TableTd>
                          <Stack gap={2}>
                            <Text fw={600} size="sm">
                              {order.developerName}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {order.developerEmail ?? "No email"}
                            </Text>
                          </Stack>
                        </TableTd>
                        <TableTd>
                          <Stack gap={2}>
                            <Text size="sm" fw={500}>
                              {order.recipientName}
                            </Text>
                            <Text size="xs" c="dimmed">
                              {order.region === "DOMESTIC"
                                ? "Domestic (MY)"
                                : `International (${order.country})`}
                            </Text>
                          </Stack>
                        </TableTd>
                        <TableTd>
                          <Text size="xs" lineClamp={2}>
                            {order.selections
                              .map(
                                (s) =>
                                  `${s.itemName}${s.selectedSize ? ` (${s.selectedSize})` : ""}`,
                              )
                              .join(", ") || "No items"}
                          </Text>
                        </TableTd>
                        <TableTd>
                          <Group gap={4} wrap="wrap">
                            {order.status === "APPROVED" &&
                              (order.exportReady ? (
                                <Badge variant="light" color="green" size="xs">
                                  Ready
                                </Badge>
                              ) : (
                                <Badge variant="light" color="gray" size="xs">
                                  Not Ready
                                </Badge>
                              ))}
                            {order.easyParcelExportCount > 0 && (
                              <Badge variant="light" color="grape" size="xs">
                                Exported ×{order.easyParcelExportCount}
                              </Badge>
                            )}
                          </Group>
                        </TableTd>
                        <TableTd>
                          <Stack gap={2}>
                            {order.estimatedFulfillmentAt && (
                              <Text size="xs" c={overdue ? "red" : "dimmed"}>
                                Fulfil:{" "}
                                {formatDate(order.estimatedFulfillmentAt)}
                              </Text>
                            )}
                            {order.trackingNumber && (
                              <Text size="xs" c="indigo" fw={500}>
                                {order.carrierName
                                  ? `${order.carrierName}: `
                                  : ""}
                                {order.trackingNumber}
                              </Text>
                            )}
                            {order.delayedAt && (
                              <Text size="xs" c="orange">
                                Delayed
                              </Text>
                            )}
                          </Stack>
                        </TableTd>
                        <TableTd>
                          <Button
                            variant="light"
                            size="compact-xs"
                            leftSection={<Eye size={12} />}
                            onClick={() => setSelectedOrderId(order.id)}
                          >
                            Details
                          </Button>
                        </TableTd>
                      </TableTr>
                    );
                  })}
                </TableTbody>
              </Table>
            </Card>
          </Box>
        </>
      )}

      <ExportEasyParcelModal
        orderIds={exportableSelected.map((o) => o.id)}
        opened={showExport}
        onClose={() => setShowExport(false)}
        onExported={clearSelection}
      />

      <Drawer
        opened={Boolean(selectedOrder)}
        onClose={() => setSelectedOrderId(null)}
        title={selectedOrder ? `Order — ${selectedOrder.developerName}` : ""}
        position="right"
        size="xl"
      >
        {selectedOrder && (
          <OrderCard
            order={selectedOrder}
            packItems={packItems}
            packDefaults={packDefaults}
          />
        )}
      </Drawer>
    </Stack>
  );
}

function OrderListRow({
  order,
  selected,
  onToggle,
  onOpen,
}: {
  order: AdminOrderRow;
  selected: boolean;
  onToggle: () => void;
  onOpen: () => void;
}) {
  const overdue =
    order.status === "APPROVED" &&
    order.estimatedFulfillmentAt !== null &&
    dayjs(order.estimatedFulfillmentAt).isBefore(dayjs(), "day");

  return (
    <Card withBorder radius="md" p="md">
      <Group justify="space-between" align="center" wrap="wrap" gap="md">
        <Group gap="sm" style={{ minWidth: 0, flex: 1 }}>
          <Checkbox
            checked={selected}
            onChange={onToggle}
            aria-label={`Select order for ${order.recipientName}`}
          />
          <StatusBadge
            copy={statusCopy(WELCOME_PACK_ORDER_STATUS, order.status)}
          />
          <Stack gap={2} style={{ minWidth: 0 }}>
            <Group gap="xs" wrap="wrap">
              <Text fw={600} lineClamp={1}>
                {order.developerName}
              </Text>
              <Badge variant="light" color="grape" size="sm">
                Wave {order.wave}
              </Badge>
              {order.delayedAt && (
                <Badge variant="light" color="orange" size="sm">
                  Delayed
                </Badge>
              )}
              {overdue && (
                <Badge variant="light" color="red" size="sm">
                  Fulfilment overdue
                </Badge>
              )}
            </Group>
            <Text size="sm" c="dimmed" lineClamp={1}>
              {order.developerEmail ?? "No email"} · {order.recipientName} ·{" "}
              {order.region === "DOMESTIC" ? "Malaysia" : "International"}
            </Text>
          </Stack>
        </Group>

        <Group gap="xs" wrap="wrap">
          {order.status === "APPROVED" &&
            (order.exportReady ? (
              <Badge variant="light" color="green" size="sm">
                Export-ready
              </Badge>
            ) : (
              <Badge variant="light" color="gray" size="sm">
                Not export-ready
              </Badge>
            ))}
          {order.easyParcelExportCount > 0 && (
            <Badge variant="light" color="grape" size="sm">
              Exported ×{order.easyParcelExportCount}
            </Badge>
          )}
          {order.estimatedFulfillmentAt && (
            <Badge
              variant="light"
              color={overdue ? "red" : "blue"}
              leftSection={<CalendarClock size={12} />}
            >
              Fulfil {formatDate(order.estimatedFulfillmentAt)}
            </Badge>
          )}
          {order.trackingNumber && (
            <Badge variant="light" color="indigo">
              {order.carrierName ? `${order.carrierName} · ` : ""}
              {order.trackingNumber}
            </Badge>
          )}
          <Button
            variant="light"
            size="compact-sm"
            leftSection={<Eye size={14} />}
            onClick={onOpen}
          >
            Details
          </Button>
        </Group>
      </Group>
    </Card>
  );
}

type ActionResult =
  | { error?: string }
  | { success: boolean; emailSent?: boolean; emailDetail?: string }
  | undefined;

function OrderCard({
  order,
  packItems,
  packDefaults,
}: {
  order: AdminOrderRow;
  packItems: AdminPackItem[];
  packDefaults: PackParcelDefaults;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [editParcel, setEditParcel] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [showShip, setShowShip] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [trackingNumber, setTrackingNumber] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [shipCarrierName, setShipCarrierName] = useState("");
  const [editSelections, setEditSelections] = useState(false);
  const [editShipping, setEditShipping] = useState(false);
  const [editTracking, setEditTracking] = useState(false);
  const [editLogistics, setEditLogistics] = useState(false);
  const [showDelay, setShowDelay] = useState(false);
  const [delayReason, setDelayReason] = useState("");
  const [revisedFulfillmentAt, setRevisedFulfillmentAt] = useState<
    string | null
  >(order.estimatedFulfillmentAt);
  const [revisedDeliveryAt, setRevisedDeliveryAt] = useState<string | null>(
    order.estimatedDeliveryAt,
  );

  async function run(action: string, fn: () => Promise<ActionResult>) {
    setBusy(action);
    try {
      const res = await fn();
      if (res && "error" in res && res.error) {
        toast.error(res.error);
        return false;
      }
      if (res && "emailSent" in res && res.emailSent === false) {
        toast.warning(
          `Order updated — notification email not sent (${res.emailDetail ?? "unknown"}). Use "Resend email" to retry.`,
        );
      } else {
        toast.success("Order updated");
      }
      router.refresh();
      return true;
    } finally {
      setBusy(null);
    }
  }

  const canAmend = order.status === "PENDING" || order.status === "APPROVED";
  const hasNotification = [
    "APPROVED",
    "REJECTED",
    "SHIPPED",
    "DELIVERED",
  ].includes(order.status);
  const staleApproved =
    order.status === "APPROVED" &&
    order.approvedAt !== null &&
    dayjs().diff(dayjs(order.approvedAt), "day") >= STALE_APPROVED_DAYS;

  const effectiveWeight = order.parcelWeightKg ?? packDefaults.weightKg;
  const effectiveLength = order.parcelLengthCm ?? packDefaults.lengthCm;
  const effectiveWidth = order.parcelWidthCm ?? packDefaults.widthCm;
  const effectiveHeight = order.parcelHeightCm ?? packDefaults.heightCm;
  const effectiveCurrency = packDefaults.currency;

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" wrap="wrap">
          <Group gap="xs">
            <StatusBadge
              copy={statusCopy(WELCOME_PACK_ORDER_STATUS, order.status)}
            />
            <Badge variant="light" color="grape">
              Wave {order.wave}
            </Badge>
            <Badge variant="light" color="cyan">
              {order.region === "DOMESTIC" ? "Malaysia" : "International"}
            </Badge>
            {!order.packIsActive && (
              <Badge variant="light" color="orange">
                Pack inactive: {order.packName}
              </Badge>
            )}
            {staleApproved && (
              <Badge variant="light" color="yellow">
                Approved {dayjs().diff(dayjs(order.approvedAt), "day")}d ago
              </Badge>
            )}
            <Text size="sm" c="dimmed">
              Submitted {formatDate(order.createdAt)}
            </Text>
          </Group>
          <Text size="sm" c="dimmed">
            {order.developerEmail ?? "—"}
          </Text>
        </Group>

        <SimpleGrid cols={{ base: 1, md: 2 }} spacing="lg">
          {/* LEFT COLUMN: Shipping & Customs */}
          <Stack gap="md">
            <Card withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Group justify="space-between" align="center">
                  <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                    Shipping Details
                  </Text>
                  <Group gap="xs">
                    <Button
                      variant="light"
                      size="compact-xs"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            formatAddress(order),
                          );
                          toast.success("Address copied to clipboard");
                        } catch {
                          toast.error("Failed to copy address");
                        }
                      }}
                    >
                      Copy Address
                    </Button>
                    <Button
                      variant="light"
                      size="compact-xs"
                      onClick={async () => {
                        const block = `Recipient: ${order.recipientName}\nPhone: ${order.phone}\nEmail: ${order.developerEmail ?? "N/A"}\nAddress:\n${formatAddress(order)}`;
                        try {
                          await navigator.clipboard.writeText(block);
                          toast.success("Complete shipping block copied");
                        } catch {
                          toast.error("Failed to copy shipping block");
                        }
                      }}
                    >
                      Copy Block
                    </Button>
                  </Group>
                </Group>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Developer Legal Name
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Text fw={600} size="sm">
                      {order.developerName}
                    </Text>
                    <CopyButton
                      value={order.developerName}
                      label="developer name"
                    />
                  </Group>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    ID Card Name
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Text size="sm">{order.idCardName}</Text>
                    <CopyButton value={order.idCardName} label="ID card name" />
                  </Group>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Recipient Name
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Text size="sm" fw={500}>
                      {order.recipientName}
                    </Text>
                    <CopyButton
                      value={order.recipientName}
                      label="recipient name"
                    />
                  </Group>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Phone Number
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Text size="sm">{order.phone}</Text>
                    <CopyButton value={order.phone} label="phone number" />
                  </Group>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Email
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="center">
                    <Text size="sm">{order.developerEmail ?? "—"}</Text>
                    {order.developerEmail && (
                      <CopyButton
                        value={order.developerEmail}
                        label="email address"
                      />
                    )}
                  </Group>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" c="dimmed">
                    Full Address
                  </Text>
                  <Group gap="xs" wrap="nowrap" align="flex-start">
                    <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                      {formatAddress(order)}
                    </Text>
                    <CopyButton
                      value={formatAddress(order)}
                      label="full address"
                    />
                  </Group>
                </Stack>
              </Stack>
            </Card>

            <Card withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Parcel & Customs Details
                </Text>

                {order.exportIssues.length > 0 && (
                  <Alert color="orange" title="Not yet export-ready">
                    <Stack gap={2}>
                      {order.exportIssues.map((issue) => (
                        <Text key={issue} size="xs">
                          • {issue}
                        </Text>
                      ))}
                    </Stack>
                  </Alert>
                )}

                <SimpleGrid cols={2} spacing="xs">
                  <div>
                    <Text size="xs" c="dimmed">
                      Weight
                    </Text>
                    <Group gap="xs" align="center">
                      <Text size="sm" fw={500}>
                        {effectiveWeight !== null
                          ? `${effectiveWeight} kg`
                          : "—"}
                      </Text>
                      <Badge
                        size="xs"
                        variant="subtle"
                        color={
                          order.parcelWeightKg !== null ? "orange" : "gray"
                        }
                      >
                        {order.parcelWeightKg !== null ? "override" : "default"}
                      </Badge>
                    </Group>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Dimensions (L×W×H)
                    </Text>
                    <Group gap="xs" align="center">
                      <Text size="sm" fw={500}>
                        {effectiveLength != null &&
                        effectiveWidth != null &&
                        effectiveHeight != null
                          ? `${effectiveLength}×${effectiveWidth}×${effectiveHeight} cm`
                          : "—"}
                      </Text>
                      <Badge
                        size="xs"
                        variant="subtle"
                        color={
                          order.parcelLengthCm !== null ||
                          order.parcelWidthCm !== null ||
                          order.parcelHeightCm !== null
                            ? "orange"
                            : "gray"
                        }
                      >
                        {order.parcelLengthCm !== null ||
                        order.parcelWidthCm !== null ||
                        order.parcelHeightCm !== null
                          ? "override"
                          : "default"}
                      </Badge>
                    </Group>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Declared Currency
                    </Text>
                    <Text size="sm" fw={500}>
                      {effectiveCurrency ?? "—"}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Address Type
                    </Text>
                    <Text size="sm" fw={500}>
                      {order.addressIsResidential === null
                        ? "Residential (default)"
                        : order.addressIsResidential
                          ? "Residential"
                          : "Business / Commercial"}
                    </Text>
                  </div>
                  <div>
                    <Text size="xs" c="dimmed">
                      Tax ID / Customs ID
                    </Text>
                    <Text size="sm" fw={500}>
                      {order.taxId ?? "—"}
                    </Text>
                  </div>
                </SimpleGrid>
              </Stack>
            </Card>
          </Stack>

          {/* RIGHT COLUMN: Items & Logistics & Eligibility */}
          <Stack gap="md">
            <Card withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Selected Items
                </Text>
                {order.selections.length === 0 ? (
                  <Text size="sm" c="dimmed">
                    No items selected.
                  </Text>
                ) : (
                  <Table withRowBorders={false} verticalSpacing={2}>
                    <TableThead>
                      <TableTr>
                        <TableTh>Item</TableTh>
                        <TableTh>Size</TableTh>
                        <TableTh style={{ width: 40 }} />
                      </TableTr>
                    </TableThead>
                    <TableTbody>
                      {order.selections.map((s) => {
                        const itemString = `${s.itemName}${s.selectedSize ? ` (${s.selectedSize})` : ""}`;
                        return (
                          <TableTr key={`${order.id}-${s.itemId}`}>
                            <TableTd>{s.itemName}</TableTd>
                            <TableTd>{s.selectedSize ?? "—"}</TableTd>
                            <TableTd style={{ textAlign: "right" }}>
                              <CopyButton
                                value={itemString}
                                label={s.itemName}
                              />
                            </TableTd>
                          </TableTr>
                        );
                      })}
                    </TableTbody>
                  </Table>
                )}
              </Stack>
            </Card>

            <Card withBorder p="md" radius="sm">
              <Stack gap="sm">
                <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
                  Logistics & Tracking
                </Text>

                {order.trackingNumber && (
                  <Stack gap={4}>
                    <Text size="xs" c="dimmed">
                      Tracking Info
                    </Text>
                    <Group gap="xs" wrap="nowrap" align="center">
                      {order.trackingUrl ? (
                        <Anchor
                          href={order.trackingUrl}
                          target="_blank"
                          size="sm"
                          fw={500}
                        >
                          {order.carrierName ? `${order.carrierName} · ` : ""}
                          {order.trackingNumber}
                        </Anchor>
                      ) : (
                        <Text size="sm" fw={500}>
                          {order.carrierName ? `${order.carrierName} · ` : ""}
                          {order.trackingNumber}
                        </Text>
                      )}
                      <CopyButton
                        value={order.trackingNumber}
                        label="tracking number"
                      />
                    </Group>
                  </Stack>
                )}

                {(order.estimatedFulfillmentAt ||
                  order.estimatedDeliveryAt ||
                  order.logisticsNote ||
                  order.delayedAt) && (
                  <Stack gap="xs">
                    <Group gap="xs" wrap="wrap">
                      {order.estimatedFulfillmentAt && (
                        <Badge variant="light" color="blue">
                          Fulfil {formatDate(order.estimatedFulfillmentAt)}
                        </Badge>
                      )}
                      {order.estimatedDeliveryAt && (
                        <Badge variant="light" color="indigo">
                          Deliver {formatDate(order.estimatedDeliveryAt)}
                        </Badge>
                      )}
                      {order.delayedAt && (
                        <Badge variant="light" color="orange">
                          Delayed {formatDate(order.delayedAt)}
                        </Badge>
                      )}
                    </Group>
                    {order.delayReason && (
                      <Text size="sm" c="dimmed">
                        <strong>Delay Reason:</strong> {order.delayReason}
                      </Text>
                    )}
                    {order.logisticsNote && (
                      <Text size="sm" c="dimmed">
                        <strong>Logistics Note:</strong> {order.logisticsNote}
                      </Text>
                    )}
                  </Stack>
                )}

                {!order.trackingNumber && !order.estimatedFulfillmentAt && (
                  <Text size="sm" c="dimmed">
                    No logistics or tracking info populated yet.
                  </Text>
                )}
              </Stack>
            </Card>

            <EligibilityPanel orderId={order.id} wave={order.wave} />
          </Stack>
        </SimpleGrid>

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
              User Order Notes
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
              Rejection Reason
            </Text>
            <Text size="sm" c="dimmed">
              {order.rejectionReason}
            </Text>
          </Box>
        )}

        <Group gap="xs" wrap="wrap">
          {order.status === "PENDING" && !showReject && !showCancel && (
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

          {order.status === "APPROVED" &&
            !showShip &&
            !showCancel &&
            !showDelay && (
              <>
                <Button onClick={() => setShowShip(true)}>Mark shipped</Button>
                <Button
                  variant="light"
                  color="yellow"
                  loading={busy === "reopen"}
                  onClick={() =>
                    run("reopen", () => reopenWelcomePackOrder(order.id))
                  }
                >
                  Un-approve
                </Button>
              </>
            )}

          {order.status === "APPROVED" && showShip && (
            <Stack gap="xs" w="100%">
              <TextInput
                label="Carrier (optional)"
                placeholder="DHL, PosLaju, J&T…"
                value={shipCarrierName}
                onChange={(e) => setShipCarrierName(e.currentTarget.value)}
              />
              <TextInput
                label="Tracking number"
                value={trackingNumber}
                onChange={(e) => setTrackingNumber(e.currentTarget.value)}
                required
              />
              <TextInput
                label="Tracking URL (optional)"
                placeholder="https://…"
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
                        shipCarrierName.trim() || undefined,
                      ),
                    );
                    if (ok) {
                      setShowShip(false);
                      setTrackingNumber("");
                      setTrackingUrl("");
                      setShipCarrierName("");
                    }
                  }}
                >
                  Confirm shipped
                </Button>
              </Group>
            </Stack>
          )}

          {order.status === "SHIPPED" && !showDelay && (
            <>
              <Button
                loading={busy === "deliver"}
                onClick={() =>
                  run("deliver", () => markWelcomePackOrderDelivered(order.id))
                }
              >
                Mark delivered
              </Button>
              <Button variant="light" onClick={() => setEditTracking(true)}>
                Edit tracking
              </Button>
            </>
          )}

          {(order.status === "APPROVED" || order.status === "SHIPPED") &&
            !showShip &&
            !showCancel &&
            !showDelay && (
              <>
                <Button variant="light" onClick={() => setEditLogistics(true)}>
                  Edit logistics
                </Button>
                <Button
                  variant="light"
                  color="orange"
                  onClick={() => setShowDelay(true)}
                >
                  Mark delayed
                </Button>
              </>
            )}

          {(order.status === "APPROVED" || order.status === "SHIPPED") &&
            showDelay && (
              <Stack gap="xs" w="100%">
                <Textarea
                  label="Delay reason"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.currentTarget.value)}
                  autosize
                  minRows={2}
                  maxRows={4}
                  required
                />
                <Group grow align="flex-start">
                  <DateTimePicker
                    label="Revised fulfilment"
                    value={revisedFulfillmentAt}
                    onChange={setRevisedFulfillmentAt}
                    clearable
                  />
                  <DateTimePicker
                    label="Revised delivery"
                    value={revisedDeliveryAt}
                    onChange={setRevisedDeliveryAt}
                    clearable
                  />
                </Group>
                <Group gap="xs">
                  <Button
                    variant="default"
                    onClick={() => setShowDelay(false)}
                    disabled={busy === "delay"}
                  >
                    Cancel
                  </Button>
                  <Button
                    color="orange"
                    loading={busy === "delay"}
                    onClick={async () => {
                      const ok = await run("delay", () =>
                        markWelcomePackOrderDelayed(
                          order.id,
                          delayReason,
                          revisedFulfillmentAt,
                          revisedDeliveryAt,
                        ),
                      );
                      if (ok) {
                        setShowDelay(false);
                        setDelayReason("");
                      }
                    }}
                  >
                    Notify delay
                  </Button>
                </Group>
              </Stack>
            )}

          {order.status === "REJECTED" && (
            <Button
              variant="light"
              color="yellow"
              loading={busy === "reopen"}
              onClick={() =>
                run("reopen", () => reopenWelcomePackOrder(order.id))
              }
            >
              Reopen
            </Button>
          )}

          {canAmend &&
            !showReject &&
            !showShip &&
            !showCancel &&
            !showDelay && (
              <>
                <Button variant="light" onClick={() => setEditSelections(true)}>
                  Edit items/sizes
                </Button>
                <Button variant="light" onClick={() => setEditShipping(true)}>
                  Edit shipping
                </Button>
                <Button
                  variant="light"
                  leftSection={<Package size={14} />}
                  color={order.exportReady ? undefined : "orange"}
                  onClick={() => setEditParcel(true)}
                >
                  Edit parcel & customs
                </Button>
                <Button
                  variant="subtle"
                  color="red"
                  onClick={() => setShowCancel(true)}
                >
                  Cancel order
                </Button>
              </>
            )}

          {canAmend && showCancel && (
            <Stack gap="xs" w="100%">
              <Textarea
                placeholder="Reason for cancellation (optional, kept in history)"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.currentTarget.value)}
                autosize
                minRows={2}
                maxRows={4}
              />
              <Group gap="xs">
                <Button
                  variant="default"
                  onClick={() => setShowCancel(false)}
                  disabled={busy === "cancel"}
                >
                  Keep order
                </Button>
                <Button
                  color="red"
                  loading={busy === "cancel"}
                  onClick={async () => {
                    const ok = await run("cancel", () =>
                      cancelWelcomePackOrderAdmin(
                        order.id,
                        cancelReason.trim() || undefined,
                      ),
                    );
                    if (ok) {
                      setShowCancel(false);
                      setCancelReason("");
                    }
                  }}
                >
                  Confirm cancel
                </Button>
              </Group>
            </Stack>
          )}

          {hasNotification &&
            !showReject &&
            !showShip &&
            !showCancel &&
            !showDelay && (
              <Button
                variant="subtle"
                size="compact-sm"
                loading={busy === "resend"}
                onClick={() =>
                  run("resend", () => resendOrderNotification(order.id))
                }
              >
                Resend email
              </Button>
            )}
        </Group>

        {order.events.length > 0 && <OrderHistory events={order.events} />}
      </Stack>

      {/* Mounted per open so stale edits don't linger after a cancel. */}
      {editSelections && (
        <EditSelectionsModal
          order={order}
          packItems={packItems}
          opened
          onClose={() => setEditSelections(false)}
        />
      )}
      {editShipping && (
        <EditShippingModal
          order={order}
          opened
          onClose={() => setEditShipping(false)}
        />
      )}
      {editTracking && (
        <EditTrackingModal
          order={order}
          opened
          onClose={() => setEditTracking(false)}
        />
      )}
      {editLogistics && (
        <EditLogisticsModal
          order={order}
          opened
          onClose={() => setEditLogistics(false)}
        />
      )}
      <EditParcelCustomsModal
        order={order}
        packDefaults={packDefaults}
        opened={editParcel}
        onClose={() => setEditParcel(false)}
        onSaved={() => router.refresh()}
      />
    </Card>
  );
}

// ── History ─────────────────────────────────────────────────────────────────

const EVENT_COLORS: Record<string, string> = {
  SUBMITTED: "blue",
  APPROVED: "green",
  REJECTED: "red",
  CANCELLED: "gray",
  ADMIN_CANCELLED: "gray",
  SHIPPED: "indigo",
  DELIVERED: "teal",
  REOPENED: "yellow",
  SELECTIONS_UPDATED: "cyan",
  SHIPPING_UPDATED: "cyan",
  TRACKING_UPDATED: "cyan",
  LOGISTICS_UPDATED: "blue",
  ESTIMATE_UPDATED: "blue",
  DELAYED: "orange",
  USER_UPDATED: "cyan",
  ITEM_CONFIG_CHANGED: "orange",
  NOTIFICATION_RESENT: "gray",
};

function eventLabel(type: string) {
  return type.replaceAll("_", " ").toLowerCase();
}

function MetadataDiff({ metadata }: { metadata: unknown }) {
  if (!metadata || typeof metadata !== "object") return null;
  const meta = metadata as {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
    reason?: string;
    from?: string;
  };
  return (
    <Stack gap={2} mt={2}>
      {meta.reason && (
        <Text size="xs" c="dimmed">
          Reason: {meta.reason}
        </Text>
      )}
      {meta.before &&
        meta.after &&
        Object.keys(meta.after).map((key) => (
          <Text size="xs" c="dimmed" key={key}>
            {key}: {JSON.stringify(meta.before?.[key] ?? null)} →{" "}
            {JSON.stringify(meta.after?.[key] ?? null)}
          </Text>
        ))}
    </Stack>
  );
}

function OrderHistory({ events }: { events: AdminOrderEvent[] }) {
  return (
    <Accordion variant="contained" chevronPosition="left">
      <AccordionItem value="history">
        <AccordionControl>
          <Text size="sm" fw={500}>
            History ({events.length})
          </Text>
        </AccordionControl>
        <AccordionPanel>
          <Stack gap="xs">
            {events.map((event) => (
              <Group key={event.id} gap="xs" align="flex-start" wrap="nowrap">
                <Text
                  size="xs"
                  c="dimmed"
                  style={{ flexShrink: 0, width: 130 }}
                >
                  {formatTimestamp(event.createdAt)}
                </Text>
                <Badge
                  variant="light"
                  color={EVENT_COLORS[event.type] ?? "gray"}
                  size="sm"
                  style={{ flexShrink: 0 }}
                >
                  {eventLabel(event.type)}
                </Badge>
                <Box style={{ flex: 1, minWidth: 0 }}>
                  <Text size="sm">
                    {event.message ?? eventLabel(event.type)}
                    {event.actorName && (
                      <Text component="span" size="xs" c="dimmed">
                        {" "}
                        — {event.actorName}
                      </Text>
                    )}
                  </Text>
                  <MetadataDiff metadata={event.metadata} />
                </Box>
              </Group>
            ))}
          </Stack>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

// ── Eligibility ─────────────────────────────────────────────────────────────

function formatTimestamp(value: string) {
  return new Date(value).toLocaleString("en-MY", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type AdminQualifyingIssue = EligibilitySnapshot["qualifyingIssues"][number];

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

/**
 * Eligibility evidence loads on demand — the persisted snapshot would
 * otherwise dominate the orders payload.
 */
function EligibilityPanel({
  orderId,
  wave,
}: {
  orderId: string;
  wave: number;
}) {
  const [snapshot, setSnapshot] = useState<EligibilitySnapshot | null>(null);
  const [snapshotLoaded, setSnapshotLoaded] = useState(false);
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [live, setLive] = useState<LiveEligibilityResult | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);

  const accent = snapshot
    ? snapshot.wave === 1
      ? "var(--mantine-color-green-7)"
      : "var(--mantine-color-blue-7)"
    : "var(--mantine-color-gray-6)";

  async function handleLoadSnapshot() {
    setLoadingSnapshot(true);
    const result = await fetchOrderEligibilitySnapshot(orderId);
    setLoadingSnapshot(false);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    setSnapshot(result.snapshot);
    setSnapshotLoaded(true);
  }

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
        <Group gap="xs">
          <Text size="xs" tt="uppercase" c="dimmed" fw={600}>
            Eligibility
          </Text>
          <Badge variant="light" color="gray" size="sm">
            Wave {wave}
          </Badge>
        </Group>
        <Group gap="xs">
          {!snapshotLoaded && (
            <Button
              size="compact-xs"
              variant="subtle"
              loading={loadingSnapshot}
              onClick={handleLoadSnapshot}
            >
              View snapshot
            </Button>
          )}
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

      {snapshotLoaded &&
        (snapshot ? (
          <>
            <Group gap="xs" mb={6} wrap="wrap">
              <Badge
                variant="light"
                color={snapshot.wave === 1 ? "green" : "blue"}
              >
                Wave {snapshot.wave} at submission
              </Badge>
              {wave !== snapshot.wave && (
                <Badge variant="light" color="orange">
                  Order wave: {wave}
                </Badge>
              )}
              <Text size="xs" c="dimmed">
                Captured {formatTimestamp(snapshot.capturedAt)}
              </Text>
              {snapshot.wave === 1 && (
                <Text size="xs" c="dimmed">
                  Last {snapshot.lookbackMonths} months ·{" "}
                  {snapshot.qualifyingIssues.length} issue
                  {snapshot.qualifyingIssues.length === 1 ? "" : "s"}
                  {snapshot.truncated ? "+" : ""}
                </Text>
              )}
            </Group>
            <Text
              size="sm"
              c="dimmed"
              mb={snapshot.qualifyingIssues.length > 0 ? "xs" : 0}
            >
              {snapshot.note}
            </Text>
            <IssueList issues={snapshot.qualifyingIssues} />
          </>
        ) : (
          <Text size="sm" c="dimmed">
            This order pre-dates eligibility snapshotting. Use{" "}
            <strong>Verify with Linear</strong> to fetch the developer&apos;s
            current qualifying issues.
          </Text>
        ))}

      {live && (
        <LivePanel result={live} snapshotWave={snapshot?.wave ?? null} />
      )}
    </Box>
  );
}

function LivePanel({
  result,
  snapshotWave,
}: {
  result: LiveEligibilityResult;
  snapshotWave: 1 | 2 | null;
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
  const drift =
    snapshotWave !== null && stillQualifies !== (snapshotWave === 1);

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
