import {
  Alert,
  Badge,
  Box,
  Card,
  Group,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import type { WelcomePackOrderStatus } from "@prisma/client";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { FadeIn, StaggerContainer, StaggerItem } from "@/components/animations";
import PageHeader from "@/components/PageHeader";
import { getSession } from "@/lib/auth-utils";
import { countryNameFromCode } from "@/lib/countries";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { WELCOME_PACK_ORDER_STATUS } from "@/lib/status-copy";
import { welcomePackAssetUrl } from "@/lib/welcome-pack-assets";
import CancelOrderButton from "./CancelOrderButton";
import EligibilityGate from "./EligibilityGate";
import type { OrderFormDefaults, OrderFormPack } from "./OrderForm";
import OrderStatusTimeline from "./OrderStatusTimeline";
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

  const [profile, existingOrder, pack] = await Promise.all([
    prisma.userProfile.findUnique({
      where: { id: userId },
      select: {
        legalName: true,
        shippingAddress: true,
        user: { select: { email: true } },
      },
    }),
    prisma.welcomePackOrder.findUnique({
      where: { userId },
      include: {
        selections: { include: { item: { select: { name: true } } } },
      },
    }),
    prisma.welcomePack.findFirst({
      where: { isActive: true },
      include: {
        items: {
          where: { isActive: true },
          orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }],
        },
      },
    }),
  ]);

  // Existing order — show timeline + summary.
  if (existingOrder) {
    const status = STATUS_COPY[existingOrder.status];
    const countryName = countryNameFromCode(existingOrder.country);
    return (
      <FadeIn>
        <Box mb="xl">
          <PageHeader
            title="Welcome Pack"
            subtitle={pack?.description ?? "Your DevHub welcome pack."}
            action={
              <Badge variant="light" color={status.color} size="lg">
                {existingOrder.status}
              </Badge>
            }
          />
        </Box>

        <StaggerContainer>
          <StaggerItem>
            <Card withBorder radius="md" p="lg" mb="md">
              <Stack gap="lg">
                <Stack gap="xs">
                  <Title order={4}>{status.title}</Title>
                  <Text>{status.body}</Text>
                </Stack>

                <OrderStatusTimeline status={existingOrder.status} />

                {existingOrder.rejectionReason && (
                  <Alert color="red" variant="light">
                    {existingOrder.rejectionReason}
                  </Alert>
                )}

                {existingOrder.trackingNumber && (
                  <TrackingCard
                    trackingNumber={existingOrder.trackingNumber}
                    trackingUrl={existingOrder.trackingUrl}
                  />
                )}

                {existingOrder.status === "PENDING" && <CancelOrderButton />}
              </Stack>
            </Card>
          </StaggerItem>

          <StaggerItem>
            <Card withBorder radius="md" p="lg" mb="md">
              <Stack gap="md">
                <Title order={5}>Order summary</Title>

                <Stack gap={4}>
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    ID card name
                  </Text>
                  <Text>{existingOrder.idCardName}</Text>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    Shipping to
                  </Text>
                  <Text size="sm" fw={500}>
                    {existingOrder.recipientName}
                  </Text>
                  <Text size="sm" c="dimmed">
                    {existingOrder.phone}
                  </Text>
                  <Text size="sm" style={{ whiteSpace: "pre-line" }}>
                    {[
                      existingOrder.addressLine1,
                      existingOrder.addressLine2,
                      [existingOrder.city, existingOrder.stateProvince]
                        .filter(Boolean)
                        .join(", "),
                      [existingOrder.postalCode, countryName]
                        .filter(Boolean)
                        .join(" "),
                    ]
                      .filter(Boolean)
                      .join("\n")}
                  </Text>
                </Stack>

                <Stack gap={4}>
                  <Text size="xs" tt="uppercase" fw={600} c="dimmed">
                    Items
                  </Text>
                  <Group gap="xs" wrap="wrap">
                    {existingOrder.selections.map((s) => (
                      <Badge key={s.id} variant="light" color="gray" size="md">
                        {s.item.name}
                        {s.selectedSize ? ` · ${s.selectedSize}` : ""}
                      </Badge>
                    ))}
                  </Group>
                </Stack>
              </Stack>
            </Card>
          </StaggerItem>
        </StaggerContainer>
      </FadeIn>
    );
  }

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
        <Alert color="blue">
          The welcome pack hasn&apos;t been configured yet. Once admins set it
          up, eligible developers will see an order form here.
        </Alert>
      </FadeIn>
    );
  }

  // Pack exists, no order yet — render header + items preview always (so the
  // page doesn't appear empty while we wait on Linear), and gate the order
  // form behind a Suspense boundary backed by EligibilityGate.
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
    shippingAddress: profile?.shippingAddress ?? null,
    email: profile?.user.email ?? null,
  };

  return (
    <FadeIn>
      <Box mb="xl">
        <PageHeader title={pack.name} subtitle={pack.description} />
      </Box>

      <Suspense fallback={<EligibilitySkeleton />}>
        <EligibilityGate
          userId={userId}
          pack={formPack}
          defaults={defaults}
          wave2Open={pack.wave2Open}
        />
      </Suspense>
    </FadeIn>
  );
}
