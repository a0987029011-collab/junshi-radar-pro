import assert from "node:assert/strict";
import test from "node:test";
import { makeMockCandles } from "../lib/mock-data.ts";
import { getOfficialSampleCandles } from "../lib/official-sample-data.ts";
import { calculateDpo, DPO_PERIOD } from "../lib/indicators.ts";
import { fitDescendingTrendline } from "../lib/scanner-engine.ts";

test("mock chart final close matches the displayed quote", () => {
  for (const timeframe of ["day", "week", "month"]) {
    const candles = makeMockCandles("2603", timeframe, 201.5);
    assert.equal(candles.at(-1).close, 201.5);
  }
});

test("descending trendline anchors to detected swing highs", () => {
  const highs = [10, 12, 10, 9, 11, 9, 8, 10, 8, 7];
  const candles = highs.map((high, index) => ({
    time: `${index}`,
    open: high - 1,
    high,
    low: high - 2,
    close: high - 1,
    volume: 1000,
    macd: 0,
    signal: 0,
    histogram: 0,
    dpo: 0
  }));

  const line = fitDescendingTrendline(candles, 2);
  assert.ok(line);
  assert.ok(line.slope < 0);
  assert.ok(line.touchIndexes.length >= 2);
  for (const index of [line.touchIndexes[0], line.touchIndexes.at(-1)]) {
    const fittedPrice = line.intercept + line.slope * index;
    assert.ok(Math.abs(fittedPrice - candles[index].high) < 1e-9);
  }
});

test("Evergreen adjusted chart removes the 16 dollar ex-dividend gap", () => {
  const adjusted = getOfficialSampleCandles("2603", "day", "adjusted");
  const raw = getOfficialSampleCandles("2603", "day", "raw");
  assert.ok(adjusted);
  assert.ok(raw);
  assert.equal(adjusted.at(-1).time, "2026-07-29");
  assert.equal(adjusted.at(-1).close, 201.5);
  assert.equal(adjusted.at(-1).high, 205.5);
  assert.equal(adjusted.at(-1).low, 198);

  const rawPreEx = raw.find((candle) => candle.time === "2026-06-16");
  const adjustedPreEx = adjusted.find(
    (candle) => candle.time === "2026-06-16"
  );
  const adjustedExDate = adjusted.find(
    (candle) => candle.time === "2026-06-17"
  );
  assert.equal(rawPreEx.close, 220.5);
  assert.equal(adjustedPreEx.close, 204.5);
  assert.equal(adjustedExDate.close, 194);

  const rawPeak = raw.find((candle) => candle.time === "2026-06-03");
  const adjustedPeak = adjusted.find(
    (candle) => candle.time === "2026-06-03"
  );
  assert.equal(rawPeak.high, 242.5);
  assert.ok(Math.abs(adjustedPeak.high - 224.90362811791383) < 1e-9);

  const line = fitDescendingTrendline(adjusted, 2);
  assert.ok(line);
  for (const index of [line.touchIndexes[0], line.touchIndexes.at(-1)]) {
    const fittedPrice = line.intercept + line.slope * index;
    assert.ok(Math.abs(fittedPrice - adjusted[index].high) < 1e-9);
  }
});

test("CM_Ult_MacD_MTF signal line uses a 9-period simple average", () => {
  const candles = getOfficialSampleCandles("2603", "day", "adjusted");
  assert.ok(candles);
  const expectedSignal =
    candles
      .slice(-9)
      .reduce((total, candle) => total + candle.macd, 0) / 9;
  assert.ok(Math.abs(candles.at(-1).signal - expectedSignal) < 1e-12);
  assert.ok(
    Math.abs(
      candles.at(-1).histogram -
        (candles.at(-1).macd - candles.at(-1).signal)
    ) < 1e-12
  );
});

test("DPO matches TradingView's built-in 21-period non-centered formula", () => {
  const closes = Array.from({ length: 40 }, (_, index) => index + 1);
  const dpo = calculateDpo(closes);
  const barsBack = Math.floor(DPO_PERIOD / 2) + 1;
  const firstValidIndex = DPO_PERIOD - 1 + barsBack;

  assert.equal(DPO_PERIOD, 21);
  assert.ok(Number.isNaN(dpo[firstValidIndex - 1]));
  assert.equal(dpo[firstValidIndex], 21);
});
