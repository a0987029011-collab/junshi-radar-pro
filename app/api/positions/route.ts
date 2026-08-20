import { getPositionMarketSnapshot } from "../../../lib/position-market-snapshot";
import {
  buildClosedPositionCase,
  calculateNetSaleProceeds,
  normalizePositionBuyInput,
  normalizePositionSellInput,
  summarizePositionTransactions,
  type ClosedPositionCase,
  type PositionBuyInput,
  type PositionSellInput,
  type PositionSaleResult,
  type PositionTransaction,
} from "../../../lib/position-transactions";
import {
  createVercelGuestStore,
  isVercelRequest,
} from "../../../lib/vercel-guest-store";
import type { WatchlistItem } from "../../../lib/watchlist";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";

type PositionStore = {
  list(ownerId: string, symbol: string): Promise<PositionTransaction[]>;
  addBuy(
    ownerId: string,
    input: PositionBuyInput
  ): Promise<PositionTransaction[]>;
  addSale(
    ownerId: string,
    input: PositionSellInput
  ): Promise<PositionSaleResult>;
  remove(ownerId: string, symbol: string): Promise<number>;
};

function isLocalDevelopment(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalDevelopment(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

async function getStore(request: Request): Promise<PositionStore> {
  if (isLocalDevelopment(new URL(request.url))) {
    const local = await import("../../../lib/position-transaction-store.local");
    return {
      list: local.listLocalPositionTransactions,
      addBuy: local.addLocalPositionBuy,
      addSale: local.addLocalPositionSale,
      remove: local.deleteLocalPositionTransactions
    };
  }

  const d1 = await import("../../../lib/position-transaction-store.d1");
  return {
    list: d1.listD1PositionTransactions,
    addBuy: d1.addD1PositionBuy,
    addSale: d1.addD1PositionSale,
    remove: d1.deleteD1PositionTransactions
  };
}

function readSymbol(url: URL) {
  const symbol = url.searchParams.get("symbol")?.trim() ?? "";
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確");
  return symbol;
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "持股紀錄處理失敗";
  return Response.json({ error: message }, { status: 400 });
}

function guestPositionKey(symbol: string) {
  return `positions_${symbol}`;
}

async function handleGuestPositionPost(
  request: Request,
  body: Record<string, unknown>,
) {
  const store = createVercelGuestStore(request);
  const symbol = typeof body.symbol === "string" ? body.symbol.trim() : "";
  const key = guestPositionKey(symbol);
  const transactions = store
    .read<PositionTransaction[]>(key, [])
    .slice()
    .sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
  const now = new Date().toISOString();

  if (body.action === "buy") {
    const input = normalizePositionBuyInput(body);
    transactions.push({
      id: crypto.randomUUID(),
      ...input,
      kind: "buy",
      marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
      createdAt: now,
    });
    store.write(key, transactions);
    return store.json({ transactions, positionClosed: false });
  }

  if (body.action !== "sell") throw new Error("不支援的持股操作");
  const input = normalizePositionSellInput(body);
  const summary = summarizePositionTransactions(
    transactions,
    input.commissionDiscount,
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
    input.commissionDiscount,
  );
  const realizedReturnPercent =
    costBasisWithFees > 0
      ? ((netSaleProceeds - costBasisWithFees) / costBasisWithFees) * 100
      : 0;
  const sale: PositionTransaction = {
    id: crypto.randomUUID(),
    ...input,
    kind: "sell",
    marketSnapshot: getPositionMarketSnapshot(input.symbol, input.occurredAt),
    averageEntryPrice: summary.averageEntryPrice,
    realizedReturnPercent,
    createdAt: now,
  };
  transactions.push(sale);
  store.write(key, transactions);

  const positionClosed = input.shares === summary.totalShares;
  const closedCase = positionClosed ? buildClosedPositionCase(transactions) : null;
  if (closedCase) {
    const cases = store.read<ClosedPositionCase[]>("position_cases", []);
    store.write(
      "position_cases",
      [
        closedCase,
        ...cases.filter((item) => item.caseKey !== closedCase.caseKey),
      ].slice(0, 50),
    );
    const watchlist = store.read<WatchlistItem[]>("watchlist", []);
    store.write(
      "watchlist",
      watchlist.filter((item) => item.symbol !== input.symbol),
    );
  }

  return store.json({ transactions, positionClosed, closedCase });
}

export async function GET(request: Request) {
  try {
    const symbol = readSymbol(new URL(request.url));
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      return store.json({
        transactions: store.read<PositionTransaction[]>(guestPositionKey(symbol), []),
      });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const transactions = await (await getStore(request)).list(ownerId, symbol);
    return Response.json({ transactions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    if (isVercelRequest(request)) {
      return await handleGuestPositionPost(request, body);
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const store = await getStore(request);
    if (body.action === "buy") {
      const transactions = await store.addBuy(
        ownerId,
        normalizePositionBuyInput(body),
      );
      return Response.json({ transactions, positionClosed: false });
    } else if (body.action === "sell") {
      const result = await store.addSale(
        ownerId,
        normalizePositionSellInput(body),
      );
      return Response.json(result);
    } else {
      throw new Error("不支援的持股操作");
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const symbol = readSymbol(new URL(request.url));
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      const transactions = store.read<PositionTransaction[]>(guestPositionKey(symbol), []);
      store.remove(guestPositionKey(symbol));
      return store.json({ deleted: transactions.length, transactions: [] });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const deleted = await (await getStore(request)).remove(ownerId, symbol);
    return Response.json({ deleted, transactions: [] });
  } catch (error) {
    return errorResponse(error);
  }
}
