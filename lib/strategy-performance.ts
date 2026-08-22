import {
  REVERSAL_SIGNAL_NAME,
  scanReversalStructure,
} from "./reversal-radar.ts";
import { scanH1Trendline } from "./scanEngine.ts";
import type { CandlePoint, StockProfile } from "./stockData.ts";

export const STRATEGY_PERFORMANCE_WINDOW_DAYS = 20;
export const STRATEGY_PERFORMANCE_TARGET_PERCENT = 10;

export type RadarStrategyId = "trendline-breakout" | "reversal";

export interface StrategySignalPoint {
  candles: CandlePoint[];
  signalIndex: number;
}

export interface StrategyPerformanceSummary {
  strategyId: RadarStrategyId;
  strategyName: string;
  signalCount: number;
  maturedSignalCount: number;
  winningSignalCount: number;
  winRatePercent: number | null;
  averageMaxGainPercent: number | null;
  maximumDrawdownPercent: number | null;
  windowDays: typeof STRATEGY_PERFORMANCE_WINDOW_DAYS;
  targetReturnPercent: typeof STRATEGY_PERFORMANCE_TARGET_PERCENT;
}

function rounded(value: number) {
  return Math.round(value * 10) / 10;
}

export function summarizeStrategySignalPoints(
  strategyId: RadarStrategyId,
  strategyName: string,
  points: StrategySignalPoint[],
): StrategyPerformanceSummary {
  const outcomes = points.flatMap(({ candles, signalIndex }) => {
    const entry = candles[signalIndex];
    const future = candles.slice(
      signalIndex + 1,
      signalIndex + 1 + STRATEGY_PERFORMANCE_WINDOW_DAYS,
    );
    if (!entry || future.length < STRATEGY_PERFORMANCE_WINDOW_DAYS) return [];
    const maxGainPercent =
      ((Math.max(...future.map((candle) => candle.high)) - entry.close) /
        entry.close) *
      100;
    const maximumDrawdownPercent =
      ((Math.min(...future.map((candle) => candle.low)) - entry.close) /
        entry.close) *
      100;
    return [{ maxGainPercent, maximumDrawdownPercent }];
  });
  const winners = outcomes.filter(
    (outcome) =>
      outcome.maxGainPercent >= STRATEGY_PERFORMANCE_TARGET_PERCENT,
  );

  return {
    strategyId,
    strategyName,
    signalCount: points.length,
    maturedSignalCount: outcomes.length,
    winningSignalCount: winners.length,
    winRatePercent:
      outcomes.length > 0 ? rounded((winners.length / outcomes.length) * 100) : null,
    averageMaxGainPercent:
      outcomes.length > 0
        ? rounded(
            outcomes.reduce(
              (total, outcome) => total + outcome.maxGainPercent,
              0,
            ) / outcomes.length,
          )
        : null,
    maximumDrawdownPercent:
      outcomes.length > 0
        ? rounded(
            Math.min(
              ...outcomes.map((outcome) => outcome.maximumDrawdownPercent),
            ),
          )
        : null,
    windowDays: STRATEGY_PERFORMANCE_WINDOW_DAYS,
    targetReturnPercent: STRATEGY_PERFORMANCE_TARGET_PERCENT,
  };
}

export function buildStrategyPerformanceComparison(
  profiles: StockProfile[],
) {
  const trendlinePoints: StrategySignalPoint[] = [];
  const reversalPoints: StrategySignalPoint[] = [];

  for (const profile of profiles) {
    const trendlineTrace = scanH1Trendline(profile.candles);
    trendlinePoints.push(
      ...trendlineTrace.signals
        .filter((signal) => signal.closeConfirmation)
        .map((signal) => ({
          candles: profile.candles,
          signalIndex: signal.index,
        })),
    );
    reversalPoints.push(
      ...scanReversalStructure(profile.candles).signals.map((signal) => ({
        candles: profile.candles,
        signalIndex: signal.index,
      })),
    );
  }

  return [
    summarizeStrategySignalPoints(
      "trendline-breakout",
      "下降趨勢線紅 K 穿越",
      trendlinePoints,
    ),
    summarizeStrategySignalPoints(
      "reversal",
      REVERSAL_SIGNAL_NAME,
      reversalPoints,
    ),
  ];
}
