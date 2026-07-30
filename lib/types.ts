export type Classification = "S" | "A" | "A+" | "Seed" | "Watch";
export type ReviewStatus = "passed" | "watching" | "excluded";
export type Timeframe = "day" | "week" | "month";

export interface StrategySignals {
  monthlyTrend: number;
  weeklyTrend: number;
  dailyBreakout: number;
  macd: number;
  dpo: number;
  keyLevel: number;
  chipStructure: number;
  confirmedTrendlineBreakout: boolean;
  multiTimeframeResonance: boolean;
  healthyConsolidation: boolean;
  indicatorsRising: boolean;
  monthlyHistogramContracting: boolean;
  monthlyMacdNearZeroOrImproving: boolean;
  monthlyDpoRising: boolean;
  monthlyKeyLevel: boolean;
  shrinkingHistogramSupport: boolean;
  successfulRetest: boolean;
  chipStructureStable: boolean;
}

export interface StructureSignals {
  consolidationDuration: number;
  trendlineTouches: number;
  keyLevelTests: number;
  monthlyHistogramDuration: number;
  cleanRetest: number;
}

export interface ProfitPlan {
  entryZoneLow: number;
  entryZoneHigh: number;
  stopLoss: number;
  profitZoneLow: number | null;
  profitZoneHigh: number | null;
  potentialLowPercent: number;
  potentialHighPercent: number;
  lowRiskReward: number;
  highRiskReward: number;
  clarityScore: number;
  isClear: boolean;
  phase: "forming" | "entry-ready" | "in-progress" | "extended";
  source: "bearish-engulfing" | "swing-high-clusters" | "none";
  resistanceTouches: number;
}

export interface StockCandidate {
  symbol: string;
  name: string;
  sector: string;
  exchange?: "TWSE" | "TPEx";
  paidInCapitalBillion: number;
  averageVolumeLots: number;
  currentPrice: number;
  changePercent: number;
  keyLevel: number;
  stopLoss: number;
  firstTarget: number;
  profitPlan?: ProfitPlan;
  deepScanScore?: number;
  classificationHint?: Classification;
  signals: StrategySignals;
  structureSignals: StructureSignals;
  reasons: string[];
  missingConditions: string[];
  catalyst: string;
  dataAsOf?: string;
  dataStatus?: string;
  dataNotes?: string[];
}

export interface ScannedStock extends StockCandidate {
  score: number;
  structureScore: number;
  classification: Classification;
  maturity: number;
  riskReward: number;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  macd: number;
  signal: number;
  histogram: number;
  dpo: number;
}

export interface BacktestSummary {
  sampleSize: number;
  windowDays: number;
  targetReturn: number;
  hitRate: number;
  averageReturn: number;
  maximumDrawdown: number;
  mock: boolean;
}
