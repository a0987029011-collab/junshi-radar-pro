import { calculateMacd } from "./indicators.ts";
import {
  priceOnTrackingLine,
  type TrackingLineSegment,
} from "./scanEngine.ts";
import type { CandlePoint, StockProfile } from "./stockData.ts";

export const REVERSAL_SIGNAL_NAME = "轉勢訊號";

export type ReversalBreakoutType =
  | "descending-line"
  | "rebound-high"
  | "dual-breakout";

export const REVERSAL_BREAKOUT_LABELS: Record<ReversalBreakoutType, string> = {
  "descending-line": "下降線突破",
  "rebound-high": "反彈高點突破",
  "dual-breakout": "雙重突破",
};

export interface StructuralPivot {
  kind: "high" | "low";
  index: number;
  confirmedIndex: number;
  date: string;
  confirmedDate: string;
  price: number;
}

export interface DescendingStructure {
  id: string;
  previousHigh: StructuralPivot;
  previousLow: StructuralPivot;
  lowerHigh: StructuralPivot;
  lastLow: StructuralPivot;
  line: TrackingLineSegment;
}

export interface ReversalQuality {
  lastLowHeld: boolean;
  macdWeakeningAfterLow: boolean;
  macdBullishTurn: boolean;
  redBreakoutCandle: boolean;
  volumeExpanded: boolean;
  averageVolume20: number | null;
  volumeRatio: number | null;
  score: number;
  reasons: string[];
}

export interface ReversalSignal extends ReversalQuality {
  name: typeof REVERSAL_SIGNAL_NAME;
  structureId: string;
  index: number;
  date: string;
  breakoutType: ReversalBreakoutType;
  breakoutLevel: number;
  descendingLinePrice: number;
  reboundHigh: StructuralPivot;
  lastLow: StructuralPivot;
  heldTradingDays: number;
}

export interface ActiveReversalSetup extends ReversalQuality {
  structureId: string;
  structure: DescendingStructure;
  reboundHigh: StructuralPivot;
  descendingLinePrice: number;
  nextBreakoutLevel: number | null;
  distanceToBreakoutPercent: number | null;
  heldTradingDays: number;
}

export interface ReversalStructureScan {
  pivots: StructuralPivot[];
  structures: DescendingStructure[];
  signals: ReversalSignal[];
  activeSetup?: ActiveReversalSetup;
}

export interface ReversalScanResult extends StockProfile {
  signalName: typeof REVERSAL_SIGNAL_NAME;
  status: "今日轉勢" | "等待突破" | "最近轉勢" | "尚未成形";
  latestClose: number;
  latestSignal?: ReversalSignal;
  signalOnLatestBar: boolean;
  activeSetup?: ActiveReversalSetup;
  signals: ReversalSignal[];
}

export interface ReversalIndicatorInput {
  macdHistogram?: number[];
}

function moreExtremePivot(
  current: StructuralPivot,
  candidate: StructuralPivot,
) {
  return current.kind === "high"
    ? candidate.price > current.price
    : candidate.price < current.price;
}

/**
 * Confirms a turning point when the next candle stops extending the extreme.
 * The rule reacts to structure changes and never waits for a fixed countdown.
 */
export function findStructuralPivots(candles: CandlePoint[]) {
  const raw: StructuralPivot[] = [];

  for (let index = 1; index < candles.length - 1; index += 1) {
    const previous = candles[index - 1];
    const candle = candles[index];
    const next = candles[index + 1];
    const highTurn = candle.high > previous.high && candle.high >= next.high;
    const lowTurn = candle.low < previous.low && candle.low <= next.low;

    if (!highTurn && !lowTurn) continue;

    const kind: StructuralPivot["kind"] =
      highTurn && lowTurn
        ? candle.close >= candle.open
          ? "low"
          : "high"
        : highTurn
          ? "high"
          : "low";
    raw.push({
      kind,
      index,
      confirmedIndex: index + 1,
      date: candle.date,
      confirmedDate: next.date,
      price: kind === "high" ? candle.high : candle.low,
    });
  }

  return raw.reduce<StructuralPivot[]>((pivots, candidate) => {
    const current = pivots.at(-1);
    if (!current || current.kind !== candidate.kind) {
      pivots.push(candidate);
    } else if (moreExtremePivot(current, candidate)) {
      pivots[pivots.length - 1] = candidate;
    }
    return pivots;
  }, []);
}

export function findDescendingStructures(candles: CandlePoint[]) {
  const pivots = findStructuralPivots(candles);
  const structures: DescendingStructure[] = [];

  for (let index = 3; index < pivots.length; index += 1) {
    const [previousHigh, previousLow, lowerHigh, lastLow] = pivots.slice(
      index - 3,
      index + 1,
    );
    if (
      previousHigh.kind !== "high" ||
      previousLow.kind !== "low" ||
      lowerHigh.kind !== "high" ||
      lastLow.kind !== "low" ||
      lowerHigh.price >= previousHigh.price ||
      lastLow.price >= previousLow.price
    ) {
      continue;
    }

    const line: TrackingLineSegment = {
      roundId: -(index + 1),
      h1Index: previousHigh.index,
      h1Date: previousHigh.date,
      startPrice: previousHigh.price,
      endIndex: lowerHigh.index,
      endDate: lowerHigh.date,
      endPrice: lowerHigh.price,
      slope:
        (lowerHigh.price - previousHigh.price) /
        (lowerHigh.index - previousHigh.index),
    };
    structures.push({
      id: `${lastLow.date}:${lastLow.index}`,
      previousHigh,
      previousLow,
      lowerHigh,
      lastLow,
      line,
    });
  }

  return { pivots, structures };
}

function average(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : null;
}

export function scoreReversalQuality(
  candles: CandlePoint[],
  macdHistogram: number[],
  lastLowIndex: number,
  index: number,
): ReversalQuality {
  const candle = candles[index];
  const lastLow = candles[lastLowIndex];
  const lastLowHeld = candles
    .slice(lastLowIndex + 1, index + 1)
    .every((item) => item.low >= lastLow.low);
  const macdWeakeningAfterLow = macdHistogram
    .slice(Math.max(lastLowIndex + 1, 1), index + 1)
    .some((current, offset) => {
      const currentIndex = Math.max(lastLowIndex + 1, 1) + offset;
      const previous = macdHistogram[currentIndex - 1];
      return (
        Number.isFinite(previous) &&
        Number.isFinite(current) &&
        previous < 0 &&
        current < 0 &&
        Math.abs(current) < Math.abs(previous)
      );
    });
  const previousHistogram = macdHistogram[index - 1];
  const currentHistogram = macdHistogram[index];
  const macdBullishTurn =
    index > 0 &&
    Number.isFinite(previousHistogram) &&
    Number.isFinite(currentHistogram) &&
    currentHistogram > 0 &&
    (previousHistogram <= 0 || currentHistogram > previousHistogram);
  const redBreakoutCandle = candle.close > candle.open;
  const volumeWindow = candles.slice(Math.max(0, index - 20), index);
  const averageVolume20 =
    volumeWindow.length === 20
      ? average(volumeWindow.map((item) => item.volume))
      : null;
  const volumeRatio =
    averageVolume20 && averageVolume20 > 0
      ? candle.volume / averageVolume20
      : null;
  const volumeExpanded = volumeRatio !== null && volumeRatio >= 1.2;
  const conditions = [
    [lastLowHeld, "最後新低後未再破低"],
    [macdWeakeningAfterLow, "MACD 負柱曾縮短"],
    [macdBullishTurn, "MACD 翻紅或紅柱增加"],
    [redBreakoutCandle, "突破 K 為紅 K"],
    [volumeExpanded, "突破量放大"],
  ] as const;

  return {
    lastLowHeld,
    macdWeakeningAfterLow,
    macdBullishTurn,
    redBreakoutCandle,
    volumeExpanded,
    averageVolume20,
    volumeRatio,
    score: conditions.filter(([matched]) => matched).length * 20,
    reasons: conditions.flatMap(([matched, reason]) =>
      matched ? [reason] : [],
    ),
  };
}

function latestConfirmedReboundHigh(
  pivots: StructuralPivot[],
  structure: DescendingStructure,
  beforeIndex: number,
) {
  return (
    pivots.findLast(
      (pivot) =>
        pivot.kind === "high" &&
        pivot.index > structure.lastLow.index &&
        pivot.confirmedIndex < beforeIndex,
    ) ?? structure.lowerHigh
  );
}

function breakoutType(
  descendingLineBreakout: boolean,
  reboundHighBreakout: boolean,
): ReversalBreakoutType {
  if (descendingLineBreakout && reboundHighBreakout) return "dual-breakout";
  return descendingLineBreakout ? "descending-line" : "rebound-high";
}

export function scanReversalStructure(
  candles: CandlePoint[],
  indicatorInput: ReversalIndicatorInput = {},
): ReversalStructureScan {
  const calculatedMacd = calculateMacd(candles.map((candle) => candle.close));
  const macdHistogram =
    indicatorInput.macdHistogram ?? calculatedMacd.histogram;
  const { pivots, structures } = findDescendingStructures(candles);
  const signals: ReversalSignal[] = [];
  let activeSetup: ActiveReversalSetup | undefined;

  for (const structure of structures) {
    let invalidated = false;
    let signal: ReversalSignal | undefined;

    for (
      let index = structure.lastLow.confirmedIndex + 1;
      index < candles.length;
      index += 1
    ) {
      const candle = candles[index];
      const previous = candles[index - 1];
      if (candle.low < structure.lastLow.price) {
        invalidated = true;
        break;
      }

      const reboundHigh = latestConfirmedReboundHigh(
        pivots,
        structure,
        index,
      );
      const descendingLinePrice = priceOnTrackingLine(structure.line, index);
      const previousLinePrice = priceOnTrackingLine(
        structure.line,
        index - 1,
      );
      const descendingLineBreakout =
        previous.close <= previousLinePrice &&
        candle.close > descendingLinePrice;
      const reboundHighBreakout =
        previous.close <= reboundHigh.price && candle.close > reboundHigh.price;
      const quality = scoreReversalQuality(
        candles,
        macdHistogram,
        structure.lastLow.index,
        index,
      );

      if (
        quality.redBreakoutCandle &&
        (descendingLineBreakout || reboundHighBreakout)
      ) {
        const type = breakoutType(
          descendingLineBreakout,
          reboundHighBreakout,
        );
        signal = {
          ...quality,
          name: REVERSAL_SIGNAL_NAME,
          structureId: structure.id,
          index,
          date: candle.date,
          breakoutType: type,
          breakoutLevel:
            type === "dual-breakout"
              ? Math.max(descendingLinePrice, reboundHigh.price)
              : type === "descending-line"
                ? descendingLinePrice
                : reboundHigh.price,
          descendingLinePrice,
          reboundHigh,
          lastLow: structure.lastLow,
          heldTradingDays: index - structure.lastLow.index,
        };
        signals.push(signal);
        break;
      }
    }

    if (signal || invalidated || structure !== structures.at(-1)) continue;

    const lastIndex = candles.length - 1;
    if (lastIndex <= structure.lastLow.confirmedIndex) continue;
    const reboundHigh = latestConfirmedReboundHigh(
      pivots,
      structure,
      lastIndex + 1,
    );
    const descendingLinePrice = priceOnTrackingLine(
      structure.line,
      lastIndex,
    );
    const latestClose = candles[lastIndex].close;
    const pendingLevels = [descendingLinePrice, reboundHigh.price].filter(
      (level) => level >= latestClose,
    );
    const nextBreakoutLevel = pendingLevels.length
      ? Math.min(...pendingLevels)
      : null;
    activeSetup = {
      ...scoreReversalQuality(
        candles,
        macdHistogram,
        structure.lastLow.index,
        lastIndex,
      ),
      structureId: structure.id,
      structure,
      reboundHigh,
      descendingLinePrice,
      nextBreakoutLevel,
      distanceToBreakoutPercent:
        nextBreakoutLevel === null || latestClose <= 0
          ? null
          : ((nextBreakoutLevel - latestClose) / latestClose) * 100,
      heldTradingDays: lastIndex - structure.lastLow.index,
    };
  }

  return { pivots, structures, signals, activeSetup };
}

export function scanReversalStock(stock: StockProfile): ReversalScanResult {
  const trace = scanReversalStructure(stock.candles);
  const latestSignal = trace.signals.at(-1);
  const signalOnLatestBar = latestSignal?.index === stock.candles.length - 1;

  return {
    ...stock,
    signalName: REVERSAL_SIGNAL_NAME,
    status: signalOnLatestBar
      ? "今日轉勢"
      : trace.activeSetup
        ? "等待突破"
        : latestSignal
          ? "最近轉勢"
          : "尚未成形",
    latestClose: stock.candles.at(-1)?.close ?? 0,
    latestSignal,
    signalOnLatestBar,
    activeSetup: trace.activeSetup,
    signals: trace.signals,
  };
}

export function scanReversalStocks(stocks: StockProfile[]) {
  return stocks.map(scanReversalStock).sort((left, right) => {
    if (right.signalOnLatestBar !== left.signalOnLatestBar) {
      return Number(right.signalOnLatestBar) - Number(left.signalOnLatestBar);
    }
    if (Boolean(right.activeSetup) !== Boolean(left.activeSetup)) {
      return Number(Boolean(right.activeSetup)) - Number(Boolean(left.activeSetup));
    }
    const rightScore = right.latestSignal?.score ?? right.activeSetup?.score ?? 0;
    const leftScore = left.latestSignal?.score ?? left.activeSetup?.score ?? 0;
    if (rightScore !== leftScore) return rightScore - leftScore;
    return (right.latestSignal?.date ?? "").localeCompare(
      left.latestSignal?.date ?? "",
    );
  });
}
