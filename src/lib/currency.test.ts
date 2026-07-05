import assert from "node:assert/strict";
import { test } from "node:test";
import {
  complexityLevelToLinearEstimate,
  estimateToAmount,
  linearEstimateToComplexityLevel,
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
