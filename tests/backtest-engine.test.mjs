import assert from "node:assert/strict";
import test from "node:test";
import {
  findUpwardCrosses,
  runWhiteLineBacktest
} from "../lib/backtest-engine.ts";

const stock = [10, 9, 11, 12, 13, 14].map((close, index) => ({
  date: `${index}`,
  close
}));
const inverse = [10, 10, 10, 9, 8, 7].map((close, index) => ({
  date: `${index}`,
  close
}));

test("finds normalized upward crosses", () => {
  assert.deepEqual(findUpwardCrosses(stock, inverse), [2]);
});

test("calculates forward event statistics", () => {
  const result = runWhiteLineBacktest(stock, inverse, [3], [0.2]);
  assert.equal(result[0].eventCount, 1);
  assert.equal(result[0].hitRate, 1);
  assert.ok(result[0].averageReturn > 0.2);
});
