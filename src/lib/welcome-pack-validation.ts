import { z } from "zod";
import { isKnownCountryCode } from "@/lib/countries";
import {
  MY_PHONE_REGEX,
  normalizeMalaysianPhone,
} from "@/lib/payment-validation";

/**
 * Shared client/server validation for welcome pack orders. The client uses
 * `validateField` for inline errors; the server actions parse the whole
 * schema so the client can never outrun it.
 */

// Strip zero-width/format characters (category Cf: ZWSP, RTL overrides, …)
// that survive trim() and would print as blank or reordered text on the
// physical ID card.
export function stripFormatChars(value: string): string {
  return value.replace(/\p{Cf}/gu, "");
}

const INTERNATIONAL_PHONE_REGEX = /^\+?\d{7,15}$/;
const MY_POSTCODE_REGEX = /^\d{5}$/;
const GENERIC_POSTCODE_REGEX = /^[A-Za-z0-9][A-Za-z0-9 -]{1,11}$/;

export const FIELD_LIMITS = {
  idCardName: 60,
  recipientName: 120,
  phone: 120,
  addressLine: 120,
  city: 120,
  stateProvince: 120,
  postalCode: 12,
  notes: 1000,
} as const;

function trimmed(max: number) {
  return z
    .string()
    .transform((v) => stripFormatChars(v).trim())
    .pipe(z.string().max(max));
}

export const orderFieldsSchema = z
  .object({
    idCardName: trimmed(FIELD_LIMITS.idCardName)
      .pipe(z.string().min(2, "ID card name must be at least 2 characters"))
      .refine((v) => /[\p{L}\p{N}]/u.test(v), {
        message: "ID card name must contain at least one letter or number",
      }),
    region: z.enum(["DOMESTIC", "INTERNATIONAL"]),
    recipientName: trimmed(FIELD_LIMITS.recipientName).pipe(
      z.string().min(2, "Recipient name is required"),
    ),
    phone: trimmed(FIELD_LIMITS.phone).pipe(
      z.string().min(1, "Phone is required"),
    ),
    addressLine1: trimmed(FIELD_LIMITS.addressLine).pipe(
      z.string().min(1, "Address line 1 is required"),
    ),
    addressLine2: trimmed(FIELD_LIMITS.addressLine).optional(),
    city: trimmed(FIELD_LIMITS.city).pipe(
      z.string().min(1, "City is required"),
    ),
    stateProvince: trimmed(FIELD_LIMITS.stateProvince).optional(),
    postalCode: trimmed(FIELD_LIMITS.postalCode).pipe(
      z.string().min(1, "Postal code is required"),
    ),
    country: trimmed(8)
      .transform((v) => v.toUpperCase())
      .refine(isKnownCountryCode, { message: "Unknown country code" }),
    notes: trimmed(FIELD_LIMITS.notes).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.region === "DOMESTIC" && data.country !== "MY") {
      ctx.addIssue({
        code: "custom",
        path: ["country"],
        message: "Domestic shipping is for Malaysia (MY) addresses only",
      });
    }
    if (data.region === "INTERNATIONAL" && data.country === "MY") {
      ctx.addIssue({
        code: "custom",
        path: ["region"],
        message: "Switch to Domestic for Malaysia addresses",
      });
    }
    // Phone: strict Malaysian format domestically, lenient E.164 otherwise.
    const compactPhone = data.phone.replace(/[\s\-()]/g, "");
    if (data.country === "MY") {
      if (!MY_PHONE_REGEX.test(normalizeMalaysianPhone(compactPhone))) {
        ctx.addIssue({
          code: "custom",
          path: ["phone"],
          message: "Enter a valid Malaysian phone number (e.g. 012-345 6789)",
        });
      }
    } else if (!INTERNATIONAL_PHONE_REGEX.test(compactPhone)) {
      ctx.addIssue({
        code: "custom",
        path: ["phone"],
        message: "Enter a valid phone number with country code",
      });
    }
    const postcodeRegex =
      data.country === "MY" ? MY_POSTCODE_REGEX : GENERIC_POSTCODE_REGEX;
    if (!postcodeRegex.test(data.postalCode)) {
      ctx.addIssue({
        code: "custom",
        path: ["postalCode"],
        message:
          data.country === "MY"
            ? "Malaysian postcodes are 5 digits"
            : "Enter a valid postal code",
      });
    }
  });

export type OrderFields = z.infer<typeof orderFieldsSchema>;
export type OrderFieldsInput = z.input<typeof orderFieldsSchema>;
export type OrderFieldName = keyof OrderFieldsInput;

/**
 * Parse the full field set; returns normalized values (trimmed, phone
 * normalized for MY, uppercased country) or the first error message.
 */
export function parseOrderFields(
  input: OrderFieldsInput,
): { ok: true; fields: OrderFields } | { ok: false; error: string } {
  const parsed = orderFieldsSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message ?? "Invalid order details" };
  }
  const fields = parsed.data;
  if (fields.country === "MY") {
    fields.phone = normalizeMalaysianPhone(
      fields.phone.replace(/[\s\-()]/g, ""),
    );
  }
  return { ok: true, fields };
}

/**
 * One schema parse → first error message per field. The client form derives
 * all inline errors from a single call per render instead of re-parsing the
 * whole schema field by field.
 */
export function collectFieldErrors(
  draft: OrderFieldsInput,
): Partial<Record<OrderFieldName, string>> {
  const parsed = orderFieldsSchema.safeParse(draft);
  if (parsed.success) return {};
  const errors: Partial<Record<OrderFieldName, string>> = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as OrderFieldName | undefined;
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** Which fields belong to which wizard step (for touched/focus handling). */
export const STEP_FIELDS: Record<number, OrderFieldName[]> = {
  1: ["idCardName"],
  2: [
    "region",
    "recipientName",
    "phone",
    "addressLine1",
    "addressLine2",
    "city",
    "stateProvince",
    "postalCode",
    "country",
    "notes",
  ],
};

export type SelectionInput = { itemId: string; selectedSize?: string | null };

const PACK_DRIFT_ERROR =
  "The pack contents changed while you were ordering — please refresh and review your selections.";

export type SelectableItem = {
  id: string;
  name: string;
  requiresSize: boolean;
  sizeOptions: string[];
  isActive?: boolean;
};

/**
 * Server-authoritative selection validation shared by submit, user-edit and
 * admin-edit actions. Iterates the item list (not the input) so duplicates
 * and foreign itemIds can never create rows.
 *
 * - `items` = the full set the order may reference (pack items).
 * - `requireAllItems` (user flows): every item must be included; an input
 *   referencing unknown/inactive items, or missing a new item, is "drift" —
 *   surfaced as a refresh-and-review error rather than silently pruned.
 * - admin flows pass `requireAllItems: false` and choose membership freely.
 */
export function validateSelections(
  items: SelectableItem[],
  input: SelectionInput[],
  opts: { requireAllItems: boolean },
):
  | { ok: true; selections: { itemId: string; selectedSize: string | null }[] }
  | { ok: false; error: string } {
  const itemIds = new Set(items.map((i) => i.id));
  if (input.some((s) => !itemIds.has(s.itemId))) {
    return { ok: false, error: PACK_DRIFT_ERROR };
  }

  const byItem = new Map(input.map((s) => [s.itemId, s]));
  const selections: { itemId: string; selectedSize: string | null }[] = [];
  for (const item of items) {
    const provided = byItem.get(item.id);
    if (!provided) {
      if (opts.requireAllItems) {
        return { ok: false, error: PACK_DRIFT_ERROR };
      }
      continue; // admin chose to exclude this item
    }
    if (item.requiresSize) {
      const size = provided.selectedSize ?? null;
      if (!size) {
        return { ok: false, error: `Select a size for ${item.name}` };
      }
      if (!item.sizeOptions.includes(size)) {
        return { ok: false, error: `Invalid size for ${item.name}` };
      }
      selections.push({ itemId: item.id, selectedSize: size });
    } else {
      selections.push({ itemId: item.id, selectedSize: null });
    }
  }
  if (selections.length === 0) {
    return { ok: false, error: "The order must contain at least one item" };
  }
  return { ok: true, selections };
}
