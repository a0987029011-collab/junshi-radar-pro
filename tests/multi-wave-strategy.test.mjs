import assert from "node:assert/strict";
import test from "node:test";
import { getTrendlineWaveStates } from "../lib/multi-wave-strategy.ts";

function candle(time, open, high, low, close) {
  return {
    time,
    open,
    high,
    low,
    close,
    volume: 100,
    macd: 0,
    signal: 0,
    histogram: 0,
    dpo: 0,
  };
}

function correction(id, h1Date, h1Price, h2Date, h2Price) {
  return {
    id,
    symbol: "2637",
    timeframe: "month",
    adjustment: "adjusted",
    h1: { date: h1Date, price: h1Price },
    h2: { date: h2Date, price: h2Price },
    originalH1: null,
    originalH2: null,
    reason: "H2 應接觸另一根 K 棒",
    notes: "",
    submittedForLearning: true,
    createdAt: "2026-08-12T00:00:00.000Z",
    updatedAt: "2026-08-12T00:00:00.000Z",
  };
}

const baseCandles = [
  candle("2024-01", 8, 10, 7, 8),
  candle("2024-02", 7, 9, 6, 7),
  candle("2024-03", 6, 8, 5, 6),
  candle("2024-04", 6.5, 8, 3, 7.5),
  candle("2024-05", 7, 9, 6, 7),
  candle("2024-06", 6, 8, 5.5, 6.5),
  candle("2024-07", 5.8, 7, 5.2, 6),
  candle("2024-08", 5.5, 7, 5, 6.5),
  candle("2024-09", 6, 7, 5.5, 6.2),
  candle("2024-10", 5.2, 6, 4.2, 5.5),
];

const corrections = [
  correction("wave-1", "2024-01", 10, "2024-03", 8),
  correction("wave-2", "2024-05", 9, "2024-07", 7),
];

test("keeps first and second waves as separate active structures", () => {
  const waves = getTrendlineWaveStates(baseCandles, corrections);
  assert.equal(waves.length, 2);
  assert.equal(waves[0].waveNumber, 1);
  assert.equal(waves[0].defense.price, 3);
  assert.equal(waves[0].status, "active");
  assert.equal(waves[1].waveNumber, 2);
  assert.equal(waves[1].defense.price, 5);
  assert.equal(waves[1].status, "active");
});

test("a second-wave failure does not erase an unbroken first wave", () => {
  const candles = baseCandles.map((item, index) =>
    index === 9 ? { ...item, close: 4.5 } : item,
  );
  const waves = getTrendlineWaveStates(candles, corrections);
  assert.equal(waves[0].status, "active");
  assert.equal(waves[1].status, "failed");
});

test("breaking the first-wave defense invalidates the whole cycle", () => {
  const candles = baseCandles.map((item, index) =>
    index === 8 ? { ...item, close: 2.5 } : item,
  );
  const waves = getTrendlineWaveStates(candles, corrections);
  assert.equal(waves[0].status, "failed");
  assert.equal(waves[1].status, "parent-invalid");
});
