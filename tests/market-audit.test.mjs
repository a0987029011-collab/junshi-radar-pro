import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketCandles,
  marketSnapshotMeta,
  verifiedCandidates,
  verifiedMarketSymbols
} from "../lib/market-data.ts";
import { scanMarket } from "../lib/scoring-engine.ts";

const officialCloses = {
  "2002": 18.95,
  "2409": 23.65,
  "2603": 201.5,
  "2609": 50.1,
  "2610": 21.7,
  "2615": 85,
  "3037": 688
};

test("all seven candidates use the same verified 2026-07-29 snapshot", () => {
  assert.equal(marketSnapshotMeta.dataAsOf, "2026-07-29");
  assert.deepEqual([...verifiedMarketSymbols].sort(), Object.keys(officialCloses));
  for (const candidate of verifiedCandidates) {
    assert.equal(candidate.dataAsOf, marketSnapshotMeta.dataAsOf);
    assert.equal(candidate.currentPrice, officialCloses[candidate.symbol]);
    assert.ok(candidate.averageVolumeLots >= 1000);
    assert.ok(candidate.paidInCapitalBillion >= 20);
    assert.equal(candidate.signals.chipStructure, 0);
    assert.equal(candidate.signals.chipStructureStable, false);
  }
});

test("every chart closes on the same TWSE-verified price shown in ranking", () => {
  for (const candidate of verifiedCandidates) {
    for (const timeframe of ["day", "week", "month"]) {
      const candles = getMarketCandles(
        candidate.symbol,
        timeframe,
        "adjusted"
      );
      assert.ok(candles?.length);
      assert.equal(candles.at(-1).close, candidate.currentPrice);
    }
  }
});

test("TWSE no-trading dates from the current month are not retained", () => {
  for (const symbol of verifiedMarketSymbols) {
    const candles = getMarketCandles(symbol, "day", "adjusted");
    assert.equal(
      candles.some((candle) => candle.time === "2026-07-10"),
      false
    );
  }
});

test("DPO matches the user's TradingView values after date audit", () => {
  const evergreen = getMarketCandles("2603", "day", "adjusted");
  const yangMing = getMarketCandles("2609", "day", "adjusted");
  assert.ok(Math.abs(evergreen.at(-1).dpo - 8.944498434294331) < 1e-9);
  assert.ok(Math.abs(yangMing.at(-1).dpo - 0.7337991382898679) < 1e-9);
});

test("Seed classification is never assigned after a detected breakout", () => {
  for (const stock of scanMarket()) {
    if (stock.classification === "Seed") {
      assert.ok(stock.signals.dailyBreakout < 0.5);
    }
  }
});
