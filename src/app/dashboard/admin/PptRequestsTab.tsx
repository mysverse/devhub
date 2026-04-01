"use client";

import { Card, SimpleGrid, Text } from "@mantine/core";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import PptRequestCard, { type PptRequestData } from "./PptRequestCard";

export default function PptRequestsTab({
  requests,
}: {
  requests: PptRequestData[];
}) {
  if (requests.length === 0) {
    return (
      <Card withBorder radius="md" padding="xl" ta="center">
        <Text c="dimmed">No pending PPT requests.</Text>
      </Card>
    );
  }

  return (
    <StaggerContainer>
      <SimpleGrid cols={{ base: 1, md: 2, lg: 3 }} spacing="lg">
        {requests.map((req) => (
          <StaggerItem key={req.id}>
            <PptRequestCard request={req} />
          </StaggerItem>
        ))}
      </SimpleGrid>
    </StaggerContainer>
  );
}
