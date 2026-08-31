import assert from "node:assert/strict";
import test from "node:test";
import {
  PAPER_RULES,
  advancePaperTradingState,
  createPaperTradingState,
} from "../lib/paper-trading.ts";
import { calculateBrokerCommission } from "../lib/position-transactions.ts";

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

test("after-hours paper entries fill at the signal close and stay within 10% of current equity", () => {
  const candidates = [candidate()];
  const initial = createPaperTradingState("2026-08-31T00:00:00.000Z");
  initial.account.cash = 600_000;
  initial.account.maximumEquity = 600_000;
  const filled = advancePaperTradingState(
    initial,
    candidates,
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T00:00:00.000Z",
  );
  assert.equal(filled.account.startingCash, 500_000);
  assert.equal(filled.orders.length, 1);
  assert.equal(filled.orders[0].status, "filled");
  const trade = filled.trades[0];
  assert.ok(trade);
  assert.equal(trade.entryDate, "2026-08-31");
  assert.equal(trade.entryPrice, 102);
  const grossCost = trade.entryPrice * trade.shares;
  assert.equal(
    trade.entryCommission,
    Math.round(
      calculateBrokerCommission(grossCost, PAPER_RULES.commissionDiscount) *
        10_000,
    ) / 10_000,
  );
  assert.equal(
    trade.totalCost,
    Math.round((grossCost + trade.entryCommission) * 10_000) / 10_000,
  );
  assert.ok(trade.totalCost <= 60_000);
  const nextGross = trade.entryPrice * (trade.shares + 1);
  assert.ok(
    nextGross +
      calculateBrokerCommission(nextGross, PAPER_RULES.commissionDiscount) >
      60_000,
  );
  assert.equal(PAPER_RULES.maximumAllocationPercent, 10);
  assert.equal(PAPER_RULES.targetNetReturnPercent, 10);
  assert.equal(PAPER_RULES.initialStopLossPercent, 10);
  assert.equal(PAPER_RULES.entrySlippagePercent, 0);
  assert.equal(PAPER_RULES.exitSlippagePercent, 0.1);
});

test("existing queued selections are reconciled once at their signal-day close", () => {
  const first = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    [candidate()],
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T00:00:00.000Z",
  );
  first.account.cash = 500_000;
  first.account.maximumEquity = 500_000;
  first.orders[0].status = "queued";
  first.orders[0].filledTradeId = null;
  first.trades = [];
  first.decisions[0].actionSummary = "挑選 1 檔，等待隔日開盤";

  const reconciled = advancePaperTradingState(
    first,
    [candidate()],
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T01:00:00.000Z",
  );
  assert.equal(reconciled.orders[0].status, "filled");
  assert.equal(reconciled.trades.length, 1);
  assert.equal(reconciled.trades[0].entryPrice, 102);
  assert.equal(reconciled.decisions.length, 1);
  assert.equal(
    reconciled.decisions[0].actionSummary,
    "規則更新：盤後假設成交 1 檔",
  );
  assert.equal(
    reconciled.decisions[0].strategyVersion,
    "paper-v1.1-after-hours-close",
  );
  assert.ok(
    reconciled.decisions[0].notes.includes(
      "規則變更前紀錄：挑選 1 檔，等待隔日開盤",
    ),
  );
});

test("a previously filled after-hours trade repairs an older waiting summary", () => {
  const filled = advancePaperTradingState(
    createPaperTradingState("2026-08-31T00:00:00.000Z"),
    [candidate()],
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T00:00:00.000Z",
  );
  filled.decisions[0].actionSummary = "挑選 1 檔，等待隔日開盤";

  const repaired = advancePaperTradingState(
    filled,
    [candidate()],
    [{ symbol: "1001", candles: [candle("2026-08-31")] }],
    "2026-08-31",
    "2026-08-31T01:00:00.000Z",
  );
  assert.equal(repaired.trades.length, 1);
  assert.equal(
    repaired.decisions[0].actionSummary,
    "規則更新：盤後假設成交 1 檔",
  );
  assert.ok(
    repaired.decisions[0].notes.some((note) =>
      note.includes("盤後以 102.00 元收盤價假設成交"),
    ),
  );
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
