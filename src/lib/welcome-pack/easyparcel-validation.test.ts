import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type ExportableOrder,
  evaluateOrderForExport,
} from "./easyparcel-validation";

const packDefaults = {
  defaultParcelWeightKg: 0.5,
  defaultParcelLengthCm: 30,
  defaultParcelWidthCm: 22,
  defaultParcelHeightCm: 6,
  defaultParcelCurrency: "MYR",
};

function order(overrides: Partial<ExportableOrder> = {}): ExportableOrder {
  return {
    id: "o1",
    reference: "o1",
    status: "APPROVED",
    region: "DOMESTIC",
    recipientName: "Bala",
    email: "bala@example.com",
    phone: "+60123456789",
    addressLine1: "88 Jalan Meranti",
    addressLine2: null,
    city: "Shah Alam",
    stateProvince: "Selangor",
    postalCode: "40000",
    country: "MY",
    addressIsResidential: true,
    taxId: null,
    parcelWeightKg: null,
    parcelLengthCm: null,
    parcelWidthCm: null,
    parcelHeightCm: null,
    easyParcelExportCount: 0,
    pack: { ...packDefaults },
    items: [
      {
        name: "Tee",
        customsDescription: "Cotton T-shirt",
        declaredUnitValue: 30,
        hsCode: "6109.10.00",
      },
    ],
    ...overrides,
  };
}

test("a complete domestic order is export-ready and uses pack defaults", () => {
  const r = evaluateOrderForExport(order());
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.row.weightKg, 0.5); // from pack default
  assert.equal(r.row.currency, "MYR");
  assert.equal(r.row.countryName, "Malaysia");
  assert.equal(r.row.phoneCountryLabel, "Malaysia +60");
  assert.equal(r.row.items[0].name, "Cotton T-shirt"); // customs description preferred
  assert.equal(r.row.items[0].quantity, 1);
});

test("per-order parcel weight overrides the pack default", () => {
  const r = evaluateOrderForExport(order({ parcelWeightKg: 0.9 }));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.row.weightKg, 0.9);
});

test("missing state blocks the order", () => {
  const r = evaluateOrderForExport(order({ stateProvince: null }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.field === "stateProvince"));
});

test("non-approved status blocks the order", () => {
  const r = evaluateOrderForExport(order({ status: "PENDING" }));
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.field === "status"));
});

test("non-positive parcel weight blocks", () => {
  const r = evaluateOrderForExport(
    order({
      parcelWeightKg: 0,
      pack: { ...packDefaults, defaultParcelWeightKg: null },
    }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.field === "weight"));
});

test("unsupported currency blocks", () => {
  const r = evaluateOrderForExport(
    order({ pack: { ...packDefaults, defaultParcelCurrency: "JPY" } }),
  );
  assert.equal(r.ok, false);
  if (!r.ok) assert.ok(r.issues.some((i) => i.field === "currency"));
});

const intl = (o: Partial<ExportableOrder> = {}): ExportableOrder =>
  order({
    region: "INTERNATIONAL",
    country: "SG",
    phone: "+6598765432",
    stateProvince: "Singapore",
    addressIsResidential: true,
    taxId: "S1234567D",
    pack: { ...packDefaults, defaultParcelCurrency: "SGD" },
    ...o,
  });

test("a complete international order is export-ready", () => {
  const r = evaluateOrderForExport(intl());
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.row.countryName, "Singapore");
    assert.equal(r.row.phoneCountryLabel, "Singapore +65");
    assert.equal(r.row.taxId, "S1234567D");
  }
});

test("international without tax ID, residential flag, or HS code blocks", () => {
  const noTax = evaluateOrderForExport(intl({ taxId: null }));
  assert.equal(noTax.ok, false);
  if (!noTax.ok) assert.ok(noTax.issues.some((i) => i.field === "taxId"));

  const noResidential = evaluateOrderForExport(
    intl({ addressIsResidential: null }),
  );
  assert.equal(noResidential.ok, false);
  if (!noResidential.ok)
    assert.ok(
      noResidential.issues.some((i) => i.field === "addressIsResidential"),
    );

  const noHs = evaluateOrderForExport(
    intl({
      items: [
        {
          name: "Tee",
          customsDescription: "Cotton T-shirt",
          declaredUnitValue: 12,
          hsCode: null,
        },
      ],
    }),
  );
  assert.equal(noHs.ok, false);
  if (!noHs.ok) assert.ok(noHs.issues.some((i) => i.field === "items"));
});

test("domestic order without HS code is still export-ready (HS optional domestically)", () => {
  const r = evaluateOrderForExport(
    order({
      items: [
        {
          name: "Tee",
          customsDescription: "Cotton T-shirt",
          declaredUnitValue: 30,
          hsCode: null,
        },
      ],
    }),
  );
  assert.equal(r.ok, true);
});

test("a prior export is flagged as a warning, not a block", () => {
  const r = evaluateOrderForExport(order({ easyParcelExportCount: 2 }));
  assert.equal(r.ok, true);
  assert.equal(r.previouslyExported, true);
  assert.ok(r.warnings.some((w) => w.field === "export"));
});
