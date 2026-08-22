import assert from "node:assert/strict";
import test from "node:test";
import {
  REVERSAL_SIGNAL_NAME,
  findDescendingStructures,
  scanReversalStructure,
  scoreReversalQuality,
} from "../lib/reversal-radar.ts";

function candle(index, open, high, low, close, volume = 100) {
  return {
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    open,
    high,
    low,
    close,
    volume,
  };
}

function descendingStructureCandles() {
  return [
    candle(0, 13, 14, 12, 13.5),
    candle(1, 14, 15, 13, 14.5),
    candle(2, 11, 11.5, 10, 10.5),
    candle(3, 12, 13, 11, 12.5),
    candle(4, 9, 10, 8, 8.5),
    candle(5, 8.5, 10, 8.3, 9.2),
  ];
}

test("recognizes lower highs and lower lows as an independent downtrend structure", () => {
  const { structures } = findDescendingStructures(descendingStructureCandles());

  assert.equal(structures.length, 1);
  assert.equal(structures[0].previousHigh.index, 1);
  assert.equal(structures[0].previousLow.index, 2);
  assert.equal(structures[0].lowerHigh.index, 3);
  assert.equal(structures[0].lastLow.index, 4);
  assert.ok(structures[0].line.slope < 0);
});

test("signals after the final low holds and a red candle crosses the descending line", () => {
  const candles = [
    ...descendingStructureCandles(),
    candle(6, 9.4, 11, 9.2, 10.8),
  ];
  const trace = scanReversalStructure(candles, {
    macdHistogram: [-1.4, -1.3, -1.2, -1.1, -0.8, -0.4, 0.2],
  });

  assert.equal(trace.signals.length, 1);
  assert.equal(trace.signals[0].name, REVERSAL_SIGNAL_NAME);
  assert.equal(trace.signals[0].breakoutType, "descending-line");
  assert.equal(trace.signals[0].lastLow.price, 8);
  assert.equal(trace.signals[0].lastLowHeld, true);
  assert.equal(trace.signals[0].redBreakoutCandle, true);
  assert.equal(trace.signals[0].heldTradingDays, 2);
});

test("a new lower low invalidates the setup before a later breakout", () => {
  const candles = [
    ...descendingStructureCandles(),
    candle(6, 8.4, 11, 7.5, 10.8),
    candle(7, 10, 12, 9.5, 11.5),
  ];
  const trace = scanReversalStructure(candles);

  assert.equal(trace.signals.length, 0);
  assert.equal(trace.activeSetup, undefined);
});

test("can trigger on the latest confirmed rebound high after the line was already crossed", () => {
  const candles = [
    ...descendingStructureCandles(),
    candle(6, 11, 11.2, 9.5, 10.5),
    candle(7, 10.2, 10.5, 9.4, 9.8),
    candle(8, 10, 11.5, 9.8, 11.3),
  ];
  const trace = scanReversalStructure(candles);

  assert.equal(trace.signals.length, 1);
  assert.equal(trace.signals[0].breakoutType, "rebound-high");
  assert.equal(trace.signals[0].reboundHigh.index, 6);
  assert.equal(trace.signals[0].reboundHigh.price, 11.2);
});

test("does not emit a long reversal signal from a bearish breakout candle", () => {
  const candles = [
    ...descendingStructureCandles(),
    candle(6, 11, 11.2, 9.2, 10.8),
  ];
  const trace = scanReversalStructure(candles);

  assert.equal(trace.signals.length, 0);
  assert.equal(trace.activeSetup?.lastLowHeld, true);
});

test("scores all five independent quality conditions without making them core gates", () => {
  const candles = Array.from({ length: 22 }, (_, index) =>
    candle(index, 9, 10, 8.5, 9.5, 100),
  );
  candles[18] = candle(18, 8.4, 9, 8, 8.6, 100);
  candles[19] = candle(19, 8.6, 9.2, 8.1, 9, 100);
  candles[20] = candle(20, 9, 9.5, 8.2, 9.3, 100);
  candles[21] = candle(21, 9.3, 10.5, 8.3, 10.2, 130);
  const histogram = Array(22).fill(-1.2);
  histogram[18] = -1;
  histogram[19] = -0.6;
  histogram[20] = -0.3;
  histogram[21] = 0.2;

  const quality = scoreReversalQuality(candles, histogram, 18, 21);

  assert.equal(quality.lastLowHeld, true);
  assert.equal(quality.macdWeakeningAfterLow, true);
  assert.equal(quality.macdBullishTurn, true);
  assert.equal(quality.redBreakoutCandle, true);
  assert.equal(quality.volumeExpanded, true);
  assert.equal(quality.volumeRatio, 1.3);
  assert.equal(quality.score, 100);
  assert.equal(quality.reasons.length, 5);
});

test("one final structural low emits at most one reversal notification", () => {
  const candles = [
    ...descendingStructureCandles(),
    candle(6, 9.4, 11, 9.2, 10.8),
    candle(7, 10.5, 12, 10, 11.8),
    candle(8, 11.5, 13, 11, 12.8),
  ];
  const trace = scanReversalStructure(candles);

  assert.equal(trace.signals.length, 1);
  assert.equal(new Set(trace.signals.map((signal) => signal.structureId)).size, 1);
});
