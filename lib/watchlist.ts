import type { Classification } from "./types.ts";

export interface WatchlistItem {
  symbol: string;
  name: string;
  addedAt: string;
}

export interface WatchlistPositionItem extends WatchlistItem {
  currentPrice: number;
  stopPrice: number | null;
  stopSourceDate: string;
  classification: Classification;
}

export type WatchlistStockOption = Pick<WatchlistItem, "symbol" | "name">;

export function buildWatchlistStockOptions(
  ...groups: ReadonlyArray<ReadonlyArray<WatchlistStockOption>>
) {
  const options = new Map<string, WatchlistStockOption>();
  for (const group of groups) {
    for (const item of group) {
      const symbol = item.symbol.trim();
      const name = item.name.trim();
      if (!/^\d{4,6}$/.test(symbol) || !name || options.has(symbol)) continue;
      options.set(symbol, { symbol, name });
    }
  }
  return [...options.values()].sort((left, right) =>
    left.symbol.localeCompare(right.symbol)
  );
}

export function normalizeWatchlistInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("追蹤資料格式不正確");
  const record = input as Record<string, unknown>;
  const symbol = typeof record.symbol === "string" ? record.symbol.trim() : "";
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!/^\d{4,6}$/.test(symbol)) throw new Error("股票代號格式不正確");
  if (!name) throw new Error("請填寫股票名稱");
  return { symbol, name };
}

export function watchlistItemKey(ownerId: string, symbol: string) {
  return `${ownerId}:${symbol}`;
}
