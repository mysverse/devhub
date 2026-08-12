import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type FollowUpStep,
  followUpFailed,
  runBatch,
  runFollowUps,
} from "./fault-isolation";

function transient() {
  return Object.assign(new Error("worker exceeded resources"), {
    code: "P6000",
    meta: { status: 503 },
  });
}

test("every step runs, in order, when nothing fails", async () => {
  const order: string[] = [];
  const report = await runFollowUps("payout", [
    { name: "awards", run: async () => void order.push("awards") },
    { name: "achievement", run: async () => void order.push("achievement") },
    { name: "confirmation", run: async () => void order.push("confirmation") },
  ]);

  assert.deepEqual(order, ["awards", "achievement", "confirmation"]);
  assert.equal(report.ok, true);
  assert.deepEqual(report.failed, []);
  assert.equal(report.detail, null);
});

test("a failed step does not stop the ones after it", async () => {
  const order: string[] = [];
  const report = await runFollowUps("payout", [
    { name: "awards", run: async () => void order.push("awards") },
    {
      name: "confirmation",
      run: async () => {
        throw transient();
      },
    },
    { name: "activation", run: async () => void order.push("activation") },
  ]);

  assert.deepEqual(order, ["awards", "activation"]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failed, [{ name: "confirmation", code: "P6000" }]);
  assert.equal(report.detail, "confirmation (P6000)");
  assert.equal(followUpFailed(report, "confirmation"), true);
  assert.equal(followUpFailed(report, "awards"), false);
});

test("a step that throws synchronously is caught like any other", async () => {
  // The load-bearing case: `run: () => { throw ... }` never returns a promise,
  // so an `await` placed outside the try would let it escape and take down the
  // caller — which is the exact failure this module exists to prevent.
  const step: FollowUpStep = {
    name: "sync",
    run: (() => {
      throw transient();
    }) as () => Promise<unknown>,
  };

  const report = await runFollowUps("payout", [step]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failed, [{ name: "sync", code: "P6000" }]);
});

test("an onFailure hook that throws cannot break the contract", async () => {
  const report = await runFollowUps(
    "payout",
    [
      {
        name: "confirmation",
        run: async () => {
          throw transient();
        },
      },
      { name: "after", run: async () => {} },
    ],
    {
      onFailure: () => {
        throw new Error("the reporting hook is itself broken");
      },
    },
  );

  assert.equal(report.ok, false);
  assert.equal(report.failed.length, 1);
});

test("onFailure sees every failure with its label and code", async () => {
  const seen: string[] = [];
  await runFollowUps(
    "reject",
    [
      {
        name: "awards",
        run: async () => {
          throw transient();
        },
      },
      {
        name: "campaign",
        run: async () => {
          throw new Error("plain");
        },
      },
    ],
    { onFailure: (f) => seen.push(`${f.label}:${f.name}:${f.code}`) },
  );

  assert.deepEqual(seen, ["reject:awards:P6000", "reject:campaign:Error"]);
});

test("multiple failures are summarised for the UI", async () => {
  const boom = async () => {
    throw transient();
  };
  const report = await runFollowUps("payout", [
    { name: "a", run: boom },
    { name: "b", run: boom },
    { name: "c", run: boom },
  ]);

  assert.equal(report.detail, "a (P6000) and 2 more");
  assert.equal(report.failed.length, 3);
});

test("runFollowUps never rejects, whatever the steps do", async () => {
  await assert.doesNotReject(
    runFollowUps("payout", [
      {
        name: "throws-non-error",
        run: async () => {
          throw "a string";
        },
      },
      // biome-ignore lint/suspicious/noExplicitAny: deliberately malformed input
      { name: "returns-undefined", run: (() => undefined) as any },
    ]),
  );
});

test("runBatch isolates each item", async () => {
  const processed: number[] = [];
  const result = await runBatch({
    label: "sweep",
    items: [1, 2, 3, 4],
    identify: (n) => `item-${n}`,
    run: async (n) => {
      if (n === 2) throw transient();
      processed.push(n);
    },
  });

  assert.deepEqual(processed, [1, 3, 4]);
  assert.equal(result.scanned, 4);
  assert.equal(result.succeeded, 3);
  assert.equal(result.failed, 1);
  assert.equal(result.deferred, 0);
  assert.equal(result.scanTruncated, false);
});

test("runBatch defers past its work limit and says how many", async () => {
  const result = await runBatch({
    label: "sweep",
    items: [1, 2, 3, 4, 5],
    workLimit: 2,
    identify: String,
    run: async () => {},
  });

  assert.equal(result.scanned, 2);
  assert.equal(result.succeeded, 2);
  assert.equal(result.deferred, 3);
});

test("runBatch reports a truncated scan", async () => {
  // A bound that is invisible in the logs reads as "there was nothing else",
  // which is how a backlog hides.
  const full = await runBatch({
    label: "sweep",
    items: [1, 2, 3],
    scanLimit: 3,
    identify: String,
    run: async () => {},
  });
  assert.equal(full.scanTruncated, true);

  const partial = await runBatch({
    label: "sweep",
    items: [1, 2],
    scanLimit: 3,
    identify: String,
    run: async () => {},
  });
  assert.equal(partial.scanTruncated, false);
});

test("runBatch tallies named outcomes", async () => {
  const result = await runBatch<number, "resent" | "skipped">({
    label: "sweep",
    items: [1, 2, 3, 4],
    identify: String,
    run: async (n) => (n % 2 === 0 ? "resent" : "skipped"),
  });

  assert.deepEqual(result.outcomes, { resent: 2, skipped: 2 });
});

test("runBatch survives an identify() that throws", async () => {
  const result = await runBatch({
    label: "sweep",
    items: [1],
    identify: () => {
      throw new Error("bad identify");
    },
    run: async () => {
      throw transient();
    },
  });

  assert.equal(result.failed, 1);
});

test("runBatch on an empty list is a no-op", async () => {
  const result = await runBatch({
    label: "sweep",
    items: [],
    identify: String,
    run: async () => {
      throw new Error("must not run");
    },
  });

  assert.equal(result.scanned, 0);
  assert.equal(result.succeeded, 0);
  assert.equal(result.failed, 0);
});
