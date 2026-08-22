import assert from "node:assert/strict";
import test from "node:test";
import { summarizeStrategySignalPoints } from "../lib/strategy-performance.ts";

function series({ high, low, length = 25 }) {
  return Array.from({ length }, (_, index) => ({
    date: String(index),
    open: 10,
    high: index === 0 ? 10 : high,
    low: index === 0 ? 10 : low,
    close: 10,
    volume: 100,
  }));
}

test("keeps trendline and reversal performance samples separate", () => {
  const winner = series({ high: 11.5, low: 9 });
  const miss = series({ high: 10.5, low: 8 });
  const trendline = summarizeStrategySignalPoints(
    "trendline-breakout",
    "下降趨勢線紅 K 穿越",
    [
      { candles: winner, signalIndex: 0 },
      { candles: miss, signalIndex: 0 },
    ],
  );
  const reversal = summarizeStrategySignalPoints("reversal", "轉勢訊號", [
    { candles: winner, signalIndex: 0 },
  ]);

  assert.equal(trendline.signalCount, 2);
  assert.equal(trendline.maturedSignalCount, 2);
  assert.equal(trendline.winRatePercent, 50);
  assert.equal(trendline.averageMaxGainPercent, 10);
  assert.equal(trendline.maximumDrawdownPercent, -20);
  assert.equal(reversal.signalCount, 1);
  assert.equal(reversal.winRatePercent, 100);
  assert.equal(reversal.maximumDrawdownPercent, -10);
});

test("does not count an unfinished 20-day outcome as a failed signal", () => {
  const candles = series({ high: 12, low: 9, length: 25 });
  const summary = summarizeStrategySignalPoints("reversal", "轉勢訊號", [
    { candles, signalIndex: 10 },
  ]);

  assert.equal(summary.signalCount, 1);
  assert.equal(summary.maturedSignalCount, 0);
  assert.equal(summary.winRatePercent, null);
  assert.equal(summary.averageMaxGainPercent, null);
  assert.equal(summary.maximumDrawdownPercent, null);
});
