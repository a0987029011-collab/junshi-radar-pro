import type { CandlePoint, StockProfile } from './stockData.ts';
import { calculateMacd } from './indicators.ts';
import { fitDescendingTrendline } from './scanner-engine.ts';

export interface ScanResultItem extends StockProfile {
  score: number;
  structureScore: number;
  structureGrade: 'A級' | 'B級' | '觀察級';
  trend: string;
  reasons: string[];
  latestClose: number;
  latestVolume: number;
  majorTrendline: boolean;
  followTrendline: boolean;
  h3Formed: boolean;
  h3Index?: number;
  momentumDecay: boolean;
  structureState: string;
  stopLoss?: number;
}

export function scanStock(stock: StockProfile): ScanResultItem {
  return scanStocks([stock], 1)[0];
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function findSwingLowIndexes(candles: CandlePoint[], radius = 2) {
  const indexes: number[] = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const window = candles.slice(index - radius, index + radius + 1);
    if (candles[index].low === Math.min(...window.map((item) => item.low))) {
      indexes.push(index);
    }
  }
  return indexes;
}

function slope(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const start = values[0];
  const end = values[values.length - 1];
  return (end - start) / Math.max(1, values.length - 1);
}

function rangeTolerance(candles: CandlePoint[]) {
  const highs = candles.map((candle) => candle.high);
  const lows = candles.map((candle) => candle.low);
  return Math.max((Math.max(...highs) - Math.min(...lows)) * 0.02, 0.1);
}

function trendlineCoversCandles(
  line: { slope: number; intercept: number },
  candles: CandlePoint[],
  tolerance: number,
  useClose = false
) {
  return candles.every((candle, index) => {
    const linePrice = line.intercept + line.slope * index;
    const value = useClose ? candle.close : candle.high;
    return value <= linePrice + tolerance;
  });
}

function isValidTrendlineWithinAnchorRange(
  line: { slope: number; intercept: number; touchIndexes: number[] },
  candles: CandlePoint[],
  tolerance: number
) {
  const lastTouch = line.touchIndexes.at(-1)!;
  return candles
    .slice(0, lastTouch + 1)
    .every((candle, index) => {
      const linePrice = line.intercept + line.slope * index;
      return candle.high <= linePrice + tolerance;
    });
}

function stoppedMakingNewLows(swingLowIndexes: number[], candles: CandlePoint[]) {
  if (swingLowIndexes.length < 2) return false;

  const recent = swingLowIndexes
    .slice(-3)
    .map((index) => candles[index].low);

  return recent.length >= 2 && recent.at(-1)! >= recent.at(-2)!;
}

function bearishMomentumDecay(macdHistogram: number[], closes: number[]) {
  const recent = macdHistogram.filter(Number.isFinite).slice(-3);
  const hasShrinkingNegative =
    recent.length >= 3 &&
    recent.every((value) => value < 0) &&
    Math.abs(recent[2]) < Math.abs(recent[1]) &&
    Math.abs(recent[1]) < Math.abs(recent[0]);

  const recentCloses = closes.slice(-8);
  const slopeValue = slope(recentCloses);
  const slopeFlattening = slopeValue > -0.008;

  return hasShrinkingNegative && slopeFlattening;
}

function pickStructuralStopLoss(candles: CandlePoint[]) {
  const swingLowIndexes = findSwingLowIndexes(candles, 2);
  if (swingLowIndexes.length >= 1) {
    return candles[swingLowIndexes.at(-1)!].low;
  }
  return Math.min(...candles.slice(-8).map((candle) => candle.low));
}

export function scanStocks(stocks: StockProfile[], limit = 8): ScanResultItem[] {
  return stocks
    .map((stock) => {
      const closes = stock.candles.map((candle) => candle.close);
      const latestClose = closes.at(-1) ?? 0;
      const latestVolume = stock.candles.at(-1)?.volume ?? 0;
      const macd = calculateMacd(closes);
      const chartTolerance = rangeTolerance(stock.candles);
      const swingLowIndexes = findSwingLowIndexes(stock.candles, 2);
      const structuralStopLoss = pickStructuralStopLoss(stock.candles);
      const largeTrendline = fitDescendingTrendline(stock.candles, 2);
      const followCandles = stock.candles.slice(Math.max(0, stock.candles.length - 28));
      const followTrendline = followCandles.length >= 6 ? fitDescendingTrendline(followCandles, 2) : null;

      const reasons: string[] = [];
      let score = 30;

      const majorLineValid =
        largeTrendline &&
        largeTrendline.slope < 0 &&
        isValidTrendlineWithinAnchorRange(
          largeTrendline,
          stock.candles,
          chartTolerance
        );

      if (majorLineValid) {
        reasons.push('大級別下降趨勢線');
        score += 25;
      }

      const followLineValid =
        followTrendline &&
        followTrendline.slope < 0 &&
        isValidTrendlineWithinAnchorRange(
          followTrendline,
          followCandles,
          chartTolerance * 1.4
        );

      if (followLineValid) {
        reasons.push('跟隨下降趨勢線');
        score += 20;
      }

      const h3AfterNoNewLow = stoppedMakingNewLows(swingLowIndexes, stock.candles);
      if (h3AfterNoNewLow) {
        reasons.push('H3 後不再創新低');
        score += 18;
      }

      const momentumDecay = bearishMomentumDecay(macd.histogram, closes);
      const noNewLowAfterStructure = swingLowIndexes.length >= 2 &&
        stock.candles[swingLowIndexes.at(-1)!].low >= stock.candles[swingLowIndexes.at(-2)!].low;

      let structureScore = 0;

      if (momentumDecay && noNewLowAfterStructure) {
        reasons.push('空方動能衰退');
        score += 18;
        structureScore += 6;
      }

      if (h3AfterNoNewLow) {
        reasons.push('H3 後不再創新低');
        score += 18;
        structureScore += 6;
      }

      if (majorLineValid) {
        structureScore += 4;
      }

      if (followLineValid) {
        structureScore += 4;
      }

      if (majorLineValid && followLineValid) {
        structureScore += 2;
      }

      structureScore = Math.min(20, structureScore);
      const structureGrade:
        | 'A級'
        | 'B級'
        | '觀察級' = structureScore >= 15
        ? 'A級'
        : structureScore >= 8
        ? 'B級'
        : '觀察級';

      let structureState = '結構破壞';
      if (majorLineValid && followLineValid) {
        structureState = '下降趨勢中';
      } else if (majorLineValid && !followLineValid) {
        structureState = '下降趨勢壓縮';
      } else if (momentumDecay) {
        structureState = '空方動能衰退';
      } else if (h3AfterNoNewLow) {
        structureState = 'H3 成形';
      }

      if (reasons.length === 0) {
        reasons.push('觀察中');
      }

      const trend = score >= 80 ? '強勢空頭反轉' : score >= 60 ? '空頭修正' : '觀察區間';

      return {
        ...stock,
        score: Math.min(100, score),
        structureScore,
        structureGrade,
        trend,
        reasons,
        latestClose,
        latestVolume,
        majorTrendline: Boolean(majorLineValid),
        followTrendline: Boolean(followLineValid),
        h3Formed: h3AfterNoNewLow,
        h3Index: h3AfterNoNewLow ? swingLowIndexes.at(-1) : undefined,
        momentumDecay,
        structureState,
        stopLoss: structuralStopLoss,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
