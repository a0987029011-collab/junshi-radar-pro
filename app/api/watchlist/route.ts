import { getPositionMarketContext } from "../../../lib/position-market-context";
import {
  normalizeWatchlistInput,
  type WatchlistItem
} from "../../../lib/watchlist";
import type { TrendlineCorrection } from "../../../lib/trendline-corrections";
import {
  createVercelGuestStore,
  isVercelRequest,
} from "../../../lib/vercel-guest-store";

const USER_ID_HEADER = "oai-authenticated-user-id";
const LOCAL_OWNER_ID = "local-dev";

type WatchlistStore = {
  list(ownerId: string): Promise<WatchlistItem[]>;
  save(
    ownerId: string,
    input: { symbol: string; name: string }
  ): Promise<WatchlistItem[]>;
  remove(ownerId: string, symbol: string): Promise<boolean>;
};

type CorrectionStore = {
  get(
    ownerId: string,
    symbol: string,
    timeframe: "day",
    adjustment: "adjusted"
  ): Promise<TrendlineCorrection | null>;
};

function isLocalDevelopment(url: URL) {
  return ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

function getOwnerId(request: Request) {
  const userId = request.headers.get(USER_ID_HEADER)?.trim();
  if (userId) return userId;
  return isLocalDevelopment(new URL(request.url)) ? LOCAL_OWNER_ID : null;
}

async function getStore(request: Request): Promise<WatchlistStore> {
  if (isLocalDevelopment(new URL(request.url))) {
    const local = await import("../../../lib/watchlist-store.local");
    return {
      list: local.listLocalWatchlistItems,
      save: local.saveLocalWatchlistItem,
      remove: local.deleteLocalWatchlistItem
    };
  }
  const d1 = await import("../../../lib/watchlist-store.d1");
  return {
    list: d1.listD1WatchlistItems,
    save: d1.saveD1WatchlistItem,
    remove: d1.deleteD1WatchlistItem
  };
}

async function getCorrectionStore(request: Request): Promise<CorrectionStore> {
  if (isLocalDevelopment(new URL(request.url))) {
    const local = await import("../../../lib/trendline-correction-store.local");
    return { get: local.getLocalTrendlineCorrection };
  }
  const d1 = await import("../../../lib/trendline-correction-store.d1");
  return { get: d1.getD1TrendlineCorrection };
}

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "追蹤清單處理失敗";
  return Response.json({ error: message }, { status: 400 });
}

async function enrich(
  request: Request,
  ownerId: string,
  items: WatchlistItem[]
) {
  const corrections = await getCorrectionStore(request);
  return Promise.all(
    items.map(async (item) =>
      getPositionMarketContext(
        item,
        await corrections.get(ownerId, item.symbol, "day", "adjusted")
      )
    )
  );
}

function guestCorrectionKey(symbol: string) {
  return `trendlines_${symbol}_day_adjusted`;
}

async function enrichGuest(
  store: ReturnType<typeof createVercelGuestStore>,
  items: WatchlistItem[],
) {
  return Promise.all(
    items.map((item) => {
      const correction = store
        .read<TrendlineCorrection[]>(guestCorrectionKey(item.symbol), [])
        .at(-1) ?? null;
      return getPositionMarketContext(item, correction);
    }),
  );
}

export async function GET(request: Request) {
  try {
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      const items = store
        .read<WatchlistItem[]>("watchlist", [])
        .slice()
        .sort((left, right) => right.addedAt.localeCompare(left.addedAt));
      return store.json({ items: await enrichGuest(store, items) });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const items = await (await getStore(request)).list(ownerId);
    return Response.json({ items: await enrich(request, ownerId, items) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request) {
  try {
    const input = normalizeWatchlistInput(await request.json());
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      const current = store.read<WatchlistItem[]>("watchlist", []);
      const items = current.some((item) => item.symbol === input.symbol)
        ? current.map((item) =>
            item.symbol === input.symbol ? { ...item, name: input.name } : item,
          )
        : [{ ...input, addedAt: new Date().toISOString() }, ...current];
      store.write("watchlist", items);
      return store.json({ items: await enrichGuest(store, items) });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const items = await (await getStore(request)).save(ownerId, input);
    return Response.json({ items: await enrich(request, ownerId, items) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const symbol = new URL(request.url).searchParams.get("symbol")?.trim() ?? "";
    if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確");
    if (isVercelRequest(request)) {
      const store = createVercelGuestStore(request);
      const current = store.read<WatchlistItem[]>("watchlist", []);
      const items = current.filter((item) => item.symbol !== symbol);
      store.write("watchlist", items);
      return store.json({ deleted: items.length !== current.length });
    }
    const ownerId = getOwnerId(request);
    if (!ownerId) return Response.json({ error: "請先登入" }, { status: 401 });
    const deleted = await (await getStore(request)).remove(ownerId, symbol);
    return Response.json({ deleted });
  } catch (error) {
    return errorResponse(error);
  }
}
