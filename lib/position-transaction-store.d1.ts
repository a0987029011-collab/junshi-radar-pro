import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { positionTransactions } from "../db/schema";
import { getPositionMarketSnapshot } from "./position-market-snapshot";
import {
  calculateNetSaleProceeds,
  summarizePositionTransactions,
  type PositionBuyInput,
  type PositionSellInput,
  type PositionTransaction
} from "./position-transactions";

function toTransaction(
  row: typeof positionTransactions.$inferSelect
): PositionTransaction {
  return {
    id: row.id,
    symbol: row.symbol,
    name: row.name,
    kind: row.kind as PositionTransaction["kind"],
    shares: row.shares,
    price: row.price,
    occurredAt: row.occurredAt,
    createdAt: row.createdAt,
    marketSnapshot: row.marketSnapshot,
    averageEntryPrice: row.averageEntryPrice,
    realizedReturnPercent: row.realizedReturnPercent,
    commissionDiscount: row.commissionDiscount
  };
}

export async function listD1PositionTransactions(
  ownerId: string,
  symbol: string
) {
  const rows = await getDb()
    .select()
    .from(positionTransactions)
    .where(
      and(
        eq(positionTransactions.ownerId, ownerId),
        eq(positionTransactions.symbol, symbol)
      )
    )
    .orderBy(asc(positionTransactions.occurredAt), asc(positionTransactions.createdAt));
  return rows.map(toTransaction);
}

export async function addD1PositionBuy(
  ownerId: string,
  input: PositionBuyInput
) {
  await getDb().insert(positionTransactions).values({
    id: crypto.randomUUID(),
    ownerId,
    ...input,
    kind: "buy",
    marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
    createdAt: new Date().toISOString()
  });
  return listD1PositionTransactions(ownerId, input.symbol);
}

export async function addD1PositionSale(
  ownerId: string,
  input: PositionSellInput
) {
  const transactions = await listD1PositionTransactions(ownerId, input.symbol);
  const summary = summarizePositionTransactions(
    transactions,
    input.commissionDiscount
  );
  if (summary.totalShares <= 0) throw new Error("目前沒有可賣出的持股");
  if (input.shares > summary.totalShares) {
    throw new Error(`賣出股數不可超過目前持有的 ${summary.totalShares} 股`);
  }
  const costBasisWithFees =
    summary.totalCostWithFees * (input.shares / summary.totalShares);
  const netSaleProceeds = calculateNetSaleProceeds(
    input.shares,
    input.price,
    input.commissionDiscount
  );
  const realizedReturnPercent =
    costBasisWithFees > 0
      ? ((netSaleProceeds - costBasisWithFees) / costBasisWithFees) * 100
      : 0;

  await getDb().insert(positionTransactions).values({
    id: crypto.randomUUID(),
    ownerId,
    ...input,
    kind: "sell",
    marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
    averageEntryPrice: summary.averageEntryPrice,
    realizedReturnPercent,
    createdAt: new Date().toISOString()
  });
  return listD1PositionTransactions(ownerId, input.symbol);
}
