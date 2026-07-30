import strategy from "../config/strategy.json" with { type: "json" };
import { verifiedCandidates } from "./market-data.ts";
import type {
  Classification,
  ScannedStock,
  StockCandidate
} from "./types";

type WeightKey = keyof typeof strategy.weights;
type StructureKey = keyof typeof strategy.structureQualityWeights;

function weightedScore(candidate: StockCandidate) {
  return (Object.keys(strategy.weights) as WeightKey[]).reduce(
    (total, key) => total + candidate.signals[key] * strategy.weights[key],
    0
  );
}

function structureScore(candidate: StockCandidate) {
  return (
    Object.keys(strategy.structureQualityWeights) as StructureKey[]
  ).reduce(
    (total, key) =>
      total +
      candidate.structureSignals[key] *
        strategy.structureQualityWeights[key],
    0
  );
}

function classify(
  candidate: StockCandidate,
  riskReward: number
): Classification {
  const s = candidate.signals;
  if (
    s.multiTimeframeResonance &&
    s.confirmedTrendlineBreakout &&
    s.macd >= strategy.indicators.signalScoreBullishMinimum &&
    s.dpo >= strategy.indicators.signalScoreBullishMinimum &&
    s.successfulRetest &&
    s.shrinkingHistogramSupport &&
    s.chipStructureStable &&
    riskReward >= strategy.classificationRules.S.minimumRiskReward
  ) return "S";
  if (
    s.confirmedTrendlineBreakout &&
    s.multiTimeframeResonance &&
    s.healthyConsolidation &&
    s.indicatorsRising
  ) return "A+";
  if (s.confirmedTrendlineBreakout) return "A";
  if (
    s.dailyBreakout < 0.5 &&
    s.monthlyHistogramContracting &&
    s.monthlyMacdNearZeroOrImproving &&
    s.monthlyDpoRising &&
    s.monthlyKeyLevel
  ) return "Seed";
  return "Watch";
}

function maturity(candidate: StockCandidate) {
  if (candidate.signals.successfulRetest) {
    return strategy.maturity.successfulRetest;
  }
  if (candidate.signals.confirmedTrendlineBreakout) {
    return strategy.maturity.trendlineBreakout;
  }
  if (
    candidate.signals.weeklyTrend >=
    strategy.maturity.weeklyTrendSignalMinimum
  ) {
    return strategy.maturity.weeklyTrendTurningUp;
  }
  if (candidate.signals.monthlyHistogramContracting) {
    return strategy.maturity.monthlyHistogramComplete;
  }
  return strategy.maturity.bottomForming;
}

export function scoreCandidate(candidate: StockCandidate): ScannedStock {
  const downside = Math.max(0.01, candidate.currentPrice - candidate.stopLoss);
  const upside = Math.max(0, candidate.firstTarget - candidate.currentPrice);
  const riskReward = upside / downside;
  return {
    ...candidate,
    score: Math.round(weightedScore(candidate)),
    structureScore: Math.round(structureScore(candidate)),
    classification: classify(candidate, riskReward),
    maturity: maturity(candidate),
    riskReward
  };
}

export function scanMarket() {
  return verifiedCandidates
    .filter(
      (candidate) =>
        candidate.paidInCapitalBillion * 100000000 >=
          strategy.universe.minimumPaidInCapital &&
        candidate.averageVolumeLots >=
          strategy.universe.minimumAverageDailyVolumeLots
    )
    .map(scoreCandidate)
    .sort(
      (left, right) =>
        right.score +
        right.structureScore * 0.25 -
        (left.score + left.structureScore * 0.25)
    );
}

export function getScannedStock(symbol: string) {
  const candidate = verifiedCandidates.find((item) => item.symbol === symbol);
  return candidate ? scoreCandidate(candidate) : undefined;
}
