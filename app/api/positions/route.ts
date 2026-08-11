import {
  normalizePositionBuyInput,
  normalizePositionSellInput,
  type PositionBuyInput,
  type PositionSellInput,
  type PositionTransaction
} from "../../../lib/position-transactions";

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
  ): Promise<PositionTransaction[]>;
  remove(ownerId: string, symbol: string): Promise<number>;
};

function isLocalDevelopment(url: URL) {
  return (
    process.env.NODE_ENV === "development" &&
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
  );
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

export async function GET(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const symbol = readSymbol(new URL(request.url));
    const transactions = await (await getStore(request)).list(ownerId, symbol);
    return Response.json({ transactions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const body = (await request.json()) as Record<string, unknown>;
    const store = await getStore(request);
    let transactions: PositionTransaction[];
    if (body.action === "buy") {
      transactions = await store.addBuy(ownerId, normalizePositionBuyInput(body));
    } else if (body.action === "sell") {
      transactions = await store.addSale(ownerId, normalizePositionSellInput(body));
    } else {
      throw new Error("不支援的持股操作");
    }
    return Response.json({ transactions });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const symbol = readSymbol(new URL(request.url));
    const deleted = await (await getStore(request)).remove(ownerId, symbol);
    return Response.json({ deleted, transactions: [] });
  } catch (error) {
    return errorResponse(error);
  }
}
