import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { getPositionMarketSnapshot } from "./position-market-snapshot";
import { saveLocalClosedPositionCase } from "./closed-position-case-store.local";
import {
  buildClosedPositionCase,
  calculateNetSaleProceeds,
  summarizePositionTransactions,
  type PositionBuyInput,
  type PositionSellInput,
  type PositionTransaction
} from "./position-transactions";
import { deleteLocalWatchlistItem } from "./watchlist-store.local";

interface LocalPositionTransaction extends PositionTransaction {
  ownerId: string;
}

const localDirectory = path.join(process.cwd(), ".local");
const localFile = path.join(localDirectory, "position-transactions.json");

async function readTransactions(): Promise<LocalPositionTransaction[]> {
  try {
    return JSON.parse(await readFile(localFile, "utf8")) as LocalPositionTransaction[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function writeTransactions(transactions: LocalPositionTransaction[]) {
  await mkdir(localDirectory, { recursive: true });
  await writeFile(localFile, `${JSON.stringify(transactions, null, 2)}\n`, "utf8");
}

export async function listLocalPositionTransactions(
  ownerId: string,
  symbol: string
) {
  const transactions = await readTransactions();
  return transactions
    .filter(
      (transaction) =>
        transaction.ownerId === ownerId && transaction.symbol === symbol
    )
    .map(({ ownerId: storedOwnerId, ...transaction }) => {
      void storedOwnerId;
      return transaction;
    })
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
}

export async function addLocalPositionBuy(
  ownerId: string,
  input: PositionBuyInput
) {
  const transactions = await readTransactions();
  const now = new Date().toISOString();
  transactions.push({
    id: crypto.randomUUID(),
    ownerId,
    ...input,
    kind: "buy",
    marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
    createdAt: now
  });
  await writeTransactions(transactions);
  return listLocalPositionTransactions(ownerId, input.symbol);
}

export async function addLocalPositionSale(
  ownerId: string,
  input: PositionSellInput
) {
  const transactions = await readTransactions();
  const ownerTransactions = transactions
    .filter(
      (transaction) =>
        transaction.ownerId === ownerId && transaction.symbol === input.symbol
    )
    .map(({ ownerId: storedOwnerId, ...transaction }) => {
      void storedOwnerId;
      return transaction;
    });
  const summary = summarizePositionTransactions(
    ownerTransactions,
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

  const now = new Date().toISOString();
  const sale: LocalPositionTransaction = {
    id: crypto.randomUUID(),
    ownerId,
    ...input,
    kind: "sell",
    marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
    averageEntryPrice: summary.averageEntryPrice,
    realizedReturnPercent,
    createdAt: now
  };
  transactions.push(sale);
  await writeTransactions(transactions);
  const positionClosed = input.shares === summary.totalShares;
  const closedCase = positionClosed
    ? buildClosedPositionCase([
        ...ownerTransactions,
        (({ ownerId: storedOwnerId, ...transaction }) => {
          void storedOwnerId;
          return transaction;
        })(sale),
      ])
    : null;
  if (closedCase) {
    await saveLocalClosedPositionCase(ownerId, closedCase);
    await deleteLocalWatchlistItem(ownerId, input.symbol);
  }
  return {
    transactions: await listLocalPositionTransactions(ownerId, input.symbol),
    positionClosed: Boolean(closedCase),
    closedCase,
  };
}

export async function deleteLocalPositionTransactions(
  ownerId: string,
  symbol: string
) {
  const transactions = await readTransactions();
  const remaining = transactions.filter(
    (transaction) =>
      transaction.ownerId !== ownerId || transaction.symbol !== symbol
  );
  const deleted = transactions.length - remaining.length;
  if (deleted > 0) await writeTransactions(remaining);
  return deleted;
}
