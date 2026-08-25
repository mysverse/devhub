import { Card, Group, SimpleGrid, Skeleton, Stack } from "@mantine/core";

export function HeroSkeleton() {
  return (
    <Card withBorder radius="lg" p={{ base: 20, sm: 32 }}>
      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="xl">
        <Stack gap="md">
          <Skeleton height={12} width={120} />
          <Skeleton height={72} width="70%" />
          <Skeleton height={16} width="50%" />
          <Skeleton height={20} width={160} />
        </Stack>
        <Stack gap="md">
          {[...Array(3)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Group key={i} gap="sm" wrap="nowrap">
              <Skeleton height={40} width={40} radius="md" />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton height={10} width="35%" />
                <Skeleton height={18} width="60%" />
              </Stack>
            </Group>
          ))}
        </Stack>
      </SimpleGrid>
    </Card>
  );
}

export function ActiveTasksSkeleton() {
  return (
    <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
      {[...Array(2)].map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Card key={i} withBorder radius="md" padding="lg">
          <Group justify="space-between" mb="xs">
            <Skeleton height={20} width={60} />
            <Skeleton height={20} width={100} />
          </Group>
          <Skeleton height={24} mb="md" />
          <Group justify="space-between" mt="auto">
            <Skeleton height={16} width={80} />
            <Skeleton height={16} width={100} />
          </Group>
        </Card>
      ))}
    </SimpleGrid>
  );
}

export function CarouselSkeleton() {
  return (
    <Stack gap="md">
      <Skeleton height={32} width={220} />
      <div style={{ display: "flex", gap: "20px", overflow: "hidden" }}>
        {[...Array(3)].map((_, i) => (
          <Card
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
            withBorder
            radius="md"
            padding="lg"
            style={{ width: 300, flexShrink: 0 }}
          >
            <Skeleton height={20} mb="xs" />
            <Skeleton height={24} mb="sm" />
            <Skeleton height={14} width="40%" />
          </Card>
        ))}
      </div>
    </Stack>
  );
}

export function LeaderboardSkeleton() {
  return (
    <Card withBorder radius="md" p={0}>
      <Stack gap={0}>
        {[...Array(5)].map((_, i) => (
          <Group
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            key={i}
            p="md"
            style={
              i > 0
                ? { borderTop: "1px solid var(--mantine-color-default-border)" }
                : undefined
            }
          >
            <Skeleton height={36} width={36} circle />
            <Stack gap={6} style={{ flex: 1 }}>
              <Skeleton height={16} width={140} />
              <Skeleton height={6} width="100%" radius="xl" />
            </Stack>
            <Skeleton height={16} width={80} />
          </Group>
        ))}
      </Stack>
    </Card>
  );
}

/** Mirrors the StatCard tile geometry (uppercase label + xl value). */
export function StatGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <SimpleGrid cols={{ base: 1, sm: 2, lg: count }} spacing="lg">
      {[...Array(count)].map((_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
        <Card key={i} withBorder>
          <Stack gap={8}>
            <Skeleton height={12} width={100} />
            <Skeleton height={24} width={140} />
          </Stack>
        </Card>
      ))}
    </SimpleGrid>
  );
}

/** Mirrors the RecentTransactions section: header + icon rows. */
export function TransactionsSkeleton() {
  return (
    <Stack gap="md">
      <Group gap="sm">
        <Skeleton height={32} width={32} radius="md" />
        <Stack gap={6}>
          <Skeleton height={20} width={200} />
          <Skeleton height={12} width={260} />
        </Stack>
      </Group>
      <Card withBorder radius="md" p={0}>
        <Stack gap={0}>
          {[...Array(4)].map((_, i) => (
            <Group
              // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
              key={i}
              p="md"
              style={
                i > 0
                  ? {
                      borderTop:
                        "1px solid var(--mantine-color-default-border)",
                    }
                  : undefined
              }
            >
              <Skeleton height={40} width={40} radius="md" />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton height={14} width="40%" />
                <Skeleton height={10} width="25%" />
              </Stack>
              <Skeleton height={16} width={90} />
            </Group>
          ))}
        </Stack>
      </Card>
    </Stack>
  );
}

export function IncentiveProgressSkeleton() {
  return (
    <Card withBorder radius="md" padding="lg">
      <Stack gap="lg">
        <Group justify="space-between">
          <Skeleton height={20} width={180} />
          <Skeleton height={18} width={90} />
        </Group>
        <Stack gap={8}>
          <Skeleton height={10} width={80} />
          <Skeleton height={14} width={220} />
        </Stack>
        <Skeleton height={6} radius="xl" />
        <Group gap={6}>
          {[...Array(5)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Skeleton key={i} height={34} width={34} radius="sm" />
          ))}
        </Group>
        <Stack gap="xs">
          {[...Array(2)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Skeleton key={i} height={104} radius="md" />
          ))}
        </Stack>
        <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
          {[...Array(3)].map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton list
            <Group key={i} gap="sm">
              <Skeleton height={24} width={24} circle />
              <Stack gap={6} style={{ flex: 1 }}>
                <Skeleton height={10} width="60%" />
                <Skeleton height={16} width="40%" />
              </Stack>
            </Group>
          ))}
        </SimpleGrid>
      </Stack>
    </Card>
  );
}
