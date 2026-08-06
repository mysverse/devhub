import assert from "node:assert/strict";
import { test } from "node:test";
import {
  complexityLevelToLinearEstimate,
  estimateToAmount,
  linearEstimateToComplexityLevel,
  roundAmount,
} from "./currency";

test("Linear Fibonacci estimates normalize to DevHub complexity levels", () => {
  assert.equal(linearEstimateToComplexityLevel(1), 1);
  assert.equal(linearEstimateToComplexityLevel(2), 2);
  assert.equal(linearEstimateToComplexityLevel(3), 3);
  assert.equal(linearEstimateToComplexityLevel(5), 4);
  assert.equal(linearEstimateToComplexityLevel(8), 5);
});

test("DevHub complexity levels write back as Linear Fibonacci estimates", () => {
  assert.equal(complexityLevelToLinearEstimate(1), 1);
  assert.equal(complexityLevelToLinearEstimate(2), 2);
  assert.equal(complexityLevelToLinearEstimate(3), 3);
  assert.equal(complexityLevelToLinearEstimate(4), 5);
  assert.equal(complexityLevelToLinearEstimate(5), 8);
});

test("normalized complexity levels produce the intended PPT amounts", () => {
  assert.equal(estimateToAmount(4, "MYR"), 80);
  assert.equal(estimateToAmount(5, "MYR"), 100);
  assert.equal(estimateToAmount(4, "ROBUX"), 4800);
  assert.equal(estimateToAmount(5, "ROBUX"), 6000);
});

test("amounts are rounded to what each currency can disburse", () => {
  // FinSys takes whole Robux; Billplz takes cents.
  assert.equal(roundAmount(1800.4, "ROBUX"), 1800);
  assert.equal(roundAmount(1800.5, "ROBUX"), 1801);
  assert.equal(roundAmount(20.005, "MYR"), 20.01);
  assert.equal(roundAmount(20.004, "MYR"), 20);
});

test("rounding never yields a negative or non-finite payout", () => {
  assert.equal(roundAmount(-50, "MYR"), 0);
  assert.equal(roundAmount(-50, "ROBUX"), 0);
  assert.equal(roundAmount(Number.NaN, "MYR"), 0);
  assert.equal(roundAmount(Number.POSITIVE_INFINITY, "ROBUX"), 0);
});
