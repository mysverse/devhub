import { Stack, Tabs, TabsList, TabsPanel, TabsTab } from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import { welcomePackAssetUrl } from "@/lib/welcome-pack-assets";
import ItemsManager, { type AdminItemData } from "./ItemsManager";
import OrdersTable, {
  type AdminOrderEvent,
  type AdminOrderRow,
  type AdminPackItem,
} from "./OrdersTable";
import PackConfig, { type PackConfigData } from "./PackConfig";

export const metadata: Metadata = buildSocialMetadata(
  "/dashboard/admin/welcome-pack",
);

export default function AdminWelcomePackPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Welcome Pack"
        subtitle="Configure the pack, manage items, and review developer orders."
        action={
          <LinkButton href="/dashboard/admin" variant="subtle">
            Back to Admin
          </LinkButton>
        }
      />
      <Suspense fallback={<PageSkeleton withHeader={false} />}>
        <AdminWelcomePackContent />
      </Suspense>
    </PageContainer>
  );
}

async function AdminWelcomePackContent() {
  await requireAdminPage();

  // Orders are fetched independently of the active pack so deactivating a
  // pack never hides in-flight orders from admins. The eligibility snapshot
  // is deliberately excluded — it dominates the payload and is fetched
  // on-demand per order instead.
  const [pack, orderRecords] = await Promise.all([
    prisma.welcomePack.findFirst({
      where: { isActive: true },
      orderBy: { createdAt: "desc" },
      include: {
        items: { orderBy: [{ displayOrder: "asc" }, { createdAt: "asc" }] },
      },
    }),
    prisma.welcomePackOrder.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        user: {
          include: { user: { select: { email: true, name: true } } },
        },
        pack: { select: { id: true, name: true, isActive: true } },
        selections: {
          include: { item: { select: { id: true, name: true } } },
        },
        events: { orderBy: { createdAt: "asc" } },
      },
    }),
  ]);

  // Resolve event actor ids to display names in one batched query.
  const actorIds = [
    ...new Set(
      orderRecords
        .flatMap((o) => o.events.map((e) => e.actorId))
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  const actors =
    actorIds.length > 0
      ? await prisma.userProfile.findMany({
          where: { id: { in: actorIds } },
          select: {
            id: true,
            legalName: true,
            user: { select: { name: true, email: true } },
          },
        })
      : [];
  const actorNames = new Map(
    actors.map((a) => [
      a.id,
      a.legalName || a.user.name || a.user.email || "Unknown",
    ]),
  );

  const packConfig: PackConfigData = pack
    ? {
        id: pack.id,
        name: pack.name,
        description: pack.description,
        isActive: pack.isActive,
        wave2Open: pack.wave2Open,
        orderingEnabled: pack.orderingEnabled,
        ordersOpenAt: pack.ordersOpenAt?.toISOString() ?? null,
        ordersCloseAt: pack.ordersCloseAt?.toISOString() ?? null,
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
        orderingEnabled: true,
        ordersOpenAt: null,
        ordersCloseAt: null,
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

  // Item metadata for the admin selections editor (no images needed).
  const packItems: AdminPackItem[] = (pack?.items ?? []).map((i) => ({
    id: i.id,
    name: i.name,
    requiresSize: i.requiresSize,
    sizeOptions: i.sizeOptions,
    isActive: i.isActive,
  }));

  const orders: AdminOrderRow[] = orderRecords.map((o) => ({
    id: o.id,
    status: o.status,
    wave: o.wave,
    packName: o.pack.name,
    packIsActive: o.pack.isActive,
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
      itemId: s.item.id,
      itemName: s.item.name,
      selectedSize: s.selectedSize,
    })),
    events: o.events.map(
      (e): AdminOrderEvent => ({
        id: e.id,
        type: e.type,
        actorRole: e.actorRole,
        actorName: e.actorId ? (actorNames.get(e.actorId) ?? null) : null,
        message: e.message,
        metadata: e.metadata,
        createdAt: e.createdAt.toISOString(),
      }),
    ),
  }));

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  return (
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
        <OrdersTable orders={orders} packItems={packItems} />
      </TabsPanel>
    </Tabs>
  );
}
