import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketCandles,
  marketSnapshotMeta,
  verifiedCandidates,
  verifiedMarketSymbols
} from "../lib/market-data.ts";
import { scanMarket } from "../lib/scoring-engine.ts";

const classifications = new Set(["S", "A+", "A", "Seed", "Watch"]);

test("radar snapshot has one consistent market date and universe audit", () => {
  assert.match(marketSnapshotMeta.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(marketSnapshotMeta.generatedAt);
  assert.ok(marketSnapshotMeta.universeStats.discovered >= verifiedCandidates.length);
  assert.equal(verifiedMarketSymbols.length, verifiedCandidates.length);
  assert.ok(verifiedCandidates.length > 0);

  for (const candidate of verifiedCandidates) {
    assert.equal(candidate.dataAsOf, marketSnapshotMeta.dataAsOf);
    assert.ok(candidate.averageVolumeLots >= 1000);
    assert.ok(candidate.paidInCapitalBillion >= 20);
    assert.ok(classifications.has(candidate.classification));
    assert.ok(candidate.score >= 0 && candidate.score <= 100);
    assert.ok(candidate.structureScore >= 0 && candidate.structureScore <= 20);
    assert.equal(candidate.signals.chipStructure, 0);
    assert.equal(candidate.signals.chipStructureStable, false);
  }
});

test("every chart closes on the same price shown in the ranking", () => {
  for (const candidate of verifiedCandidates) {
    for (const timeframe of ["day", "week", "month"]) {
      const adjusted = getMarketCandles(
        candidate.symbol,
        timeframe,
        "adjusted"
      );
      const raw = getMarketCandles(candidate.symbol, timeframe, "raw");
      assert.ok(adjusted?.length);
      assert.ok(raw?.length);
      assert.equal(adjusted.at(-1).close, candidate.currentPrice);
      assert.equal(raw.at(-1).close, candidate.currentPrice);
      assert.ok(Number.isFinite(adjusted.at(-1).dpo));
    }
  }
});

test("automatic classifications respect the strategy guardrails", () => {
  for (const stock of scanMarket()) {
    if (stock.classification === "Seed") {
      assert.ok(stock.signals.dailyBreakout < 0.5);
      assert.equal(stock.signals.confirmedTrendlineBreakout, false);
    }
    if (stock.classification === "S") {
      assert.equal(stock.signals.chipStructureStable, true);
      assert.ok(stock.riskReward >= 2);
    }
  }
});
