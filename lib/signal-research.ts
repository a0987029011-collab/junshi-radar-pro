import { getMarketCandles } from "./market-data.ts";
import { calculateDpo, calculateMacd } from "./indicators.ts";
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

export const AUTONOMOUS_FILTER_KEY =
  "bullish-pullback-volume-breakout" as const;

export interface RecentKResearchSnapshot {
  lookbackDays: 3;
  priorDownCloseCount: number;
  priorDayWasDown: boolean;
  currentLongRed: boolean;
  currentVolumeRatio20: number;
  macdPositiveRising: boolean;
  macdHistogramReexpanded: boolean;
  dpoTurnedUp: boolean;
  autonomousPattern: typeof AUTONOMOUS_FILTER_KEY | "none";
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
    recentK?: RecentKResearchSnapshot;
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

export const HIGH_CONFIDENCE_THRESHOLDS = {
  minimumSamples: 80,
  minimumUniqueStocks: 40,
  minimumUniqueDates: 20,
  minimumHitRatePercent: 70,
  minimumWilsonLowerBoundPercent: 65,
  minimumRecentSamples: 30,
  minimumRecentHitRatePercent: 60,
  minimumLiftPercent: 10,
  minimumAverageCloseReturnPercent: 5,
  minimumAverageAdversePercent: -10,
} as const;

export interface HighConfidenceSignalEvidence {
  samples: number;
  uniqueStocks: number;
  uniqueSignalDates: number;
  hitRatePercent: number;
  wilsonLowerBoundPercent: number;
  recentSamples: number;
  recentHitRatePercent: number;
  baselineHitRatePercent: number;
  liftPercent: number;
  averageCloseReturnPercent: number;
  averageMaxReturnPercent: number;
  averageAdversePercent: number;
}

export interface HighConfidenceSignalCandidate {
  observationKey: string;
  symbol: string;
  name: string;
  market: string;
  sector: string;
  signalDate: string;
  entryPrice: number;
  signalKind: SignalResearchObservation["signalKind"];
  breakoutType: SignalResearchObservation["breakoutType"];
  macdSignalMode: SignalResearchObservation["macdSignalMode"];
  logicLabels: string[];
  evidence: HighConfidenceSignalEvidence;
}

export interface AutonomousFilterReview {
  key: typeof AUTONOMOUS_FILTER_KEY;
  label: string;
  status: "monitoring" | "active";
  matchedCurrentSignals: number;
  evidence: HighConfidenceSignalEvidence;
}

export interface HighConfidenceSignalReview {
  dataAsOf: string;
  evaluatedSignals: number;
  qualifiedSignals: number;
  candidates: HighConfidenceSignalCandidate[];
  autonomousFilters: AutonomousFilterReview[];
  thresholds: typeof HIGH_CONFIDENCE_THRESHOLDS;
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

function timeframeGroupKey(time: string, timeframe: Exclude<Timeframe, "day">) {
  if (timeframe === "month") return time.slice(0, 7);
  const date = new Date(`${time}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function recalculateIndicators(candles: Candle[]) {
  const closes = candles.map((candle) => candle.close);
  const macd = calculateMacd(closes);
  const dpo = calculateDpo(closes);
  return candles.map((candle, index) => ({
    ...candle,
    macd: macd.macd[index],
    signal: macd.signal[index],
    histogram: macd.histogram[index],
    dpo: dpo[index],
  }));
}

/**
 * Builds the week/month series exactly as it was knowable on signalDate.
 * The current aggregate candle is rebuilt from daily candles only through the
 * signal date so its later high, close and volume cannot leak into research.
 */
export function buildNoLookAheadTimeframeCandles(
  aggregateCandles: Candle[],
  dailyCandles: Candle[],
  signalDate: string,
  timeframe: Exclude<Timeframe, "day">,
) {
  const groupKey = timeframeGroupKey(signalDate, timeframe);
  const partialRows = dailyCandles.filter(
    (candle) =>
      candle.time <= signalDate &&
      timeframeGroupKey(candle.time, timeframe) === groupKey,
  );
  if (!partialRows.length) return [];

  const partialCandle: Candle = {
    time: signalDate,
    open: partialRows[0].open,
    high: Math.max(...partialRows.map((candle) => candle.high)),
    low: Math.min(...partialRows.map((candle) => candle.low)),
    close: partialRows.at(-1)?.close ?? partialRows[0].close,
    volume: partialRows.reduce((total, candle) => total + candle.volume, 0),
    macd: 0,
    signal: 0,
    histogram: 0,
    dpo: 0,
  };
  const history = aggregateCandles.filter(
    (candle) => timeframeGroupKey(candle.time, timeframe) < groupKey,
  );
  return recalculateIndicators([...history, partialCandle]);
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
  timeframe: Exclude<Timeframe, "day">,
  signalDate: string,
  dailyCandles: Candle[],
) {
  const aggregateCandles =
    getMarketCandles(symbol, timeframe, "adjusted") ?? [];
  const candles = buildNoLookAheadTimeframeCandles(
    aggregateCandles,
    dailyCandles,
    signalDate,
    timeframe,
  );
  return buildTimeframeResearchSnapshot(candles, candles.length - 1, timeframe);
}

export function buildRecentKResearchSnapshot(
  candles: Candle[],
  signalIndex: number,
  macdSignalMode: MacdSignalMode | null,
): RecentKResearchSnapshot {
  const current = candles[signalIndex];
  const previous = candles[signalIndex - 1];
  const previous2 = candles[signalIndex - 2];
  const recent = candles.slice(Math.max(0, signalIndex - 3), signalIndex);
  const priorDownCloseCount = recent.reduce((count, candle, index) => {
    const previousCandle = candles[signalIndex - recent.length + index - 1];
    return count + (previousCandle && candle.close < previousCandle.close ? 1 : 0);
  }, 0);
  const range = current
    ? Math.max(current.high - current.low, Number.EPSILON)
    : Number.EPSILON;
  const currentLongRed = Boolean(
    current &&
      current.close > current.open &&
      (current.close - current.open) / range >= 0.65,
  );
  const volumeWindow = candles
    .slice(Math.max(0, signalIndex - 19), signalIndex + 1)
    .map((candle) => candle.volume);
  const average20 = average(volumeWindow);
  const currentVolumeRatio20 =
    current && average20 > 0 ? current.volume / average20 : 0;
  const priorDayWasDown = Boolean(
    previous && previous2 && previous.close < previous2.close,
  );
  const macdPositiveRising = macdSignalMode === "positive-rising";
  const macdHistogramReexpanded = Boolean(
    current && previous && current.histogram > previous.histogram,
  );
  const dpoTurnedUp = Boolean(
    current &&
      previous &&
      previous2 &&
      previous.dpo <= previous2.dpo &&
      current.dpo > previous.dpo,
  );
  const matchesAutonomousPattern =
    priorDayWasDown &&
    currentLongRed &&
    currentVolumeRatio20 >= 1.2 &&
    macdPositiveRising;

  return {
    lookbackDays: 3,
    priorDownCloseCount,
    priorDayWasDown,
    currentLongRed,
    currentVolumeRatio20,
    macdPositiveRising,
    macdHistogramReexpanded,
    dpoTurnedUp,
    autonomousPattern: matchesAutonomousPattern
      ? AUTONOMOUS_FILTER_KEY
      : "none",
  };
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
      month: timeframeSnapshot(
        profile.symbol,
        "month",
        signal.date,
        dailyCandles,
      ),
      week: timeframeSnapshot(
        profile.symbol,
        "week",
        signal.date,
        dailyCandles,
      ),
      day: buildTimeframeResearchSnapshot(dailyCandles, signalIndex, "day"),
      recentK: buildRecentKResearchSnapshot(
        dailyCandles,
        signalIndex,
        signal.macdSignalMode ?? null,
      ),
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

function ma35Position(snapshot: TimeframeResearchSnapshot | null) {
  if (!snapshot) return "unknown";
  const ma35 = snapshot.movingAverages.find((item) => item.period === 35);
  if (ma35?.value === null || ma35?.value === undefined) return "unknown";
  return snapshot.close >= ma35.value ? "above" : "below";
}

function timeframeRegime(snapshot: TimeframeResearchSnapshot | null) {
  if (!snapshot) return "unknown";
  return `${snapshot.dpo.direction}-${ma35Position(snapshot)}`;
}

function highConfidenceSignature(observation: SignalResearchObservation) {
  return [
    observation.macdSignalMode ?? "unknown",
    observation.breakoutType ?? "intraday-only",
    timeframeRegime(observation.snapshot.week),
    timeframeRegime(observation.snapshot.month),
  ].join("|");
}

function directionLabel(value: Direction) {
  return value === "rising" ? "DPO 上彎" : value === "falling" ? "DPO 下彎" : "DPO 走平";
}

function timeframeLogicLabel(
  label: "月" | "週",
  snapshot: TimeframeResearchSnapshot | null,
) {
  if (!snapshot) return `${label}線資料不足`;
  const position = ma35Position(snapshot);
  return `${label}${directionLabel(snapshot.dpo.direction)}、${
    position === "above"
      ? "站上 MA35"
      : position === "below"
        ? "位於 MA35 下"
        : "MA35 資料不足"
  }`;
}

function highConfidenceLogicLabels(observation: SignalResearchObservation) {
  const macd =
    observation.macdSignalMode === "positive-rising"
      ? "MACD 零軸上雙線向上"
      : observation.macdSignalMode === "negative-weakening"
        ? "MACD 負柱縮短"
        : "MACD 其他型態";
  const breakout =
    observation.breakoutType === "body-cross"
      ? "紅 K 實體穿越"
      : observation.breakoutType === "gap-above"
        ? "跳空紅 K 站上"
        : "盤中穿越預警";
  return [
    macd,
    breakout,
    timeframeLogicLabel("週", observation.snapshot.week),
    timeframeLogicLabel("月", observation.snapshot.month),
  ];
}

function hitRatePercent(observations: SignalResearchObservation[]) {
  if (!observations.length) return 0;
  return (
    (observations.filter((item) => item.outcomes[20].targetReached).length /
      observations.length) *
    100
  );
}

function wilsonLowerBoundPercent(successes: number, samples: number) {
  if (samples <= 0) return 0;
  const z = 1.96;
  const probability = successes / samples;
  const denominator = 1 + (z * z) / samples;
  const center = probability + (z * z) / (2 * samples);
  const margin =
    z *
    Math.sqrt(
      (probability * (1 - probability) + (z * z) / (4 * samples)) /
        samples,
    );
  return ((center - margin) / denominator) * 100;
}

function averageOutcome(
  observations: SignalResearchObservation[],
  field: "closeReturnPercent" | "maxReturnPercent" | "maxDrawdownPercent",
) {
  const values = observations.flatMap((observation) => {
    const value = observation.outcomes[20][field];
    return value === null ? [] : [value];
  });
  return values.length ? average(values) : 0;
}

function evaluateHighConfidenceEvidence(
  matching: SignalResearchObservation[],
  baselineHitRatePercent: number,
) {
  const splitIndex = Math.max(1, Math.floor(matching.length * 0.7));
  const recent = matching.slice(splitIndex);
  const hits = matching.filter(
    (observation) => observation.outcomes[20].targetReached,
  ).length;
  const hitRate = hitRatePercent(matching);
  const recentHitRate = hitRatePercent(recent);
  const evidence: HighConfidenceSignalEvidence = {
    samples: matching.length,
    uniqueStocks: new Set(matching.map((item) => item.symbol)).size,
    uniqueSignalDates: new Set(matching.map((item) => item.signalDate)).size,
    hitRatePercent: hitRate,
    wilsonLowerBoundPercent: wilsonLowerBoundPercent(hits, matching.length),
    recentSamples: recent.length,
    recentHitRatePercent: recentHitRate,
    baselineHitRatePercent,
    liftPercent: hitRate - baselineHitRatePercent,
    averageCloseReturnPercent: averageOutcome(
      matching,
      "closeReturnPercent",
    ),
    averageMaxReturnPercent: averageOutcome(matching, "maxReturnPercent"),
    averageAdversePercent: averageOutcome(matching, "maxDrawdownPercent"),
  };
  const passes =
    evidence.samples >= HIGH_CONFIDENCE_THRESHOLDS.minimumSamples &&
    evidence.uniqueStocks >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumUniqueStocks &&
    evidence.uniqueSignalDates >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumUniqueDates &&
    evidence.hitRatePercent >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumHitRatePercent &&
    evidence.wilsonLowerBoundPercent >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumWilsonLowerBoundPercent &&
    evidence.recentSamples >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumRecentSamples &&
    evidence.recentHitRatePercent >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumRecentHitRatePercent &&
    evidence.liftPercent >= HIGH_CONFIDENCE_THRESHOLDS.minimumLiftPercent &&
    evidence.averageCloseReturnPercent >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumAverageCloseReturnPercent &&
    evidence.averageAdversePercent >=
      HIGH_CONFIDENCE_THRESHOLDS.minimumAverageAdversePercent;
  return { evidence, passes };
}

function matchesAutonomousFilter(observation: SignalResearchObservation) {
  return (
    observation.snapshot.recentK?.autonomousPattern === AUTONOMOUS_FILTER_KEY
  );
}

function candidateFromEvidence(
  current: SignalResearchObservation,
  evidence: HighConfidenceSignalEvidence,
  extraLogicLabels: string[] = [],
): HighConfidenceSignalCandidate {
  return {
    observationKey: current.observationKey,
    symbol: current.symbol,
    name: current.name,
    market: current.market,
    sector: current.sector,
    signalDate: current.signalDate,
    entryPrice: current.entryPrice,
    signalKind: current.signalKind,
    breakoutType: current.breakoutType,
    macdSignalMode: current.macdSignalMode,
    logicLabels: [...highConfidenceLogicLabels(current), ...extraLogicLabels],
    evidence,
  };
}

export function deriveHighConfidenceSignalReview(
  observations: SignalResearchObservation[],
  dataAsOf: string,
): HighConfidenceSignalReview {
  const currentSignals = observations.filter(
    (observation) => observation.signalDate === dataAsOf,
  );
  const historical = observations
    .filter(
      (observation) =>
        observation.signalDate < dataAsOf && observation.outcomes[20].complete,
    )
    .sort(
      (left, right) =>
        left.signalDate.localeCompare(right.signalDate) ||
        left.observationKey.localeCompare(right.observationKey),
    );
  const baselineHitRatePercent = hitRatePercent(historical);

  const autonomousMatching = historical.filter(matchesAutonomousFilter);
  const autonomousEvaluation = evaluateHighConfidenceEvidence(
    autonomousMatching,
    baselineHitRatePercent,
  );
  const autonomousFilters: AutonomousFilterReview[] = [
    {
      key: AUTONOMOUS_FILTER_KEY,
      label: "多頭回檔後放量長紅",
      status: autonomousEvaluation.passes ? "active" : "monitoring",
      matchedCurrentSignals: currentSignals.filter(matchesAutonomousFilter)
        .length,
      evidence: autonomousEvaluation.evidence,
    },
  ];

  const candidates = currentSignals.flatMap(
    (current): HighConfidenceSignalCandidate[] => {
      const signature = highConfidenceSignature(current);
      const matching = historical.filter(
        (observation) => highConfidenceSignature(observation) === signature,
      );
      const baseEvaluation = evaluateHighConfidenceEvidence(
        matching,
        baselineHitRatePercent,
      );

      if (baseEvaluation.passes) {
        return [candidateFromEvidence(current, baseEvaluation.evidence)];
      }
      if (autonomousEvaluation.passes && matchesAutonomousFilter(current)) {
        return [
          candidateFromEvidence(current, autonomousEvaluation.evidence, [
            "自主驗證：多頭回檔後放量長紅",
          ]),
        ];
      }
      return [];
    },
  );

  return {
    dataAsOf,
    evaluatedSignals: currentSignals.length,
    qualifiedSignals: candidates.length,
    candidates: candidates.sort(
      (left, right) =>
        right.evidence.recentHitRatePercent -
          left.evidence.recentHitRatePercent ||
        right.evidence.wilsonLowerBoundPercent -
          left.evidence.wilsonLowerBoundPercent ||
        left.symbol.localeCompare(right.symbol),
    ),
    autonomousFilters,
    thresholds: HIGH_CONFIDENCE_THRESHOLDS,
  };
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
