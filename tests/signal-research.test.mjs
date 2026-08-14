import assert from "node:assert/strict";
import test from "node:test";
import {
  buildSignalOutcomes,
  buildTimeframeResearchSnapshot,
  summarizeSignalResearch,
} from "../lib/signal-research.ts";

function candle(index, overrides = {}) {
  const close = 100 + index;
  return {
    time: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: close - 1,
    high: close + 2,
    low: close - 2,
    close,
    volume: 1_000 + index * 10,
    macd: index / 10,
    signal: index / 12,
    histogram: index / 100,
    dpo: index / 5,
    ...overrides,
  };
}

test("research snapshot freezes candle, volume, indicators, MA and deduction values", () => {
  const candles = Array.from({ length: 70 }, (_, index) => candle(index));
  const snapshot = buildTimeframeResearchSnapshot(candles, 60, "day");

  assert.ok(snapshot);
  assert.equal(snapshot.dataDate, candles[60].time);
  assert.equal(snapshot.candlePattern, "紅 K 長上影");
  assert.equal(snapshot.dpo.direction, "rising");
  assert.equal(snapshot.macd.state, "positive-strengthening");
  assert.equal(snapshot.movingAverages.find((item) => item.period === 35)?.deductionValue, candles[26].close);
  assert.equal(snapshot.movingAverages.find((item) => item.period === 60)?.deductionValue, candles[1].close);
});

test("outcomes only mark a window eligible after all trading days exist", () => {
  const candles = [
    candle(0, { close: 100 }),
    candle(1, { high: 102, low: 98, close: 101 }),
    candle(2, { high: 106, low: 99, close: 104 }),
    candle(3, { high: 105, low: 97, close: 103 }),
    candle(4, { high: 108, low: 100, close: 107 }),
    candle(5, { high: 110, low: 102, close: 109 }),
  ];
  const outcomes = buildSignalOutcomes(candles, 0);

  assert.equal(outcomes[5].complete, true);
  assert.equal(outcomes[5].targetReached, true);
  assert.equal(outcomes[5].maxReturnPercent, 10);
  assert.equal(outcomes[20].complete, false);
  assert.equal(outcomes[20].targetReached, null);
  assert.equal(outcomes[20].closeReturnPercent, null);
});

test("summary excludes unfinished windows from the hit-rate denominator", () => {
  const matureOutcomes = buildSignalOutcomes(
    Array.from({ length: 70 }, (_, index) =>
      candle(index, { close: 100 + index, high: 101 + index, low: 99 }),
    ),
    0,
  );
  const monitoringOutcomes = buildSignalOutcomes(
    Array.from({ length: 4 }, (_, index) => candle(index)),
    0,
  );
  const summary = summarizeSignalResearch([
    {
      signalDate: "2026-01-01",
      status: "matured",
      macdSignalMode: "positive-rising",
      outcomes: matureOutcomes,
    },
    {
      signalDate: "2026-02-01",
      status: "monitoring",
      macdSignalMode: "negative-weakening",
      outcomes: monitoringOutcomes,
    },
  ]);

  assert.equal(summary.totalSamples, 2);
  assert.equal(summary.windows.find((item) => item.windowDays === 20)?.eligibleSamples, 1);
  assert.equal(summary.windows.find((item) => item.windowDays === 60)?.eligibleSamples, 1);
});
