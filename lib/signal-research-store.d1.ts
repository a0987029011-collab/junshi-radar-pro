import { desc, eq } from "drizzle-orm";
import { getDb } from "../db";
import { signalObservations, signalResearchSyncs } from "../db/schema";
import type { SignalResearchObservation } from "./signal-research";

export interface SignalResearchSyncState {
  nextProfileIndex: number;
  completed: boolean;
  observationCount: number;
}

function observationId(ownerId: string, observationKey: string) {
  return `${ownerId}:${observationKey}`;
}

function syncId(ownerId: string, snapshotGeneratedAt: string) {
  return `${ownerId}:${snapshotGeneratedAt}`;
}

function toObservation(
  row: typeof signalObservations.$inferSelect,
): SignalResearchObservation {
  return {
    observationKey: row.observationKey,
    symbol: row.symbol,
    name: row.name,
    market: row.market,
    sector: row.sector,
    signalDate: row.signalDate,
    signalName: row.signalName as SignalResearchObservation["signalName"],
    signalKind: row.signalKind as SignalResearchObservation["signalKind"],
    breakoutType:
      row.breakoutType as SignalResearchObservation["breakoutType"],
    macdSignalMode:
      row.macdSignalMode as SignalResearchObservation["macdSignalMode"],
    entryPrice: row.entryPrice,
    linePrice: row.linePrice,
    snapshot: row.snapshot,
    outcomes: row.outcomes,
    status: row.status,
  };
}

export async function listD1SignalResearchObservations(ownerId: string) {
  const rows = await getDb()
    .select()
    .from(signalObservations)
    .where(eq(signalObservations.ownerId, ownerId))
    .orderBy(desc(signalObservations.signalDate));
  return rows.map(toObservation);
}

export async function upsertD1SignalResearchObservations(
  ownerId: string,
  observations: SignalResearchObservation[],
) {
  if (!observations.length) return;
  const db = getDb();
  const now = new Date().toISOString();
  const statements = observations.map((observation) =>
    db
      .insert(signalObservations)
      .values({
        id: observationId(ownerId, observation.observationKey),
        ownerId,
        ...observation,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: signalObservations.id,
        set: {
          name: observation.name,
          market: observation.market,
          sector: observation.sector,
          signalKind: observation.signalKind,
          breakoutType: observation.breakoutType,
          macdSignalMode: observation.macdSignalMode,
          entryPrice: observation.entryPrice,
          linePrice: observation.linePrice,
          snapshot: observation.snapshot,
          outcomes: observation.outcomes,
          status: observation.status,
          updatedAt: now,
        },
      }),
  );

  for (let index = 0; index < statements.length; index += 50) {
    const batch = statements.slice(index, index + 50);
    if (!batch.length) continue;
    await db.batch(
      batch as [typeof statements[number], ...Array<typeof statements[number]>],
    );
  }
}

export async function getD1SignalResearchSync(
  ownerId: string,
  snapshotGeneratedAt: string,
): Promise<SignalResearchSyncState | null> {
  const rows = await getDb()
    .select({
      nextProfileIndex: signalResearchSyncs.nextProfileIndex,
      completed: signalResearchSyncs.completed,
      observationCount: signalResearchSyncs.observationCount,
    })
    .from(signalResearchSyncs)
    .where(
      eq(signalResearchSyncs.id, syncId(ownerId, snapshotGeneratedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function saveD1SignalResearchSync(
  ownerId: string,
  snapshotGeneratedAt: string,
  state: SignalResearchSyncState,
) {
  const id = syncId(ownerId, snapshotGeneratedAt);
  const updatedAt = new Date().toISOString();
  await getDb()
    .insert(signalResearchSyncs)
    .values({
      id,
      ownerId,
      snapshotGeneratedAt,
      ...state,
      updatedAt,
    })
    .onConflictDoUpdate({
      target: signalResearchSyncs.id,
      set: { ...state, updatedAt },
    });
}
