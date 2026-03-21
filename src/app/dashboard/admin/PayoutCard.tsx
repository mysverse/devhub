"use client";

import {
  Box,
  Button,
  Card,
  Group,
  Modal,
  Stack,
  Text,
  Textarea,
} from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useState } from "react";
import { toast } from "sonner";
import { markTransactionAsPaid } from "./actions";
import { sendPaymentInfoNotice } from "./email-actions";

type PayoutCardProps = {
  transactionId: string;
  userId: string;
  amount: number;
  currency: string;
  developerName: string;
  taskTitle: string;
  paymentMethod: string;
  paymentDetails: React.ReactNode;
};

export default function PayoutCard({
  transactionId,
  userId,
  amount,
  currency,
  developerName,
  taskTitle,
  paymentMethod,
  paymentDetails,
}: PayoutCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [
    reasonModalOpened,
    { open: openReasonModal, close: closeReasonModal },
  ] = useDisclosure(false);
  const [reason, setReason] = useState("");
  const [sendingNotice, setSendingNotice] = useState(false);

  async function handleMarkPaid() {
    setLoading(true);
    setError("");
    const res = await markTransactionAsPaid(transactionId);
    if (res?.error) {
      setError(res.error);
    }
    setLoading(false);
  }

  async function handleSendPaymentNotice() {
    setSendingNotice(true);
    const res = await sendPaymentInfoNotice(userId, reason.trim() || undefined);
    if (res.error) {
      toast.error(res.error);
    } else {
      toast.success("Payment issue notification sent");
    }
    setSendingNotice(false);
    setReason("");
    closeReasonModal();
  }

  return (
    <>
      <Card
        withBorder
        radius="md"
        padding="lg"
        h="100%"
        style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
      >
        <Stack flex={1} gap="xs">
          <Group justify="space-between" align="flex-start">
            <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1}>
              {developerName}
            </Text>
            <Text size="lg" fw={700} c="green">
              {currency === "MYR" ? "RM" : "$"}
              {amount.toFixed(2)} {currency}
            </Text>
          </Group>

          <Text fw={600} mb="xs">
            {taskTitle}
          </Text>

          <Box
            bg="var(--mantine-color-default-hover)"
            p="sm"
            style={{ borderRadius: "var(--mantine-radius-md)" }}
          >
            <Text size="sm" fw={600} mb={4}>
              Pay via {paymentMethod}
            </Text>
            <Text size="sm" c="dimmed" ff="monospace">
              {paymentDetails}
            </Text>
          </Box>
        </Stack>

        <Box mt="auto">
          {error && (
            <Text size="xs" c="red" mb="xs">
              {error}
            </Text>
          )}
          <Button
            fullWidth
            onClick={handleMarkPaid}
            loading={loading}
            variant="light"
            color="blue"
          >
            Mark as Paid
          </Button>
          <Button
            fullWidth
            onClick={openReasonModal}
            variant="light"
            color="yellow"
            mt="xs"
          >
            Notify: Payment Issue
          </Button>
          <Button
            component="a"
            href={`/api/transactions/${transactionId}/pdf`}
            fullWidth
            variant="light"
            color="gray"
            mt="xs"
          >
            Download Slip
          </Button>
        </Box>
      </Card>

      <Modal
        opened={reasonModalOpened}
        onClose={closeReasonModal}
        title="Notify Payment Issue"
        centered
      >
        <Stack gap="md">
          <Text size="sm" c="dimmed">
            Send an email to <strong>{developerName}</strong> notifying them
            that their payment information needs to be updated.
          </Text>
          <Textarea
            label="Reason (optional)"
            placeholder="e.g. Bank account name does not match name on system"
            value={reason}
            onChange={(e) => setReason(e.currentTarget.value)}
            autosize
            minRows={2}
            maxRows={4}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={closeReasonModal}>
              Cancel
            </Button>
            <Button
              onClick={handleSendPaymentNotice}
              loading={sendingNotice}
              color="yellow"
            >
              Send Notification
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}
