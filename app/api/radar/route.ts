import { NextResponse } from "next/server";
import {
  getScannableSnapshotProfiles,
  marketSnapshotMeta
} from "../../../lib/market-data";
import {
  BREAKOUT_SIGNAL_NAME,
  scanStocks
} from "../../../lib/scanEngine";
import { importedStocks } from "../../../lib/stockData";

export async function GET() {
  const snapshotProfiles = getScannableSnapshotProfiles();
  const sourceProfiles = snapshotProfiles.length
    ? snapshotProfiles
    : importedStocks;
  const candidates = scanStocks(sourceProfiles, sourceProfiles.length).map(
    (item) => ({
      symbol: item.symbol,
      name: item.name,
      market: item.market,
      sector: item.sector,
      latestClose: item.latestClose,
      latestVolume: item.latestVolume,
      status: item.status,
      signalName: item.signalName,
      h1: item.h1,
      h2: item.h2,
      currentLine: item.currentLine,
      linePrice: item.linePrice,
      intradayWarning: item.intradayWarning,
      closeConfirmation: item.closeConfirmation,
      breakoutType: item.breakoutType,
      macdWeakening: item.macdWeakening,
      dpoUpturn: item.dpoUpturn,
      signalDate: item.signalDate,
      signalOnLatestBar: item.signalOnLatestBar
    })
  );

  return NextResponse.json({
    dataMode: marketSnapshotMeta.mode,
    market: marketSnapshotMeta.market,
    provider: marketSnapshotMeta.provider,
    universeStats: marketSnapshotMeta.universeStats,
    dataAsOf: marketSnapshotMeta.dataAsOf,
    snapshotGeneratedAt: marketSnapshotMeta.generatedAt,
    signalName: BREAKOUT_SIGNAL_NAME,
    candidates
  });
}
