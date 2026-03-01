'use client'

import { useState } from "react";
import { markTransactionAsPaid } from "./actions";
import { Card, Text, Group, Button, Box, Stack } from "@mantine/core";

type PayoutCardProps = {
  transactionId: string;
  amount: number;
  currency: string;
  developerName: string;
  taskTitle: string;
  paymentMethod: string;
  paymentDetails: React.ReactNode;
};

export default function PayoutCard({
  transactionId,
  amount,
  currency,
  developerName,
  taskTitle,
  paymentMethod,
  paymentDetails
}: PayoutCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleMarkPaid() {
    setLoading(true);
    setError("");
    const res = await markTransactionAsPaid(transactionId);
    if (res?.error) {
      setError(res.error);
    }
    setLoading(false);
  }

  return (
    <Card withBorder radius="md" padding="lg" h="100%" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <Stack flex={1} gap="xs">
        <Group justify="space-between" align="flex-start">
          <Text size="xs" fw={700} c="dimmed" tt="uppercase" lts={1}>{developerName}</Text>
          <Text size="lg" fw={700} c="green">${amount.toFixed(2)} {currency}</Text>
        </Group>
        
        <Text fw={600} mb="xs">{taskTitle}</Text>
        
        <Box bg="var(--mantine-color-default-hover)" p="sm" style={{ borderRadius: 'var(--mantine-radius-md)' }}>
          <Text size="sm" fw={600} mb={4}>Pay via {paymentMethod}</Text>
          <Text size="sm" c="dimmed" ff="monospace">
            {paymentDetails}
          </Text>
        </Box>
      </Stack>

      <Box mt="auto">
        {error && <Text size="xs" c="red" mb="xs">{error}</Text>}
        <Button
          fullWidth
          onClick={handleMarkPaid}
          loading={loading}
          variant="light"
          color="blue"
        >
          Mark as Paid
        </Button>
      </Box>
    </Card>
  );
}