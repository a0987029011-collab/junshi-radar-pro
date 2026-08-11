import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeTrendlineCorrectionInput,
  trendlineCorrectionKey,
} from "../lib/trendline-corrections.ts";

function validInput(overrides = {}) {
  return {
    symbol: "6142",
    timeframe: "day",
    adjustment: "adjusted",
    h1: { date: "2026-06-18", price: 42.5 },
    h2: { date: "2026-07-09", price: 38.2 },
    originalH1: { date: "2026-06-12", price: 43 },
    originalH2: { date: "2026-07-03", price: 39 },
    reason: "H2 應接觸另一根 K 棒",
    notes: "中間高點沒有形成有效壓力",
    submittedForLearning: true,
    ...overrides,
  };
}

test("normalizes a valid manual trendline correction", () => {
  assert.deepEqual(normalizeTrendlineCorrectionInput(validInput()), validInput());
});

test("requires a descending line with H1 before H2", () => {
  assert.throws(
    () => normalizeTrendlineCorrectionInput(validInput({
      h2: { date: "2026-07-09", price: 44 },
    })),
    /H1 必須高於 H2/,
  );
  assert.throws(
    () => normalizeTrendlineCorrectionInput(validInput({
      h2: { date: "2026-06-01", price: 38 },
    })),
    /H1 必須早於 H2/,
  );
});

test("separates corrections by owner, stock, timeframe and adjustment", () => {
  const dayAdjusted = trendlineCorrectionKey("user-1", "6142", "day", "adjusted");
  assert.notEqual(
    dayAdjusted,
    trendlineCorrectionKey("user-2", "6142", "day", "adjusted"),
  );
  assert.notEqual(
    dayAdjusted,
    trendlineCorrectionKey("user-1", "6142", "week", "adjusted"),
  );
  assert.notEqual(
    dayAdjusted,
    trendlineCorrectionKey("user-1", "1517", "day", "adjusted"),
  );
});
