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
  assert.deepEqual(
    new Set(verifiedCandidates.map((candidate) => candidate.exchange)),
    new Set(["TWSE", "TPEx"])
  );

  for (const candidate of verifiedCandidates) {
    assert.equal(candidate.dataAsOf, marketSnapshotMeta.dataAsOf);
    assert.ok(candidate.averageVolumeLots >= 1000);
    assert.ok(candidate.paidInCapitalBillion >= 20);
    assert.ok(classifications.has(candidate.classification));
    assert.ok(candidate.score >= 0 && candidate.score <= 100);
    assert.ok(candidate.structureScore >= 0 && candidate.structureScore <= 20);
    assert.ok(candidate.profitPlan);
    assert.ok(candidate.monthlyStructure);
    assert.ok(candidate.deepScanScore >= 0 && candidate.deepScanScore <= 100);
    assert.ok(
      candidate.profitPlan.entryZoneLow <= candidate.profitPlan.entryZoneHigh
    );
    assert.ok(
      candidate.profitPlan.stopLoss <= candidate.profitPlan.entryZoneHigh
    );
    assert.ok(
      candidate.monthlyStructure.score >= 0 &&
        candidate.monthlyStructure.score <= 100
    );
    assert.equal(candidate.signals.chipStructure, 0);
    assert.equal(candidate.signals.chipStructureStable, false);
  }
});

test("long-cycle monthly watches keep support and do not claim a major breakout", () => {
  const watches = verifiedCandidates.filter(
    (candidate) => candidate.monthlyStructure?.longCycleWatch
  );
  assert.ok(watches.length > 0);
  for (const candidate of watches) {
    const structure = candidate.monthlyStructure;
    assert.equal(structure.state, "long-cycle-watch");
    assert.equal(structure.supportHeld, true);
    assert.equal(structure.histogramContracting, true);
    assert.equal(structure.majorTrendBroken, false);
    assert.ok(structure.keySupport > 0);
    assert.ok(structure.majorTrendline);
  }

  const runLong = verifiedCandidates.find(
    (candidate) => candidate.symbol === "1808"
  );
  assert.equal(runLong.monthlyStructure.longCycleWatch, true);
  assert.equal(runLong.monthlyStructure.keySupport, 28.5);
  assert.equal(runLong.monthlyStructure.priorKeySupport, 46.95);
  assert.equal(runLong.monthlyStructure.targetZoneLow, 40.25);
  assert.equal(runLong.monthlyStructure.targetZoneHigh, 41.65);
  assert.equal(runLong.monthlyStructure.majorTrendline.startTime, "2024-03");
  assert.equal(runLong.monthlyStructure.majorTrendline.endTime, "2024-09");
});

test("deep profit-zone candidates expose an auditable range", () => {
  const deepCandidates = verifiedCandidates.filter(
    (candidate) => candidate.profitPlan?.isClear
  );
  assert.ok(deepCandidates.length > 0);

  for (const candidate of deepCandidates) {
    const plan = candidate.profitPlan;
    assert.equal(plan.phase, "entry-ready");
    assert.ok(plan.profitZoneLow > plan.entryZoneHigh);
    assert.ok(plan.profitZoneHigh > plan.profitZoneLow);
    assert.ok(plan.lowRiskReward >= 1.5);
    assert.ok(plan.highRiskReward >= 2);
    assert.ok(plan.potentialLowPercent >= 5);
    assert.ok(["bearish-engulfing", "swing-high-clusters"].includes(plan.source));
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
