import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TrendlineCorrection,
  TrendlineCorrectionInput,
  TrendlineCorrectionAdjustment,
  TrendlineCorrectionTimeframe,
} from "./trendline-corrections";
import {
  trendlineCorrectionKey,
  trendlineWaveKey,
} from "./trendline-corrections";

const localDirectory = path.join(process.cwd(), ".local");
const localFile = path.join(localDirectory, "trendline-corrections.json");

type StoredCorrection = Omit<TrendlineCorrection, "id"> & { id?: string };
type LocalRecords = Record<string, StoredCorrection>;

async function readRecords(): Promise<LocalRecords> {
  try {
    return JSON.parse(await readFile(localFile, "utf8")) as LocalRecords;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return {};
    throw error;
  }
}

async function writeRecords(records: LocalRecords) {
  await mkdir(localDirectory, { recursive: true });
  await writeFile(localFile, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}

export async function listLocalTrendlineCorrections(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const records = await readRecords();
  const legacyKey = trendlineCorrectionKey(
    ownerId,
    symbol,
    timeframe,
    adjustment,
  );
  const wavePrefix = `${encodeURIComponent(legacyKey)}:`;
  return Object.entries(records)
    .filter(
      ([key, item]) =>
        (key === legacyKey || key.startsWith(wavePrefix)) &&
        item.symbol === symbol &&
        item.timeframe === timeframe &&
        item.adjustment === adjustment,
    )
    .map(([key, item]) => ({ ...item, id: item.id ?? key }))
    .sort(
      (left, right) =>
        left.h1.date.localeCompare(right.h1.date) ||
        left.h2.date.localeCompare(right.h2.date) ||
        left.createdAt.localeCompare(right.createdAt),
    );
}

export async function getLocalTrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  return (
    (await listLocalTrendlineCorrections(
      ownerId,
      symbol,
      timeframe,
      adjustment,
    )).at(-1) ?? null
  );
}

async function saveAtKey(
  records: LocalRecords,
  key: string,
  input: TrendlineCorrectionInput,
) {
  const now = new Date().toISOString();
  const correction: TrendlineCorrection = {
    ...input,
    id: key,
    createdAt: records[key]?.createdAt ?? now,
    updatedAt: now,
  };
  records[key] = correction;
  await writeRecords(records);
  return correction;
}

export async function saveLocalTrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
  correctionId?: string,
) {
  const records = await readRecords();
  const key =
    correctionId ??
    trendlineCorrectionKey(
      ownerId,
      input.symbol,
      input.timeframe,
      input.adjustment,
    );
  if (correctionId && !records[correctionId]) {
    throw new Error("找不到要編輯的波段");
  }
  return saveAtKey(records, key, input);
}

export async function appendLocalTrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
) {
  const records = await readRecords();
  return saveAtKey(records, trendlineWaveKey(ownerId, input), input);
}

export async function deleteLocalTrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
  correctionId?: string,
) {
  const records = await readRecords();
  const legacyKey = trendlineCorrectionKey(
    ownerId,
    symbol,
    timeframe,
    adjustment,
  );
  const wavePrefix = `${encodeURIComponent(legacyKey)}:`;
  const matches = Object.entries(records).filter(
    ([key, item]) =>
      (key === legacyKey || key.startsWith(wavePrefix)) &&
      (!correctionId || key === correctionId) &&
      item.symbol === symbol &&
      item.timeframe === timeframe &&
      item.adjustment === adjustment,
  );
  for (const [key] of matches) delete records[key];
  if (matches.length) await writeRecords(records);
  return matches.length > 0;
}
