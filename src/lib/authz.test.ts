import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ADMIN_ACCESS_WHERE,
  ADMIN_DEVELOPER_RANKS,
  hasAdminAccess,
} from "./developer-access";

test("role ADMIN grants access regardless of rank", () => {
  assert.equal(
    hasAdminAccess({ role: "ADMIN", developerRank: "PROBATIONARY_DEVELOPER" }),
    true,
  );
  assert.equal(hasAdminAccess({ role: "ADMIN", developerRank: null }), true);
});

test("council and head-developer ranks grant access without the ADMIN role", () => {
  assert.equal(
    hasAdminAccess({ role: "DEVELOPER", developerRank: "DEVELOPER_COUNCIL" }),
    true,
  );
  assert.equal(
    hasAdminAccess({ role: "DEVELOPER", developerRank: "HEAD_DEVELOPER" }),
    true,
  );
});

test("ordinary developers, missing ranks and null profiles are denied", () => {
  assert.equal(
    hasAdminAccess({ role: "DEVELOPER", developerRank: "SENIOR_DEVELOPER" }),
    false,
  );
  assert.equal(hasAdminAccess({ role: "DEVELOPER" }), false);
  assert.equal(
    hasAdminAccess({ role: "DEVELOPER", developerRank: null }),
    false,
  );
  assert.equal(hasAdminAccess(null), false);
});

/**
 * The valuable one. ADMIN_ACCESS_WHERE decides who RECEIVES admin
 * notifications; hasAdminAccess decides who may ACT. A rank added to one and
 * not the other silently splits those two populations apart.
 */
test("ADMIN_ACCESS_WHERE enumerates exactly the ranks hasAdminAccess accepts", () => {
  const clauses = ADMIN_ACCESS_WHERE.OR as
    | { role?: string; developerRank?: { in?: string[] } }[]
    | undefined;
  assert.ok(clauses, "ADMIN_ACCESS_WHERE should be an OR clause");

  const roleClause = clauses.find((c) => c.role);
  assert.equal(roleClause?.role, "ADMIN");

  const ranksInWhere = clauses.find((c) => c.developerRank)?.developerRank?.in;
  assert.ok(ranksInWhere, "ADMIN_ACCESS_WHERE should enumerate admin ranks");

  assert.deepEqual(
    [...ranksInWhere].sort(),
    [...ADMIN_DEVELOPER_RANKS].sort(),
    "ADMIN_ACCESS_WHERE ranks must match ADMIN_DEVELOPER_RANKS, which is what hasAdminAccess() consults",
  );

  for (const rank of ranksInWhere) {
    assert.equal(
      hasAdminAccess({ role: "DEVELOPER", developerRank: rank }),
      true,
      `${rank} receives admin notifications but cannot act`,
    );
  }
});
