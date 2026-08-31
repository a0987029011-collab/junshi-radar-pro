import {
  BROKER_COMMISSION_RATE,
  DEFAULT_COMMISSION_DISCOUNT,
  MINIMUM_COMMISSION,
  STOCK_TRANSACTION_TAX_RATE,
  calculateBrokerCommission,
  calculateTargetSalePrice,
  roundUpToTaiwanStockTick,
} from "./position-transactions.ts";
import type { SignalResearchObservation } from "./signal-research.ts";
import type { Candle } from "./types.ts";

export const PAPER_ACCOUNT_ID = "junshi-paper-account";
export const PAPER_STRATEGY_VERSION = "paper-v1.1-after-hours-close";
export const PAPER_TRADING_START_DATE = "2026-08-31";
export const PAPER_STARTING_CASH = 500_000;

export const PAPER_RULES = {
  maximumPositions: 3,
  maximumNewPositionsPerDay: 2,
  maximumAllocationPercent: 10,
  targetNetReturnPercent: 10,
  initialStopLossPercent: 10,
  earlyReviewProfitPercent: 5,
  earlyStopReviewDays: 5,
  maximumHoldingDays: 20,
  entrySlippagePercent: 0,
  exitSlippagePercent: 0.1,
  commissionDiscount: DEFAULT_COMMISSION_DISCOUNT,
  minimumSelectionScore: 70,
} as const;

export type PaperOrderStatus = "queued" | "filled" | "skipped";
export type PaperTradeStatus = "open" | "closed";
export type PaperExitReason =
  | "stop-loss"
  | "target"
  | "early-profit"
  | "early-stop"
  | "time-limit";

export interface PaperAccount {
  id: string;
  startingCash: number;
  cash: number;
  strategyVersion: string;
  lastProcessedDate: string | null;
  maximumEquity: number;
  maximumDrawdownPercent: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaperOrder {
  id: string;
  accountId: string;
  observationKey: string;
  symbol: string;
  name: string;
  sector: string;
  signalDate: string;
  status: PaperOrderStatus;
  selectionScore: number;
  selectionReasons: string[];
  strategyVersion: string;
  signalClose: number;
  linePrice: number;
  filledTradeId: string | null;
  skippedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaperTrade {
  id: string;
  accountId: string;
  orderId: string;
  symbol: string;
  name: string;
  sector: string;
  signalDate: string;
  entryDate: string;
  entryPrice: number;
  shares: number;
  entryCommission: number;
  totalCost: number;
  stopPrice: number;
  targetPrice: number;
  targetNetReturnPercent: number;
  status: PaperTradeStatus;
  exitDate: string | null;
  exitPrice: number | null;
  exitCommission: number | null;
  transactionTax: number | null;
  netSaleProceeds: number | null;
  exitReason: PaperExitReason | null;
  queuedExitReason: PaperExitReason | null;
  queuedExitSignalDate: string | null;
  realizedProfit: number | null;
  realizedReturnPercent: number | null;
  holdingDays: number;
  maximumFavorablePercent: number;
  maximumAdversePercent: number;
  selectionScore: number;
  selectionReasons: string[];
  strategyVersion: string;
  createdAt: string;
  updatedAt: string;
}

export interface PaperDailyDecision {
  id: string;
  accountId: string;
  marketDate: string;
  actionSummary: string;
  candidatesEvaluated: number;
  selectedOrderIds: string[];
  notes: string[];
  cash: number;
  equity: number;
  openPositions: number;
  queuedOrders: number;
  strategyVersion: string;
  createdAt: string;
}

export interface PaperTradingState {
  account: PaperAccount;
  orders: PaperOrder[];
  trades: PaperTrade[];
  decisions: PaperDailyDecision[];
}

export interface PaperMarketProfile {
  symbol: string;
  candles: Candle[];
}

export interface ScoredPaperCandidate {
  observation: SignalResearchObservation;
  score: number;
  reasons: string[];
}

export interface PaperTradingDashboard {
  dataAsOf: string;
  account: PaperAccount;
  currentEquity: number;
  totalReturnPercent: number;
  realizedProfit: number;
  unrealizedProfit: number;
  closedTrades: number;
  profitableTrades: number;
  winRatePercent: number | null;
  targetTrades: number;
  pendingOrders: PaperOrder[];
  openTrades: Array<PaperTrade & { currentPrice: number | null; unrealizedReturnPercent: number | null }>;
  history: PaperTrade[];
  decisions: PaperDailyDecision[];
  rules: typeof PAPER_RULES;
  readiness: {
    ready: false;
    label: string;
    reason: string;
  };
}

function nowIso(now: Date | string) {
  return typeof now === "string" ? now : now.toISOString();
}

function rounded(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function taiwanTick(price: number) {
  if (price < 10) return 0.01;
  if (price < 50) return 0.05;
  if (price < 100) return 0.1;
  if (price < 500) return 0.5;
  if (price < 1000) return 1;
  return 5;
}

function roundDownToTaiwanStockTick(price: number) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const tick = taiwanTick(price);
  return Number((Math.floor((price + 1e-9) / tick) * tick).toFixed(2));
}

function movingAverageDistance(
  observation: SignalResearchObservation,
  period: number,
) {
  return observation.snapshot.day?.movingAverages.find(
    (item) => item.period === period,
  )?.priceDistancePercent ?? null;
}

export function scorePaperCandidate(
  observation: SignalResearchObservation,
): ScoredPaperCandidate {
  const day = observation.snapshot.day;
  const week = observation.snapshot.week;
  const month = observation.snapshot.month;
  const reasons = ["收盤確認下降線突破"];
  let score = 20;

  if (observation.macdSignalMode === "positive-rising") {
    score += 18;
    reasons.push("日 MACD 零軸上雙線向上");
  } else if (observation.macdSignalMode === "negative-weakening") {
    score += 8;
    reasons.push("日 MACD 負柱縮短");
  }
  if (
    observation.snapshot.recentK?.autonomousPattern ===
    "bullish-pullback-volume-breakout"
  ) {
    score += 18;
    reasons.push("符合自主研究的回檔放量長紅");
  }
  if (day?.macd.state === "positive-strengthening") {
    score += 10;
    reasons.push("日 MACD 紅柱增強");
  } else if (day?.macd.state === "negative-weakening") {
    score += 7;
    reasons.push("日 MACD 空方動能衰退");
  }
  if (week?.dpo.direction === "rising") {
    score += 8;
    reasons.push("週 DPO 向上");
  } else if (week?.dpo.direction === "falling") {
    score -= 6;
  }
  if (month?.dpo.direction === "rising") {
    score += 8;
    reasons.push("月 DPO 向上");
  } else if (month?.dpo.direction === "falling") {
    score -= 6;
  }
  if ((day?.volume.ratioToAverage20 ?? 0) >= 1.2) {
    score += 8;
    reasons.push("突破量達 20 日均量 1.2 倍");
  }
  if ((day?.bodyPercentOfRange ?? 0) >= 50) {
    score += 6;
    reasons.push("突破紅 K 實體明確");
  }
  if (observation.breakoutType === "body-cross") {
    score += 4;
    reasons.push("紅 K 實體穿越下降線");
  }
  for (const [label, snapshot] of [
    ["週", week],
    ["月", month],
  ] as const) {
    if (snapshot?.macd.state === "positive-strengthening") {
      score += 6;
      reasons.push(`${label} MACD 動能增強`);
    } else if (snapshot?.macd.state === "negative-weakening") {
      score += 4;
      reasons.push(`${label} MACD 空方動能衰退`);
    } else if (snapshot?.macd.state === "negative-strengthening") {
      score -= 5;
    }
  }

  const ma20Distance = movingAverageDistance(observation, 20);
  if (ma20Distance !== null) {
    if (ma20Distance > 20) {
      score -= 15;
      reasons.push("風險：距日 MA20 過遠");
    } else if (ma20Distance > 12) {
      score -= 8;
      reasons.push("風險：短線已有延伸");
    } else if (ma20Distance >= -2) {
      score += 6;
      reasons.push("距日 MA20 尚未過度延伸");
    } else if (ma20Distance < -5) {
      score -= 4;
    }
  }
  if ((day?.changePercent ?? 0) > 9) {
    score -= 12;
    reasons.push("風險：訊號 K 漲幅過大");
  } else if ((day?.changePercent ?? 0) > 6) {
    score -= 6;
    reasons.push("風險：訊號 K 漲幅偏大");
  }
  if ((day?.volume.ratioToAverage20 ?? 0) > 4) {
    score -= 8;
    reasons.push("風險：爆量後追價");
  }

  return { observation, score: Math.max(0, Math.round(score)), reasons };
}

export function createPaperTradingState(
  now: Date | string = new Date(),
): PaperTradingState {
  const timestamp = nowIso(now);
  return {
    account: {
      id: PAPER_ACCOUNT_ID,
      startingCash: PAPER_STARTING_CASH,
      cash: PAPER_STARTING_CASH,
      strategyVersion: PAPER_STRATEGY_VERSION,
      lastProcessedDate: null,
      maximumEquity: PAPER_STARTING_CASH,
      maximumDrawdownPercent: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    },
    orders: [],
    trades: [],
    decisions: [],
  };
}

function candleByDate(profile: PaperMarketProfile | undefined, date: string) {
  return profile?.candles.find((candle) => candle.time === date) ?? null;
}

function latestCandleOnOrBefore(
  profile: PaperMarketProfile | undefined,
  date: string,
) {
  return profile?.candles.filter((candle) => candle.time <= date).at(-1) ?? null;
}

function currentEquity(
  account: PaperAccount,
  trades: PaperTrade[],
  profiles: Map<string, PaperMarketProfile>,
  date: string,
) {
  return trades
    .filter((trade) => trade.status === "open")
    .reduce((equity, trade) => {
      const candle = latestCandleOnOrBefore(profiles.get(trade.symbol), date);
      return equity + trade.shares * (candle?.close ?? trade.entryPrice);
    }, account.cash);
}

function exitTrade(
  trade: PaperTrade,
  marketPrice: number,
  date: string,
  reason: PaperExitReason,
  timestamp: string,
) {
  const slippage = PAPER_RULES.exitSlippagePercent / 100;
  const exitPrice = roundDownToTaiwanStockTick(marketPrice * (1 - slippage));
  const grossAmount = trade.shares * exitPrice;
  const exitCommission = calculateBrokerCommission(
    grossAmount,
    PAPER_RULES.commissionDiscount,
  );
  const transactionTax = grossAmount * STOCK_TRANSACTION_TAX_RATE;
  const netSaleProceeds = grossAmount - exitCommission - transactionTax;
  const realizedProfit = netSaleProceeds - trade.totalCost;
  return {
    ...trade,
    status: "closed" as const,
    exitDate: date,
    exitPrice,
    exitCommission: rounded(exitCommission),
    transactionTax: rounded(transactionTax),
    netSaleProceeds: rounded(netSaleProceeds),
    exitReason: reason,
    queuedExitReason: null,
    queuedExitSignalDate: null,
    realizedProfit: rounded(realizedProfit),
    realizedReturnPercent: rounded((realizedProfit / trade.totalCost) * 100),
    updatedAt: timestamp,
  };
}

function fillAfterHoursOrder(
  state: PaperTradingState,
  order: PaperOrder,
  profiles: Map<string, PaperMarketProfile>,
  timestamp: string,
  notes: string[],
) {
  const candle = candleByDate(profiles.get(order.symbol), order.signalDate);
  if (!candle) {
    notes.push(`${order.symbol} ${order.name} 缺少訊號日行情，保留待處理`);
    return false;
  }
  const openTrades = state.trades.filter((trade) => trade.status === "open");
  if (openTrades.length >= PAPER_RULES.maximumPositions) {
    order.status = "skipped";
    order.skippedReason = "模擬帳戶已達持股上限";
    order.updatedAt = timestamp;
    notes.push(`${order.symbol} 因持股上限取消進場`);
    return false;
  }

  const entryPrice = roundUpToTaiwanStockTick(candle.close);
  const equityBeforeEntry = currentEquity(
    state.account,
    state.trades,
    profiles,
    order.signalDate,
  );
  const allocationLimit =
    equityBeforeEntry * (PAPER_RULES.maximumAllocationPercent / 100);
  let shares = Math.max(0, Math.floor(allocationLimit / entryPrice));
  while (shares > 0) {
    const gross = shares * entryPrice;
    const commission = calculateBrokerCommission(
      gross,
      PAPER_RULES.commissionDiscount,
    );
    const totalCost = gross + commission;
    if (totalCost <= allocationLimit && totalCost <= state.account.cash) break;
    shares -= 1;
  }
  if (shares < 1) {
    order.status = "skipped";
    order.skippedReason = "依風險與現金上限無法配置至少 1 股";
    order.updatedAt = timestamp;
    notes.push(`${order.symbol} 因資金風險限制取消進場`);
    return false;
  }

  const grossAmount = shares * entryPrice;
  const entryCommission = calculateBrokerCommission(
    grossAmount,
    PAPER_RULES.commissionDiscount,
  );
  const totalCost = grossAmount + entryCommission;
  const targetExecutionPrice = calculateTargetSalePrice(
    shares,
    totalCost,
    PAPER_RULES.targetNetReturnPercent,
    PAPER_RULES.commissionDiscount,
  );
  const exitSlippage = PAPER_RULES.exitSlippagePercent / 100;
  const targetPrice = roundUpToTaiwanStockTick(
    targetExecutionPrice / (1 - exitSlippage),
  );
  const stopPrice = roundDownToTaiwanStockTick(
    entryPrice * (1 - PAPER_RULES.initialStopLossPercent / 100),
  );
  const tradeId = `paper-trade:${order.observationKey}`;
  const assumptionReason = "盤後資料完成後，以訊號日收盤價假設全部成交";
  const trade: PaperTrade = {
    id: tradeId,
    accountId: PAPER_ACCOUNT_ID,
    orderId: order.id,
    symbol: order.symbol,
    name: order.name,
    sector: order.sector,
    signalDate: order.signalDate,
    entryDate: order.signalDate,
    entryPrice,
    shares,
    entryCommission: rounded(entryCommission),
    totalCost: rounded(totalCost),
    stopPrice,
    targetPrice,
    targetNetReturnPercent: PAPER_RULES.targetNetReturnPercent,
    status: "open",
    exitDate: null,
    exitPrice: null,
    exitCommission: null,
    transactionTax: null,
    netSaleProceeds: null,
    exitReason: null,
    queuedExitReason: null,
    queuedExitSignalDate: null,
    realizedProfit: null,
    realizedReturnPercent: null,
    holdingDays: 0,
    maximumFavorablePercent: 0,
    maximumAdversePercent: 0,
    selectionScore: order.selectionScore,
    selectionReasons: order.selectionReasons.includes(assumptionReason)
      ? [...order.selectionReasons]
      : [...order.selectionReasons, assumptionReason],
    strategyVersion: PAPER_STRATEGY_VERSION,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  state.trades.push(trade);
  state.account.cash = rounded(state.account.cash - totalCost);
  state.account.strategyVersion = PAPER_STRATEGY_VERSION;
  state.account.updatedAt = timestamp;
  order.status = "filled";
  order.filledTradeId = tradeId;
  order.updatedAt = timestamp;
  notes.push(
    `${order.symbol} ${order.name} 盤後以 ${entryPrice.toFixed(2)} 元收盤價假設成交`,
  );
  return true;
}

function uniqueMarketDates(
  profiles: PaperMarketProfile[],
  afterDate: string | null,
  dataAsOf: string,
) {
  return [...new Set(profiles.flatMap((profile) => profile.candles.map((candle) => candle.time)))]
    .filter(
      (date) =>
        date >= PAPER_TRADING_START_DATE &&
        date <= dataAsOf &&
        (!afterDate || date > afterDate),
    )
    .sort();
}

export function advancePaperTradingState(
  current: PaperTradingState,
  candidates: SignalResearchObservation[],
  marketProfiles: PaperMarketProfile[],
  dataAsOf: string,
  now: Date | string = new Date(),
): PaperTradingState {
  const timestamp = nowIso(now);
  const state: PaperTradingState = {
    account: { ...current.account },
    orders: current.orders.map((order) => ({ ...order, selectionReasons: [...order.selectionReasons] })),
    trades: current.trades.map((trade) => ({ ...trade, selectionReasons: [...trade.selectionReasons] })),
    decisions: current.decisions.map((decision) => ({
      ...decision,
      selectedOrderIds: [...decision.selectedOrderIds],
      notes: [...decision.notes],
    })),
  };
  const profiles = new Map(marketProfiles.map((profile) => [profile.symbol, profile]));
  const marketDates = uniqueMarketDates(
    marketProfiles,
    state.account.lastProcessedDate,
    dataAsOf,
  );

  state.account.strategyVersion = PAPER_STRATEGY_VERSION;
  const legacyNotes: string[] = [];
  const legacyQueued = state.orders
    .filter(
      (order) =>
        order.status === "queued" &&
        Boolean(state.account.lastProcessedDate) &&
        order.signalDate <= (state.account.lastProcessedDate ?? ""),
    )
    .sort(
      (left, right) =>
        right.selectionScore - left.selectionScore ||
        left.createdAt.localeCompare(right.createdAt),
    );
  for (const order of legacyQueued) {
    fillAfterHoursOrder(state, order, profiles, timestamp, legacyNotes);
  }
  const legacyFilledOrders = legacyQueued.filter(
    (order) => order.status === "filled",
  );
  if (legacyFilledOrders.length) {
    const reconciliationDate = state.account.lastProcessedDate ?? dataAsOf;
    const equity = rounded(
      currentEquity(state.account, state.trades, profiles, reconciliationDate),
    );
    state.account.maximumEquity = Math.max(state.account.maximumEquity, equity);
    const drawdown =
      state.account.maximumEquity > 0
        ? ((equity - state.account.maximumEquity) /
            state.account.maximumEquity) *
          100
        : 0;
    state.account.maximumDrawdownPercent = Math.min(
      state.account.maximumDrawdownPercent,
      rounded(drawdown),
    );
    state.account.updatedAt = timestamp;
    const existingDecision = state.decisions.find(
      (decision) => decision.marketDate === reconciliationDate,
    );
    const priorSummary = existingDecision?.actionSummary ?? null;
    const reconciledDecision: PaperDailyDecision = {
      id: existingDecision?.id ?? `${PAPER_ACCOUNT_ID}:${reconciliationDate}`,
      accountId: PAPER_ACCOUNT_ID,
      marketDate: reconciliationDate,
      actionSummary: `規則更新：盤後假設成交 ${legacyFilledOrders.length} 檔`,
      candidatesEvaluated: existingDecision?.candidatesEvaluated ?? 0,
      selectedOrderIds: [
        ...new Set([
          ...(existingDecision?.selectedOrderIds ?? []),
          ...legacyFilledOrders.map((order) => order.id),
        ]),
      ],
      notes: [
        ...(priorSummary && !priorSummary.includes("盤後假設成交")
          ? [`規則變更前紀錄：${priorSummary}`]
          : []),
        "依使用者指定的績效試驗規則，原等待開盤標的改以訊號日收盤價假設成交",
        ...legacyNotes,
      ],
      cash: state.account.cash,
      equity,
      openPositions: state.trades.filter((trade) => trade.status === "open")
        .length,
      queuedOrders: state.orders.filter((order) => order.status === "queued")
        .length,
      strategyVersion: PAPER_STRATEGY_VERSION,
      createdAt: existingDecision?.createdAt ?? timestamp,
    };
    if (existingDecision) {
      Object.assign(existingDecision, reconciledDecision);
    } else {
      state.decisions.push(reconciledDecision);
    }
  }

  for (const marketDate of marketDates) {
    const notes: string[] = [];
    const selectedOrderIds: string[] = [];

    const queued = state.orders
      .filter(
        (order) =>
          order.status === "queued" && order.signalDate < marketDate,
      )
      .sort(
        (left, right) =>
          right.selectionScore - left.selectionScore ||
          left.createdAt.localeCompare(right.createdAt),
      );
    for (const order of queued) {
      fillAfterHoursOrder(state, order, profiles, timestamp, notes);
    }

    for (let index = 0; index < state.trades.length; index += 1) {
      const trade = state.trades[index];
      if (trade.status !== "open" || trade.entryDate > marketDate) continue;
      const candle = candleByDate(profiles.get(trade.symbol), marketDate);
      if (!candle) {
        notes.push(`${trade.symbol} 持股缺少當日行情，未臆測出場`);
        continue;
      }
      if (
        trade.queuedExitReason &&
        trade.queuedExitSignalDate &&
        trade.queuedExitSignalDate < marketDate
      ) {
        const closedTrade = exitTrade(
          trade,
          candle.open,
          marketDate,
          trade.queuedExitReason,
          timestamp,
        );
        state.trades[index] = closedTrade;
        state.account.cash = rounded(
          state.account.cash + (closedTrade.netSaleProceeds ?? 0),
        );
        notes.push(
          `${trade.symbol} ${trade.name} 依前一日收盤弱化訊號，隔日開盤提前出場`,
        );
        continue;
      }
      trade.holdingDays += 1;
      trade.maximumFavorablePercent = rounded(
        Math.max(
          trade.maximumFavorablePercent,
          ((candle.high - trade.entryPrice) / trade.entryPrice) * 100,
        ),
      );
      trade.maximumAdversePercent = rounded(
        Math.min(
          trade.maximumAdversePercent,
          ((candle.low - trade.entryPrice) / trade.entryPrice) * 100,
        ),
      );
      trade.updatedAt = timestamp;

      let exit: { price: number; reason: PaperExitReason } | null = null;
      if (candle.low <= trade.stopPrice) {
        exit = {
          price: candle.open <= trade.stopPrice ? candle.open : trade.stopPrice,
          reason: "stop-loss",
        };
      } else if (candle.high >= trade.targetPrice) {
        exit = {
          price: candle.open >= trade.targetPrice ? candle.open : trade.targetPrice,
          reason: "target",
        };
      } else if (trade.holdingDays >= PAPER_RULES.maximumHoldingDays) {
        exit = { price: candle.close, reason: "time-limit" };
      }
      if (!exit) continue;
      const closedTrade = exitTrade(
        trade,
        exit.price,
        marketDate,
        exit.reason,
        timestamp,
      );
      state.trades[index] = closedTrade;
      state.account.cash = rounded(
        state.account.cash + (closedTrade.netSaleProceeds ?? 0),
      );
      notes.push(
        `${trade.symbol} ${trade.name} ${
          exit.reason === "target"
            ? "達淨利目標出場"
            : exit.reason === "stop-loss"
              ? "觸及防守出場"
              : "滿 20 個交易日出場"
        }`,
      );
    }

    for (const trade of state.trades) {
      if (
        trade.status !== "open" ||
        trade.entryDate > marketDate ||
        trade.queuedExitReason
      ) {
        continue;
      }
      const profile = profiles.get(trade.symbol);
      const candleIndex = profile?.candles.findIndex(
        (candle) => candle.time === marketDate,
      ) ?? -1;
      const candle = candleIndex >= 0 ? profile?.candles[candleIndex] : null;
      const previous = candleIndex > 0 ? profile?.candles[candleIndex - 1] : null;
      if (!candle || !previous) continue;
      const bearish = candle.close < candle.open;
      const coversPreviousLow = candle.close < previous.low;
      const earlyStop =
        trade.holdingDays <= PAPER_RULES.earlyStopReviewDays &&
        bearish &&
        coversPreviousLow;
      const closeReturnPercent =
        ((candle.close - trade.entryPrice) / trade.entryPrice) * 100;
      const momentumWarnings = [
        candle.close < previous.close,
        candle.volume >= previous.volume,
        candle.histogram < previous.histogram,
        candle.dpo < previous.dpo,
      ].filter(Boolean).length;
      const earlyProfit =
        !earlyStop &&
        trade.maximumFavorablePercent >= PAPER_RULES.earlyReviewProfitPercent &&
        closeReturnPercent > 0 &&
        bearish &&
        momentumWarnings >= 2;
      if (!earlyStop && !earlyProfit) continue;
      trade.queuedExitReason = earlyStop ? "early-stop" : "early-profit";
      trade.queuedExitSignalDate = marketDate;
      trade.updatedAt = timestamp;
      notes.push(
        earlyStop
          ? `${trade.symbol} 買進初期出現黑 K 收破前一根最低價，排定隔日提前止損`
          : `${trade.symbol} 曾上漲至少 5% 後多頭轉弱，排定隔日提前獲利了結`,
      );
    }

    const todaysCandidates = candidates.filter(
      (observation) =>
        observation.signalDate === marketDate &&
        observation.signalKind === "close-confirmed",
    );
    const unavailableSymbols = new Set([
      ...state.orders
        .filter((order) => order.status === "queued")
        .map((order) => order.symbol),
      ...state.trades
        .filter((trade) => trade.status === "open")
        .map((trade) => trade.symbol),
    ]);
    const scored = todaysCandidates
      .filter((observation) => !unavailableSymbols.has(observation.symbol))
      .map(scorePaperCandidate)
      .filter((item) => item.score >= PAPER_RULES.minimumSelectionScore)
      .sort(
        (left, right) =>
          right.score - left.score ||
          left.observation.symbol.localeCompare(right.observation.symbol),
      );
    const currentOpenCount = state.trades.filter(
      (trade) => trade.status === "open",
    ).length;
    const currentQueuedCount = state.orders.filter(
      (order) => order.status === "queued",
    ).length;
    const availableSlots = Math.max(
      0,
      PAPER_RULES.maximumPositions - currentOpenCount - currentQueuedCount,
    );
    const selected: ScoredPaperCandidate[] = [];
    const selectedSectors = new Set<string>();
    for (const item of scored) {
      if (
        selected.length >=
        Math.min(availableSlots, PAPER_RULES.maximumNewPositionsPerDay)
      ) {
        break;
      }
      if (selectedSectors.has(item.observation.sector)) continue;
      selected.push(item);
      selectedSectors.add(item.observation.sector);
    }
    let filledSelections = 0;
    for (const item of selected) {
      const observation = item.observation;
      const orderId = `paper-order:${observation.observationKey}`;
      if (state.orders.some((order) => order.id === orderId)) continue;
      const order: PaperOrder = {
        id: orderId,
        accountId: PAPER_ACCOUNT_ID,
        observationKey: observation.observationKey,
        symbol: observation.symbol,
        name: observation.name,
        sector: observation.sector,
        signalDate: observation.signalDate,
        status: "queued",
        selectionScore: item.score,
        selectionReasons: [...item.reasons],
        strategyVersion: PAPER_STRATEGY_VERSION,
        signalClose: observation.entryPrice,
        linePrice: observation.linePrice,
        filledTradeId: null,
        skippedReason: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      state.orders.push(order);
      selectedOrderIds.push(orderId);
      if (fillAfterHoursOrder(state, order, profiles, timestamp, notes)) {
        filledSelections += 1;
      }
    }
    if (todaysCandidates.length && selected.length === 0) {
      notes.push("今日訊號均未通過紙上實驗分數或風險限制，保持現金");
    } else if (!todaysCandidates.length) {
      notes.push("今日沒有收盤確認訊號，保持現金");
    } else if (filledSelections) {
      notes.push(
        `挑選 ${filledSelections} 檔，盤後全部以當日收盤價假設成交`,
      );
    } else if (selected.length) {
      notes.push(`挑選 ${selected.length} 檔，但盤後成交資料仍待處理`);
    }

    const equity = rounded(
      currentEquity(state.account, state.trades, profiles, marketDate),
    );
    state.account.maximumEquity = Math.max(
      state.account.maximumEquity,
      equity,
    );
    const drawdown =
      state.account.maximumEquity > 0
        ? ((equity - state.account.maximumEquity) /
            state.account.maximumEquity) *
          100
        : 0;
    state.account.maximumDrawdownPercent = Math.min(
      state.account.maximumDrawdownPercent,
      rounded(drawdown),
    );
    state.account.lastProcessedDate = marketDate;
    state.account.updatedAt = timestamp;
    state.decisions.push({
      id: `${PAPER_ACCOUNT_ID}:${marketDate}`,
      accountId: PAPER_ACCOUNT_ID,
      marketDate,
      actionSummary: filledSelections
        ? `挑選並盤後假設成交 ${filledSelections} 檔`
        : selected.length
          ? `挑選 ${selected.length} 檔，成交待處理`
        : notes.some((note) => note.includes("出場"))
          ? "依既定規則執行出場"
          : "今日觀望",
      candidatesEvaluated: todaysCandidates.length,
      selectedOrderIds,
      notes,
      cash: state.account.cash,
      equity,
      openPositions: state.trades.filter((trade) => trade.status === "open")
        .length,
      queuedOrders: state.orders.filter((order) => order.status === "queued")
        .length,
      strategyVersion: PAPER_STRATEGY_VERSION,
      createdAt: timestamp,
    });
  }

  return state;
}

export function buildPaperTradingDashboard(
  state: PaperTradingState,
  marketProfiles: PaperMarketProfile[],
  dataAsOf: string,
): PaperTradingDashboard {
  const profiles = new Map(marketProfiles.map((profile) => [profile.symbol, profile]));
  const openTrades = state.trades
    .filter((trade) => trade.status === "open")
    .map((trade) => {
      const currentPrice =
        latestCandleOnOrBefore(profiles.get(trade.symbol), dataAsOf)?.close ??
        null;
      const estimatedExitPrice = currentPrice
        ? roundDownToTaiwanStockTick(
            currentPrice *
              (1 - PAPER_RULES.exitSlippagePercent / 100),
          )
        : null;
      const gross = estimatedExitPrice ? trade.shares * estimatedExitPrice : 0;
      const estimatedNet = estimatedExitPrice
        ? gross -
          calculateBrokerCommission(gross, PAPER_RULES.commissionDiscount) -
          gross * STOCK_TRANSACTION_TAX_RATE
        : null;
      const unrealizedReturnPercent =
        estimatedNet !== null
          ? ((estimatedNet - trade.totalCost) / trade.totalCost) * 100
          : null;
      return {
        ...trade,
        currentPrice,
        unrealizedReturnPercent:
          unrealizedReturnPercent === null
            ? null
            : rounded(unrealizedReturnPercent),
      };
    });
  const currentEquityValue = rounded(
    state.account.cash +
      openTrades.reduce(
        (total, trade) =>
          total + trade.shares * (trade.currentPrice ?? trade.entryPrice),
        0,
      ),
  );
  const closed = state.trades.filter((trade) => trade.status === "closed");
  const realizedProfit = rounded(
    closed.reduce((total, trade) => total + (trade.realizedProfit ?? 0), 0),
  );
  const unrealizedProfit = rounded(
    openTrades.reduce((total, trade) => {
      if (trade.currentPrice === null) return total;
      const marketValue = trade.shares * trade.currentPrice;
      return total + marketValue - trade.totalCost;
    }, 0),
  );
  const profitableTrades = closed.filter(
    (trade) => (trade.realizedProfit ?? 0) > 0,
  ).length;

  return {
    dataAsOf,
    account: state.account,
    currentEquity: currentEquityValue,
    totalReturnPercent: rounded(
      ((currentEquityValue - state.account.startingCash) /
        state.account.startingCash) *
        100,
    ),
    realizedProfit,
    unrealizedProfit,
    closedTrades: closed.length,
    profitableTrades,
    winRatePercent:
      closed.length > 0 ? rounded((profitableTrades / closed.length) * 100) : null,
    targetTrades: closed.filter((trade) => trade.exitReason === "target").length,
    pendingOrders: state.orders
      .filter((order) => order.status === "queued")
      .sort((left, right) => right.signalDate.localeCompare(left.signalDate)),
    openTrades,
    history: closed.sort((left, right) =>
      (right.exitDate ?? "").localeCompare(left.exitDate ?? ""),
    ),
    decisions: state.decisions
      .slice()
      .sort(
        (left, right) =>
          right.marketDate.localeCompare(left.marketDate) ||
          right.createdAt.localeCompare(left.createdAt),
      )
      .slice(0, 60),
    rules: PAPER_RULES,
    readiness: {
      ready: false,
      label: "尚未達到可交付自動交易的門檻",
      reason:
        "這是向前走的紙上實驗，必須累積足夠交易日、樣本、成本後績效與不同市場環境，才會評估下一階段。",
    },
  };
}

export function paperTradingCostAssumptions() {
  return {
    commissionRatePercent: BROKER_COMMISSION_RATE * 100,
    commissionDiscount: PAPER_RULES.commissionDiscount,
    minimumCommission: MINIMUM_COMMISSION,
    transactionTaxPercent: STOCK_TRANSACTION_TAX_RATE * 100,
    entrySlippagePercent: PAPER_RULES.entrySlippagePercent,
    exitSlippagePercent: PAPER_RULES.exitSlippagePercent,
  };
}
