import { Stack, Tabs, TabsList, TabsPanel, TabsTab } from "@mantine/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import LinkButton from "@/components/LinkButton";
import PageContainer from "@/components/PageContainer";
import PageHeader from "@/components/PageHeader";
import PageSkeleton from "@/components/PageSkeleton";
import { requireAdminPage } from "@/lib/authz";
import { DISPLAY_NAME_SELECT, resolveDisplayName } from "@/lib/display-name";
import prisma from "@/lib/prisma";
import { buildSocialMetadata } from "@/lib/social-previews";
import {
  type ExportableOrder,
  evaluateOrdersForExport,
} from "@/lib/welcome-pack/easyparcel-validation";
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
        pack: {
          select: {
            id: true,
            name: true,
            isActive: true,
            defaultParcelWeightKg: true,
            defaultParcelLengthCm: true,
            defaultParcelWidthCm: true,
            defaultParcelHeightCm: true,
            defaultParcelCurrency: true,
          },
        },
        selections: {
          include: {
            item: {
              select: {
                id: true,
                name: true,
                customsDescription: true,
                declaredUnitValue: true,
                hsCode: true,
              },
            },
          },
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
          select: { id: true, ...DISPLAY_NAME_SELECT },
        })
      : [];
  const actorNames = new Map(
    actors.map((profile) => [profile.id, resolveDisplayName({ profile })]),
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
        defaultDomesticFulfillmentDays: pack.defaultDomesticFulfillmentDays,
        defaultInternationalFulfillmentDays:
          pack.defaultInternationalFulfillmentDays,
        defaultDomesticDeliveryDays: pack.defaultDomesticDeliveryDays,
        defaultInternationalDeliveryDays: pack.defaultInternationalDeliveryDays,
        defaultParcelWeightKg: pack.defaultParcelWeightKg,
        defaultParcelLengthCm: pack.defaultParcelLengthCm,
        defaultParcelWidthCm: pack.defaultParcelWidthCm,
        defaultParcelHeightCm: pack.defaultParcelHeightCm,
        defaultParcelCurrency: pack.defaultParcelCurrency,
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
        defaultDomesticFulfillmentDays: 14,
        defaultInternationalFulfillmentDays: 21,
        defaultDomesticDeliveryDays: 3,
        defaultInternationalDeliveryDays: 14,
        defaultParcelWeightKg: null,
        defaultParcelLengthCm: null,
        defaultParcelWidthCm: null,
        defaultParcelHeightCm: null,
        defaultParcelCurrency: null,
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
    customsDescription: i.customsDescription,
    declaredUnitValue: i.declaredUnitValue,
    hsCode: i.hsCode,
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

  // Server-side export readiness so the Orders tab can badge/filter without
  // bundling the validation + phone libraries into the client. The export API
  // re-validates authoritatively before generating the workbook.
  const readinessByOrder = new Map(
    evaluateOrdersForExport(
      orderRecords.map(
        (o): ExportableOrder => ({
          id: o.id,
          reference: o.id,
          status: o.status,
          region: o.region,
          recipientName: o.recipientName,
          email: o.user.user.email ?? null,
          phone: o.phone,
          addressLine1: o.addressLine1,
          addressLine2: o.addressLine2,
          city: o.city,
          stateProvince: o.stateProvince,
          postalCode: o.postalCode,
          country: o.country,
          addressIsResidential: o.addressIsResidential,
          taxId: o.taxId,
          parcelWeightKg: o.parcelWeightKg,
          parcelLengthCm: o.parcelLengthCm,
          parcelWidthCm: o.parcelWidthCm,
          parcelHeightCm: o.parcelHeightCm,
          easyParcelExportCount: o.easyParcelExportCount,
          pack: {
            defaultParcelWeightKg: o.pack.defaultParcelWeightKg,
            defaultParcelLengthCm: o.pack.defaultParcelLengthCm,
            defaultParcelWidthCm: o.pack.defaultParcelWidthCm,
            defaultParcelHeightCm: o.pack.defaultParcelHeightCm,
            defaultParcelCurrency: o.pack.defaultParcelCurrency,
          },
          items: o.selections.map((s) => ({
            name: s.item.name,
            customsDescription: s.item.customsDescription,
            declaredUnitValue: s.item.declaredUnitValue,
            hsCode: s.item.hsCode,
          })),
        }),
      ),
    ).map((r) => [r.orderId, r]),
  );

  const orders: AdminOrderRow[] = orderRecords.map((o) => {
    const readiness = readinessByOrder.get(o.id);
    return {
      id: o.id,
      status: o.status,
      wave: o.wave,
      packName: o.pack.name,
      packIsActive: o.pack.isActive,
      recipientName: o.recipientName,
      developerName: resolveDisplayName({ profile: o.user }),
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
      addressIsResidential: o.addressIsResidential,
      taxId: o.taxId,
      parcelWeightKg: o.parcelWeightKg,
      parcelLengthCm: o.parcelLengthCm,
      parcelWidthCm: o.parcelWidthCm,
      parcelHeightCm: o.parcelHeightCm,
      easyParcelExportCount: o.easyParcelExportCount,
      easyParcelExportedAt: o.easyParcelExportedAt?.toISOString() ?? null,
      exportReady: readiness?.ok ?? false,
      exportIssues:
        readiness && !readiness.ok
          ? readiness.issues.map((i) => i.message)
          : [],
      notes: o.notes,
      trackingNumber: o.trackingNumber,
      trackingUrl: o.trackingUrl,
      carrierName: o.carrierName,
      estimatedFulfillmentAt: o.estimatedFulfillmentAt?.toISOString() ?? null,
      estimatedDeliveryAt: o.estimatedDeliveryAt?.toISOString() ?? null,
      logisticsNote: o.logisticsNote,
      delayedAt: o.delayedAt?.toISOString() ?? null,
      delayReason: o.delayReason,
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
    };
  });

  const pendingCount = orders.filter((o) => o.status === "PENDING").length;

  const packDefaults = {
    weightKg: packConfig.defaultParcelWeightKg,
    lengthCm: packConfig.defaultParcelLengthCm,
    widthCm: packConfig.defaultParcelWidthCm,
    heightCm: packConfig.defaultParcelHeightCm,
    currency: packConfig.defaultParcelCurrency,
  };

  return (
    <Tabs defaultValue="orders">
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
        <OrdersTable
          orders={orders}
          packItems={packItems}
          packDefaults={packDefaults}
        />
      </TabsPanel>
    </Tabs>
  );
}
