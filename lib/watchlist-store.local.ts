import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { WatchlistItem } from "./watchlist";
import { watchlistItemKey } from "./watchlist";

interface LocalWatchlistItem extends WatchlistItem {
  id: string;
  ownerId: string;
}

const localDirectory = path.join(process.cwd(), ".local");
const localFile = path.join(localDirectory, "watchlist.json");

async function readItems(): Promise<LocalWatchlistItem[]> {
  try {
    return JSON.parse(await readFile(localFile, "utf8")) as LocalWatchlistItem[];
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw error;
  }
}

async function writeItems(items: LocalWatchlistItem[]) {
  await mkdir(localDirectory, { recursive: true });
  await writeFile(localFile, `${JSON.stringify(items, null, 2)}\n`, "utf8");
}

export async function listLocalWatchlistItems(ownerId: string) {
  return (await readItems())
    .filter((item) => item.ownerId === ownerId)
    .map(({ id: _id, ownerId: _ownerId, ...item }) => item)
    .sort((left, right) => right.addedAt.localeCompare(left.addedAt));
}

export async function saveLocalWatchlistItem(
  ownerId: string,
  input: { symbol: string; name: string }
) {
  const items = await readItems();
  const id = watchlistItemKey(ownerId, input.symbol);
  const current = items.find((item) => item.id === id);
  if (current) {
    current.name = input.name;
  } else {
    items.push({
      id,
      ownerId,
      ...input,
      addedAt: new Date().toISOString()
    });
  }
  await writeItems(items);
  return listLocalWatchlistItems(ownerId);
}

export async function deleteLocalWatchlistItem(
  ownerId: string,
  symbol: string
) {
  const items = await readItems();
  const id = watchlistItemKey(ownerId, symbol);
  const next = items.filter((item) => item.id !== id);
  if (next.length !== items.length) await writeItems(next);
  return next.length !== items.length;
}
