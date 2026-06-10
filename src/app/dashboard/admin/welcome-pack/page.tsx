import {
  Group,
  Stack,
  Tabs,
  TabsList,
  TabsPanel,
  TabsTab,
  Text,
  Title,
} from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { FadeIn } from "@/components/animations";
import { requireAdminPage } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { welcomePackAssetUrl } from "@/lib/welcome-pack-assets";
import ItemsManager, { type AdminItemData } from "./ItemsManager";
import OrdersTable, {
  type AdminEligibilitySnapshot,
  type AdminOrderRow,
} from "./OrdersTable";
import PackConfig, { type PackConfigData } from "./PackConfig";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/welcome-pack",
);

export default function AdminWelcomePackPage() {
  return (
    <Suspense fallback={null}>
      <AdminWelcomePackContent />
    </Suspense>
  );
}

async function AdminWelcomePackContent() {
  await requireAdminPage();

  const pack = await prisma.welcomePack.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
      orders: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            include: { user: { select: { email: true, name: true } } },
          },
          selections: { include: { item: { select: { name: true } } } },
        },
      },
    },
  });

  const packConfig: PackConfigData = pack
    ? {
        id: pack.id,
        name: pack.name,
        description: pack.description,
        isActive: pack.isActive,
        wave2Open: pack.wave2Open,
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
          (pack.idCardNameAlign as PackConfigData["idCardNameAlign"]) ?? null,
        idCardNameWrapMode:
          (pack.idCardNameWrapMode as PackConfigData["idCardNameWrapMode"]) ??
          null,
      }
    : {
        id: null,
        name: "Welcome Pack",
        description: null,
        isActive: true,
        wave2Open: false,
        idCardTemplateBlobUrl: null,
        idCardWidth: null,
        idCardHeight: null,
        idCardNameX: null,
        idCardNameY: null,
        idCardFontSize: null,
        idCardFontColor: null,
        idCardFontFamily: null,
        idCardNameMaxWidth: null,
        idCardNameMaxHeight: null,
        idCardNameAlign: null,
        idCardNameWrapMode: null,
      };

  const items: AdminItemData[] = (pack?.items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    description: i.description,
    imageBlobUrl: i.imageBlobUrl
      ? welcomePackAssetUrl("item-image", i.id, i.updatedAt)
      : null,
    requiresSize: i.requiresSize,
    sizeChartBlobUrl: i.sizeChartBlobUrl
      ? welcomePackAssetUrl("size-chart", i.id, i.updatedAt)
      : null,
    sizeOptions: i.sizeOptions,
    displayOrder: i.displayOrder,
    isActive: i.isActive,
  }));

  const orders: AdminOrderRow[] = (pack?.orders ?? []).map((o) => ({
    id: o.id,
    status: o.status,
    wave: o.wave,
    recipientName: o.recipientName,
    developerName:
      o.user.legalName || o.user.user.name || o.recipientName || "Developer",
    developerEmail: o.user.user.email ?? null,
    region: o.region,
    idCardName: o.idCardName,
    phone: o.phone,
    addressLine1: o.addressLine1,
    addressLine2: o.addressLine2,
    city: o.city,
    stateProvince: o.stateProvince,
    postalCode: o.postalCode,
    country: o.country,
    notes: o.notes,
    trackingNumber: o.trackingNumber,
    trackingUrl: o.trackingUrl,
    rejectionReason: o.rejectionReason,
    createdAt: o.createdAt.toISOString(),
    approvedAt: o.approvedAt?.toISOString() ?? null,
    shippedAt: o.shippedAt?.toISOString() ?? null,
    deliveredAt: o.deliveredAt?.toISOString() ?? null,
    selections: o.selections.map((s) => ({
      itemName: s.item.name,
      selectedSize: s.selectedSize,
    })),
    eligibility:
      (o.eligibilitySnapshot as unknown as AdminEligibilitySnapshot) ?? null,
  }));

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  return (
    <FadeIn>
      <Group justify="space-between" mb="xl">
        <div>
          <Title order={1}>Welcome Pack</Title>
          <Text c="dimmed" mt="xs">
            Configure the pack, manage items, and review developer orders.
          </Text>
        </div>
      </Group>

      <Tabs defaultValue="config">
        <TabsList>
          <TabsTab value="config">Pack config</TabsTab>
          <TabsTab value="items">Items ({items.length})</TabsTab>
          <TabsTab value="orders">
            Orders{" "}
            {pendingCount > 0
              ? `(${pendingCount} pending)`
              : `(${orders.length})`}
          </TabsTab>
        </TabsList>

        <TabsPanel value="config" pt="md">
          <PackConfig pack={packConfig} />
        </TabsPanel>

        <TabsPanel value="items" pt="md">
          <Stack>
            <ItemsManager packId={packConfig.id} items={items} />
          </Stack>
        </TabsPanel>

        <TabsPanel value="orders" pt="md">
          <OrdersTable orders={orders} />
        </TabsPanel>
      </Tabs>
    </FadeIn>
  );
}
