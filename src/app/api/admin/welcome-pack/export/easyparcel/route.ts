import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/authz";
import prisma from "@/lib/prisma";
import {
  buildEasyParcelWorkbook,
  loadEasyParcelTemplate,
} from "@/lib/welcome-pack/easyparcel-export";
import {
  type ExportableOrder,
  evaluateOrdersForExport,
  type OrderReadiness,
} from "@/lib/welcome-pack/easyparcel-validation";
import { logOrderEvent } from "@/lib/welcome-pack-events";

/**
 * Generates the EasyParcel bulk-upload workbook for the selected orders.
 *
 * Body: { orderIds: string[], confirmReexport?: boolean, dryRun?: boolean }
 *  - dryRun           → 200 JSON readiness report (drives the preflight dialog)
 *  - any order blocked → 422 JSON (export the whole batch or nothing)
 *  - any prior export, unconfirmed → 409 JSON (needs re-export confirmation)
 *  - otherwise        → 200 .xlsx attachment
 */
export async function POST(req: Request) {
  let actorId: string;
  try {
    actorId = await requireAdmin();
  } catch {
    return NextResponse.json(
      { error: "Forbidden: Admin access required" },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const payload = (body ?? {}) as {
    orderIds?: unknown;
    confirmReexport?: unknown;
    dryRun?: unknown;
  };
  const orderIds = Array.isArray(payload.orderIds)
    ? [
        ...new Set(
          payload.orderIds.filter((x): x is string => typeof x === "string"),
        ),
      ]
    : [];
  const confirmReexport = payload.confirmReexport === true;
  const dryRun = payload.dryRun === true;
  if (orderIds.length === 0) {
    return NextResponse.json({ error: "No orders selected" }, { status: 400 });
  }

  const found = await prisma.welcomePackOrder.findMany({
    where: { id: { in: orderIds } },
    include: {
      user: { include: { user: { select: { email: true } } } },
      pack: {
        select: {
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
              name: true,
              customsDescription: true,
              declaredUnitValue: true,
              hsCode: true,
            },
          },
        },
      },
    },
  });

  const foundById = new Map(found.map((o) => [o.id, o]));
  // Preserve the caller's selection order; report missing ids as blocked.
  const exportables: ExportableOrder[] = [];
  const missing: OrderReadiness[] = [];
  for (const id of orderIds) {
    const o = foundById.get(id);
    if (!o) {
      missing.push({
        orderId: id,
        reference: id,
        recipientName: "(unknown)",
        region: "DOMESTIC",
        previouslyExported: false,
        warnings: [],
        ok: false,
        issues: [{ field: "order", message: "Order not found" }],
      });
      continue;
    }
    exportables.push(toExportableOrder(o));
  }

  const readiness = [...evaluateOrdersForExport(exportables), ...missing];
  const blocked = readiness.filter((r) => !r.ok);
  const reexport = readiness.filter((r) => r.ok && r.previouslyExported);

  const summary = (status: string) => ({
    status,
    counts: {
      total: readiness.length,
      ready: readiness.filter((r) => r.ok).length,
      withWarnings: readiness.filter((r) => r.ok && r.warnings.length > 0)
        .length,
      blocked: blocked.length,
      previouslyExported: reexport.length,
    },
    orders: readiness.map(toPreflight),
  });

  if (blocked.length > 0) {
    return NextResponse.json(summary("blocked"), {
      status: dryRun ? 200 : 422,
    });
  }
  if (reexport.length > 0 && !confirmReexport) {
    return NextResponse.json(summary("needs_confirmation"), {
      status: dryRun ? 200 : 409,
    });
  }
  if (dryRun) {
    return NextResponse.json(summary("ready"), { status: 200 });
  }

  // All ready (and confirmed if re-exporting): build first, then record audit.
  const rows = readiness.flatMap((r) => (r.ok ? [r.row] : []));
  const template = await loadEasyParcelTemplate();
  const workbook = await buildEasyParcelWorkbook(rows, template);

  const exportedAt = new Date();
  await prisma.$transaction(async (tx) => {
    for (const r of readiness) {
      if (!r.ok) continue;
      await tx.welcomePackOrder.update({
        where: { id: r.orderId },
        data: {
          easyParcelExportedAt: exportedAt,
          easyParcelExportCount: { increment: 1 },
        },
      });
      await logOrderEvent(tx, {
        orderId: r.orderId,
        actorId,
        actorRole: "ADMIN",
        type: "EASYPARCEL_EXPORTED",
        message: r.previouslyExported
          ? "Re-exported to EasyParcel"
          : "Exported to EasyParcel",
        metadata: { batchSize: rows.length },
      });
    }
  });

  const stamp = exportedAt.toISOString().slice(0, 10);
  return new NextResponse(new Uint8Array(workbook), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="easyparcel-${stamp}-${rows.length}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

type FoundOrder = Awaited<
  ReturnType<typeof prisma.welcomePackOrder.findMany>
>[number] & {
  user: { user: { email: string | null } | null } | null;
  pack: {
    defaultParcelWeightKg: number | null;
    defaultParcelLengthCm: number | null;
    defaultParcelWidthCm: number | null;
    defaultParcelHeightCm: number | null;
    defaultParcelCurrency: string | null;
  };
  selections: {
    item: {
      name: string;
      customsDescription: string | null;
      declaredUnitValue: number | null;
      hsCode: string | null;
    };
  }[];
};

function toExportableOrder(o: FoundOrder): ExportableOrder {
  return {
    id: o.id,
    reference: o.id,
    status: o.status,
    region: o.region,
    recipientName: o.recipientName,
    email: o.user?.user?.email ?? null,
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
  };
}

function toPreflight(r: OrderReadiness) {
  return {
    orderId: r.orderId,
    reference: r.reference,
    recipientName: r.recipientName,
    region: r.region,
    ok: r.ok,
    previouslyExported: r.previouslyExported,
    issues: r.ok ? [] : r.issues,
    warnings: r.warnings,
  };
}
