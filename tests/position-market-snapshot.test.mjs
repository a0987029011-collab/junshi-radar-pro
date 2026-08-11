import assert from "node:assert/strict";
import test from "node:test";
import { buildPositionMarketSnapshot } from "../lib/position-market-snapshot.ts";

function candle(index) {
  const close = index + 1;
  return {
    time: `2026-06-${String(index + 1).padStart(2, "0")}`,
    open: close - 0.5,
    high: close + 1,
    low: close - 1,
    close,
    volume: 1_000,
    macd: index / 10,
    signal: index / 12,
    histogram: index === 39 ? -0.5 : -1,
    dpo: index === 39 ? -1 : -2,
  };
}

test("an entry snapshot captures MACD, DPO, volume, MA35 and its deduction value", () => {
  const candles = Array.from({ length: 40 }, (_, index) => candle(index));
  const snapshot = buildPositionMarketSnapshot(candles, 39);

  assert.equal(snapshot.dataDate, "2026-06-40");
  assert.equal(snapshot.macd.histogram, -0.5);
  assert.equal(snapshot.macd.state, "negative-weakening");
  assert.equal(snapshot.dpo.direction, "rising");
  assert.equal(snapshot.volume.average20, 1_000);
  assert.equal(snapshot.volume.ratioToAverage20, 1);
  assert.equal(snapshot.ma35.value, 23);
  assert.equal(snapshot.ma35.slope, 1);
  assert.equal(snapshot.ma35.deductionValue, 6);
  assert.equal(snapshot.ma35.deductionDate, "2026-06-06");
});
