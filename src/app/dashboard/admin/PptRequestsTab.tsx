"use client";

import { SimpleGrid } from "@mantine/core";
import { StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import PptRequestCard, { type PptRequestData } from "./PptRequestCard";

export default function PptRequestsTab({
  requests,
}: {
  requests: PptRequestData[];
}) {
  if (requests.length === 0) {
    return <EmptyState description="No pending PPT requests." />;
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
