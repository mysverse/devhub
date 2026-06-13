"use client";

import {
  Badge,
  Card,
  Chip,
  ChipGroup,
  Group,
  Stack,
  Table,
  TableTbody,
  TableTd,
  TableTh,
  TableThead,
  TableTr,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import type { WelcomePackOrderStatus } from "@prisma/client";
import { AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminOrderRow, AdminPackItem } from "./OrdersTable";

const TALLY_STATUSES: { value: WelcomePackOrderStatus; label: string }[] = [
  { value: "PENDING", label: "Pending" },
  { value: "APPROVED", label: "Approved" },
  { value: "SHIPPED", label: "Shipped" },
  { value: "DELIVERED", label: "Delivered" },
];

const NO_SIZE = "No size";

/**
 * Procurement view: how many of each item/size are needed across the
 * selected statuses. Defaults to PENDING + APPROVED = "still to procure".
 */
export default function FulfillmentSummary({
  orders,
  packItems,
}: {
  orders: AdminOrderRow[];
  packItems: AdminPackItem[];
}) {
  const [statuses, setStatuses] = useState<string[]>(["PENDING", "APPROVED"]);
  const operational = useMemo(() => {
    const open = orders.filter((order) =>
      ["PENDING", "APPROVED", "SHIPPED"].includes(order.status),
    );
    return {
      domestic: open.filter((order) => order.region === "DOMESTIC").length,
      international: open.filter((order) => order.region === "INTERNATIONAL")
        .length,
      delayed: open.filter((order) => order.delayedAt).length,
      estimated: open.filter(
        (order) => order.estimatedFulfillmentAt || order.estimatedDeliveryAt,
      ).length,
      overdue: open.filter(
        (order) =>
          order.status === "APPROVED" &&
          order.estimatedFulfillmentAt &&
          new Date(order.estimatedFulfillmentAt).getTime() < Date.now(),
      ).length,
    };
  }, [orders]);

  const { rows, sizeColumns, driftCount } = useMemo(() => {
    const included = orders.filter((o) =>
      statuses.includes(o.status as string),
    );
    const knownSizes = new Map(
      packItems.map((i) => [i.id, new Set(i.sizeOptions)]),
    );

    // item name → size → count; track sizes no longer offered by the item.
    const tally = new Map<string, Map<string, number>>();
    const drifted = new Set<string>();
    const columns = new Set<string>();

    for (const order of included) {
      for (const sel of order.selections) {
        const size = sel.selectedSize ?? NO_SIZE;
        columns.add(size);
        const perItem = tally.get(sel.itemName) ?? new Map<string, number>();
        perItem.set(size, (perItem.get(size) ?? 0) + 1);
        tally.set(sel.itemName, perItem);

        const itemSizes = knownSizes.get(sel.itemId);
        if (sel.selectedSize && itemSizes && !itemSizes.has(sel.selectedSize)) {
          drifted.add(`${sel.itemName}:${sel.selectedSize}`);
        }
      }
    }

    const sizeColumns = [...columns].sort((a, b) => {
      if (a === NO_SIZE) return 1;
      if (b === NO_SIZE) return -1;
      return a.localeCompare(b, undefined, { numeric: true });
    });
    const rows = [...tally.entries()]
      .map(([itemName, sizes]) => ({
        itemName,
        counts: sizeColumns.map((col) => ({
          size: col,
          count: sizes.get(col) ?? 0,
          drifted: drifted.has(`${itemName}:${col}`),
        })),
        total: [...sizes.values()].reduce((a, b) => a + b, 0),
      }))
      .sort((a, b) => a.itemName.localeCompare(b.itemName));

    return { rows, sizeColumns, driftCount: drifted.size };
  }, [orders, packItems, statuses]);

  return (
    <Card withBorder radius="md" p="lg">
      <Stack gap="md">
        <Group justify="space-between" align="flex-start" wrap="wrap">
          <div>
            <Title order={5}>Fulfillment summary</Title>
            <Text c="dimmed" size="sm">
              Item and size counts across the selected statuses.
            </Text>
          </div>
          <ChipGroup multiple value={statuses} onChange={setStatuses}>
            <Group gap={6}>
              {TALLY_STATUSES.map((s) => (
                <Chip key={s.value} value={s.value} size="xs" variant="light">
                  {s.label}
                </Chip>
              ))}
            </Group>
          </ChipGroup>
        </Group>

        {driftCount > 0 && (
          <Group gap={6}>
            <AlertTriangle size={14} color="var(--mantine-color-orange-5)" />
            <Text size="sm" c="orange">
              Some selections use sizes the item no longer offers — marked
              below.
            </Text>
          </Group>
        )}

        <Group gap="xs" wrap="wrap">
          <Badge variant="light" color="cyan">
            {operational.domestic} domestic open
          </Badge>
          <Badge variant="light" color="grape">
            {operational.international} international open
          </Badge>
          <Badge variant="light" color="blue">
            {operational.estimated} with estimates
          </Badge>
          <Badge
            variant="light"
            color={operational.overdue > 0 ? "red" : "gray"}
          >
            {operational.overdue} overdue
          </Badge>
          <Badge
            variant="light"
            color={operational.delayed > 0 ? "orange" : "gray"}
          >
            {operational.delayed} delayed
          </Badge>
        </Group>

        {rows.length === 0 ? (
          <Text c="dimmed" size="sm">
            No orders in the selected statuses.
          </Text>
        ) : (
          <Table withRowBorders={false} verticalSpacing={4}>
            <TableThead>
              <TableTr>
                <TableTh>Item</TableTh>
                {sizeColumns.map((col) => (
                  <TableTh key={col} ta="center">
                    {col}
                  </TableTh>
                ))}
                <TableTh ta="center">Total</TableTh>
              </TableTr>
            </TableThead>
            <TableTbody>
              {rows.map((row) => (
                <TableTr key={row.itemName}>
                  <TableTd>{row.itemName}</TableTd>
                  {row.counts.map((cell) => (
                    <TableTd key={cell.size} ta="center">
                      {cell.count === 0 ? (
                        <Text size="sm" c="dimmed" component="span">
                          —
                        </Text>
                      ) : cell.drifted ? (
                        <Tooltip label="This size was removed from the item's options">
                          <Badge variant="light" color="orange" size="sm">
                            {cell.count}
                          </Badge>
                        </Tooltip>
                      ) : (
                        cell.count
                      )}
                    </TableTd>
                  ))}
                  <TableTd ta="center" fw={600}>
                    {row.total}
                  </TableTd>
                </TableTr>
              ))}
            </TableTbody>
          </Table>
        )}
      </Stack>
    </Card>
  );
}
