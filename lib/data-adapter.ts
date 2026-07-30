import { getMarketCandles, verifiedCandidates } from "./market-data";
import type {
  BacktestSummary,
  Candle,
  StockCandidate,
  Timeframe
} from "./types";

export interface MarketDataAdapter {
  readonly name: string;
  listCandidates(): Promise<StockCandidate[]>;
  getCandidate(symbol: string): Promise<StockCandidate | undefined>;
  getCandles(
    symbol: string,
    timeframe: Timeframe,
    basePrice: number
  ): Promise<Candle[]>;
  runInverseEtfResearch(): Promise<BacktestSummary[]>;
}

export class VerifiedSnapshotMarketDataAdapter implements MarketDataAdapter {
  readonly name = "twse-tpex-automatic-market-snapshot";
  async listCandidates() { return verifiedCandidates; }
  async getCandidate(symbol: string) {
    return verifiedCandidates.find((candidate) => candidate.symbol === symbol);
  }
  async getCandles(
    symbol: string,
    timeframe: Timeframe
  ) {
    return getMarketCandles(symbol, timeframe) ?? [];
  }
  async runInverseEtfResearch() { return []; }
}

export const marketDataAdapter: MarketDataAdapter =
  new VerifiedSnapshotMarketDataAdapter();
