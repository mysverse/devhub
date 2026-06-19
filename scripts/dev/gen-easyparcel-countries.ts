/**
 * Generates src/lib/welcome-pack/easyparcel-countries.ts from the committed
 * EasyParcel template. The `order` sheet validates column M against the hidden
 * `country` sheet (ISO 3166 official names) and columns C/E against the hidden
 * `country_code_list` sheet ("<short name> +<calling code>"). The two sheets use
 * DIFFERENT spellings, so we resolve each ISO-2 code against each list exactly
 * and bake the result. Unresolved codes are emitted as null (fail-closed at
 * export time). Re-run after replacing the template; the node:test guards drift.
 *
 *   pnpm tsx scripts/dev/gen-easyparcel-countries.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { getCountryCallingCode, isSupportedCountry } from "libphonenumber-js";
import {
  ALL_COUNTRY_CODES,
  countryNameFromCode,
} from "../../src/lib/countries";

const TEMPLATE = join(
  process.cwd(),
  "src/lib/welcome-pack/easyparcel-template.xlsx",
);
const OUT = join(process.cwd(), "src/lib/welcome-pack/easyparcel-countries.ts");

const NS = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";

async function colA(
  zip: JSZip,
  sheetPath: string,
  shared: string[],
): Promise<string[]> {
  const file = zip.file(sheetPath);
  if (!file) throw new Error(`Missing file: ${sheetPath}`);
  const xml = await file.async("string");
  const values: string[] = [];
  // crude column-A cell scan good enough for these single-column lookup sheets
  const cellRe = /<c r="A\d+"([^>]*)>(?:<v>([\s\S]*?)<\/v>)?<\/c>/g;
  let m: RegExpExecArray | null;
  m = cellRe.exec(xml);
  while (m !== null) {
    const attrs = m[1];
    const raw = m[2];
    if (raw !== undefined) {
      const isShared = /\bt="s"/.test(attrs);
      values.push(isShared ? shared[Number(raw)] : decode(raw));
    }
    m = cellRe.exec(xml);
  }
  return values;
}

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
  if (!file) throw new Error("Missing xl/sharedStrings.xml");
  const xml = await file.async("string");
  const out: string[] = [];
  for (const si of xml.split("<si>").slice(1)) {
    const body = si.slice(0, si.indexOf("</si>"));
    const text = [...body.matchAll(/<t[^>]*>(.*?)<\/t>/g)]
      .map((x) => decode(x[1]))
      .join("");
    out.push(text);
  }
  return out;
}

/** Reversible normalisation for safe matching (no false positives). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’]/g, "'") // curly → straight apostrophe
    .replace(/&/g, "and")
    .replace(/\bst\.?\b/g, "saint")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ISO-2 → exact `country` sheet name, where exact/normalised match is wrong/absent.
const COUNTRY_NAME_OVERRIDE: Record<string, string> = {
  BN: "Brunei Darussalam",
  BO: "Bolivia (Plurinational State of)",
  BQ: "Bonaire, Sint Eustatius and Saba",
  CD: "Congo, Democratic Republic of the",
  CG: "Congo",
  CV: "Cabo Verde",
  FK: "Falkland Islands (Malvinas)",
  FM: "Micronesia (Federated States of)",
  GB: "United Kingdom of Great Britain and Northern Ireland",
  GS: "South Georgia and the South Sandwich Islands",
  HK: "Hong Kong",
  HM: "Heard Island and McDonald Islands",
  IR: "Iran (Islamic Republic of)",
  KP: "Korea (Democratic People's Republic of)",
  KR: "Korea, Republic of",
  LA: "Lao People's Democratic Republic",
  MD: "Moldova, Republic of",
  MF: "Saint Martin (French part)",
  MM: "Myanmar",
  MO: "Macao",
  PN: "Pitcairn",
  PS: "Palestine, State of",
  RU: "Russian Federation",
  SH: "Saint Helena, Ascension and Tristan da Cunha",
  ST: "Sao Tome and Principe",
  SX: "Sint Maarten (Dutch part)",
  SY: "Syrian Arab Republic",
  TR: "Turkey",
  TW: "Taiwan, Province of China",
  TZ: "Tanzania, United Republic of",
  UM: "United States Minor Outlying Islands",
  US: "United States of America",
  VA: "Holy See",
  VC: "Saint Vincent and the Grenadines",
  VE: "Venezuela (Bolivarian Republic of)",
  VG: "Virgin Islands (British)",
  VI: "Virgin Islands (U.S.)",
  VN: "Viet Nam",
};

// ISO-2 → exact `country_code_list` label, where the short-name spelling diverges.
const PHONE_LABEL_OVERRIDE: Record<string, string> = {
  AX: "Aland Islands +358",
  BN: "Brunei +673",
  BO: "Bolivia +591",
  BQ: "Caribbean Netherlands +599",
  CC: "Cocos Islands +61",
  CD: "Congo +243",
  CG: "Congo +242",
  CV: "Cape Verde +238",
  CZ: "Czech Republic +420",
  FK: "Falkland Islands +500",
  FM: "Micronesia +691",
  GB: "United Kingdom +44",
  HK: "Hong Kong +852",
  IR: "Iran +98",
  KP: "Democratic People's Republic of Korea +850",
  KR: "Korea, Republic of +82",
  LA: "Laos +856",
  MD: "Moldova +373",
  MF: "Saint Martin +590",
  MM: "Myanmar +95",
  MO: "Macau +853",
  PS: "Palestine +970",
  RE: "Reunion +262",
  RU: "Russia +7",
  SH: "Saint Helena +290",
  ST: "Sao Tome and Principe +239",
  SY: "Syria +963",
  TR: "Turkey +90",
  TW: "Taiwan +886",
  TZ: "Tanzania +255",
  US: "United States +1",
  VA: "Vatican City +39",
  VC: "Saint Vincent and the Grenadines +1",
  VE: "Venezuela +58",
  VG: "British Virgin Islands +1",
  VI: "U.S. Virgin Islands +1",
  VN: "Vietnam +84",
};

async function main() {
  const zip = await JSZip.loadAsync(readFileSync(TEMPLATE));
  const shared = await sharedStrings(zip);
  const countryNames = await colA(zip, "xl/worksheets/sheet2.xml", shared);
  const phoneLabels = await colA(zip, "xl/worksheets/sheet3.xml", shared);
  void NS;

  const countryByNorm = new Map<string, string>();
  for (const n of countryNames) countryByNorm.set(norm(n), n);
  const phoneSet = new Set(phoneLabels);
  // phone label keyed by normalised "<name>" (strip trailing " +NN")
  const phoneByNormName = new Map<string, string>();
  for (const label of phoneLabels) {
    const mm = label.match(/^(.*)\s+\+\d+$/);
    if (mm) phoneByNormName.set(norm(mm[1]), label);
  }

  const rows: { iso: string; name: string | null; phone: string | null }[] = [];
  const unresolvedName: string[] = [];
  const unresolvedPhone: string[] = [];

  for (const iso of ALL_COUNTRY_CODES) {
    const intl = countryNameFromCode(iso);
    // country sheet name
    let name: string | null = COUNTRY_NAME_OVERRIDE[iso] ?? null;
    if (!name) name = countryByNorm.get(norm(intl)) ?? null;
    if (name && !countryNames.includes(name)) name = null;
    if (!name) unresolvedName.push(iso);
    // phone label
    let phone: string | null = PHONE_LABEL_OVERRIDE[iso] ?? null;
    if (!phone) {
      const byName = phoneByNormName.get(norm(intl));
      if (byName) phone = byName;
    }
    if (!phone) {
      try {
        if (isSupportedCountry(iso)) {
          const cand = `${intl} +${getCountryCallingCode(iso)}`;
          if (phoneSet.has(cand)) phone = cand;
        }
      } catch {
        // no calling code for this territory — leave fail-closed
      }
    }
    if (phone && !phoneSet.has(phone)) phone = null;
    if (!phone) unresolvedPhone.push(iso);
    rows.push({ iso, name, phone });
  }

  const body = rows
    .map(
      (r) =>
        `  ${r.iso}: { name: ${r.name === null ? "null" : JSON.stringify(r.name)}, phone: ${r.phone === null ? "null" : JSON.stringify(r.phone)} },`,
    )
    .join("\n");
  const file = `// AUTO-GENERATED by scripts/dev/gen-easyparcel-countries.ts — do not edit by hand.
// Maps ISO 3166-1 alpha-2 codes to the exact strings the committed EasyParcel
// template expects: \`name\` for column M (Receiver Country), \`phone\` for the
// phone-country dropdown in columns C/E. null means the template's hidden
// lookup sheets have no matching entry — the export fails closed for that code.

export type EasyParcelCountry = { name: string | null; phone: string | null };

export const EASYPARCEL_COUNTRY_BY_ISO2: Record<string, EasyParcelCountry> = {
${body}
};
`;
  writeFileSync(OUT, file);
  console.log(`Wrote ${OUT} (${rows.length} codes)`);
  console.log(
    `Resolved country name: ${rows.length - unresolvedName.length}/${rows.length}; phone: ${rows.length - unresolvedPhone.length}/${rows.length}`,
  );
  console.log(
    "No country-sheet name (fail-closed):",
    unresolvedName.join(" ") || "none",
  );
  console.log(
    "No phone label (fail-closed):",
    unresolvedPhone.join(" ") || "none",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
