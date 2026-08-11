import {
  getLatestBreakoutLowLine,
  getTrendlineBreakoutLowLine,
  type H1TrendlineScan,
  type TrackingLineSegment
} from "./scanEngine.ts";
import type { Candle } from "./types.ts";
import type { TrendlineCorrection } from "./trendline-corrections.ts";

export function getSystemDisplayTrendline(trace: H1TrendlineScan) {
  const latestSignal = [...trace.signals].reverse().find((signal) =>
    trace.lineSegments.some(
      (line) =>
        line.roundId === signal.roundId &&
        line.endIndex === signal.sourceEndIndex &&
        line.slope < 0
    )
  );
  const h1 = latestSignal
    ? trace.h1Points.find((point) => point.roundId === latestSignal.roundId)
    : trace.activeH1;
  const line = latestSignal
    ? trace.lineSegments.find(
        (candidate) =>
          candidate.roundId === latestSignal.roundId &&
          candidate.endIndex === latestSignal.sourceEndIndex
      )
    : trace.currentLine;

  return { h1, latestSignal, line };
}

export function getCorrectionTrackingLine(
  candles: Candle[],
  correction?: TrendlineCorrection | null
): TrackingLineSegment | undefined {
  if (
    !correction ||
    correction.timeframe !== "day" ||
    correction.adjustment !== "adjusted"
  ) {
    return undefined;
  }
  const h1Index = candles.findIndex(
    (candle) => candle.time === correction.h1.date
  );
  const h2Index = candles.findIndex(
    (candle) => candle.time === correction.h2.date
  );
  if (h1Index < 0 || h2Index <= h1Index) return undefined;
  const h1 = candles[h1Index];
  const h2 = candles[h2Index];

  return {
    roundId: -1,
    h1Index,
    h1Date: h1.time,
    startPrice: h1.high,
    endIndex: h2Index,
    endDate: h2.time,
    endPrice: h2.high,
    slope: (h2.high - h1.high) / (h2Index - h1Index)
  };
}

export function getDisplayedActiveSupportLine(
  candles: Candle[],
  trace: H1TrendlineScan,
  displayedLine?: TrackingLineSegment
) {
  const trendline = displayedLine ?? getSystemDisplayTrendline(trace).line;
  const currentLine = trendline
    ? getTrendlineBreakoutLowLine(candles, trendline)
    : undefined;
  if (currentLine?.active) return currentLine;
  return getLatestBreakoutLowLine(candles, trace.signals);
}
