import { getMarketCandles } from "./market-data.ts";
import {
  BREAKOUT_SIGNAL_NAME,
  scanH1Trendline,
  type BreakoutType,
  type MacdSignalMode,
  type TrendlineSignal,
} from "./scanEngine.ts";
import type { Candle, Timeframe } from "./types.ts";
import type { StockProfile } from "./stockData.ts";

export const SIGNAL_OUTCOME_WINDOWS = [5, 20, 60] as const;
export type SignalOutcomeWindowDays = (typeof SIGNAL_OUTCOME_WINDOWS)[number];

export const SIGNAL_SUCCESS_TARGETS: Record<SignalOutcomeWindowDays, number> = {
  5: 5,
  20: 10,
  60: 20,
};

export type Direction = "rising" | "falling" | "flat";

export interface MovingAverageResearchSnapshot {
  period: number;
  value: number | null;
  slope: number | null;
  priceDistancePercent: number | null;
  deductionValue: number | null;
  deductionDate: string | null;
}

export interface TimeframeResearchSnapshot {
  timeframe: Timeframe;
  dataDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  changePercent: number | null;
  candlePattern: string;
  bodyPercentOfRange: number;
  upperShadowPercentOfRange: number;
  lowerShadowPercentOfRange: number;
  volume: {
    value: number;
    average20: number;
    ratioToAverage20: number;
    priceVolumeRelation:
      | "price-up-volume-up"
      | "price-up-volume-down"
      | "price-down-volume-up"
      | "price-down-volume-down"
      | "flat";
  };
  movingAverages: MovingAverageResearchSnapshot[];
  macd: {
    value: number;
    signal: number;
    histogram: number;
    state:
      | "positive-strengthening"
      | "positive-weakening"
      | "negative-strengthening"
      | "negative-weakening";
  };
  dpo: {
    value: number;
    direction: Direction;
  };
}

export interface SignalOutcomeSnapshot {
  windowDays: SignalOutcomeWindowDays;
  targetReturnPercent: number;
  observedDays: number;
  complete: boolean;
  closeReturnPercent: number | null;
  maxReturnPercent: number | null;
  maxDrawdownPercent: number | null;
  targetReached: boolean | null;
}

export interface SignalResearchObservation {
  observationKey: string;
  symbol: string;
  name: string;
  market: string;
  sector: string;
  signalDate: string;
  signalName: typeof BREAKOUT_SIGNAL_NAME;
  signalKind: "close-confirmed" | "intraday-only";
  breakoutType: BreakoutType | null;
  macdSignalMode: MacdSignalMode | null;
  entryPrice: number;
  linePrice: number;
  snapshot: {
    month: TimeframeResearchSnapshot | null;
    week: TimeframeResearchSnapshot | null;
    day: TimeframeResearchSnapshot | null;
  };
  outcomes: Record<SignalOutcomeWindowDays, SignalOutcomeSnapshot>;
  status: "monitoring" | "matured";
}

export interface SignalResearchWindowSummary {
  windowDays: SignalOutcomeWindowDays;
  targetReturnPercent: number;
  eligibleSamples: number;
  hitSamples: number;
  hitRatePercent: number | null;
  averageCloseReturnPercent: number | null;
  averageMaxReturnPercent: number | null;
  averageMaxDrawdownPercent: number | null;
}

export interface SignalResearchSummary {
  totalSamples: number;
  maturedSamples: number;
  monitoringSamples: number;
  firstSignalDate: string | null;
  latestSignalDate: string | null;
  windows: SignalResearchWindowSummary[];
  signalModes: Array<{
    mode: MacdSignalMode | "unknown";
    samples: number;
    eligible20DaySamples: number;
    hitRate20DayPercent: number | null;
  }>;
}

const MOVING_AVERAGE_PERIODS = [5, 10, 20, 35, 60] as const;

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function movingAverage(candles: Candle[], index: number, period: number) {
  if (index < period - 1) return null;
  return average(
    candles.slice(index - period + 1, index + 1).map((candle) => candle.close),
  );
}

function direction(current: number, previous?: number): Direction {
  if (previous === undefined || !Number.isFinite(previous)) return "flat";
  if (current > previous) return "rising";
  if (current < previous) return "falling";
  return "flat";
}

function candlePattern(candle: Candle) {
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const body = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const bullish = candle.close > candle.open;
  const bearish = candle.close < candle.open;

  if (body / range <= 0.1) return "十字／近十字";
  if (lowerShadow >= body * 2 && upperShadow <= body) {
    return bullish ? "紅 K 長下影" : "黑 K 長下影";
  }
  if (upperShadow >= body * 2 && lowerShadow <= body) {
    return bullish ? "紅 K 長上影" : "黑 K 長上影";
  }
  if (body / range >= 0.65) return bullish ? "長紅 K" : "長黑 K";
  if (bullish) return "紅 K";
  if (bearish) return "黑 K";
  return "平盤 K";
}

export function buildTimeframeResearchSnapshot(
  candles: Candle[],
  index: number,
  timeframe: Timeframe,
): TimeframeResearchSnapshot | null {
  const candle = candles[index];
  if (!candle) return null;
  const previous = candles[index - 1];
  const range = Math.max(candle.high - candle.low, Number.EPSILON);
  const body = Math.abs(candle.close - candle.open);
  const upperShadow = candle.high - Math.max(candle.open, candle.close);
  const lowerShadow = Math.min(candle.open, candle.close) - candle.low;
  const volumeWindow = candles
    .slice(Math.max(0, index - 19), index + 1)
    .map((item) => item.volume);
  const average20 = average(volumeWindow);
  const priceDirection = previous
    ? Math.sign(candle.close - previous.close)
    : 0;
  const volumeDirection = previous
    ? Math.sign(candle.volume - previous.volume)
    : 0;
  const priceVolumeRelation =
    priceDirection === 0
      ? "flat"
      : priceDirection > 0
        ? volumeDirection >= 0
          ? "price-up-volume-up"
          : "price-up-volume-down"
        : volumeDirection >= 0
          ? "price-down-volume-up"
          : "price-down-volume-down";
  const histogramStrengthening = previous
    ? Math.abs(candle.histogram) > Math.abs(previous.histogram)
    : false;
  const histogramSide = candle.histogram >= 0 ? "positive" : "negative";

  return {
    timeframe,
    dataDate: candle.time,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    changePercent:
      previous && previous.close !== 0
        ? ((candle.close - previous.close) / previous.close) * 100
        : null,
    candlePattern: candlePattern(candle),
    bodyPercentOfRange: (body / range) * 100,
    upperShadowPercentOfRange: (upperShadow / range) * 100,
    lowerShadowPercentOfRange: (lowerShadow / range) * 100,
    volume: {
      value: candle.volume,
      average20,
      ratioToAverage20: average20 > 0 ? candle.volume / average20 : 0,
      priceVolumeRelation,
    },
    movingAverages: MOVING_AVERAGE_PERIODS.map((period) => {
      const value = movingAverage(candles, index, period);
      const previousValue = movingAverage(candles, index - 1, period);
      const deductionCandle = candles[index - period + 1];
      return {
        period,
        value,
        slope:
          value !== null && previousValue !== null
            ? value - previousValue
            : null,
        priceDistancePercent:
          value !== null && value !== 0
            ? ((candle.close - value) / value) * 100
            : null,
        deductionValue: deductionCandle?.close ?? null,
        deductionDate: deductionCandle?.time ?? null,
      };
    }),
    macd: {
      value: candle.macd,
      signal: candle.signal,
      histogram: candle.histogram,
      state: `${histogramSide}-${
        histogramStrengthening ? "strengthening" : "weakening"
      }` as TimeframeResearchSnapshot["macd"]["state"],
    },
    dpo: {
      value: candle.dpo,
      direction: direction(candle.dpo, previous?.dpo),
    },
  };
}

export function buildSignalOutcomes(
  candles: Candle[],
  signalIndex: number,
): SignalResearchObservation["outcomes"] {
  const entry = candles[signalIndex];
  const buildWindow = (
    windowDays: SignalOutcomeWindowDays,
  ): SignalOutcomeSnapshot => {
    const future = candles.slice(signalIndex + 1, signalIndex + 1 + windowDays);
    const complete = future.length >= windowDays;
    const targetReturnPercent = SIGNAL_SUCCESS_TARGETS[windowDays];
    const maxReturnPercent =
      entry && future.length
        ? ((Math.max(...future.map((candle) => candle.high)) - entry.close) /
            entry.close) *
          100
        : null;
    const maxDrawdownPercent =
      entry && future.length
        ? ((Math.min(...future.map((candle) => candle.low)) - entry.close) /
            entry.close) *
          100
        : null;
    const finalCandle = complete ? future[windowDays - 1] : undefined;
    return {
      windowDays,
      targetReturnPercent,
      observedDays: future.length,
      complete,
      closeReturnPercent:
        entry && finalCandle
          ? ((finalCandle.close - entry.close) / entry.close) * 100
          : null,
      maxReturnPercent,
      maxDrawdownPercent,
      targetReached:
        complete && maxReturnPercent !== null
          ? maxReturnPercent >= targetReturnPercent
          : null,
    };
  };

  return {
    5: buildWindow(5),
    20: buildWindow(20),
    60: buildWindow(60),
  };
}

function timeframeSnapshot(
  symbol: string,
  timeframe: Timeframe,
  signalDate: string,
) {
  const candles = getMarketCandles(symbol, timeframe, "adjusted") ?? [];
  const index = candles.findLastIndex((candle) => candle.time <= signalDate);
  return buildTimeframeResearchSnapshot(candles, index, timeframe);
}

export function buildSignalResearchObservation(
  profile: StockProfile,
  signal: TrendlineSignal,
): SignalResearchObservation | null {
  const dailyCandles = getMarketCandles(profile.symbol, "day", "adjusted") ?? [];
  const signalIndex = dailyCandles.findIndex(
    (candle) => candle.time === signal.date,
  );
  const signalCandle = dailyCandles[signalIndex];
  if (!signalCandle) return null;
  const outcomes = buildSignalOutcomes(dailyCandles, signalIndex);

  return {
    observationKey: [
      profile.symbol,
      signal.date,
      signal.roundId,
      signal.sourceEndIndex,
    ].join(":"),
    symbol: profile.symbol,
    name: profile.name,
    market: profile.market,
    sector: profile.sector,
    signalDate: signal.date,
    signalName: signal.name,
    signalKind: signal.closeConfirmation
      ? "close-confirmed"
      : "intraday-only",
    breakoutType: signal.breakoutType ?? null,
    macdSignalMode: signal.macdSignalMode ?? null,
    entryPrice: signalCandle.close,
    linePrice: signal.linePrice,
    snapshot: {
      month: timeframeSnapshot(profile.symbol, "month", signal.date),
      week: timeframeSnapshot(profile.symbol, "week", signal.date),
      day: buildTimeframeResearchSnapshot(dailyCandles, signalIndex, "day"),
    },
    outcomes,
    status: outcomes[60].complete ? "matured" : "monitoring",
  };
}

export function buildSignalResearchObservations(
  profiles: StockProfile[],
): SignalResearchObservation[] {
  return profiles.flatMap((profile) =>
    scanH1Trendline(profile.candles).signals
      .map((signal) => buildSignalResearchObservation(profile, signal))
      .filter(
        (observation): observation is SignalResearchObservation =>
          observation !== null,
      ),
  );
}

function roundedAverage(values: number[]) {
  return values.length ? average(values) : null;
}

export function summarizeSignalResearch(
  observations: SignalResearchObservation[],
): SignalResearchSummary {
  const dates = observations
    .map((observation) => observation.signalDate)
    .sort();
  const windows = SIGNAL_OUTCOME_WINDOWS.map((windowDays) => {
    const outcomes = observations
      .map((observation) => observation.outcomes[windowDays])
      .filter((outcome) => outcome.complete);
    const hits = outcomes.filter((outcome) => outcome.targetReached);
    return {
      windowDays,
      targetReturnPercent: SIGNAL_SUCCESS_TARGETS[windowDays],
      eligibleSamples: outcomes.length,
      hitSamples: hits.length,
      hitRatePercent:
        outcomes.length > 0 ? (hits.length / outcomes.length) * 100 : null,
      averageCloseReturnPercent: roundedAverage(
        outcomes.flatMap((outcome) =>
          outcome.closeReturnPercent === null
            ? []
            : [outcome.closeReturnPercent],
        ),
      ),
      averageMaxReturnPercent: roundedAverage(
        outcomes.flatMap((outcome) =>
          outcome.maxReturnPercent === null ? [] : [outcome.maxReturnPercent],
        ),
      ),
      averageMaxDrawdownPercent: roundedAverage(
        outcomes.flatMap((outcome) =>
          outcome.maxDrawdownPercent === null
            ? []
            : [outcome.maxDrawdownPercent],
        ),
      ),
    };
  });
  const modes = ["negative-weakening", "positive-rising", "unknown"] as const;

  return {
    totalSamples: observations.length,
    maturedSamples: observations.filter(
      (observation) => observation.status === "matured",
    ).length,
    monitoringSamples: observations.filter(
      (observation) => observation.status === "monitoring",
    ).length,
    firstSignalDate: dates.at(0) ?? null,
    latestSignalDate: dates.at(-1) ?? null,
    windows,
    signalModes: modes.map((mode) => {
      const matching = observations.filter(
        (observation) =>
          (observation.macdSignalMode ?? "unknown") === mode,
      );
      const eligible = matching.filter(
        (observation) => observation.outcomes[20].complete,
      );
      const hits = eligible.filter(
        (observation) => observation.outcomes[20].targetReached,
      );
      return {
        mode,
        samples: matching.length,
        eligible20DaySamples: eligible.length,
        hitRate20DayPercent:
          eligible.length > 0 ? (hits.length / eligible.length) * 100 : null,
      };
    }),
  };
}

export function selectSuccessfulSignalCases(
  observations: SignalResearchObservation[],
  limit = 12,
) {
  return observations
    .filter((observation) => observation.outcomes[20].targetReached)
    .sort(
      (left, right) =>
        (right.outcomes[20].maxReturnPercent ?? -Infinity) -
        (left.outcomes[20].maxReturnPercent ?? -Infinity),
    )
    .slice(0, limit);
}
