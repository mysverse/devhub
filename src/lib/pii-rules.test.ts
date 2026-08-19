import assert from "node:assert/strict";
import { test } from "node:test";
import {
  checkPiiRules,
  collectPiiViolations,
  type PiiRuleId,
} from "./pii-rules";

function rules(file: string, source: string): PiiRuleId[] {
  return collectPiiViolations(file, source).map((v) => v.rule);
}

const ADMIN_PAGE = "src/app/dashboard/admin/page.tsx";
const ADMIN_ACTIONS = "src/app/dashboard/admin/email-actions.ts";
const DEV_ACTIONS = "src/app/dashboard/documents/actions.ts";

test("flags legalName used as a display fallback", () => {
  assert.deepEqual(
    rules(ADMIN_PAGE, `const n = user.legalName || user.user.name || "Dev";`),
    ["pii/display-name-fallback"],
  );
  assert.deepEqual(
    rules(ADMIN_PAGE, `const n = state?.user?.legalName ?? assigneeName;`),
    ["pii/display-name-fallback"],
  );
});

test("does not flag legalName normalized to null or an empty string", () => {
  // Carrying the legal name to a compliance surface is the point; the
  // anti-pattern is falling back FROM it to a different name.
  assert.deepEqual(
    rules(ADMIN_PAGE, `legalName: profile?.legalName ?? null,`),
    [],
  );
  assert.deepEqual(rules(ADMIN_PAGE, `recipientName: d.legalName ?? "",`), []);
  assert.deepEqual(
    rules(
      ADMIN_PAGE,
      `value={profile.bankAccountName || profile.legalName || ""}`,
    ),
    [],
  );
});

test("does not flag a bare legalName identifier or the company's own name", () => {
  assert.deepEqual(
    rules(ADMIN_PAGE, `label={\`I, \${legalName}, agree\`}`),
    [],
  );
  assert.deepEqual(
    rules("src/lib/config.ts", `legalName: "MYSverse Digital Ventures",`),
    [],
  );
});

test("flags legalName inside an email template", () => {
  assert.deepEqual(
    rules("src/emails/PaymentProcessed.tsx", `<Text>{legalName}</Text>`),
    ["pii/legal-name-in-email-template"],
  );
  assert.deepEqual(
    rules("src/emails/PaymentProcessed.tsx", `<Text>{userName}</Text>`),
    [],
  );
});

test("flags legalName passed as an email userName prop", () => {
  assert.deepEqual(
    rules(
      ADMIN_PAGE,
      `react: createElement(Blocked, {\n  userName:\n    state.user.legalName || "developer",\n});`,
    ).filter((r) => r === "pii/legal-name-in-email-prop"),
    ["pii/legal-name-in-email-prop"],
  );
});

test("flags legalName reaching a Linear write, argument-scoped", () => {
  assert.deepEqual(
    rules(
      ADMIN_PAGE,
      `await client.createComment({ body: u.legalName });`,
    ).filter((r) => r === "pii/legal-name-to-linear"),
    ["pii/legal-name-to-linear"],
  );

  // A file holding both a Linear write and an unrelated legalName read must
  // not trip the rule — this is why it is argument-scoped, not file-scoped.
  const mixed = `
    await client.createComment({ issueId, body: guidance });
    const forSlip = { legalName: profile.legalName };
  `;
  assert.equal(
    rules("src/lib/ppt-eligibility.ts", mixed).includes(
      "pii/legal-name-to-linear",
    ),
    false,
  );
});

test("flags an unguarded export in a use-server module", () => {
  assert.deepEqual(
    rules(
      ADMIN_ACTIONS,
      `"use server";\nexport async function leak(userId: string) {\n  return prisma.user.findUnique({ where: { id: userId } });\n}`,
    ),
    ["pii/unguarded-server-action"],
  );
});

test("accepts a guard behind object-typed params and a Promise return type", () => {
  // Both forms put a brace before the body; reading either as the body made
  // properly guarded actions look unguarded.
  assert.deepEqual(
    rules(
      DEV_ACTIONS,
      `"use server";\nexport async function ok(input: { a: string }) {\n  const { userId } = await getSession();\n  return userId;\n}`,
    ),
    [],
  );
  assert.deepEqual(
    rules(
      DEV_ACTIONS,
      `"use server";\nexport async function ok(\n  id: string,\n): Promise<{ error?: string }> {\n  const { userId } = await getSession();\n  return { };\n}`,
    ),
    [],
  );
});

test("admin modules require requireAdmin, not merely a session", () => {
  assert.deepEqual(
    rules(
      ADMIN_ACTIONS,
      `"use server";\nexport async function act(id: string) {\n  const { userId } = await getSession();\n  return userId;\n}`,
    ),
    ["pii/unguarded-server-action"],
  );
});

test("flags a non-async export from a use-server module", () => {
  // Next.js strips ALL exports from such a module, so this is a hard breakage
  // as well as a policy problem.
  assert.deepEqual(
    rules(
      ADMIN_ACTIONS,
      `"use server";\nexport const MARKER = "<!-- x -->";\nexport async function act() {\n  await requireAdmin();\n}`,
    ),
    ["pii/non-async-server-action-export"],
  );
});

test("ignores type exports in a use-server module", () => {
  assert.deepEqual(
    rules(
      ADMIN_ACTIONS,
      `"use server";\nexport type Target = { type: "open" };\nexport async function act() {\n  await requireAdmin();\n}`,
    ),
    [],
  );
});

test("flags payment rails named in a client component", () => {
  assert.deepEqual(
    rules(
      "src/app/dashboard/SomeCard.tsx",
      `"use client";\nconst x = tx.bankAccountNumber;`,
    ),
    ["pii/bank-field-in-client-component"],
  );
  assert.deepEqual(
    rules("src/app/dashboard/Server.tsx", `const x = tx.bankAccountNumber;`),
    [],
  );
});

/**
 * `\bduitNowId\b` silently missed every column added beside duitNowId: the
 * trailing word boundary fails against a following word character, so
 * duitNowIdType and its siblings could be rendered in a client component with
 * this guard staying green.
 */
test("flags the columns that sit beside duitNowId, not just duitNowId", () => {
  for (const field of [
    "duitNowId",
    "duitNowIdType",
    "duitNowIdStatus",
    "duitNowIdCheckedAt",
    "duitNowIdIssue",
  ]) {
    assert.deepEqual(
      rules(
        "src/app/dashboard/SomeCard.tsx",
        `"use client";\nconst x = profile.${field};`,
      ),
      ["pii/bank-field-in-client-component"],
      field,
    );
  }
});

test("an inline pragma suppresses, but only with a reason", () => {
  const withReason = `// pii-allow: pii/display-name-fallback — signature line of a legal agreement\nLEGAL_NAME: profile.legalName ?? "____",`;
  assert.deepEqual(checkPiiRules(ADMIN_PAGE, withReason), []);

  const bare = `// pii-allow: pii/display-name-fallback\nconst n = profile.legalName || user.name;`;
  assert.deepEqual(
    checkPiiRules(ADMIN_PAGE, bare).map((v) => v.rule),
    ["pii/display-name-fallback"],
  );

  const wrongRule = `// pii-allow: pii/legal-name-to-linear — unrelated\nconst n = profile.legalName || user.name;`;
  assert.deepEqual(
    checkPiiRules(ADMIN_PAGE, wrongRule).map((v) => v.rule),
    ["pii/display-name-fallback"],
  );
});

test("the allowlist suppresses only its own file and rule", () => {
  const source = `const n = data.legalName || "Not set";`;
  assert.deepEqual(
    checkPiiRules("src/lib/transaction-slip-pdf.ts", source),
    [],
  );
  assert.deepEqual(
    checkPiiRules("src/lib/somewhere-else.ts", source).map((v) => v.rule),
    ["pii/display-name-fallback"],
  );
});
