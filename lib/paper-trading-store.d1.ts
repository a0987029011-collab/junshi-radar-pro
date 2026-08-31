import { asc, eq } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { getDb } from "../db";
import {
  paperAccounts,
  paperDailyDecisions,
  paperOrders,
  paperTrades,
} from "../db/schema";
import {
  PAPER_ACCOUNT_ID,
  createPaperTradingState,
  type PaperTradingState,
} from "./paper-trading";

export async function loadD1PaperTradingState(): Promise<PaperTradingState> {
  const db = getDb();
  const [accounts, orders, trades, decisions] = await Promise.all([
    db
      .select()
      .from(paperAccounts)
      .where(eq(paperAccounts.id, PAPER_ACCOUNT_ID))
      .limit(1),
    db
      .select()
      .from(paperOrders)
      .where(eq(paperOrders.accountId, PAPER_ACCOUNT_ID))
      .orderBy(asc(paperOrders.signalDate)),
    db
      .select()
      .from(paperTrades)
      .where(eq(paperTrades.accountId, PAPER_ACCOUNT_ID))
      .orderBy(asc(paperTrades.entryDate)),
    db
      .select()
      .from(paperDailyDecisions)
      .where(eq(paperDailyDecisions.accountId, PAPER_ACCOUNT_ID))
      .orderBy(asc(paperDailyDecisions.marketDate)),
  ]);
  const account = accounts[0];
  if (!account) return createPaperTradingState();
  return { account, orders, trades, decisions };
}

async function runBatches(statements: BatchItem<"sqlite">[]) {
  const db = getDb();
  for (let index = 0; index < statements.length; index += 40) {
    const batch = statements.slice(index, index + 40);
    if (!batch.length) continue;
    await db.batch(
      batch as [BatchItem<"sqlite">, ...Array<BatchItem<"sqlite">>],
    );
  }
}

export async function saveD1PaperTradingState(state: PaperTradingState) {
  const db = getDb();
  await db
    .insert(paperAccounts)
    .values(state.account)
    .onConflictDoUpdate({
      target: paperAccounts.id,
      set: {
        cash: state.account.cash,
        strategyVersion: state.account.strategyVersion,
        lastProcessedDate: state.account.lastProcessedDate,
        maximumEquity: state.account.maximumEquity,
        maximumDrawdownPercent: state.account.maximumDrawdownPercent,
        updatedAt: state.account.updatedAt,
      },
    });

  await runBatches(
    state.orders.map((order) =>
      db
        .insert(paperOrders)
        .values(order)
        .onConflictDoUpdate({
          target: paperOrders.id,
          set: {
            status: order.status,
            filledTradeId: order.filledTradeId,
            skippedReason: order.skippedReason,
            updatedAt: order.updatedAt,
          },
        }),
    ),
  );
  await runBatches(
    state.trades.map((trade) =>
      db
        .insert(paperTrades)
        .values(trade)
        .onConflictDoUpdate({
          target: paperTrades.id,
          set: {
            status: trade.status,
            exitDate: trade.exitDate,
            exitPrice: trade.exitPrice,
            exitCommission: trade.exitCommission,
            transactionTax: trade.transactionTax,
            netSaleProceeds: trade.netSaleProceeds,
            exitReason: trade.exitReason,
            queuedExitReason: trade.queuedExitReason,
            queuedExitSignalDate: trade.queuedExitSignalDate,
            realizedProfit: trade.realizedProfit,
            realizedReturnPercent: trade.realizedReturnPercent,
            holdingDays: trade.holdingDays,
            maximumFavorablePercent: trade.maximumFavorablePercent,
            maximumAdversePercent: trade.maximumAdversePercent,
            updatedAt: trade.updatedAt,
          },
        }),
    ),
  );
  await runBatches(
    state.decisions.map((decision) =>
      db
        .insert(paperDailyDecisions)
        .values(decision)
        .onConflictDoNothing({ target: paperDailyDecisions.id }),
    ),
  );
}
