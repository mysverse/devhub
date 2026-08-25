import { Stack, Text } from "@mantine/core";

export type TrailEvent = {
  id: string;
  type: string;
  createdAt: Date;
};

/**
 * The "what happened" trail: dots, whitelisted labels, timestamps.
 *
 * `copy` is a whitelist, not a formatter. Event rows carry hold reasons, cap
 * arithmetic and admin notes in their message and metadata, so a trail built by
 * filtering out the bad ones leaks the next one somebody adds. Anything absent
 * from the map does not render.
 */
export default function EventTrail({
  events,
  copy,
  limit = 8,
}: {
  events: TrailEvent[];
  copy: Record<string, string>;
  limit?: number;
}) {
  const visible = events
    .filter((event) => copy[event.type])
    .slice(-limit)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  if (visible.length === 0) return null;

  return (
    <Stack gap={4} pl="xs">
      {visible.map((event, index) => (
        <div
          key={event.id}
          style={{ display: "flex", gap: 8, alignItems: "baseline" }}
        >
          <div
            style={{
              width: 6,
              height: 6,
              borderRadius: "50%",
              flexShrink: 0,
              background:
                index === visible.length - 1
                  ? "var(--mantine-color-blue-5)"
                  : "var(--mantine-color-dark-3)",
            }}
          />
          <Text fz="xs" c={index === visible.length - 1 ? undefined : "dimmed"}>
            {copy[event.type]}
          </Text>
          <Text fz="xs" c="dimmed" ml="auto" style={{ whiteSpace: "nowrap" }}>
            {event.createdAt.toLocaleString("en-US", {
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </Text>
        </div>
      ))}
    </Stack>
  );
}
