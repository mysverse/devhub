import {
  Alert,
  Badge,
  Box,
  Card,
  Group,
  SimpleGrid,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { WelcomePackOrderStatus } from "@prisma/client";
import dayjs from "dayjs";
import { CalendarClock, CalendarOff, PauseCircle } from "lucide-react";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import EmptyState from "@/components/EmptyState";
import PageHeader from "@/components/PageHeader";
import { getSession } from "@/lib/auth-utils";
import { countryNameFromCode } from "@/lib/countries";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { WELCOME_PACK_ORDER_STATUS } from "@/lib/status-copy";
import { welcomePackAssetUrl } from "@/lib/welcome-pack-assets";
import {
  getOrderingWindowState,
  type OrderingWindowState,
} from "@/lib/welcome-pack-ordering";
import CancelOrderButton from "./CancelOrderButton";
import EditOrderButton, { type EditableOrder } from "./EditOrderModal";
import EligibilityGate from "./EligibilityGate";
import IdCardPreview from "./IdCardPreview";
import type { OrderFormDefaults, OrderFormPack } from "./OrderForm";
import OrderingWindowBanner from "./OrderingWindowBanner";
import OrderStatusTimeline from "./OrderStatusTimeline";
import PackItemsPreview from "./PackItemsPreview";
import SuccessCelebration from "./SuccessCelebration";
import TrackingCard from "./TrackingCard";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/welcome-pack",
);

// Long-form copy stays local; the badge color comes from the shared
// WELCOME_PACK_ORDER_STATUS map so it cannot drift from other surfaces.
const STATUS_COPY: Record<
  WelcomePackOrderStatus,
  { color: string; title: string; body: string }
> = {
  PENDING: {
    color: WELCOME_PACK_ORDER_STATUS.PENDING.color,
    title: "Order received",
    body: "We're reviewing your order. You'll get an email once it's approved.",
  },
  APPROVED: {
    color: WELCOME_PACK_ORDER_STATUS.APPROVED.color,
    title: "Approved",
    body: "Your pack is queued for fulfillment. We'll email you when it ships.",
  },
  SHIPPED: {
    color: WELCOME_PACK_ORDER_STATUS.SHIPPED.color,
    title: "On the way",
    body: "Your welcome pack has shipped. Tracking details below.",
  },
  DELIVERED: {
    color: WELCOME_PACK_ORDER_STATUS.DELIVERED.color,
    title: "Delivered",
    body: "Your welcome pack was delivered. Enjoy!",
  },
  CANCELLED: {
    color: WELCOME_PACK_ORDER_STATUS.CANCELLED.color,
    title: "Cancelled",
    body: "This order was cancelled.",
  },
  REJECTED: {
    color: WELCOME_PACK_ORDER_STATUS.REJECTED.color,
    title: "Order not approved",
    body: "Reach out if you have questions.",
  },
};

function EligibilitySkeleton() {
  return (
    <Stack gap="md" mt="md">
      <Skeleton height={28} width={220} />
      <Skeleton height={120} radius="md" />
      <Skeleton height={48} width="60%" radius="md" />
    </Stack>
  );
}

export default function WelcomePackPage() {
  return (
    <Suspense fallback={<EligibilitySkeleton />}>
      <WelcomePackContent />
    </Suspense>
  );
}

async function WelcomePackContent() {
  const { userId } = await getSession();
  if (!userId) redirect("/");

  const [profile, activeOrder, pack] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        legalName: true,
        preferredName: true,
        shippingAddress: true,
      },
    }),
    prisma.welcomePackOrder.findUnique({
      where: { activeUserId: userId },
      include: {
        pack: true,
        events: { orderBy: { createdAt: "asc" } },
        selections: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                description: true,
                imageBlobUrl: true,
                updatedAt: true,
                requiresSize: true,
                sizeOptions: true,
              },
            },
          },
        },
      },
    }),
    prisma.welcomePack.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  ]);

  // Active (non-terminal) order — show timeline + summary.
  if (activeOrder) {
    const status = STATUS_COPY[activeOrder.status];
    const countryName = countryNameFromCode(activeOrder.country);
    const editableOrder: EditableOrder = {
      idCardName: activeOrder.idCardName,
      region: activeOrder.region,
      // Only PENDING/APPROVED orders are editable and the retention sweep
      // never touches those, so these are non-null in practice. The coercion
      // exists because DELIVERED orders keep activeUserId and can be purged.
      recipientName: activeOrder.recipientName ?? "",
      phone: activeOrder.phone ?? "",
      addressLine1: activeOrder.addressLine1 ?? "",
      addressLine2: activeOrder.addressLine2,
      city: activeOrder.city ?? "",
      stateProvince: activeOrder.stateProvince,
      postalCode: activeOrder.postalCode ?? "",
      country: activeOrder.country,
      notes: activeOrder.notes,
      selections: activeOrder.selections.map((s) => ({
        itemId: s.item.id,
        itemName: s.item.name,
        requiresSize: s.item.requiresSize,
        sizeOptions: s.item.sizeOptions,
        selectedSize: s.selectedSize,
      })),
    };

    return (
      <FadeIn>
        <Box mb="xl">
          <PageHeader
            title="Welcome Pack"
            subtitle={pack?.description ?? "Your DevHub welcome pack."}
            action={
              <Badge variant="light" color={status.color} size="lg">
                {activeOrder.status}
              </Badge>
            }
          />
        </Box>

        <SuccessCelebration />

        <StaggerContainer>
          <StaggerItem>
            <Card withBorder radius="md" p="lg" mb="md">
              <Stack gap="lg">
                <Stack gap="xs">
                  <Title order={4}>{status.title}</Title>
                  <Text>{status.body}</Text>
                  <Text size="sm" c="dimmed">
                    Submitted{" "}
                    {dayjs(activeOrder.createdAt).format("D MMM YYYY")} · Wave{" "}
                    {activeOrder.wave}
                  </Text>
                  <Group gap="xs" wrap="wrap">
                    {activeOrder.estimatedFulfillmentAt && (
                      <Badge variant="light" color="blue">
                        Fulfilment estimate{" "}
                        {dayjs(activeOrder.estimatedFulfillmentAt).format(
                          "D MMM YYYY",
                        )}
                      </Badge>
                    )}
                    {activeOrder.estimatedDeliveryAt && (
                      <Badge variant="light" color="indigo">
                        Delivery estimate{" "}
                        {dayjs(activeOrder.estimatedDeliveryAt).format(
                          "D MMM YYYY",
                        )}
                      </Badge>
                    )}
                    {activeOrder.delayedAt && (
                      <Badge variant="light" color="orange">
                        Delayed
                      </Badge>
                    )}
                  </Group>
                  {activeOrder.delayReason && (
                    <Text size="sm" c="orange">
                      {activeOrder.delayReason}
                    </Text>
                  )}
                </Stack>

                <OrderStatusTimeline status={activeOrder.status} />

                {activeOrder.trackingNumber && (
                  <TrackingCard
                    carrierName={activeOrder.carrierName}
                    trackingNumber={activeOrder.trackingNumber}
                    trackingUrl={activeOrder.trackingUrl}
                  />
                )}

                {activeOrder.events.length > 0 && (
                  <OrderEventTimeline
                    events={activeOrder.events.map((event) => ({
                      id: event.id,
                      type: event.type,
                      message: event.message,
                      createdAt: event.createdAt,
                    }))}
                  />
                )}

                {activeOrder.status === "PENDING" && (
                  <Group
                    justify="flex-end"
                    gap="xs"
                    pt="md"
                    style={{
                      borderTop: "1px solid var(--mantine-color-dark-5)",
                    }}
                  >
                    <EditOrderButton order={editableOrder} />
                    <CancelOrderButton />
                  </Group>
                )}
              </Stack>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Title order={5}>Order summary</Title>

                  <Stack gap={4}>
                    <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                      ID card name
                    </Text>
                    <Text>{activeOrder.idCardName}</Text>
                  </Stack>

                  <Stack gap={4}>
                    <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                      Items
                    </Text>
                    <Group gap="xs" wrap="wrap">
                      {activeOrder.selections.map((s) => (
                        <Badge
                          key={s.id}
                          variant="light"
                          color="gray"
                          size="md"
                        >
                          {s.item.name}
                          {s.selectedSize ? ` · ${s.selectedSize}` : ""}
                        </Badge>
                      ))}
                    </Group>
                  </Stack>
                </Stack>
              </Card>

              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Title order={5}>Shipping to</Title>
                  <Stack gap={4}>
                    <Text size="sm" fw={500}>
                      {activeOrder.recipientName}
                    </Text>
                    <Text size="sm" c="dimmed">
                      {activeOrder.phone}
                    </Text>
                    <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                      {[
                        activeOrder.addressLine1,
                        activeOrder.addressLine2,
                        [activeOrder.city, activeOrder.stateProvince]
                          .filter(Boolean)
                          .join(", "),
                        [activeOrder.postalCode, countryName]
                          .filter(Boolean)
                          .join(" "),
                      ]
                        .filter(Boolean)
                        .join("\n")}
                    </Text>
                  </Stack>
                </Stack>
              </Card>
            </SimpleGrid>
          </StaggerItem>

          <StaggerItem>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <Stack gap="md">
                <Title order={5}>Pack preview</Title>
                <PackItemsPreview
                  items={activeOrder.selections.map((selection) => ({
                    id: selection.item.id,
                    name: selection.item.name,
                    description: selection.item.description,
                    imageBlobUrl: selection.item.imageBlobUrl
                      ? welcomePackAssetUrl(
                          "item-image",
                          selection.item.id,
                          selection.item.updatedAt,
                        )
                      : null,
                  }))}
                />
              </Stack>

              <Card withBorder radius="md" p="lg">
                <Stack gap="md">
                  <Title order={5}>ID card preview</Title>
                  <IdCardPreview
                    templateUrl={
                      activeOrder.pack.idCardTemplateBlobUrl
                        ? welcomePackAssetUrl(
                            "id-card-template",
                            activeOrder.pack.id,
                            activeOrder.pack.updatedAt,
                          )
                        : null
                    }
                    templateWidth={activeOrder.pack.idCardWidth}
                    templateHeight={activeOrder.pack.idCardHeight}
                    nameX={activeOrder.pack.idCardNameX}
                    nameY={activeOrder.pack.idCardNameY}
                    fontSize={activeOrder.pack.idCardFontSize}
                    fontColor={activeOrder.pack.idCardFontColor}
                    fontFamily={activeOrder.pack.idCardFontFamily}
                    nameMaxWidth={activeOrder.pack.idCardNameMaxWidth}
                    nameMaxHeight={activeOrder.pack.idCardNameMaxHeight}
                    nameAlign={
                      (activeOrder.pack.idCardNameAlign as
                        | "left"
                        | "center"
                        | "right"
                        | null) ?? null
                    }
                    nameWrapMode={
                      (activeOrder.pack.idCardNameWrapMode as
                        | "nowrap"
                        | "truncate"
                        | "wrap"
                        | "shrink"
                        | null) ?? null
                    }
                    name={activeOrder.idCardName}
                  />
                </Stack>
              </Card>
            </SimpleGrid>
          </StaggerItem>
        </StaggerContainer>
      </FadeIn>
    );
  }

  // No active order — a previous one may have ended in cancellation or
  // rejection; surface that next to whatever comes below.
  const lastTerminalOrder = await prisma.welcomePackOrder.findFirst({
    where: { userId, status: { in: ["CANCELLED", "REJECTED"] } },
    orderBy: { createdAt: "desc" },
    select: { status: true, rejectionReason: true, createdAt: true },
  });

  // No active pack configured.
  if (!pack) {
    return (
      <FadeIn>
        <Box mb="xl">
          <PageHeader
            title="Welcome Pack"
            subtitle="Welcome packs aren't open yet. Check back soon."
          />
        </Box>
        <EmptyState
          icon={<CalendarClock size={26} />}
          title="Not set up yet"
          description="The welcome pack hasn't been configured yet. Once admins set it up, eligible developers will see an order form here."
        />
      </FadeIn>
    );
  }

  const window = getOrderingWindowState(pack);

  const terminalAlert = lastTerminalOrder ? (
    <Alert
      color={lastTerminalOrder.status === "REJECTED" ? "red" : "gray"}
      variant="light"
      title={
        lastTerminalOrder.status === "REJECTED"
          ? "Your previous order wasn't approved"
          : "Your previous order was cancelled"
      }
    >
      {lastTerminalOrder.rejectionReason && (
        <Text size="sm" mb={4}>
          {lastTerminalOrder.rejectionReason}
        </Text>
      )}
      <Text size="sm">
        {window.open
          ? "You can place a new order below."
          : "You'll be able to place a new order when ordering reopens."}
      </Text>
    </Alert>
  ) : null;

  // Ordering window closed — header + explanation + pack preview, no form.
  if (!window.open) {
    return (
      <FadeIn>
        <Box mb="xl">
          <PageHeader title={pack.name} subtitle={pack.description} />
        </Box>
        <Stack gap="xl">
          {terminalAlert}
          <ClosedWindowState window={window} />
          {pack.items.length > 0 && (
            <Stack gap="md">
              <Title order={4}>What&apos;s in the pack</Title>
              <Text c="dimmed" size="sm" mt={-6}>
                A preview of what eligible developers get to claim.
              </Text>
              <PackItemsPreview
                items={pack.items.map((item) => ({
                  id: item.id,
                  name: item.name,
                  description: item.description,
                  imageBlobUrl: item.imageBlobUrl
                    ? welcomePackAssetUrl("item-image", item.id, item.updatedAt)
                    : null,
                }))}
              />
            </Stack>
          )}
        </Stack>
      </FadeIn>
    );
  }

  // Pack exists, ordering open, no active order — render header + the gated
  // order form (eligibility resolves behind Suspense so the page isn't
  // blocked on Linear).
  const formPack: OrderFormPack = {
    id: pack.id,
    name: pack.name,
    description: pack.description,
    idCardTemplateBlobUrl: pack.idCardTemplateBlobUrl
      ? welcomePackAssetUrl("id-card-template", pack.id, pack.updatedAt)
      : null,
    idCardWidth: pack.idCardWidth,
    idCardHeight: pack.idCardHeight,
    idCardNameX: pack.idCardNameX,
    idCardNameY: pack.idCardNameY,
    idCardFontSize: pack.idCardFontSize,
    idCardFontColor: pack.idCardFontColor,
    idCardFontFamily: pack.idCardFontFamily,
    idCardNameMaxWidth: pack.idCardNameMaxWidth,
    idCardNameMaxHeight: pack.idCardNameMaxHeight,
    idCardNameAlign:
      (pack.idCardNameAlign as OrderFormPack["idCardNameAlign"]) ?? null,
    idCardNameWrapMode:
      (pack.idCardNameWrapMode as OrderFormPack["idCardNameWrapMode"]) ?? null,
    defaultDomesticFulfillmentDays: pack.defaultDomesticFulfillmentDays,
    defaultInternationalFulfillmentDays:
      pack.defaultInternationalFulfillmentDays,
    defaultDomesticDeliveryDays: pack.defaultDomesticDeliveryDays,
    defaultInternationalDeliveryDays: pack.defaultInternationalDeliveryDays,
    items: pack.items.map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      imageBlobUrl: item.imageBlobUrl
        ? welcomePackAssetUrl("item-image", item.id, item.updatedAt)
        : null,
      requiresSize: item.requiresSize,
      sizeChartBlobUrl: item.sizeChartBlobUrl
        ? welcomePackAssetUrl("size-chart", item.id, item.updatedAt)
        : null,
      sizeOptions: item.sizeOptions,
    })),
  };

  const defaults: OrderFormDefaults = {
    legalName: profile?.legalName ?? null,
    preferredName: profile?.preferredName ?? null,
    shippingAddress: profile?.shippingAddress ?? null,
  };

  return (
    <FadeIn>
      <Box mb="xl">
        <PageHeader title={pack.name} subtitle={pack.description} />
      </Box>

      <Stack gap="md">
        {terminalAlert}
        {window.closesAt && (
          <OrderingWindowBanner
            closesAt={window.closesAt.toISOString()}
            serverNow={new Date().toISOString()}
          />
        )}
        <Suspense fallback={<EligibilitySkeleton />}>
          <EligibilityGate
            userId={userId}
            pack={formPack}
            defaults={defaults}
            wave2Open={pack.wave2Open}
          />
        </Suspense>
      </Stack>
    </FadeIn>
  );
}

function OrderEventTimeline({
  events,
}: {
  events: {
    id: string;
    type: string;
    message: string | null;
    createdAt: Date;
  }[];
}) {
  return (
    <Stack gap="xs">
      <Title order={5}>Timeline</Title>
      <Stack gap={6}>
        {events.map((event) => (
          <Group key={event.id} gap="sm" align="flex-start" wrap="nowrap">
            <Badge variant="light" color="gray" size="sm">
              {event.type.replaceAll("_", " ").toLowerCase()}
            </Badge>
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Text size="sm">{event.message ?? event.type}</Text>
              <Text size="xs" c="dimmed">
                {dayjs(event.createdAt).format("D MMM YYYY, HH:mm")}
              </Text>
            </Stack>
          </Group>
        ))}
      </Stack>
    </Stack>
  );
}

function ClosedWindowState({
  window,
}: {
  window: Extract<OrderingWindowState, { open: false }>;
}) {
  if (window.reason === "not-yet-open" && window.opensAt) {
    return (
      <EmptyState
        icon={<CalendarClock size={26} />}
        color="yellow"
        title="Ordering opens soon"
        description={`Ordering opens ${dayjs(window.opensAt).format(
          "D MMM YYYY, HH:mm",
        )} — ${dayjs(window.opensAt).diff(dayjs(), "day") >= 1 ? `in ${dayjs(window.opensAt).diff(dayjs(), "day")} day(s)` : "later today"}. Check back then.`}
      />
    );
  }
  if (window.reason === "closed") {
    return (
      <EmptyState
        icon={<CalendarOff size={26} />}
        color="red"
        title="Ordering has closed"
        description="Ordering for this welcome pack has closed. Keep an eye out for announcements about future waves."
      />
    );
  }
  return (
    <EmptyState
      icon={<PauseCircle size={26} />}
      color="gray"
      title="Ordering is paused"
      description="Ordering is temporarily paused while admins make adjustments. Check back soon."
    />
  );
}
