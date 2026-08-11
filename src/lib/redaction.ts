/**
 * Redaction of free text on its way to a model.
 *
 * Extracted from `assistant.ts` because it is no longer chat-only: every
 * writing-assist surface sends text a person typed, and that text can contain
 * anything. Keeping it here — pure, Prisma-free, unit-tested — means a caller
 * can redact without importing the whole assistant, and means the regexes are
 * testable rather than trusted.
 *
 * Two layers, because neither is sufficient alone:
 *
 *  - `redactPatterns` catches the *shapes* of personal data (an email, a phone
 *    number, an API key) wherever they appear, including data belonging to
 *    someone other than the author.
 *  - an exact-value pass catches what has no shape at all. A legal name is just
 *    words; no regex finds "Alexander Tan Wei Ming" without also eating half the
 *    sentence around it. The caller supplies the values it knows.
 *
 * This is defence in depth, not the primary boundary. The primary boundary is
 * the prompt input types in `llm-prompts.ts`, which have no field to put a name
 * in. Redaction exists for the one case those types cannot cover: prose.
 */

export const REDACTED_EMAIL = "[redacted email]";
export const REDACTED_NUMBER = "[redacted number]";
export const REDACTED_SECRET = "[redacted secret]";
export const REDACTED_PERSONAL = "[redacted personal data]";

/**
 * Shape-based redaction. Deliberately eager: a false positive costs the model a
 * little context, a false negative sends someone's phone number to a provider.
 *
 * The number pattern matches 9+ digits with optional separators, which covers
 * Malaysian mobiles, bank account numbers and NRIC digits. It does not match a
 * Linear estimate, a year, or a short issue number.
 */
export function redactPatterns(text: string) {
  return text
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, REDACTED_EMAIL)
    .replace(/(?:\+?\d[\s().-]?){8,}\d/g, REDACTED_NUMBER)
    .replace(
      /\b(?:sk|api|token|secret|password)[-_ ]?[A-Za-z0-9_-]{12,}\b/gi,
      REDACTED_SECRET,
    );
}

/**
 * Builds a redactor over a set of known-personal strings.
 *
 * The longest-first sort is load-bearing. "Tan" is a substring of "Tan Jun Yan",
 * so replacing the short value first would leave "[redacted personal data] Jun
 * Yan" — the full name still legible, and now impossible to match. Blanks are
 * dropped for the same reason an empty `replaceAll` is a disaster: it would
 * splice the marker between every character in the string.
 */
export function createExactRedactor(
  values: readonly (string | null | undefined)[],
) {
  const exact = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => right.length - left.length);

  return (text: string) => {
    let redacted = redactPatterns(text);
    for (const value of exact) {
      redacted = redacted.replaceAll(value, REDACTED_PERSONAL);
    }
    return redacted;
  };
}
