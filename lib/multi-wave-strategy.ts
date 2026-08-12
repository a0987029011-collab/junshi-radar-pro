import {
  getTrendlineBreakoutLowLine,
  type BreakoutLowLine,
  type TrackingLineSegment,
} from "./scanEngine.ts";
import type { Candle } from "./types.ts";
import type { TrendlineCorrection } from "./trendline-corrections.ts";

export type TrendlineWaveStatus =
  | "waiting-breakout"
  | "active"
  | "failed"
  | "parent-invalid";

export interface TrendlineWaveState {
  correction: TrendlineCorrection;
  waveNumber: number;
  line?: TrackingLineSegment;
  defense?: BreakoutLowLine;
  status: TrendlineWaveStatus;
}

function correctionLine(
  candles: Candle[],
  correction: TrendlineCorrection,
): TrackingLineSegment | undefined {
  const h1Index = candles.findIndex(
    (candle) => candle.time === correction.h1.date,
  );
  const h2Index = candles.findIndex(
    (candle) => candle.time === correction.h2.date,
  );
  if (h1Index < 0 || h2Index <= h1Index) return undefined;
  const h1 = candles[h1Index];
  const h2 = candles[h2Index];
  return {
    roundId: -(h1Index + 1),
    h1Index,
    h1Date: h1.time,
    startPrice: h1.high,
    endIndex: h2Index,
    endDate: h2.time,
    endPrice: h2.high,
    slope: (h2.high - h1.high) / (h2Index - h1Index),
  };
}

export function getTrendlineWaveStates(
  candles: Candle[],
  corrections: TrendlineCorrection[],
): TrendlineWaveState[] {
  const ordered = [...corrections].sort(
    (left, right) =>
      left.h1.date.localeCompare(right.h1.date) ||
      left.h2.date.localeCompare(right.h2.date) ||
      left.createdAt.localeCompare(right.createdAt),
  );
  let parentInvalid = false;

  return ordered.map((correction, index) => {
    const line = correctionLine(candles, correction);
    const defense = line
      ? getTrendlineBreakoutLowLine(candles, line)
      : undefined;
    let status: TrendlineWaveStatus = "waiting-breakout";

    if (parentInvalid) {
      status = "parent-invalid";
    } else if (defense?.active) {
      status = "active";
    } else if (defense) {
      status = "failed";
    }

    if (index === 0 && defense && !defense.active) parentInvalid = true;

    return {
      correction,
      waveNumber: index + 1,
      ...(line ? { line } : {}),
      ...(defense ? { defense } : {}),
      status,
    };
  });
}

export function getCurrentTrendlineWave(
  waves: TrendlineWaveState[],
) {
  return (
    [...waves].reverse().find((wave) => wave.status === "active") ??
    waves.at(-1)
  );
}
