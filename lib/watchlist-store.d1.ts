import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { watchlistItems } from "../db/schema";
import { watchlistItemKey } from "./watchlist";

export async function listD1WatchlistItems(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(watchlistItems)
    .where(eq(watchlistItems.ownerId, ownerId))
    .orderBy(desc(watchlistItems.addedAt));
  return rows.map(({ id: _id, ownerId: _ownerId, ...item }) => item);
}

export async function saveD1WatchlistItem(
  ownerId: string,
  input: { symbol: string; name: string }
) {
  const id = watchlistItemKey(ownerId, input.symbol);
  await getDb()
    .insert(watchlistItems)
    .values({ id, ownerId, ...input, addedAt: new Date().toISOString() })
    .onConflictDoUpdate({
      target: watchlistItems.id,
      set: { name: input.name }
    });
  return listD1WatchlistItems(ownerId);
}

export async function deleteD1WatchlistItem(
  ownerId: string,
  symbol: string
) {
  const rows = await getDb()
    .delete(watchlistItems)
    .where(eq(watchlistItems.id, watchlistItemKey(ownerId, symbol)))
    .returning({ id: watchlistItems.id });
  return rows.length > 0;
}
