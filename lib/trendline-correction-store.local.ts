import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TrendlineCorrection,
  TrendlineCorrectionInput,
  TrendlineCorrectionAdjustment,
  TrendlineCorrectionTimeframe,
} from "./trendline-corrections";
import { trendlineCorrectionKey } from "./trendline-corrections";

const localDirectory = path.join(process.cwd(), ".local");
const localFile = path.join(localDirectory, "trendline-corrections.json");

type LocalRecords = Record<string, TrendlineCorrection>;

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

export async function getLocalTrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const records = await readRecords();
  return records[trendlineCorrectionKey(ownerId, symbol, timeframe, adjustment)] ?? null;
}

export async function saveLocalTrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
) {
  const records = await readRecords();
  const key = trendlineCorrectionKey(
    ownerId,
    input.symbol,
    input.timeframe,
    input.adjustment,
  );
  const now = new Date().toISOString();
  const correction: TrendlineCorrection = {
    ...input,
    createdAt: records[key]?.createdAt ?? now,
    updatedAt: now,
  };
  records[key] = correction;
  await writeRecords(records);
  return correction;
}

export async function deleteLocalTrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const records = await readRecords();
  const key = trendlineCorrectionKey(ownerId, symbol, timeframe, adjustment);
  const existed = Boolean(records[key]);
  if (existed) {
    delete records[key];
    await writeRecords(records);
  }
  return existed;
}
