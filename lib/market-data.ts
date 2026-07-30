import radarSnapshotJson from "../data/radar-snapshot.json" with {
  type: "json"
};
import type { Candle, ScannedStock, Timeframe } from "./types";

export type PriceAdjustment = "adjusted" | "raw";

interface SnapshotMeta {
  dataAsOf: string;
  generatedAt: string;
  market: string;
  mode: string;
  provider: string;
  sources: Record<string, string>;
  limitations: Record<string, string>;
  universeStats: {
    discovered: number;
    capitalEligible: number;
    volumeEligible: number;
    analyzed: number;
    failed: number;
  };
}

interface MarketDataNote {
  dataAsOf: string;
  startDate: string;
  endDate: string;
  historyDays: number;
  corporateActions: number;
  latestVerification?: {
    date: string;
    source: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  };
}

type TimeframeCharts = Record<Timeframe, Candle[]>;

interface CandidateCharts {
  adjusted: TimeframeCharts;
  raw: TimeframeCharts;
}

interface RadarSnapshot {
  meta: SnapshotMeta;
  candidates: ScannedStock[];
  charts: Record<string, CandidateCharts>;
  notes: Record<string, MarketDataNote>;
}

const snapshot = radarSnapshotJson as unknown as RadarSnapshot;

export const marketSnapshotMeta = snapshot.meta;
export const verifiedCandidates = snapshot.candidates;
export const verifiedMarketSymbols = snapshot.candidates.map(
  (candidate) => candidate.symbol
);

export function getMarketCandles(
  symbol: string,
  timeframe: Timeframe,
  adjustment: PriceAdjustment = "adjusted"
) {
  return snapshot.charts[symbol]?.[adjustment]?.[timeframe] ?? null;
}

export function getMarketDataNote(symbol: string) {
  return snapshot.notes[symbol] ?? null;
}
