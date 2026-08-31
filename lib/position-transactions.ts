import type { PositionMarketSnapshot } from "./position-market-snapshot";

export type PositionTransactionKind = "buy" | "sell";

export interface PositionTransaction {
  id: string;
  symbol: string;
  name: string;
  kind: PositionTransactionKind;
  shares: number;
  price: number;
  occurredAt: string;
  createdAt: string;
  marketSnapshot?: PositionMarketSnapshot | null;
  averageEntryPrice?: number | null;
  realizedReturnPercent?: number | null;
  commissionDiscount?: number | null;
}

export interface PositionBuyInput {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  occurredAt: string;
  commissionDiscount: number;
}

export interface PositionSellInput {
  symbol: string;
  name: string;
  shares: number;
  price: number;
  occurredAt: string;
  commissionDiscount: number;
}

export const SHORT_TERM_TARGET_RETURN_PERCENT = 10;

export interface ClosedPositionMarketOutcome {
  baselinePrice: number;
  maximumPrice: number | null;
  maximumReturnPercent: number | null;
  targetReached: boolean | null;
  targetReachedAt: string | null;
  observedThrough: string | null;
  complete: boolean;
}

export interface ClosedPositionCase {
  caseKey: string;
  symbol: string;
  name: string;
  openedAt: string;
  closedAt: string;
  holdingDays: number;
  totalShares: number;
  transactionCount: number;
  averageEntryPrice: number;
  averageExitPrice: number;
  totalCostWithFees: number;
  netSaleProceeds: number;
  realizedProfit: number;
  realizedReturnPercent: number;
  targetReturnPercent: number;
  targetReached: boolean;
  marketOutcome?: ClosedPositionMarketOutcome;
  entrySnapshot: PositionMarketSnapshot | null;
  exitSnapshot: PositionMarketSnapshot | null;
  transactions: PositionTransaction[];
  createdAt: string;
}

export interface PositionSaleResult {
  transactions: PositionTransaction[];
  positionClosed: boolean;
  closedCase: ClosedPositionCase | null;
}

export interface ClosedPositionResearchSummary {
  totalCases: number;
  profitableCases: number;
  targetReachedCases: number;
  targetHitRatePercent: number | null;
  marketEvaluatedCases: number;
  marketTargetReachedCases: number;
  marketTargetHitRatePercent: number | null;
  averageReturnPercent: number | null;
  averageHoldingDays: number | null;
  averageProfit: number | null;
}

export const DEFAULT_COMMISSION_DISCOUNT = 0.3;
export const BROKER_COMMISSION_RATE = 0.001425;
export const MINIMUM_COMMISSION = 20;
export const STOCK_TRANSACTION_TAX_RATE = 0.003;

function readText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`請填寫${label}`);
  }
  return value.trim();
}

function readPositiveNumber(value: unknown, label: string) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    throw new Error(`${label}必須大於 0`);
  }
  return number;
}

function readCommissionDiscount(value: unknown) {
  const number = Number(value ?? DEFAULT_COMMISSION_DISCOUNT);
  if (!Number.isFinite(number) || number <= 0 || number > 1) {
    throw new Error("券商折扣必須大於 0 且不超過原價");
  }
  return number;
}

export function calculateBrokerCommission(
  grossAmount: number,
  commissionDiscount = DEFAULT_COMMISSION_DISCOUNT
) {
  return Math.max(
    MINIMUM_COMMISSION,
    grossAmount * BROKER_COMMISSION_RATE * commissionDiscount
  );
}

export function calculateNetSaleProceeds(
  shares: number,
  price: number,
  commissionDiscount = DEFAULT_COMMISSION_DISCOUNT
) {
  const grossAmount = shares * price;
  return (
    grossAmount -
    calculateBrokerCommission(grossAmount, commissionDiscount) -
    grossAmount * STOCK_TRANSACTION_TAX_RATE
  );
}

export function roundUpToTaiwanStockTick(price: number) {
  if (!Number.isFinite(price) || price <= 0) return 0;
  const tick =
    price < 10
      ? 0.01
      : price < 50
        ? 0.05
        : price < 100
          ? 0.1
          : price < 500
            ? 0.5
            : price < 1000
              ? 1
              : 5;
  return Number((Math.ceil((price - 1e-9) / tick) * tick).toFixed(2));
}

export function calculateTargetSalePrice(
  shares: number,
  totalCostWithFees: number,
  targetReturnPercent = SHORT_TERM_TARGET_RETURN_PERCENT,
  commissionDiscount = DEFAULT_COMMISSION_DISCOUNT
) {
  if (shares <= 0 || totalCostWithFees <= 0) return 0;
  const targetProceeds =
    totalCostWithFees * (1 + targetReturnPercent / 100);
  let low = totalCostWithFees / shares;
  let high = low * (1 + targetReturnPercent / 100 + 0.1);
  while (
    calculateNetSaleProceeds(shares, high, commissionDiscount) < targetProceeds
  ) {
    high *= 1.2;
  }
  for (let iteration = 0; iteration < 60; iteration += 1) {
    const middle = (low + high) / 2;
    if (
      calculateNetSaleProceeds(shares, middle, commissionDiscount) >=
      targetProceeds
    ) {
      high = middle;
    } else {
      low = middle;
    }
  }
  return roundUpToTaiwanStockTick(high);
}

function normalizeCommon(input: Record<string, unknown>) {
  const symbol = readText(input.symbol, "股票代號");
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確");
  const name = readText(input.name, "股票名稱");
  const occurredAt = input.occurredAt
    ? readText(input.occurredAt, "成交時間")
    : new Date().toISOString();
  if (!Number.isFinite(Date.parse(occurredAt))) {
    throw new Error("成交時間格式不正確");
  }
  return { symbol, name, occurredAt };
}

export function normalizePositionBuyInput(input: unknown): PositionBuyInput {
  if (!input || typeof input !== "object") throw new Error("買進資料格式不正確");
  const record = input as Record<string, unknown>;
  const common = normalizeCommon(record);
  const shares = readPositiveNumber(record.shares, "股數");
  if (!Number.isInteger(shares)) throw new Error("股數必須是整數");
  return {
    ...common,
    shares,
    price: readPositiveNumber(record.price, "買進價"),
    commissionDiscount: readCommissionDiscount(record.commissionDiscount)
  };
}

export function normalizePositionSellInput(input: unknown): PositionSellInput {
  if (!input || typeof input !== "object") throw new Error("賣出資料格式不正確");
  const record = input as Record<string, unknown>;
  const shares = readPositiveNumber(record.shares, "賣出股數");
  if (!Number.isInteger(shares)) throw new Error("賣出股數必須是整數");
  return {
    ...normalizeCommon(record),
    shares,
    price: readPositiveNumber(record.price, "賣出價"),
    commissionDiscount: readCommissionDiscount(record.commissionDiscount)
  };
}

export function summarizePositionTransactions(
  transactions: PositionTransaction[],
  defaultCommissionDiscount = DEFAULT_COMMISSION_DISCOUNT
) {
  let activeBuys: PositionTransaction[] = [];
  let totalShares = 0;
  let totalCost = 0;
  let totalCostWithFees = 0;
  const sales: PositionTransaction[] = [];
  const saleHistory: Array<{
    transaction: PositionTransaction;
    averageEntryPrice: number;
    returnPercent: number;
  }> = [];

  [...transactions]
    .sort((left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.createdAt.localeCompare(right.createdAt)
    )
    .forEach((transaction) => {
      if (transaction.kind === "sell") {
        const sharesBeforeSale = totalShares;
        const costBeforeSale = totalCost;
        const calculatedAverageEntryPrice =
          sharesBeforeSale > 0 ? costBeforeSale / sharesBeforeSale : 0;
        const averageEntryPrice =
          transaction.averageEntryPrice ?? calculatedAverageEntryPrice;
        const soldShares = Math.min(transaction.shares, sharesBeforeSale);
        const costBasisWithFees =
          sharesBeforeSale > 0
            ? totalCostWithFees * (soldShares / sharesBeforeSale)
            : 0;
        const netSaleProceeds = calculateNetSaleProceeds(
          soldShares,
          transaction.price,
          transaction.commissionDiscount ?? defaultCommissionDiscount
        );
        const calculatedReturnPercent =
          costBasisWithFees > 0
            ? ((netSaleProceeds - costBasisWithFees) / costBasisWithFees) * 100
            : 0;
        if (sharesBeforeSale > 0) {
          const remainingRatio =
            (sharesBeforeSale - soldShares) / sharesBeforeSale;
          totalShares -= soldShares;
          totalCost *= remainingRatio;
          totalCostWithFees *= remainingRatio;
        }
        if (totalShares <= 0) {
          activeBuys = [];
          totalShares = 0;
          totalCost = 0;
          totalCostWithFees = 0;
        }
        sales.push(transaction);
        saleHistory.push({
          transaction,
          averageEntryPrice,
          returnPercent:
            transaction.realizedReturnPercent ?? calculatedReturnPercent
        });
      } else {
        activeBuys.push(transaction);
        const grossAmount = transaction.shares * transaction.price;
        totalShares += transaction.shares;
        totalCost += grossAmount;
        totalCostWithFees +=
          grossAmount +
          calculateBrokerCommission(
            grossAmount,
            transaction.commissionDiscount ?? defaultCommissionDiscount
          );
      }
    });

  return {
    activeBuys,
    sales,
    saleHistory,
    totalShares,
    totalCost,
    totalCostWithFees,
    averageEntryPrice: totalShares > 0 ? totalCost / totalShares : 0,
    averageEntryCost: totalShares > 0 ? totalCostWithFees / totalShares : 0
  };
}

function latestCompletedCycle(
  transactions: PositionTransaction[]
): PositionTransaction[] | null {
  let openShares = 0;
  let activeCycle: PositionTransaction[] = [];
  let completedCycle: PositionTransaction[] | null = null;

  const sorted = [...transactions].sort(
    (left, right) =>
      left.occurredAt.localeCompare(right.occurredAt) ||
      left.createdAt.localeCompare(right.createdAt)
  );
  for (const transaction of sorted) {
    if (transaction.kind === "buy") {
      if (openShares === 0) activeCycle = [];
      activeCycle.push(transaction);
      openShares += transaction.shares;
      continue;
    }
    if (openShares <= 0) continue;
    activeCycle.push(transaction);
    openShares = Math.max(0, openShares - transaction.shares);
    if (openShares === 0) {
      completedCycle = [...activeCycle];
      activeCycle = [];
    }
  }

  return completedCycle;
}

export function buildClosedPositionCase(
  transactions: PositionTransaction[],
  targetReturnPercent = SHORT_TERM_TARGET_RETURN_PERCENT
): ClosedPositionCase | null {
  const cycle = latestCompletedCycle(transactions);
  if (!cycle?.length || cycle.at(-1)?.kind !== "sell") return null;
  const buys = cycle.filter((transaction) => transaction.kind === "buy");
  const sales = cycle.filter((transaction) => transaction.kind === "sell");
  if (!buys.length || !sales.length) return null;
  const totalShares = buys.reduce(
    (total, transaction) => total + transaction.shares,
    0
  );
  const totalSoldShares = sales.reduce(
    (total, transaction) => total + transaction.shares,
    0
  );
  if (totalShares <= 0 || totalSoldShares !== totalShares) return null;
  const totalBuyValue = buys.reduce(
    (total, transaction) => total + transaction.shares * transaction.price,
    0
  );
  const totalCostWithFees = buys.reduce((total, transaction) => {
    const grossAmount = transaction.shares * transaction.price;
    return (
      total +
      grossAmount +
      calculateBrokerCommission(
        grossAmount,
        transaction.commissionDiscount ?? DEFAULT_COMMISSION_DISCOUNT
      )
    );
  }, 0);
  const totalSaleValue = sales.reduce(
    (total, transaction) => total + transaction.shares * transaction.price,
    0
  );
  const netSaleProceeds = sales.reduce(
    (total, transaction) =>
      total +
      calculateNetSaleProceeds(
        transaction.shares,
        transaction.price,
        transaction.commissionDiscount ?? DEFAULT_COMMISSION_DISCOUNT
      ),
    0
  );
  const realizedProfit = netSaleProceeds - totalCostWithFees;
  const realizedReturnPercent =
    totalCostWithFees > 0
      ? (realizedProfit / totalCostWithFees) * 100
      : 0;
  const openedAt = buys[0].occurredAt;
  const closedAt = sales.at(-1)!.occurredAt;
  const holdingDays = Math.max(
    0,
    Math.ceil((Date.parse(closedAt) - Date.parse(openedAt)) / 86_400_000)
  );

  return {
    caseKey: `${cycle.at(-1)!.id}:${closedAt}`,
    symbol: buys[0].symbol,
    name: buys[0].name,
    openedAt,
    closedAt,
    holdingDays,
    totalShares,
    transactionCount: cycle.length,
    averageEntryPrice: totalBuyValue / totalShares,
    averageExitPrice: totalSaleValue / totalSoldShares,
    totalCostWithFees,
    netSaleProceeds,
    realizedProfit,
    realizedReturnPercent,
    targetReturnPercent,
    targetReached: realizedReturnPercent >= targetReturnPercent,
    entrySnapshot: buys[0].marketSnapshot ?? null,
    exitSnapshot: sales.at(-1)?.marketSnapshot ?? null,
    transactions: cycle,
    createdAt: new Date().toISOString()
  };
}

function taipeiMarketDate(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function buildClosedPositionMarketOutcome(
  closedCase: ClosedPositionCase,
  candles: ReadonlyArray<{ time: string; high: number }>,
): ClosedPositionMarketOutcome {
  const openedDate = taipeiMarketDate(closedCase.openedAt);
  const closedDate = taipeiMarketDate(closedCase.closedAt);
  const targetPrice =
    closedCase.averageEntryPrice * (1 + closedCase.targetReturnPercent / 100);
  const observedCandles = candles.filter(
    (candle) => candle.time >= openedDate && candle.time <= closedDate,
  );
  const observedTransactions = closedCase.transactions.filter((transaction) => {
    const date = taipeiMarketDate(transaction.occurredAt);
    return date >= openedDate && date <= closedDate;
  });
  const candleMaximum = observedCandles.reduce<number | null>(
    (maximum, candle) =>
      Number.isFinite(candle.high)
        ? Math.max(maximum ?? candle.high, candle.high)
        : maximum,
    null,
  );
  const transactionMaximum = observedTransactions.reduce<number | null>(
    (maximum, transaction) =>
      Number.isFinite(transaction.price)
        ? Math.max(maximum ?? transaction.price, transaction.price)
        : maximum,
    null,
  );
  const maximumPrice =
    candleMaximum === null
      ? transactionMaximum
      : transactionMaximum === null
        ? candleMaximum
        : Math.max(candleMaximum, transactionMaximum);
  const maximumReturnPercent =
    maximumPrice !== null && closedCase.averageEntryPrice > 0
      ? ((maximumPrice - closedCase.averageEntryPrice) /
          closedCase.averageEntryPrice) *
        100
      : null;
  const reachedCandle = observedCandles.find(
    (candle) => candle.high >= targetPrice,
  );
  const reachedTransaction = observedTransactions.find(
    (transaction) => transaction.price >= targetPrice,
  );
  const reachedAt = [
    reachedCandle?.time ?? null,
    reachedTransaction ? taipeiMarketDate(reachedTransaction.occurredAt) : null,
  ]
    .filter((value): value is string => Boolean(value))
    .sort()[0] ?? null;
  const observedThrough =
    candles
      .map((candle) => candle.time)
      .filter((date) => date <= closedDate)
      .sort()
      .at(-1) ?? null;
  const hasCompleteCoverage = Boolean(
    candles.some((candle) => candle.time >= closedDate),
  );
  const targetReached = reachedAt
    ? true
    : hasCompleteCoverage
      ? false
      : null;

  return {
    baselinePrice: closedCase.averageEntryPrice,
    maximumPrice,
    maximumReturnPercent,
    targetReached,
    targetReachedAt: reachedAt,
    observedThrough,
    complete: targetReached !== null,
  };
}

export function withClosedPositionMarketOutcome(
  closedCase: ClosedPositionCase,
  candles: ReadonlyArray<{ time: string; high: number }>,
): ClosedPositionCase {
  return {
    ...closedCase,
    marketOutcome: buildClosedPositionMarketOutcome(closedCase, candles),
  };
}

export function summarizeClosedPositionCases(
  cases: ClosedPositionCase[]
): ClosedPositionResearchSummary {
  if (!cases.length) {
    return {
      totalCases: 0,
      profitableCases: 0,
      targetReachedCases: 0,
      targetHitRatePercent: null,
      marketEvaluatedCases: 0,
      marketTargetReachedCases: 0,
      marketTargetHitRatePercent: null,
      averageReturnPercent: null,
      averageHoldingDays: null,
      averageProfit: null,
    };
  }
  const total = (values: number[]) =>
    values.reduce((sum, value) => sum + value, 0);
  const targetReachedCases = cases.filter((item) => item.targetReached).length;
  const marketEvaluatedCases = cases.filter(
    (item) => item.marketOutcome?.targetReached !== null && item.marketOutcome,
  ).length;
  const marketTargetReachedCases = cases.filter(
    (item) => item.marketOutcome?.targetReached === true,
  ).length;
  return {
    totalCases: cases.length,
    profitableCases: cases.filter((item) => item.realizedProfit > 0).length,
    targetReachedCases,
    targetHitRatePercent: (targetReachedCases / cases.length) * 100,
    marketEvaluatedCases,
    marketTargetReachedCases,
    marketTargetHitRatePercent:
      marketEvaluatedCases > 0
        ? (marketTargetReachedCases / marketEvaluatedCases) * 100
        : null,
    averageReturnPercent:
      total(cases.map((item) => item.realizedReturnPercent)) / cases.length,
    averageHoldingDays:
      total(cases.map((item) => item.holdingDays)) / cases.length,
    averageProfit: total(cases.map((item) => item.realizedProfit)) / cases.length,
  };
}
