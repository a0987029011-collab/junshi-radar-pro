import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { closedPositionCases } from "../db/schema";
import type { ClosedPositionCase } from "./position-transactions";

function toClosedCase(
  row: typeof closedPositionCases.$inferSelect,
): ClosedPositionCase {
  return {
    caseKey: row.caseKey,
    symbol: row.symbol,
    name: row.name,
    openedAt: row.openedAt,
    closedAt: row.closedAt,
    holdingDays: row.holdingDays,
    totalShares: row.totalShares,
    transactionCount: row.transactionCount,
    averageEntryPrice: row.averageEntryPrice,
    averageExitPrice: row.averageExitPrice,
    totalCostWithFees: row.totalCostWithFees,
    netSaleProceeds: row.netSaleProceeds,
    realizedProfit: row.realizedProfit,
    realizedReturnPercent: row.realizedReturnPercent,
    targetReturnPercent: row.targetReturnPercent,
    targetReached: row.targetReached,
    entrySnapshot: row.entrySnapshot,
    exitSnapshot: row.exitSnapshot,
    transactions: row.transactions,
    createdAt: row.createdAt,
  };
}

export async function listD1ClosedPositionCases(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(closedPositionCases)
    .where(eq(closedPositionCases.ownerId, ownerId))
    .orderBy(desc(closedPositionCases.closedAt));
  return rows.map(toClosedCase);
}
