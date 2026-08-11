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
