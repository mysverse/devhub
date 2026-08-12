import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isInTransactionScope,
  isTransientDatabaseError,
  RETRYABLE_READ_OPERATIONS,
  retryDelayMs,
  runInTransactionScope,
  transientErrorCode,
  withTransientRetry,
} from "./prisma-retry";

/**
 * The production failure this module exists for, verbatim: an admin pressed
 * "Mark as Paid" on 2026-08-12 and two of that request's queries came back as
 * Cloudflare error 1102. Note `retryable: false` in the payload — we retry
 * anyway, and this fixture is the reason (see the comment in prisma-retry.ts).
 */
function workerExceededResources() {
  return Object.assign(
    new Error("Invalid `prisma.notification.findUnique()`"),
    {
      name: "PrismaClientKnownRequestError",
      code: "P6000",
      clientVersion: "7.9.1",
      meta: {
        modelName: "Notification",
        title: "Error 1102: Worker exceeded resource limits",
        status: 503,
        error_code: 1102,
        error_name: "worker_exceeded_resources",
        error_category: "worker",
        cloudflare_error: true,
        retryable: false,
        owner_action_required: true,
        what_you_should_do: "**Do not retry.**",
      },
    },
  );
}

test("the production error 1102 payload is transient", () => {
  assert.equal(isTransientDatabaseError(workerExceededResources()), true);
  assert.equal(transientErrorCode(workerExceededResources()), "P6000");
});

test("a 503 from Accelerate is transient even without a known code", () => {
  assert.equal(isTransientDatabaseError({ meta: { status: 503 } }), true);
  assert.equal(isTransientDatabaseError({ meta: { status: 429 } }), true);
});

test("connection and transport failures are transient", () => {
  assert.equal(isTransientDatabaseError({ code: "P1017" }), true);
  assert.equal(
    isTransientDatabaseError(
      Object.assign(new Error("fetch failed"), {
        cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
      }),
    ),
    true,
  );
  assert.equal(
    isTransientDatabaseError({ name: "PrismaClientInitializationError" }),
    true,
  );
});

test("deterministic Accelerate failures are not retried", () => {
  // Too large stays too large; a plan limit stays reached. Retrying these
  // spends the caller's latency budget to arrive at the same answer.
  assert.equal(isTransientDatabaseError({ code: "P6009" }), false);
  assert.equal(
    isTransientDatabaseError({ code: "P6003", meta: { status: 429 } }),
    false,
  );
  assert.equal(isTransientDatabaseError({ code: "P6002" }), false);
});

test("application errors are left to their call sites", () => {
  assert.equal(isTransientDatabaseError({ code: "P2002" }), false);
  assert.equal(isTransientDatabaseError({ code: "P2025" }), false);
  assert.equal(isTransientDatabaseError(new Error("boom")), false);
  assert.equal(isTransientDatabaseError(null), false);
  assert.equal(isTransientDatabaseError("P6000"), false);
});

test("writes are never in the auto-retry set", () => {
  for (const operation of ["create", "update", "delete", "upsert"]) {
    assert.equal(RETRYABLE_READ_OPERATIONS.has(operation), false);
  }
  for (const operation of ["findUnique", "findMany", "count", "groupBy"]) {
    assert.equal(RETRYABLE_READ_OPERATIONS.has(operation), true);
  }
});

test("a transient failure is retried until it succeeds", async () => {
  const delays: number[] = [];
  let calls = 0;

  const result = await withTransientRetry(
    async () => {
      calls++;
      if (calls < 3) throw workerExceededResources();
      return "ok";
    },
    { sleep: async (ms) => void delays.push(ms), random: () => 0.5 },
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
  // Backoff grows: 120ms then 360ms at the midpoint of the jitter window.
  assert.deepEqual(delays, [120, 360]);
});

test("a transient failure that never clears rethrows after the last attempt", async () => {
  let calls = 0;

  await assert.rejects(
    withTransientRetry(
      async () => {
        calls++;
        throw workerExceededResources();
      },
      { sleep: async () => {}, random: () => 0.5 },
    ),
    (error: unknown) => transientErrorCode(error) === "P6000",
  );

  assert.equal(calls, 3);
});

test("a non-transient failure is rethrown immediately", async () => {
  let calls = 0;

  await assert.rejects(
    withTransientRetry(
      async () => {
        calls++;
        throw Object.assign(new Error("duplicate"), { code: "P2002" });
      },
      { sleep: async () => {} },
    ),
    /duplicate/,
  );

  assert.equal(calls, 1);
});

test("transaction scope is set for the whole callback and does not leak", async () => {
  // Guards the reason retries are skipped inside an interactive transaction:
  // the backoff would sleep while the transaction holds its locks and burns
  // its 5s deadline. The scope has to survive an await — the operations it
  // covers are all awaited — and has to be gone afterwards, or every later
  // read on that request silently loses its retry.
  assert.equal(isInTransactionScope(), false);

  await runInTransactionScope(async () => {
    assert.equal(isInTransactionScope(), true);
    await Promise.resolve();
    assert.equal(isInTransactionScope(), true);
  });

  assert.equal(isInTransactionScope(), false);
});

test("a transient failure inside a transaction scope is still classified", () => {
  // The skip is a policy decision made by the caller, not a property of the
  // error — withTransientRetry() itself stays scope-agnostic and testable.
  runInTransactionScope(() => {
    assert.equal(isTransientDatabaseError(workerExceededResources()), true);
  });
});

test("jitter stays within ±25% of the backoff", () => {
  assert.equal(
    retryDelayMs(1, 120, () => 0),
    90,
  );
  assert.equal(
    retryDelayMs(1, 120, () => 1),
    150,
  );
  assert.equal(
    retryDelayMs(2, 120, () => 0),
    270,
  );
  assert.equal(
    retryDelayMs(2, 120, () => 1),
    450,
  );
});
