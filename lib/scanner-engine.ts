import type { Candle } from "./types";

export interface Trendline {
  slope: number;
  intercept: number;
  touchIndexes: number[];
}

export function findSwingHighIndexes(candles: Candle[], radius = 2) {
  const indexes: number[] = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const window = candles.slice(index - radius, index + radius + 1);
    if (candles[index].high === Math.max(...window.map((item) => item.high))) {
      indexes.push(index);
    }
  }
  return indexes;
}

export function fitDescendingTrendline(
  candles: Candle[],
  minimumTouches = 2
): Trendline | null {
  const swingIndexes = findSwingHighIndexes(candles);
  if (swingIndexes.length < minimumTouches) return null;

  const priceRange =
    Math.max(...candles.map((candle) => candle.high)) -
    Math.min(...candles.map((candle) => candle.low));
  const tolerance = Math.max(priceRange * 0.018, Number.EPSILON);
  let best:
    | (Trendline & {
        score: number;
      })
    | null = null;

  // Evaluate every descending pair. A useful resistance line should connect
  // real swing highs, span a meaningful part of the chart, and not cut through
  // intervening candle highs.
  for (let left = 0; left < swingIndexes.length - 1; left += 1) {
    for (let right = left + 1; right < swingIndexes.length; right += 1) {
      const first = swingIndexes[left];
      const last = swingIndexes[right];
      if (candles[last].high >= candles[first].high) continue;

      const slope =
        (candles[last].high - candles[first].high) / (last - first);
      const intercept = candles[first].high - slope * first;
      let violations = 0;

      for (let index = first + 1; index < last; index += 1) {
        const linePrice = intercept + slope * index;
        if (candles[index].high > linePrice + tolerance) violations += 1;
      }

      const touchIndexes = swingIndexes.filter((index) => {
        if (index < first || index > last) return false;
        const linePrice = intercept + slope * index;
        return Math.abs(candles[index].high - linePrice) <= tolerance;
      });
      if (touchIndexes.length < minimumTouches) continue;

      const span = (last - first) / Math.max(1, candles.length - 1);
      const score = touchIndexes.length * 10 + span * 5 - violations * 8;
      if (!best || score > best.score) {
        best = { slope, intercept, touchIndexes, score };
      }
    }
  }

  if (!best) return null;
  return {
    slope: best.slope,
    intercept: best.intercept,
    touchIndexes: best.touchIndexes
  };
}

export function detectBreakout(candle: Candle, index: number, line: Trendline) {
  const trendlinePrice = line.intercept + line.slope * index;
  return {
    trendlinePrice,
    openBreakout: candle.open > trendlinePrice,
    intradayBreakout: candle.high > trendlinePrice,
    closeConfirmed: candle.close > trendlinePrice
  };
}

export function findShrinkingHistogramSupport(
  candles: Candle[],
  minimumBarsUnbroken: number
) {
  for (
    let index = candles.length - minimumBarsUnbroken - 1;
    index >= 2;
    index -= 1
  ) {
    const shrinking =
      Math.abs(candles[index].histogram) <
        Math.abs(candles[index - 1].histogram) &&
      Math.abs(candles[index - 1].histogram) <
        Math.abs(candles[index - 2].histogram);
    if (!shrinking) continue;
    const support = candles[index].low;
    const forward = candles.slice(index + 1);
    if (forward.every((candle) => candle.low >= support)) {
      return {
        startIndex: index - 2,
        supportIndex: index,
        support,
        unbrokenBars: forward.length
      };
    }
  }
  return null;
}
