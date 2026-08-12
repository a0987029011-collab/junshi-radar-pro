import { and, asc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { trendlineCorrections } from "../db/schema";
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

function toCorrection(
  row: typeof trendlineCorrections.$inferSelect,
): TrendlineCorrection {
  return {
    id: row.id,
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

export async function listD1TrendlineCorrections(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  const rows = await getDb()
    .select()
    .from(trendlineCorrections)
    .where(
      and(
        eq(trendlineCorrections.ownerId, ownerId),
        eq(trendlineCorrections.symbol, symbol),
        eq(trendlineCorrections.timeframe, timeframe),
        eq(trendlineCorrections.adjustment, adjustment),
      ),
    )
    .orderBy(
      asc(trendlineCorrections.h1Date),
      asc(trendlineCorrections.h2Date),
      asc(trendlineCorrections.createdAt),
    );
  return rows.map(toCorrection);
}

export async function getD1TrendlineCorrection(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  return (
    (await listD1TrendlineCorrections(
      ownerId,
      symbol,
      timeframe,
      adjustment,
    )).at(-1) ?? null
  );
}

function correctionValues(
  ownerId: string,
  input: TrendlineCorrectionInput,
  id: string,
  now: string,
) {
  return {
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
}

export async function saveD1TrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
  correctionId?: string,
) {
  const now = new Date().toISOString();
  const legacyId = trendlineCorrectionKey(
    ownerId,
    input.symbol,
    input.timeframe,
    input.adjustment,
  );
  const id = correctionId ?? legacyId;

  if (correctionId) {
    const [existing] = await getDb()
      .select({ id: trendlineCorrections.id })
      .from(trendlineCorrections)
      .where(
        and(
          eq(trendlineCorrections.id, correctionId),
          eq(trendlineCorrections.ownerId, ownerId),
          eq(trendlineCorrections.symbol, input.symbol),
          eq(trendlineCorrections.timeframe, input.timeframe),
          eq(trendlineCorrections.adjustment, input.adjustment),
        ),
      )
      .limit(1);
    if (!existing) throw new Error("找不到要編輯的波段");
  }

  const values = correctionValues(ownerId, input, id, now);
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

export async function appendD1TrendlineCorrection(
  ownerId: string,
  input: TrendlineCorrectionInput,
) {
  const id = trendlineWaveKey(ownerId, input);
  const now = new Date().toISOString();
  const values = correctionValues(ownerId, input, id, now);
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
  correctionId?: string,
) {
  const conditions = [
    eq(trendlineCorrections.ownerId, ownerId),
    eq(trendlineCorrections.symbol, symbol),
    eq(trendlineCorrections.timeframe, timeframe),
    eq(trendlineCorrections.adjustment, adjustment),
  ];
  if (correctionId) conditions.push(eq(trendlineCorrections.id, correctionId));
  const rows = await getDb()
    .delete(trendlineCorrections)
    .where(and(...conditions))
    .returning({ id: trendlineCorrections.id });
  return rows.length > 0;
}
