import {
  type EasyParcelItemLine,
  type EasyParcelRow,
  isEasyParcelCurrency,
  resolveEasyParcelCountryName,
  resolveEasyParcelPhone,
} from "./easyparcel-export";

/**
 * Pure export-readiness evaluation for welcome-pack orders. Resolves pack
 * defaults against per-order overrides, validates every EasyParcel-required
 * field, and either yields a serialisable EasyParcelRow or a list of blocking
 * issues. No DB/Prisma types here so it can be unit-tested directly; the API
 * route maps Prisma rows into ExportableOrder.
 */

export type ExportableOrderItem = {
  name: string;
  customsDescription: string | null;
  declaredUnitValue: number | null;
  hsCode: string | null;
};

export type ExportablePackDefaults = {
  defaultParcelWeightKg: number | null;
  defaultParcelLengthCm: number | null;
  defaultParcelWidthCm: number | null;
  defaultParcelHeightCm: number | null;
  defaultParcelCurrency: string | null;
};

export type ExportableOrder = {
  id: string;
  reference: string;
  status: string;
  region: "DOMESTIC" | "INTERNATIONAL";
  recipientName: string;
  email: string | null;
  phone: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  stateProvince: string | null;
  postalCode: string;
  country: string; // ISO-2
  addressIsResidential: boolean | null;
  taxId: string | null;
  parcelWeightKg: number | null;
  parcelLengthCm: number | null;
  parcelWidthCm: number | null;
  parcelHeightCm: number | null;
  easyParcelExportCount: number;
  pack: ExportablePackDefaults;
  items: ExportableOrderItem[];
};

export type ExportIssue = { field: string; message: string };

export type OrderReadiness = {
  orderId: string;
  reference: string;
  recipientName: string;
  region: "DOMESTIC" | "INTERNATIONAL";
  previouslyExported: boolean;
  warnings: ExportIssue[];
} & ({ ok: true; row: EasyParcelRow } | { ok: false; issues: ExportIssue[] });

// Characters that survive trimming but corrupt a carrier label (control chars,
// zero-width / bidi format chars). Warned, not blocked — admins may have valid
// reasons, and EasyParcel will still accept the row.
const SUSPICIOUS = /[\p{Cc}\p{Cf}]/u;

function positive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function evaluateOrderForExport(order: ExportableOrder): OrderReadiness {
  const issues: ExportIssue[] = [];
  const warnings: ExportIssue[] = [];
  const add = (field: string, message: string) =>
    issues.push({ field, message });
  const warn = (field: string, message: string) =>
    warnings.push({ field, message });

  const isInternational = order.region === "INTERNATIONAL";

  // EasyParcel only accepts approved, unshipped parcels.
  if (order.status !== "APPROVED") {
    add(
      "status",
      "Only approved, unshipped orders can be exported to EasyParcel",
    );
  }

  // Receiver text fields.
  const recipientName = order.recipientName?.trim() ?? "";
  if (!recipientName) add("recipientName", "Receiver name is required");
  const address = [order.addressLine1, order.addressLine2]
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(", ");
  if (!order.addressLine1?.trim())
    add("addressLine1", "Receiver address is required");
  const postcode = order.postalCode?.trim() ?? "";
  if (!postcode) add("postalCode", "Receiver postcode is required");
  const city = order.city?.trim() ?? "";
  if (!city) add("city", "Receiver city is required");
  const state = order.stateProvince?.trim() ?? "";
  if (!state)
    add("stateProvince", "Receiver state/province is required for EasyParcel");

  // Country → exact template label (fail-closed).
  const country = resolveEasyParcelCountryName(order.country);
  if (!country.ok) add("country", country.error);

  // Phone → country label + national number.
  const phone = resolveEasyParcelPhone(order.phone ?? "", order.country);
  if (!phone.ok) add("phone", phone.error);

  // Residential flag: required for international customs; optional domestically.
  if (isInternational && order.addressIsResidential === null) {
    add(
      "addressIsResidential",
      "Address type (residential?) is required for international orders",
    );
  }

  // Tax ID: required internationally.
  const taxId = order.taxId?.trim() ?? "";
  if (isInternational && !taxId) {
    add("taxId", "Receiver tax ID is required for international orders");
  }

  // Parcel dimensions/weight (override → pack default).
  const weight = order.parcelWeightKg ?? order.pack.defaultParcelWeightKg;
  const length = order.parcelLengthCm ?? order.pack.defaultParcelLengthCm;
  const width = order.parcelWidthCm ?? order.pack.defaultParcelWidthCm;
  const height = order.parcelHeightCm ?? order.pack.defaultParcelHeightCm;
  if (!positive(weight))
    add("weight", "Parcel weight (kg) must be a positive number");
  if (!positive(length))
    add("length", "Parcel length (cm) must be a positive number");
  if (!positive(width))
    add("width", "Parcel width (cm) must be a positive number");
  if (!positive(height))
    add("height", "Parcel height (cm) must be a positive number");

  // Currency.
  const currency = order.pack.defaultParcelCurrency?.trim().toUpperCase() ?? "";
  if (!currency) {
    add("currency", "Pack default parcel currency is required");
  } else if (!isEasyParcelCurrency(currency)) {
    add("currency", `Currency ${currency} is not supported by EasyParcel`);
  }

  // Items (each quantity 1, declared value required; HS code required intl).
  const lines: EasyParcelItemLine[] = [];
  if (order.items.length === 0) {
    add("items", "Order has no items to export");
  }
  for (const item of order.items) {
    const label = item.customsDescription?.trim() || item.name?.trim() || "";
    if (!label) add("items", `An item is missing a name/customs description`);
    if (!positive(item.declaredUnitValue)) {
      add(
        "items",
        `Item "${label || item.name}" needs a positive declared value`,
      );
    }
    if (isInternational && !item.hsCode?.trim()) {
      add(
        "items",
        `Item "${label || item.name}" needs an HS code for international export`,
      );
    }
    lines.push({
      name: label || item.name,
      declaredUnitValue: item.declaredUnitValue ?? 0,
      quantity: 1,
      hsCode: item.hsCode?.trim() || null,
    });
  }

  // Soft warnings.
  if (SUSPICIOUS.test(recipientName) || SUSPICIOUS.test(address)) {
    warn(
      "recipientName",
      "Name or address contains unusual characters — double-check the label",
    );
  }
  if (order.easyParcelExportCount > 0) {
    warn(
      "export",
      `Previously exported ${order.easyParcelExportCount}× — re-exporting needs confirmation`,
    );
  }

  const base = {
    orderId: order.id,
    reference: order.reference,
    recipientName,
    region: order.region,
    previouslyExported: order.easyParcelExportCount > 0,
    warnings,
  };

  if (issues.length > 0 || !country.ok || !phone.ok) {
    return { ...base, ok: false, issues };
  }

  const row: EasyParcelRow = {
    receiverName: recipientName,
    phoneCountryLabel: phone.value.label,
    phoneNationalNumber: phone.value.national,
    email: order.email,
    address,
    postcode,
    city,
    state,
    countryName: country.value,
    isResidential: order.addressIsResidential,
    taxId: taxId || null,
    weightKg: weight as number,
    lengthCm: length as number,
    widthCm: width as number,
    heightCm: height as number,
    currency: currency as EasyParcelRow["currency"],
    items: lines,
    reference: order.reference,
  };
  return { ...base, ok: true, row };
}

export function evaluateOrdersForExport(
  orders: ExportableOrder[],
): OrderReadiness[] {
  return orders.map(evaluateOrderForExport);
}
