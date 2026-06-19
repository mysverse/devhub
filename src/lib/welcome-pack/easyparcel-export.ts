import { readFile } from "node:fs/promises";
import { join } from "node:path";
import JSZip from "jszip";
// Use the /core API with explicitly-imported metadata. The bundled-metadata
// subpaths ("libphonenumber-js", "/max") break under the esbuild/tsx CJS
// interop (metadata arrives shaped as { default }); passing metadata ourselves
// parses reliably in both the Next.js runtime and the tsx test runner.
import { parsePhoneNumberFromString } from "libphonenumber-js/core";
import phoneMetadataImport from "libphonenumber-js/min/metadata";
import { EASYPARCEL_COUNTRY_BY_ISO2 } from "./easyparcel-countries";

const phoneMetadata =
  (phoneMetadataImport as { default?: unknown }).default ?? phoneMetadataImport;

/**
 * Serialises welcome-pack orders into the EasyParcel bulk-upload workbook by
 * patching the committed template's `order` sheet only. The template is a
 * LibreOffice-authored .xlsx with hidden country lookup sheets, cell comments,
 * styles and per-column data validation that ExcelJS would not round-trip
 * faithfully (https://github.com/exceljs/exceljs/issues/1184), so we edit the
 * sheet XML in place via jszip and leave every other archive part untouched.
 */

export const EASYPARCEL_CURRENCIES = [
  "AUD",
  "EUR",
  "GBP",
  "IDR",
  "MYR",
  "SGD",
  "THB",
  "TWD",
  "USD",
] as const;
export type EasyParcelCurrency = (typeof EASYPARCEL_CURRENCIES)[number];

export function isEasyParcelCurrency(
  value: string,
): value is EasyParcelCurrency {
  return (EASYPARCEL_CURRENCIES as readonly string[]).includes(value);
}

export type EasyParcelItemLine = {
  name: string;
  declaredUnitValue: number;
  quantity: number;
  hsCode?: string | null;
};

/** A fully-resolved, validated row ready to serialise. No DB types here. */
export type EasyParcelRow = {
  receiverName: string;
  phoneCountryLabel: string; // e.g. "Malaysia +60" — must match country_code_list
  phoneNationalNumber: string; // national significant number, digits only
  email?: string | null;
  address: string; // combined address line(s)
  postcode: string;
  city: string;
  state: string;
  countryName: string; // e.g. "Malaysia" — must match the country sheet exactly
  isResidential: boolean | null;
  taxId?: string | null;
  weightKg: number;
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  currency: EasyParcelCurrency;
  items: EasyParcelItemLine[];
  reference: string; // order id
};

// ── Resolution helpers (shared with the validation layer) ──────────────────

export type Resolved<T> = { ok: true; value: T } | { ok: false; error: string };

/** ISO-2 → exact `country` sheet name (column M). Fail-closed when absent. */
export function resolveEasyParcelCountryName(iso2: string): Resolved<string> {
  const name = EASYPARCEL_COUNTRY_BY_ISO2[iso2?.toUpperCase()]?.name;
  if (!name) {
    return {
      ok: false,
      error: `Country ${iso2} is not in the EasyParcel country list`,
    };
  }
  return { ok: true, value: name };
}

/**
 * Split a stored phone into the EasyParcel phone-country dropdown label
 * (column C) and the national significant number (column D). Uses
 * libphonenumber-js so international numbers split reliably; defaults to the
 * shipping country when the number is stored without a `+` prefix.
 */
export function resolveEasyParcelPhone(
  raw: string,
  shippingIso2: string,
): Resolved<{ label: string; national: string }> {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return { ok: false, error: "Phone number is required" };
  const iso = shippingIso2?.toUpperCase();
  let parsed = parsePhoneNumberFromString(
    trimmed,
    iso as never,
    phoneMetadata as never,
  );
  if (!parsed && trimmed.startsWith("+")) {
    parsed = parsePhoneNumberFromString(trimmed, phoneMetadata as never);
  }
  if (!parsed?.nationalNumber) {
    return {
      ok: false,
      error: "Phone number could not be parsed for EasyParcel",
    };
  }
  const phoneIso = (parsed.country ?? iso) as string;
  const label = EASYPARCEL_COUNTRY_BY_ISO2[phoneIso?.toUpperCase()]?.phone;
  if (!label) {
    return {
      ok: false,
      error: `No EasyParcel phone-country entry for ${phoneIso}`,
    };
  }
  return {
    ok: true,
    value: { label, national: String(parsed.nationalNumber) },
  };
}

// ── Workbook serialisation ─────────────────────────────────────────────────

const COLUMNS = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z",
  "AA",
] as const;
const LAST_COLUMN = "AA";
const SHEET_PATH = "xl/worksheets/sheet1.xml";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function numCell(
  col: string,
  row: number,
  style: string,
  value: number,
): string {
  return `<c r="${col}${row}" s="${style}" t="n"><v>${value}</v></c>`;
}

function textCell(
  col: string,
  row: number,
  style: string,
  value: string,
): string {
  if (value === "") return `<c r="${col}${row}" s="${style}"/>`;
  return `<c r="${col}${row}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(
    value,
  )}</t></is></c>`;
}

/** Derive the per-column style index from the template's first data row. */
function styleMap(sheetXml: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const col of COLUMNS) {
    const m = sheetXml.match(new RegExp(`<c r="${col}2"[^>]*\\bs="(\\d+)"`));
    map[col] = m ? m[1] : "0";
  }
  return map;
}

function residentialText(value: boolean | null): string {
  if (value === null) return "";
  return value ? "Yes" : "No";
}

function serialiseRow(
  row: EasyParcelRow,
  index: number,
  styles: Record<string, string>,
): string {
  const r = index + 2; // data starts at sheet row 2
  const names = row.items.map((i) => i.name);
  const values = row.items.map((i) => formatNumber(i.declaredUnitValue));
  const quantities = row.items.map((i) => String(i.quantity));
  const hsCodes = row.items.map((i) => (i.hsCode ?? "").trim());
  const text = (col: string, value: string) =>
    textCell(col, r, styles[col], value);
  const num = (col: string, value: number) =>
    numCell(col, r, styles[col], value);
  return [
    num("A", index + 1),
    text("B", row.receiverName),
    text("C", row.phoneCountryLabel),
    text("D", row.phoneNationalNumber),
    text("E", ""),
    text("F", ""),
    text("G", ""),
    text("H", row.email?.trim() ?? ""),
    text("I", row.address),
    text("J", row.postcode),
    text("K", row.city),
    text("L", row.state),
    text("M", row.countryName),
    text("N", residentialText(row.isResidential)),
    text("O", row.taxId?.trim() ?? ""),
    num("P", row.weightKg),
    num("Q", row.lengthCm),
    num("R", row.widthCm),
    num("S", row.heightCm),
    text("T", row.currency),
    text("U", names.join("\n")),
    text("V", values.join("\n")),
    text("W", quantities.join("\n")),
    text("X", hsCodes.some(Boolean) ? hsCodes.join("\n") : ""),
    text("Y", row.reference),
    text("Z", ""),
    text("AA", ""),
  ].join("");
}

function formatNumber(value: number): string {
  // avoid scientific notation / trailing noise for typical money/weight values
  return Number.isInteger(value)
    ? String(value)
    : String(Number(value.toFixed(4)));
}

/** Rebuild the data-validation block so every dropdown spans rows 2..lastRow. */
function buildValidations(lastRow: number): string {
  const blocks = [
    {
      op: "between",
      sqref: `T2:T${lastRow} Z2:Z${lastRow}`,
      f: "&quot;AUD,EUR,GBP,IDR,MYR,SGD,THB,TWD,USD&quot;",
    },
    { op: "between", sqref: `N2:N${lastRow}`, f: "&quot;Yes,No&quot;" },
    {
      op: "between",
      sqref: `C2:C${lastRow} E2:E${lastRow}`,
      f: "country_code_list!$A$1:$A$240",
    },
    { op: "equal", sqref: `M2:M${lastRow}`, f: "country!$A$1:$A$250" },
  ];
  const body = blocks
    .map(
      (b) =>
        `<dataValidation allowBlank="true" errorStyle="stop" operator="${b.op}" showDropDown="false" showErrorMessage="true" showInputMessage="false" sqref="${b.sqref}" type="list"><formula1>${b.f}</formula1><formula2>0</formula2></dataValidation>`,
    )
    .join("");
  return `<dataValidations count="${blocks.length}">${body}</dataValidations>`;
}

/**
 * Build the EasyParcel workbook for the given rows. Touches only the `order`
 * sheet: replaces the sample data rows, extends the sheet dimension and every
 * validation range to cover exactly the rows written, and leaves the hidden
 * lookup sheets, tips sheet, comments, styles and shared strings intact.
 */
export async function buildEasyParcelWorkbook(
  rows: EasyParcelRow[],
  templateBuffer: Buffer | Uint8Array,
): Promise<Buffer> {
  if (rows.length === 0) {
    throw new Error("Refusing to build an EasyParcel workbook with zero rows");
  }
  const zip = await JSZip.loadAsync(templateBuffer);
  const sheetFile = zip.file(SHEET_PATH);
  if (!sheetFile)
    throw new Error("EasyParcel template is missing the order sheet");
  let xml = await sheetFile.async("string");

  const styles = styleMap(xml);
  const newRows = rows
    .map((row, i) => `<row r="${i + 2}">${serialiseRow(row, i, styles)}</row>`)
    .join("");

  // Replace everything between the header row and </sheetData> with new rows.
  const headerStart = xml.indexOf('<row r="1"');
  const headerEnd = xml.indexOf("</row>", headerStart) + "</row>".length;
  const sheetDataEnd = xml.indexOf("</sheetData>");
  if (headerStart === -1 || sheetDataEnd === -1) {
    throw new Error("EasyParcel template order sheet has an unexpected shape");
  }
  xml = xml.slice(0, headerEnd) + newRows + xml.slice(sheetDataEnd);

  const lastRow = rows.length + 1;
  xml = xml.replace(
    /<dimension ref="A1:[A-Z]+\d+"\/>/,
    `<dimension ref="A1:${LAST_COLUMN}${lastRow}"/>`,
  );
  xml = xml.replace(
    /<dataValidations[\s\S]*?<\/dataValidations>/,
    buildValidations(lastRow),
  );

  zip.file(SHEET_PATH, xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// ── Template loading ───────────────────────────────────────────────────────

export function easyParcelTemplatePath(): string {
  return join(process.cwd(), "src/lib/welcome-pack/easyparcel-template.xlsx");
}

export async function loadEasyParcelTemplate(): Promise<Buffer> {
  return readFile(easyParcelTemplatePath());
}
