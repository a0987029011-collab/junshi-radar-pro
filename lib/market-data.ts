import radarSnapshotJson from "../data/radar-snapshot.json" with {
  type: "json"
};
import { calculateDpo, calculateMacd } from "./indicators.ts";
import type { Candle, ScannedStock, Timeframe } from "./types";
import type { CandlePoint, StockProfile } from "./stockData";

export type PriceAdjustment = "adjusted" | "raw";

interface SnapshotMeta {
  dataAsOf: string;
  generatedAt: string;
  market: string;
  mode: string;
  provider: string;
  sources: Record<string, string>;
  limitations: Record<string, string>;
  quoteDates?: Partial<Record<"TWSE" | "TPEx", string>>;
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

type SnapshotCandle = [
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
];

type TimeframeCharts = Record<Timeframe, SnapshotCandle[]>;

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
const calculatedChartCache = new Map<string, Candle[]>();

export const marketSnapshotMeta = snapshot.meta;
export const verifiedCandidates = snapshot.candidates;
export const verifiedMarketSymbols = snapshot.candidates.map(
  (candidate) => candidate.symbol
);

function snapshotMarketToMarketLabel(exchange?: "TWSE" | "TPEx") {
  return exchange === "TPEx" ? "上櫃" : "上市";
}

function normalizedCandles(candles: Candle[] | null): CandlePoint[] {
  return (candles ?? []).map((item) => ({
    date: item.time,
    open: item.open,
    high: item.high,
    low: item.low,
    close: item.close,
    volume: item.volume
  }));
}

export function getScannableSnapshotProfiles(): StockProfile[] {
  return verifiedCandidates
    .map((candidate) => {
      const candles = getMarketCandles(candidate.symbol, "day", "adjusted");
      if (!candles?.length) return null;
      return {
        symbol: candidate.symbol,
        name: candidate.name,
        market: snapshotMarketToMarketLabel(candidate.exchange),
        sector: candidate.sector,
        candles: normalizedCandles(candles)
      };
    })
    .filter((item): item is StockProfile => Boolean(item));
}

export function getMarketCandles(
  symbol: string,
  timeframe: Timeframe,
  adjustment: PriceAdjustment = "adjusted"
) {
  const source = snapshot.charts[symbol]?.[adjustment]?.[timeframe];
  if (!source) return null;

  const cacheKey = `${symbol}:${timeframe}:${adjustment}`;
  const cached = calculatedChartCache.get(cacheKey);
  if (cached) return cached;

  const closes = source.map((candle) => candle[4]);
  const macd = calculateMacd(closes);
  const dpo = calculateDpo(closes);
  const candles = source.map((candle, index) => ({
    time: candle[0],
    open: candle[1],
    high: candle[2],
    low: candle[3],
    close: candle[4],
    volume: candle[5],
    macd: macd.macd[index],
    signal: macd.signal[index],
    histogram: macd.histogram[index],
    dpo: dpo[index]
  }));
  calculatedChartCache.set(cacheKey, candles);
  return candles;
}

export function getMarketDataNote(symbol: string) {
  return snapshot.notes[symbol] ?? null;
}
