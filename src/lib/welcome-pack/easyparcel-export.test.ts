import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import JSZip from "jszip";
import { ALL_COUNTRY_CODES } from "../countries";
import { EASYPARCEL_COUNTRY_BY_ISO2 } from "./easyparcel-countries";
import {
  buildEasyParcelWorkbook,
  type EasyParcelRow,
  easyParcelTemplatePath,
  resolveEasyParcelCountryName,
  resolveEasyParcelPhone,
} from "./easyparcel-export";

const TEMPLATE = readFileSync(easyParcelTemplatePath());

const domestic: EasyParcelRow = {
  receiverName: "Bala Subramaniam",
  phoneCountryLabel: "Malaysia +60",
  phoneNationalNumber: "123456789",
  email: "bala@example.com",
  address: "12 Jalan Mawar, Taman Indah",
  postcode: "50000",
  city: "Kuala Lumpur",
  state: "Wilayah Persekutuan",
  countryName: "Malaysia",
  isResidential: true,
  taxId: null,
  weightKg: 0.5,
  lengthCm: 25,
  widthCm: 20,
  heightCm: 5,
  currency: "MYR",
  items: [
    {
      name: "DevHub T-shirt",
      declaredUnitValue: 30,
      quantity: 1,
      hsCode: "6109.10.00",
    },
    { name: "Sticker sheet", declaredUnitValue: 5, quantity: 1, hsCode: null },
  ],
  reference: "order_dom_1",
};

const international: EasyParcelRow = {
  receiverName: "Ravi Kumar",
  phoneCountryLabel: "Singapore +65",
  phoneNationalNumber: "98765432",
  email: "ravi@example.sg",
  address: "1 Marina Boulevard #20-01",
  postcode: "018989",
  city: "Singapore",
  state: "Singapore",
  countryName: "Singapore",
  isResidential: false,
  taxId: "S1234567D",
  weightKg: 0.6,
  lengthCm: 25,
  widthCm: 20,
  heightCm: 6,
  currency: "SGD",
  items: [
    {
      name: "DevHub T-shirt",
      declaredUnitValue: 12,
      quantity: 1,
      hsCode: "6109.10.00",
    },
  ],
  reference: "order_intl_1",
};

async function orderSheet(buf: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buf);
  const file = zip.file("xl/worksheets/sheet1.xml");
  if (!file) throw new Error("Missing sheet1.xml");
  return file.async("string");
}

function fileNames(zip: JSZip): string[] {
  // ignore bare directory entries — jszip omits them on regenerate and Excel
  // does not require them; only real file parts matter for validity.
  return Object.values(zip.files)
    .filter((f) => !f.dir)
    .map((f) => f.name)
    .sort();
}

test("output preserves all template archive parts", async () => {
  const out = await buildEasyParcelWorkbook(
    [domestic, international],
    TEMPLATE,
  );
  const tplNames = fileNames(await JSZip.loadAsync(TEMPLATE));
  const outNames = fileNames(await JSZip.loadAsync(out));
  assert.deepEqual(outNames, tplNames, "archive file list must be unchanged");
  // The 4 sheets + comments + lookups all still present.
  for (const part of [
    "xl/worksheets/sheet1.xml",
    "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml",
    "xl/worksheets/sheet4.xml",
    "xl/comments1.xml",
    "xl/styles.xml",
    "xl/sharedStrings.xml",
  ]) {
    assert.ok(outNames.includes(part), `${part} must survive`);
  }
});

test("only sheet1 changes; lookups/comments/styles are byte-identical", async () => {
  const out = await buildEasyParcelWorkbook([domestic], TEMPLATE);
  const tpl = await JSZip.loadAsync(TEMPLATE);
  const res = await JSZip.loadAsync(out);
  for (const part of [
    "xl/worksheets/sheet2.xml",
    "xl/worksheets/sheet3.xml",
    "xl/worksheets/sheet4.xml",
    "xl/comments1.xml",
    "xl/styles.xml",
    "xl/sharedStrings.xml",
    "xl/drawings/vmlDrawing1.vml",
  ]) {
    const fileA = tpl.file(part);
    const fileB = res.file(part);
    if (!fileA || !fileB) throw new Error(`Missing part: ${part}`);
    const a = await fileA.async("string");
    const b = await fileB.async("string");
    assert.equal(b, a, `${part} must be untouched`);
  }
});

test("header row is intact and no sample recipients remain", async () => {
  const xml = await orderSheet(
    await buildEasyParcelWorkbook([domestic, international], TEMPLATE),
  );
  assert.ok(xml.includes('<row r="1"'), "header row present");
  for (const sample of [
    "Mira",
    "Leaver",
    "EASYPARCEL SINGAPORE",
    "Paya Lebar",
    "Suntech",
  ]) {
    assert.ok(
      !xml.includes(sample),
      `sample value "${sample}" must be removed`,
    );
  }
});

test("dimension and validations expand to exactly the rows written", async () => {
  const xml = await orderSheet(
    await buildEasyParcelWorkbook([domestic, international], TEMPLATE),
  );
  assert.match(xml, /<dimension ref="A1:AA3"\/>/);
  assert.match(xml, /<dataValidations count="4">/);
  // currency, residential, phone-country, country ranges all end at row 3
  assert.match(xml, /sqref="T2:T3 Z2:Z3"/);
  assert.match(xml, /sqref="N2:N3"/);
  assert.match(xml, /sqref="C2:C3 E2:E3"/);
  assert.match(xml, /sqref="M2:M3"/);
  assert.ok(!xml.includes(":T20"), "stale row-20 ranges must be gone");
});

test("row values land in the right columns with aligned multiline cells", async () => {
  const xml = await orderSheet(
    await buildEasyParcelWorkbook([domestic], TEMPLATE),
  );
  // receiver name in B2, country in M2, currency in T2, reference in Y2
  assert.match(xml, /<c r="B2"[^>]*><is><t[^>]*>Bala Subramaniam<\/t>/);
  assert.match(xml, /<c r="M2"[^>]*><is><t[^>]*>Malaysia<\/t>/);
  assert.match(xml, /<c r="T2"[^>]*><is><t[^>]*>MYR<\/t>/);
  assert.match(xml, /<c r="Y2"[^>]*><is><t[^>]*>order_dom_1<\/t>/);
  // weight numeric in P2
  assert.match(xml, /<c r="P2"[^>]*t="n"><v>0.5<\/v>/);
  // U/V/W aligned 2 lines each; X has a blank second line (one item lacks HS)
  assert.match(
    xml,
    /<c r="U2"[^>]*><is><t[^>]*>DevHub T-shirt\nSticker sheet<\/t>/,
  );
  assert.match(xml, /<c r="V2"[^>]*><is><t[^>]*>30\n5<\/t>/);
  assert.match(xml, /<c r="W2"[^>]*><is><t[^>]*>1\n1<\/t>/);
  assert.match(xml, /<c r="X2"[^>]*><is><t[^>]*>6109.10.00\n<\/t>/);
});

test("residential maps Yes/No; empty COD and alt-phone columns stay blank", async () => {
  const xml = await orderSheet(
    await buildEasyParcelWorkbook([domestic, international], TEMPLATE),
  );
  assert.match(xml, /<c r="N2"[^>]*><is><t[^>]*>Yes<\/t>/);
  assert.match(xml, /<c r="N3"[^>]*><is><t[^>]*>No<\/t>/);
  // alt phone (E/F), company (G), COD (Z/AA) are empty cells
  assert.match(xml, /<c r="E2" s="\d+"\/>/);
  assert.match(xml, /<c r="Z2" s="\d+"\/>/);
});

test("country resolution is exact and fail-closed", () => {
  assert.deepEqual(resolveEasyParcelCountryName("MY"), {
    ok: true,
    value: "Malaysia",
  });
  assert.deepEqual(resolveEasyParcelCountryName("US"), {
    ok: true,
    value: "United States of America",
  });
  assert.equal(resolveEasyParcelCountryName("AX").ok, false); // Åland absent in template
});

test("phone resolution splits country label and national number", () => {
  const my = resolveEasyParcelPhone("+60123456789", "MY");
  assert.deepEqual(my, {
    ok: true,
    value: { label: "Malaysia +60", national: "123456789" },
  });
  // stored without + but with shipping country context
  const local = resolveEasyParcelPhone("0123456789", "MY");
  assert.equal(local.ok, true);
  if (local.ok) assert.equal(local.value.label, "Malaysia +60");
  const sg = resolveEasyParcelPhone("+6598765432", "SG");
  assert.equal(sg.ok, true);
  if (sg.ok) assert.equal(sg.value.label, "Singapore +65");
});

test("every baked country mapping matches the committed template lists", async () => {
  const zip = await JSZip.loadAsync(TEMPLATE);
  const shared = await sharedStrings(zip);
  const names = new Set(await colA(zip, "xl/worksheets/sheet2.xml", shared));
  const phones = new Set(await colA(zip, "xl/worksheets/sheet3.xml", shared));
  for (const iso of ALL_COUNTRY_CODES) {
    const entry = EASYPARCEL_COUNTRY_BY_ISO2[iso];
    assert.ok(entry, `${iso} present in map`);
    if (entry.name !== null)
      assert.ok(names.has(entry.name), `${iso} name "${entry.name}" in sheet`);
    if (entry.phone !== null)
      assert.ok(
        phones.has(entry.phone),
        `${iso} phone "${entry.phone}" in list`,
      );
  }
});

// — local helpers for the template-integrity test —
function decode(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}
async function sharedStrings(zip: JSZip): Promise<string[]> {
  const file = zip.file("xl/sharedStrings.xml");
  if (!file) throw new Error("Missing shared strings");
  const xml = await file.async("string");
  return xml
    .split("<si>")
    .slice(1)
    .map((si) => {
      const body = si.slice(0, si.indexOf("</si>"));
      return [...body.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)]
        .map((x) => decode(x[1]))
        .join("");
    });
}
async function colA(
  zip: JSZip,
  path: string,
  shared: string[],
): Promise<string[]> {
  const file = zip.file(path);
  if (!file) throw new Error(`Missing path: ${path}`);
  const xml = await file.async("string");
  const out: string[] = [];
  for (const m of xml.matchAll(
    /<c r="A\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g,
  )) {
    if (m[2] === undefined) continue;
    out.push(/\bt="s"/.test(m[1]) ? shared[Number(m[2])] : decode(m[2]));
  }
  return out;
}
