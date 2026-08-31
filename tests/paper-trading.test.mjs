import assert from "node:assert/strict";
import test from "node:test";
import {
  PAPER_RULES,
  advancePaperTradingState,
  createPaperTradingState,
} from "../lib/paper-trading.ts";

function snapshot(timeframe, overrides = {}) {
  return {
    timeframe,
    dataDate: "2026-08-31",
    open: 99,
    high: 103,
    low: 98,
    close: 102,
    changePercent: 3,
    candlePattern: "長紅 K",
    bodyPercentOfRange: 70,
    upperShadowPercentOfRange: 10,
    lowerShadowPercentOfRange: 20,
    volume: {
      value: 2_000,
      average20: 1_000,
      ratioToAverage20: 2,
      priceVolumeRelation: "price-up-volume-up",
    },
    movingAverages: [
      {
        period: 20,
        value: 100,
        slope: 1,
        priceDistancePercent: 2,
        deductionValue: 95,
        deductionDate: "2026-07-31",
      },
    ],
    macd: {
      value: 1,
      signal: 0.8,
      histogram: 0.2,
      state: "positive-strengthening",
    },
    dpo: { value: 2, direction: "rising" },
    ...overrides,
  };
}

function candidate(symbol = "1001", sector = "電子") {
  const emptyOutcome = (windowDays, targetReturnPercent) => ({
    windowDays,
    targetReturnPercent,
    observedDays: 0,
    complete: false,
    closeReturnPercent: null,
    maxReturnPercent: null,
    maxDrawdownPercent: null,
    targetReached: null,
  });
  return {
    observationKey: `${symbol}:2026-08-31:paper`,
    symbol,
    name: `測試股 ${symbol}`,
    market: "上市",
    sector,
    signalDate: "2026-08-31",
    signalName: "下降趨勢線紅 K 穿越",
    signalKind: "close-confirmed",
    breakoutType: "body-cross",
    macdSignalMode: "positive-rising",
    entryPrice: 102,
    linePrice: 98,
    snapshot: {
      day: snapshot("day"),
      week: snapshot("week"),
      month: snapshot("month"),
      recentK: {
        lookbackDays: 3,
        priorDownCloseCount: 1,
        priorDayWasDown: true,
        currentLongRed: true,
        currentVolumeRatio20: 2,
        macdPositiveRising: true,
        macdHistogramReexpanded: true,
        dpoTurnedUp: true,
        autonomousPattern: "bullish-pullback-volume-breakout",
      },
    },
    outcomes: {
      5: emptyOutcome(5, 5),
      20: emptyOutcome(20, 10),
      60: emptyOutcome(60, 20),
    },
    status: "monitoring",
  };
}

function candle(time, { open = 100, high = 103, low = 98, close = 102, volume = 1_000, histogram = 1, dpo = 1 } = {}) {
  return { time, open, high, low, close, volume, macd: 1, signal: 0.5, histogram, dpo };
}

test("paper account starts at 500,000 and limits each entry to 10% of current equity", () => {
  const candidates = [candidate()];
  const queued = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    candidates,
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T00:00:00.000Z",
  );
  assert.equal(queued.account.startingCash, 500_000);
  assert.equal(queued.orders.length, 1);
  assert.equal(queued.orders[0].status, "queued");

  queued.account.cash = 600_000;
  queued.account.maximumEquity = 600_000;
  const filled = advancePaperTradingState(
    queued,
    candidates,
    [
      {
        symbol: "1001",
        candles: [
          candle("2026-08-31"),
          candle("2026-09-01", { open: 100, high: 103, low: 99, close: 102 }),
        ],
      },
    ],
    "2026-09-01",
    "2026-09-01T06:00:00.000Z",
  );
  const trade = filled.trades[0];
  assert.ok(trade);
  assert.ok(trade.entryPrice * trade.shares <= 60_000);
  assert.ok(trade.entryPrice * (trade.shares + 1) > 60_000);
  assert.equal(PAPER_RULES.maximumAllocationPercent, 10);
  assert.equal(PAPER_RULES.targetNetReturnPercent, 10);
  assert.equal(PAPER_RULES.initialStopLossPercent, 10);
});

test("same-day target and stop collision is conservatively recorded as stop-loss", () => {
  const candidates = [candidate()];
  const state = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    candidates,
    [
      {
        symbol: "1001",
        candles: [
          candle("2026-08-31"),
          candle("2026-09-01", { open: 100, high: 103, low: 99, close: 102 }),
          candle("2026-09-02", { open: 102, high: 120, low: 85, close: 110 }),
        ],
      },
    ],
    "2026-09-02",
    "2026-09-02T06:00:00.000Z",
  );
  assert.equal(state.trades[0].status, "closed");
  assert.equal(state.trades[0].exitReason, "stop-loss");
});

test("an early black candle closing below the previous low queues and executes an early stop", () => {
  const state = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    [candidate()],
    [
      {
        symbol: "1001",
        candles: [
          candle("2026-08-31"),
          candle("2026-09-01", { open: 100, high: 103, low: 99, close: 102 }),
          candle("2026-09-02", { open: 102, high: 103, low: 96, close: 98 }),
          candle("2026-09-03", { open: 97, high: 99, low: 96, close: 98 }),
        ],
      },
    ],
    "2026-09-03",
    "2026-09-03T06:00:00.000Z",
  );
  assert.equal(state.trades[0].status, "closed");
  assert.equal(state.trades[0].exitReason, "early-stop");
  assert.equal(state.trades[0].exitDate, "2026-09-03");
});

test("after a 5% advance, a bearish momentum fade queues an early-profit exit for next open", () => {
  const state = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    [candidate()],
    [
      {
        symbol: "1001",
        candles: [
          candle("2026-08-31"),
          candle("2026-09-01", { open: 100, high: 103, low: 99, close: 102, histogram: 1, dpo: 1 }),
          candle("2026-09-02", { open: 102, high: 108, low: 101, close: 106, volume: 1_000, histogram: 2, dpo: 2 }),
          candle("2026-09-03", { open: 106, high: 107, low: 103, close: 104, volume: 2_000, histogram: 1, dpo: 1 }),
          candle("2026-09-04", { open: 104, high: 105, low: 102, close: 103 }),
        ],
      },
    ],
    "2026-09-04",
    "2026-09-04T06:00:00.000Z",
  );
  assert.equal(state.trades[0].status, "closed");
  assert.equal(state.trades[0].exitReason, "early-profit");
  assert.equal(state.trades[0].exitDate, "2026-09-04");
});
