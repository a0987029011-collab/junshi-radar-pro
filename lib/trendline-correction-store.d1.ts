import { eq } from "drizzle-orm";
import { getDb } from "../db";
import { trendlineCorrections } from "../db/schema";
import type {
  TrendlineCorrection,
  TrendlineCorrectionInput,
  TrendlineCorrectionAdjustment,
  TrendlineCorrectionTimeframe,
} from "./trendline-corrections";
import { trendlineCorrectionKey } from "./trendline-corrections";

function toCorrection(
  row: typeof trendlineCorrections.$inferSelect,
): TrendlineCorrection {
  return {
    symbol: row.symbol,
    timeframe: row.timeframe as TrendlineCorrectionTimeframe,
    adjustment: row.adjustment as TrendlineCorrectionAdjustment,
    h1: { date: row.h1Date, price: row.h1Price },
    h2: { date: row.h2Date, price: row.h2Price },
    originalH1:
      row.originalH1Date && row.originalH1Price != null
        ? { date: row.originalH1Date, price: row.originalH1Price }
        : null,
    originalH2:
      row.originalH2Date && row.originalH2Price != null
        ? { date: row.originalH2Date, price: row.originalH2Price }
        : null,
    reason: row.reason as TrendlineCorrection["reason"],
    notes: row.notes,
    submittedForLearning: row.submittedForLearning,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function getD1TrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const id = trendlineCorrectionKey(ownerId, symbol, timeframe, adjustment);
  const [row] = await getDb()
    .select()
    .from(trendlineCorrections)
    .where(eq(trendlineCorrections.id, id))
    .limit(1);
  return row ? toCorrection(row) : null;
}

export async function saveD1TrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
) {
  const id = trendlineCorrectionKey(
    ownerId,
    input.symbol,
    input.timeframe,
    input.adjustment,
  );
  const now = new Date().toISOString();
  const values = {
    id,
    ownerId,
    symbol: input.symbol,
    timeframe: input.timeframe,
    adjustment: input.adjustment,
    h1Date: input.h1.date,
    h1Price: input.h1.price,
    h2Date: input.h2.date,
    h2Price: input.h2.price,
    originalH1Date: input.originalH1?.date ?? null,
    originalH1Price: input.originalH1?.price ?? null,
    originalH2Date: input.originalH2?.date ?? null,
    originalH2Price: input.originalH2?.price ?? null,
    reason: input.reason,
    notes: input.notes,
    submittedForLearning: input.submittedForLearning,
    updatedAt: now,
  };
  const [row] = await getDb()
    .insert(trendlineCorrections)
    .values(values)
    .onConflictDoUpdate({
      target: trendlineCorrections.id,
      set: values,
    })
    .returning();
  return toCorrection(row);
}

export async function deleteD1TrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const id = trendlineCorrectionKey(ownerId, symbol, timeframe, adjustment);
  const rows = await getDb()
    .delete(trendlineCorrections)
    .where(eq(trendlineCorrections.id, id))
    .returning({ id: trendlineCorrections.id });
  return rows.length > 0;
}
