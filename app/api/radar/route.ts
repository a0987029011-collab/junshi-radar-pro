import { NextResponse } from "next/server";
import strategy from "../../../config/strategy.json";
import { marketSnapshotMeta } from "../../../lib/market-data";
import { scanMarket } from "../../../lib/scoring-engine";

export async function GET() {
  return NextResponse.json({
    dataMode: strategy.meta.mode,
    dataAsOf: marketSnapshotMeta.dataAsOf,
    snapshotGeneratedAt: marketSnapshotMeta.generatedAt,
    strategyVersion: strategy.meta.version,
    candidates: scanMarket()
  });
}
