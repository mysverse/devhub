import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  checkDuitNowId,
  DUITNOW_ID_TYPES,
  formatDuitNowIdForBank,
  formatDuitNowIdForDisplay,
  isDuitNowConfirmationStale,
  isDuitNowIdType,
  MY_MOBILE_REGEX,
  normalizeDuitNowId,
} from "@/lib/duitnow-id";
import {
  MY_PHONE_REGEX,
  normalizeMalaysianPhone,
} from "@/lib/payment-validation";

/** A well-formed NRIC: 1 Jan 1999, birthplace 14 (Kuala Lumpur). */
const NRIC = "990101141234";

describe("mobile proxies", () => {
  it("accepts a 7-subscriber-digit mobile (012)", () => {
    assert.equal(checkDuitNowId("MOBILE", "012-345 6789"), null);
  });

  it("accepts an 8-subscriber-digit mobile (011)", () => {
    assert.equal(checkDuitNowId("MOBILE", "011-1234 5678"), null);
  });

  it("accepts the +60 and 60 forms as well as the local one", () => {
    for (const input of ["+60123456789", "60123456789", "0123456789"]) {
      assert.equal(checkDuitNowId("MOBILE", input), null, input);
    }
  });

  it("accepts 015 even though it is currently reserved", () => {
    // A false negative here blocks someone from being paid; an unusual number
    // simply fails to resolve at the bank, which the admin flow already covers.
    assert.equal(checkDuitNowId("MOBILE", "015-1234 5678"), null);
  });

  /**
   * The regression that motivated a separate mobile rule: MY_PHONE_REGEX
   * admits landlines, and it is shared with welcome-pack shipping where a
   * landline is a legitimate courier contact. Tightening it in place would
   * have rejected valid delivery numbers, so the two rules must stay distinct
   * and must disagree about exactly this value.
   */
  it("rejects a landline for DuitNow while shipping still accepts it", () => {
    const landline = "03-1234 5678";
    const rejection = checkDuitNowId("MOBILE", landline);
    assert.equal(rejection?.reason, "mobile-is-landline");
    assert.match(rejection?.message ?? "", /landline/i);

    assert.ok(
      MY_PHONE_REGEX.test(normalizeMalaysianPhone(landline)),
      "shipping validation must still accept a landline",
    );
    assert.ok(!MY_MOBILE_REGEX.test(normalizeMalaysianPhone(landline)));
  });

  it("rejects a number that is not Malaysian at all", () => {
    assert.equal(checkDuitNowId("MOBILE", "12345")?.reason, "mobile-invalid");
  });
});

describe("NRIC proxies", () => {
  it("accepts a well-formed NRIC, with or without dashes", () => {
    assert.equal(checkDuitNowId("NRIC", NRIC), null);
    assert.equal(checkDuitNowId("NRIC", "990101-14-1234"), null);
  });

  /**
   * Birthplace codes 60-93 are foreign birthplaces, 82 is "state unknown" and
   * 98/99 are stateless/refugee — all held by real citizens. An allowlist
   * tuned to state codes would reject them, so there must not be one.
   */
  it("accepts every birthplace code, including foreign and unknown", () => {
    for (const code of ["01", "14", "60", "69", "70", "82", "98", "99"]) {
      const value = `990101${code}1234`;
      assert.equal(checkDuitNowId("NRIC", value), null, `birthplace ${code}`);
    }
  });

  /**
   * JPN's late-birth registration schemes substitute nominal dates when a
   * holder cannot document one, so an "impossible" date can be genuine. This
   * pins the leniency against a future edit that tightens it into a real
   * calendar check.
   */
  it("accepts a date that is not a real calendar date", () => {
    assert.equal(checkDuitNowId("NRIC", "990231141234"), null);
  });

  it("rejects anything that is not 12 digits", () => {
    assert.equal(
      checkDuitNowId("NRIC", "99010114123")?.reason,
      "nric-wrong-length",
    );
    assert.equal(
      checkDuitNowId("NRIC", "9901011412345")?.reason,
      "nric-wrong-length",
    );
  });

  /**
   * A TnG eWallet account number is 12 digits with no distinguishing prefix,
   * so this cannot be asserted — only offered as a hypothesis with the fix.
   */
  it("points a 12-digit non-date at the eWallet path instead of just failing", () => {
    const rejection = checkDuitNowId("NRIC", "889912345678");
    assert.equal(rejection?.reason, "nric-bad-date");
    assert.match(rejection?.message ?? "", /Touch 'n Go/);
    assert.match(rejection?.message ?? "", /Bank account/);
  });
});

/**
 * These three types are refused outright by the old validateDuitNowId, which
 * accepted only a mobile number or an NRIC — so a permanent resident on a
 * passport, a serving officer, or a sole proprietor could not save payment
 * details at all.
 */
describe("passport, business registration and army/police proxies", () => {
  it("accepts a passport number", () => {
    assert.equal(checkDuitNowId("PASSPORT", "A12345678"), null);
  });

  it("accepts both current SSM business registration formats", () => {
    assert.equal(checkDuitNowId("BUSINESS_REG", "202001012345"), null);
    assert.equal(checkDuitNowId("BUSINESS_REG", "1234567-A"), null);
  });

  it("accepts an army/police service number", () => {
    assert.equal(checkDuitNowId("ARMY_POLICE", "T1234567"), null);
  });

  it("rejects symbols, and bounds the length", () => {
    assert.equal(checkDuitNowId("PASSPORT", "A123$5678")?.reason, "charset");
    assert.equal(checkDuitNowId("PASSPORT", "A12")?.reason, "too-short");
    assert.equal(
      checkDuitNowId("PASSPORT", "A".repeat(21))?.reason,
      "too-long",
    );
  });

  it("requires a value", () => {
    assert.equal(checkDuitNowId("BUSINESS_REG", "   ")?.reason, "empty");
  });
});

describe("normalizeDuitNowId", () => {
  /**
   * The settings and onboarding actions used to run the phone normalizer over
   * every proxy type, which rewrote a 10-digit army/police number beginning
   * "0" into a phone number and stripped a BRN down to something else.
   */
  it("never applies phone normalization to a non-mobile proxy", () => {
    assert.equal(normalizeDuitNowId("BUSINESS_REG", "1234567-A"), "1234567A");
    assert.equal(normalizeDuitNowId("ARMY_POLICE", "0123456789"), "0123456789");
    assert.equal(normalizeDuitNowId("MOBILE", "0123456789"), "+60123456789");
  });

  it("is idempotent for every type", () => {
    const cases = [
      ["MOBILE", "012-345 6789"],
      ["NRIC", "990101-14-1234"],
      ["BUSINESS_REG", "1234567-A"],
      ["PASSPORT", "a12345678"],
      ["ARMY_POLICE", "T-1234567"],
    ] as const;
    for (const [type, raw] of cases) {
      const once = normalizeDuitNowId(type, raw);
      assert.equal(normalizeDuitNowId(type, once), once, `${type} ${raw}`);
    }
  });

  it("uppercases alphanumeric proxies", () => {
    assert.equal(normalizeDuitNowId("PASSPORT", "a12345678"), "A12345678");
  });
});

describe("formatting", () => {
  it("groups mobiles by subscriber-digit count", () => {
    assert.equal(
      formatDuitNowIdForDisplay("MOBILE", "0123456789"),
      "+6012-345 6789",
    );
    assert.equal(
      formatDuitNowIdForDisplay("MOBILE", "01112345678"),
      "+6011-1234 5678",
    );
  });

  it("groups an NRIC the way a MyKad prints it", () => {
    assert.equal(formatDuitNowIdForDisplay("NRIC", NRIC), "990101-14-1234");
  });

  it("gives the bank the stored form, not the pretty one", () => {
    assert.equal(
      formatDuitNowIdForBank("MOBILE", "012-345 6789"),
      "+60123456789",
    );
    assert.equal(formatDuitNowIdForBank("NRIC", "990101-14-1234"), NRIC);
  });

  it("leaves an unparseable value alone rather than mangling it", () => {
    assert.equal(formatDuitNowIdForDisplay("MOBILE", "12345"), "12345");
  });
});

describe("type registry", () => {
  it("covers all five PayNet proxy types with unique codes", () => {
    assert.equal(DUITNOW_ID_TYPES.length, 5);
    const codes = new Set(DUITNOW_ID_TYPES.map((spec) => spec.paynetCode));
    assert.equal(codes.size, 5);
  });

  it("guards unknown values at the boundary", () => {
    assert.ok(isDuitNowIdType("MOBILE"));
    assert.ok(!isDuitNowIdType("EWALLET"));
    assert.ok(!isDuitNowIdType(null));
  });
});

describe("isDuitNowConfirmationStale", () => {
  const now = new Date("2026-08-19T00:00:00Z");

  it("is false when nothing was ever confirmed, so it cannot nag", () => {
    assert.equal(isDuitNowConfirmationStale(null, now), false);
  });

  it("is false for a recent confirmation and true for an old one", () => {
    assert.equal(
      isDuitNowConfirmationStale(new Date("2026-07-01T00:00:00Z"), now),
      false,
    );
    assert.equal(
      isDuitNowConfirmationStale(new Date("2025-08-19T00:00:00Z"), now),
      true,
    );
  });
});
