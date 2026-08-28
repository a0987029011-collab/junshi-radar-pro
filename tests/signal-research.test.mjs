import assert from "node:assert/strict";
import test from "node:test";
import {
  AUTONOMOUS_FILTER_KEY,
  buildNoLookAheadTimeframeCandles,
  buildRecentKResearchSnapshot,
  buildSignalOutcomes,
  buildTimeframeResearchSnapshot,
  deriveHighConfidenceSignalReview,
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

test("week and month research candles exclude prices and volume after the signal date", () => {
  const aggregate = [
    candle(0, { time: "2026-07-01", close: 90 }),
    candle(1, {
      time: "2026-08-01",
      open: 100,
      high: 999,
      low: 80,
      close: 500,
      volume: 9_999,
    }),
  ];
  const daily = [
    candle(0, {
      time: "2026-08-03",
      open: 100,
      high: 108,
      low: 98,
      close: 105,
      volume: 1_000,
    }),
    candle(1, {
      time: "2026-08-24",
      open: 105,
      high: 115,
      low: 103,
      close: 110,
      volume: 2_000,
    }),
    candle(2, {
      time: "2026-08-28",
      open: 110,
      high: 999,
      low: 109,
      close: 500,
      volume: 9_999,
    }),
  ];
  const rebuilt = buildNoLookAheadTimeframeCandles(
    aggregate,
    daily,
    "2026-08-24",
    "month",
  );
  const current = rebuilt.at(-1);

  assert.equal(current.time, "2026-08-24");
  assert.equal(current.open, 100);
  assert.equal(current.high, 115);
  assert.equal(current.close, 110);
  assert.equal(current.volume, 3_000);
});

test("recent K research recognizes the tested pullback and volume breakout pattern", () => {
  const candles = Array.from({ length: 25 }, (_, index) =>
    candle(index, {
      time: `2026-02-${String(index + 1).padStart(2, "0")}`,
      close: 100 + index,
      volume: 1_000,
    }),
  );
  candles[22] = candle(22, { close: 120, volume: 1_000 });
  candles[23] = candle(23, { open: 118, high: 119, low: 115, close: 116, volume: 800 });
  candles[24] = candle(24, {
    open: 116,
    high: 132,
    low: 115,
    close: 130,
    volume: 4_000,
    histogram: 1.2,
    dpo: 4,
  });
  const snapshot = buildRecentKResearchSnapshot(
    candles,
    24,
    "positive-rising",
  );

  assert.equal(snapshot.priorDayWasDown, true);
  assert.equal(snapshot.currentLongRed, true);
  assert.ok(snapshot.currentVolumeRatio20 >= 1.2);
  assert.equal(snapshot.autonomousPattern, AUTONOMOUS_FILTER_KEY);
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

function researchDate(index) {
  const date = new Date(Date.UTC(2025, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}

function researchOutcome(hit, complete = true) {
  const outcome = (windowDays, targetReturnPercent) => ({
    windowDays,
    targetReturnPercent,
    observedDays: complete ? windowDays : 0,
    complete,
    closeReturnPercent: complete ? (hit ? 12 : -3) : null,
    maxReturnPercent: complete ? (hit ? 15 : 4) : null,
    maxDrawdownPercent: complete ? -5 : null,
    targetReached: complete ? hit : null,
  });
  return {
    5: outcome(5, 5),
    20: outcome(20, 10),
    60: outcome(60, 20),
  };
}

function researchSnapshot(timeframe) {
  const snapshot = buildTimeframeResearchSnapshot(
    Array.from({ length: 70 }, (_, index) => candle(index)),
    60,
    timeframe,
  );
  assert.ok(snapshot);
  return snapshot;
}

function researchObservation(index, {
  hit,
  current = false,
  macdSignalMode = "positive-rising",
} = {}) {
  return {
    observationKey: `observation-${index}`,
    symbol: String(1000 + index),
    name: `測試股 ${index}`,
    market: "上市",
    sector: "測試",
    signalDate: current ? "2027-01-01" : researchDate(index),
    signalName: "下降趨勢線紅 K 穿越",
    signalKind: "close-confirmed",
    breakoutType: "gap-above",
    macdSignalMode,
    entryPrice: 100,
    linePrice: 99,
    snapshot: {
      month: researchSnapshot("month"),
      week: researchSnapshot("week"),
      day: researchSnapshot("day"),
    },
    outcomes: researchOutcome(Boolean(hit), !current),
    status: current ? "monitoring" : "matured",
  };
}

test("high-confidence review requires broad, recent and risk-controlled evidence", () => {
  const matching = Array.from({ length: 100 }, (_, index) =>
    researchObservation(index, {
      hit: index < 70 ? index < 53 : index < 93,
    }),
  );
  const baselineFailures = Array.from({ length: 100 }, (_, index) =>
    researchObservation(200 + index, {
      hit: false,
      macdSignalMode: "negative-weakening",
    }),
  );
  const current = researchObservation(999, { current: true });
  const review = deriveHighConfidenceSignalReview(
    [...matching, ...baselineFailures, current],
    "2027-01-01",
  );

  assert.equal(review.evaluatedSignals, 1);
  assert.equal(review.qualifiedSignals, 1);
  assert.equal(review.candidates[0].evidence.samples, 100);
  assert.equal(review.candidates[0].evidence.recentSamples, 30);
  assert.ok(review.candidates[0].evidence.hitRatePercent >= 70);
  assert.ok(review.candidates[0].evidence.recentHitRatePercent >= 60);
  assert.ok(review.candidates[0].evidence.wilsonLowerBoundPercent >= 65);
});

test("high-confidence review rejects a pattern whose recent results have faded", () => {
  const faded = Array.from({ length: 100 }, (_, index) =>
    researchObservation(index, {
      hit: index < 70 ? index < 60 : index < 85,
    }),
  );
  const baselineFailures = Array.from({ length: 100 }, (_, index) =>
    researchObservation(200 + index, {
      hit: false,
      macdSignalMode: "negative-weakening",
    }),
  );
  const current = researchObservation(999, { current: true });
  const review = deriveHighConfidenceSignalReview(
    [...faded, ...baselineFailures, current],
    "2027-01-01",
  );

  assert.equal(review.qualifiedSignals, 0);
});

test("an autonomous filter activates only after its combined evidence clears every gate", () => {
  const matching = Array.from({ length: 100 }, (_, index) => {
    const observation = researchObservation(index, {
      hit: index < 70 ? index < 53 : index < 93,
    });
    observation.breakoutType = index % 2 ? "body-cross" : "gap-above";
    observation.snapshot.recentK = {
      lookbackDays: 3,
      priorDownCloseCount: 1,
      priorDayWasDown: true,
      currentLongRed: true,
      currentVolumeRatio20: 1.5,
      macdPositiveRising: true,
      macdHistogramReexpanded: true,
      dpoTurnedUp: true,
      autonomousPattern: AUTONOMOUS_FILTER_KEY,
    };
    return observation;
  });
  const baselineFailures = Array.from({ length: 100 }, (_, index) =>
    researchObservation(200 + index, {
      hit: false,
      macdSignalMode: "negative-weakening",
    }),
  );
  const current = researchObservation(999, { current: true });
  current.breakoutType = "body-cross";
  current.snapshot.recentK = matching[0].snapshot.recentK;
  const review = deriveHighConfidenceSignalReview(
    [...matching, ...baselineFailures, current],
    "2027-01-01",
  );

  assert.equal(review.autonomousFilters[0].status, "active");
  assert.equal(review.autonomousFilters[0].evidence.samples, 100);
  assert.equal(review.qualifiedSignals, 1);
  assert.ok(
    review.candidates[0].logicLabels.includes(
      "自主驗證：多頭回檔後放量長紅",
    ),
  );
});
