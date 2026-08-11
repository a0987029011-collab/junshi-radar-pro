import { getMarketCandles } from "./market-data.ts";
import type { Candle } from "./types.ts";

export interface PositionMarketSnapshot {
  dataDate: string;
  marketClose: number;
  macd: {
    value: number;
    signal: number;
    histogram: number;
    state: "positive-strengthening" | "positive-weakening" | "negative-strengthening" | "negative-weakening";
  };
  dpo: {
    value: number;
    direction: "rising" | "falling" | "flat";
  };
  volume: {
    value: number;
    average20: number;
    ratioToAverage20: number;
  };
  ma35: {
    value: number | null;
    slope: number | null;
    priceDistancePercent: number | null;
    deductionValue: number | null;
    deductionDate: string | null;
  };
}

function average(values: number[]) {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function movingAverage(candles: Candle[], index: number, period: number) {
  if (index < period - 1) return null;
  return average(
    candles.slice(index - period + 1, index + 1).map((candle) => candle.close)
  );
}

function marketDateAtTaipei(occurredAt: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(occurredAt));
}

export function buildPositionMarketSnapshot(
  candles: Candle[],
  index: number
): PositionMarketSnapshot | null {
  const candle = candles[index];
  if (!candle) return null;
  const previous = candles[index - 1];
  const histogramStrengthening = previous
    ? Math.abs(candle.histogram) > Math.abs(previous.histogram)
    : false;
  const histogramSide = candle.histogram >= 0 ? "positive" : "negative";
  const histogramState = `${histogramSide}-${
    histogramStrengthening ? "strengthening" : "weakening"
  }` as PositionMarketSnapshot["macd"]["state"];
  const dpoDirection = !previous
    ? "flat"
    : candle.dpo > previous.dpo
      ? "rising"
      : candle.dpo < previous.dpo
        ? "falling"
        : "flat";
  const volumeWindow = candles
    .slice(Math.max(0, index - 19), index + 1)
    .map((item) => item.volume);
  const average20 = average(volumeWindow);
  const ma35 = movingAverage(candles, index, 35);
  const previousMa35 = movingAverage(candles, index - 1, 35);
  const deductionIndex = index - 34;
  const deductionCandle = candles[deductionIndex];

  return {
    dataDate: candle.time,
    marketClose: candle.close,
    macd: {
      value: candle.macd,
      signal: candle.signal,
      histogram: candle.histogram,
      state: histogramState
    },
    dpo: {
      value: candle.dpo,
      direction: dpoDirection
    },
    volume: {
      value: candle.volume,
      average20,
      ratioToAverage20: average20 > 0 ? candle.volume / average20 : 0
    },
    ma35: {
      value: ma35,
      slope: ma35 !== null && previousMa35 !== null ? ma35 - previousMa35 : null,
      priceDistancePercent:
        ma35 !== null && ma35 !== 0
          ? ((candle.close - ma35) / ma35) * 100
          : null,
      deductionValue: deductionCandle?.close ?? null,
      deductionDate: deductionCandle?.time ?? null
    }
  };
}

export function getPositionMarketSnapshot(
  symbol: string,
  occurredAt: string
) {
  const candles = getMarketCandles(symbol, "day", "adjusted") ?? [];
  const targetDate = marketDateAtTaipei(occurredAt);
  let index = candles.findLastIndex((candle) => candle.time <= targetDate);
  if (index < 0) index = candles.length - 1;
  return buildPositionMarketSnapshot(candles, index);
}
