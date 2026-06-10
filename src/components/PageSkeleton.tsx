import { Skeleton, Stack } from "@mantine/core";

export default function PageSkeleton({ cards = 3 }: { cards?: number }) {
  return (
    <Stack gap="xl">
      <div>
        <Skeleton height={34} width={260} radius="sm" />
        <Skeleton height={16} width={420} mt={12} radius="sm" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static skeleton cards are never reordered
        <Skeleton key={i} height={140} radius="md" />
      ))}
    </Stack>
  );
}
