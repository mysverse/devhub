/**
 * Static checks that keep PII where it belongs. Pure and filesystem-free so it
 * can be unit tested; scripts/dev/check-pii.ts does the walking and reporting.
 *
 * Two invariants, learned the hard way:
 *
 *  1. UserProfile.legalName is collected under an explicit promise that only
 *     administrators ever see it, for payment and compliance. Anything a human
 *     reads must go through resolveDisplayName() in src/lib/display-name.ts.
 *
 *  2. Every export of a "use server" module is a publicly callable Server
 *     Action endpoint. Un-guarded exports are unauthenticated API surface, and
 *     a non-async export silently strips the whole module of its exports.
 *
 * Compliance sites deliberately need NO allowlist entry — the rules are shaped
 * not to hit them. Do not "helpfully" add:
 *   - src/app/api/documents/**, src/lib/markdown-to-pdf.ts  (signed documents)
 *   - src/app/api/kyc/**, src/app/dashboard/admin/kyc/**    (KycVerification
 *     has its own legalName column)
 *   - the EasyParcel export                                 (courier label
 *     uses recipientName)
 */

export type PiiRuleId =
  | "pii/display-name-fallback"
  | "pii/legal-name-in-email-template"
  | "pii/legal-name-in-email-prop"
  | "pii/legal-name-to-linear"
  | "pii/unguarded-server-action"
  | "pii/non-async-server-action-export"
  | "pii/bank-field-in-client-component";

export type PiiViolation = {
  rule: PiiRuleId;
  file: string;
  line: number;
  snippet: string;
  message: string;
};

export type PiiAllowEntry = {
  rule: PiiRuleId;
  file: string;
  /** Required: an allowlist nobody can justify is how this rot starts. */
  reason: string;
};

export const PII_ALLOWLIST: PiiAllowEntry[] = [
  {
    rule: "pii/display-name-fallback",
    file: "src/lib/transaction-slip-pdf.ts",
    reason:
      "A payment slip is a financial record and must carry the legal name (AML/KYC).",
  },
  {
    rule: "pii/bank-field-in-client-component",
    file: "src/app/dashboard/settings/SettingsForm.tsx",
    reason: "The user editing their own payment details.",
  },
  {
    rule: "pii/bank-field-in-client-component",
    file: "src/app/onboarding/OnboardingFlow.tsx",
    reason: "The user entering their own payment details during onboarding.",
  },
  {
    rule: "pii/bank-field-in-client-component",
    file: "src/app/dashboard/admin/PayoutCard.tsx",
    reason:
      "Admin payout UI. Pending rows only — settled rows get a null paymentDetails (see PayoutTransaction).",
  },
  {
    rule: "pii/bank-field-in-client-component",
    file: "src/components/DuitNowFields.tsx",
    reason:
      "The shared payment-details editor. The user editing their own rails — it renders only what its host passes in, and both hosts pass the signed-in user's own profile.",
  },
  {
    rule: "pii/bank-field-in-client-component",
    file: "src/components/DuitNowConfirmModal.tsx",
    reason:
      "Restates the user's own DuitNow ID back to them before saving it. Displays, never fetches.",
  },
];

// `duitNowId\w*` on purpose: `\bduitNowId\b` does not match duitNowIdType,
// duitNowIdStatus, duitNowIdCheckedAt or duitNowIdIssue, because the trailing
// word boundary fails against a following word character. Those columns carry
// where and whether someone can be paid, and one of them was very nearly a
// bank-returned legal name.
const BANK_FIELDS =
  /\b(bankAccountNumber|bankAccountName|duitNowId\w*|paypalEmail)\b/;

/**
 * Two details keep this rule quiet on legitimate code:
 *
 *  - it requires a property access before legalName, which excludes the
 *    bare-identifier form defaults and src/lib/config.ts, where `legalName:`
 *    is the company's own name;
 *  - it requires the fallback to be some OTHER value. `legalName ?? null` and
 *    `legalName || ""` are normalizations that carry the legal name to a
 *    compliance surface; the anti-pattern is falling back FROM legalName to a
 *    different name, e.g. `?? user.name` or `|| "Developer"`.
 */
// The lookahead sits immediately after the operator and consumes the
// whitespace itself; putting `\s*` before it lets the regex backtrack to a
// zero-width match and defeat the exclusion.
const DISPLAY_FALLBACK =
  /(?:\.|\?\.)\s*legalName\s*(?:\|\||\?\?)(?!\s*(?:null\b|undefined\b|""|''|``))/;

const EMAIL_PROP = /\buserName\s*:\s*[^,;}]*\blegalName\b/;

const LINEAR_WRITE =
  /\.(createComment|updateIssue|issueCreate|createIssue|commentCreate)\s*\(|\bpostPptProofComment\s*\(/g;

function lineOf(source: string, index: number) {
  return source.slice(0, index).split("\n").length;
}

function isUseServer(source: string) {
  return /^\s*(["'])use server\1\s*;?/m.test(
    source.split("\n").slice(0, 3).join("\n"),
  );
}

function isUseClient(source: string) {
  return /^\s*(["'])use client\1\s*;?/m.test(
    source.split("\n").slice(0, 3).join("\n"),
  );
}

/** Extracts the argument text of a call whose opening paren is at `open`. */
function sliceCallArgs(source: string, open: number) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/** Extracts a brace-delimited block given the index of its opening brace. */
function sliceBlock(source: string, open: number) {
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  return source.slice(open + 1);
}

/**
 * Body of the function declared at `declStart`. Two things put a `{` before
 * the real body, and taking the first brace naively reads one of them as the
 * body — which makes properly guarded actions look unguarded:
 *
 *   export async function f(input: { a: string }) {}      // param type
 *   export async function f(id: string): Promise<{}> {}   // return type
 *
 * So: skip the parameter list by paren matching, then skip any return type by
 * ignoring braces nested inside angle brackets.
 */
function sliceFunctionBody(source: string, declStart: number) {
  const paramOpen = source.indexOf("(", declStart);
  if (paramOpen === -1) return "";

  let depth = 0;
  let paramClose = -1;
  for (let i = paramOpen; i < source.length; i++) {
    const ch = source[i];
    if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0) {
        paramClose = i;
        break;
      }
    }
  }
  if (paramClose === -1) return "";

  let angle = 0;
  for (let i = paramClose + 1; i < source.length; i++) {
    const ch = source[i];
    if (ch === "<") angle++;
    else if (ch === ">") angle = Math.max(0, angle - 1);
    else if (ch === "{" && angle === 0) return sliceBlock(source, i);
  }
  return "";
}

const PRAGMA_LOOKBACK = 4;

/**
 * `// pii-allow: <rule> — <reason>` on the offending line or in the comment
 * block immediately above it. The reason may wrap onto following comment
 * lines; a bare pragma with no reason does not suppress anything.
 */
function hasInlinePragma(source: string, line: number, rule: PiiRuleId) {
  const lines = source.split("\n");
  const start = Math.max(0, line - 1 - PRAGMA_LOOKBACK);
  const window = lines.slice(start, line);

  for (let i = 0; i < window.length; i++) {
    const match = window[i].match(/\/\/\s*pii-allow:\s*(\S+)\s*[—-]*\s*(.*)$/);
    if (!match || match[1] !== rule) continue;
    const continuation = window
      .slice(i + 1)
      .filter((text) => /^\s*(\/\/|\*)/.test(text))
      .join(" ");
    if (`${match[2]} ${continuation}`.trim().length >= 3) return true;
  }
  return false;
}

/** Every finding, before the allowlist and inline pragmas are applied. */
export function collectPiiViolations(
  filePath: string,
  source: string,
): PiiViolation[] {
  const found: PiiViolation[] = [];
  const lines = source.split("\n");

  const push = (
    rule: PiiRuleId,
    line: number,
    snippet: string,
    message: string,
  ) => {
    found.push({
      rule,
      file: filePath,
      line,
      snippet: snippet.trim(),
      message,
    });
  };

  // 1 — legalName used as a display fallback.
  lines.forEach((text, i) => {
    if (DISPLAY_FALLBACK.test(text)) {
      push(
        "pii/display-name-fallback",
        i + 1,
        text,
        "Legal names are collected for payment and compliance only. Use resolveDisplayName() from @/lib/display-name for anything a human reads.",
      );
    }
  });

  // 2 — legalName anywhere inside an email template.
  if (filePath.startsWith("src/emails/")) {
    lines.forEach((text, i) => {
      if (/\blegalName\b/.test(text)) {
        push(
          "pii/legal-name-in-email-template",
          i + 1,
          text,
          "Email templates take a userName prop. Whether that is a display or legal name is the caller's decision, made once in src/lib/user-contact.ts.",
        );
      }
    });
  }

  // 3 — legalName fed into an email template's userName prop.
  lines.forEach((text, i) => {
    const window = lines
      .slice(i, i + 4)
      .join(" ")
      .replace(/\s+/g, " ");
    if (EMAIL_PROP.test(window) && /userName\s*:/.test(text)) {
      push(
        "pii/legal-name-in-email-prop",
        i + 1,
        text,
        "Pass resolveDisplayName({ profile }) as userName, not the legal name.",
      );
    }
  });

  // 4 — legalName reaching a Linear write. Argument-scoped, not file-scoped:
  // ppt-eligibility.ts holds both createComment() calls and unrelated
  // .legalName reads, so a file-level rule would fire on the wrong lines.
  LINEAR_WRITE.lastIndex = 0;
  let call: RegExpExecArray | null = LINEAR_WRITE.exec(source);
  while (call !== null) {
    const open = source.indexOf("(", call.index);
    if (open !== -1) {
      const args = sliceCallArgs(source, open);
      if (/\blegalName\b/.test(args)) {
        push(
          "pii/legal-name-to-linear",
          lineOf(source, call.index),
          call[0],
          "Linear is a third party outside DevHub's retention control — a name written there cannot be taken back. Drop it, or use resolveDisplayName().",
        );
      }
    }
    call = LINEAR_WRITE.exec(source);
  }

  // 5/6 — "use server" export hygiene.
  if (isUseServer(source)) {
    const adminModule = filePath.includes("/admin/");
    const exportRe =
      /^export\s+(?:async\s+)?(function|const|let|var|class)\s+(\w+)/gm;
    let match: RegExpExecArray | null = exportRe.exec(source);
    while (match !== null) {
      const [text, kind, name] = match;
      const line = lineOf(source, match.index);
      const isAsyncFn = /^export\s+async\s+function\b/.test(text);

      if (!isAsyncFn) {
        push(
          "pii/non-async-server-action-export",
          line,
          text,
          `"${name}" is a ${kind} export from a "use server" module. Next.js requires every export to be an async function — a plain export silently strips the module of ALL its exports. Move it to a non-"use server" module.`,
        );
      } else {
        const body = sliceFunctionBody(source, match.index);
        const guarded = adminModule
          ? /\b(requireAdmin|requireAdminPage)\s*\(/.test(body)
          : /\b(requireAdmin|requireAdminPage|getSession)\s*\(/.test(body);
        if (!guarded) {
          push(
            "pii/unguarded-server-action",
            line,
            text,
            `"${name}" is a public HTTP endpoint. Add requireAdmin() — or, if it is an internal helper, move it to src/lib/ so Next never compiles it into an endpoint.`,
          );
        }
      }
      match = exportRe.exec(source);
    }
  }

  // 7 — payment rails named in a client component.
  if (isUseClient(source)) {
    lines.forEach((text, i) => {
      if (BANK_FIELDS.test(text)) {
        push(
          "pii/bank-field-in-client-component",
          i + 1,
          text,
          "Payment rails should not cross into a client bundle. If this is genuinely required, add a reviewed PII_ALLOWLIST entry.",
        );
      }
    });
  }

  return found;
}

/** Findings that survive the allowlist and any inline pragmas. */
export function checkPiiRules(
  filePath: string,
  source: string,
): PiiViolation[] {
  return collectPiiViolations(filePath, source).filter(
    (violation) =>
      !PII_ALLOWLIST.some(
        (entry) => entry.rule === violation.rule && entry.file === filePath,
      ) && !hasInlinePragma(source, violation.line, violation.rule),
  );
}

/**
 * Which allowlist entries actually suppressed something in this file. The CLI
 * fails on entries that never fire: an allowlist nobody re-justifies decays
 * into a list of exemptions no one can explain.
 */
export function allowlistHitsFor(
  filePath: string,
  source: string,
): PiiAllowEntry[] {
  const entries = PII_ALLOWLIST.filter((entry) => entry.file === filePath);
  if (entries.length === 0) return [];

  const raw = new Set(
    collectPiiViolations(filePath, source).map((violation) => violation.rule),
  );
  return entries.filter((entry) => raw.has(entry.rule));
}

export function formatPiiViolations(violations: PiiViolation[]): string {
  return violations
    .map(
      (v) =>
        `   ${v.file}:${v.line}  [${v.rule}]\n     ${v.snippet}\n     → ${v.message}`,
    )
    .join("\n\n");
}
