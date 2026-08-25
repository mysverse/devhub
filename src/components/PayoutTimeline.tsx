import EventTrail, { type TrailEvent } from "@/components/EventTrail";
import { PPT_EVENT_COPY } from "@/lib/ppt-reason-copy";

export type PayoutTimelineEvent = TrailEvent;

/**
 * "What happened" trail for a PPT payout. The rendering lives in EventTrail,
 * shared with incentive rewards; this fixes the whitelist to PPT_EVENT_COPY so
 * raw event messages and metadata — which may contain admin notes — can never
 * reach a developer.
 */
export default function PayoutTimeline({
  events,
}: {
  events: PayoutTimelineEvent[];
}) {
  return <EventTrail events={events} copy={PPT_EVENT_COPY} />;
}
