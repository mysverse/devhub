import { Stack, Text } from "@mantine/core";
import { PPT_EVENT_COPY } from "@/lib/ppt-reason-copy";

export type PayoutTimelineEvent = {
  id: string;
  type: string;
  createdAt: Date;
};

/**
 * "What happened" trail for a PPT payout, modeled on the welcome-pack order
 * timeline. Renders ONLY whitelisted event types (PPT_EVENT_COPY) — raw event
 * messages/metadata may contain admin notes and never reach developers.
 */
export default function PayoutTimeline({
  events,
}: {
  events: PayoutTimelineEvent[];
}) {
  const visible = events
    .filter((event) => PPT_EVENT_COPY[event.type])
    .slice(-8);
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
            {PPT_EVENT_COPY[event.type]}
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
