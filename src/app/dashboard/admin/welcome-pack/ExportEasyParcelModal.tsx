"use client";

import {
  Alert,
  Badge,
  Button,
  Group,
  List,
  ListItem,
  Loader,
  Modal,
  ScrollArea,
  Stack,
  Text,
} from "@mantine/core";
import dayjs from "dayjs";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

const ENDPOINT = "/api/admin/welcome-pack/export/easyparcel";

type PreflightOrder = {
  orderId: string;
  reference: string;
  recipientName: string;
  region: "DOMESTIC" | "INTERNATIONAL";
  ok: boolean;
  previouslyExported: boolean;
  issues: { field: string; message: string }[];
  warnings: { field: string; message: string }[];
};

type Preflight = {
  status: "ready" | "needs_confirmation" | "blocked";
  counts: {
    total: number;
    ready: number;
    withWarnings: number;
    blocked: number;
    previouslyExported: number;
  };
  orders: PreflightOrder[];
};

export function ExportEasyParcelModal({
  orderIds,
  opened,
  onClose,
  onExported,
}: {
  orderIds: string[];
  opened: boolean;
  onClose: () => void;
  onExported: () => void;
}) {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const runPreflight = useCallback(async () => {
    setLoading(true);
    setPreflight(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, dryRun: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? "Could not check export readiness");
        return;
      }
      setPreflight((await res.json()) as Preflight);
    } finally {
      setLoading(false);
    }
  }, [orderIds]);

  useEffect(() => {
    if (opened && orderIds.length > 0) runPreflight();
  }, [opened, orderIds.length, runPreflight]);

  async function download() {
    setDownloading(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds, confirmReexport: true }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        toast.error(body.error ?? `Export failed (${res.status})`);
        // refresh readiness so the dialog reflects the server's verdict
        if (res.status === 422 || res.status === 409) {
          setPreflight(body as Preflight);
        }
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `easyparcel-${dayjs().format("YYYY-MM-DD")}-${orderIds.length}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("EasyParcel workbook downloaded");
      onExported();
      onClose();
    } finally {
      setDownloading(false);
    }
  }

  const counts = preflight?.counts;
  const blocked = counts ? counts.blocked > 0 : false;
  const canDownload = Boolean(
    counts && counts.blocked === 0 && counts.ready > 0,
  );
  const downloadLabel =
    counts && counts.previouslyExported > 0
      ? `Confirm & re-export ${counts.ready}`
      : `Download XLSX (${counts?.ready ?? 0})`;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Export to EasyParcel"
      size="lg"
    >
      <Stack gap="md">
        {loading || !preflight ? (
          <Group gap="sm">
            <Loader size="sm" />
            <Text c="dimmed">Checking export readiness…</Text>
          </Group>
        ) : (
          <>
            <Group gap="xs">
              <Badge color="green" variant="light">
                {counts?.ready ?? 0} ready
              </Badge>
              {(counts?.withWarnings ?? 0) > 0 && (
                <Badge color="yellow" variant="light">
                  {counts?.withWarnings} with warnings
                </Badge>
              )}
              {(counts?.blocked ?? 0) > 0 && (
                <Badge color="red" variant="light">
                  {counts?.blocked} blocked
                </Badge>
              )}
              {(counts?.previouslyExported ?? 0) > 0 && (
                <Badge color="grape" variant="light">
                  {counts?.previouslyExported} previously exported
                </Badge>
              )}
            </Group>

            {blocked && (
              <Alert color="red" title="Export blocked">
                Every selected order must be export-ready — fix the issues below
                or deselect those orders. Nothing is exported while any row is
                invalid.
              </Alert>
            )}

            <ScrollArea.Autosize mah={320}>
              <Stack gap="xs">
                {preflight.orders.map((o) => (
                  <Stack key={o.orderId} gap={2}>
                    <Group gap="xs">
                      {o.ok ? (
                        <Badge color="green" size="sm" variant="light">
                          Ready
                        </Badge>
                      ) : (
                        <Badge color="red" size="sm" variant="light">
                          Blocked
                        </Badge>
                      )}
                      <Text size="sm" fw={500}>
                        {o.recipientName}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {o.region === "DOMESTIC" ? "Domestic" : "International"}
                      </Text>
                      {o.previouslyExported && (
                        <Badge color="grape" size="xs" variant="light">
                          re-export
                        </Badge>
                      )}
                    </Group>
                    {(o.issues.length > 0 || o.warnings.length > 0) && (
                      <List size="xs" spacing={0} withPadding>
                        {o.issues.map((i) => (
                          <ListItem key={i.field + i.message} c="red">
                            {i.message}
                          </ListItem>
                        ))}
                        {o.warnings.map((w) => (
                          <ListItem key={w.field + w.message} c="orange">
                            {w.message}
                          </ListItem>
                        ))}
                      </List>
                    )}
                  </Stack>
                ))}
              </Stack>
            </ScrollArea.Autosize>
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose} disabled={downloading}>
            Close
          </Button>
          <Button
            onClick={download}
            loading={downloading}
            disabled={!canDownload || loading}
          >
            {downloadLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
