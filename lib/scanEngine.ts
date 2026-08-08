import type { CandlePoint, StockProfile } from './stockData';

export interface ScanResultItem extends StockProfile {
  score: number;
  trend: string;
  reasons: string[];
  latestClose: number;
  latestVolume: number;
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sma(values: number[], period: number) {
  if (values.length < period) {
    return values[values.length - 1] ?? 0;
  }

  return average(values.slice(-period));
}

function slope(values: number[]) {
  if (values.length < 2) {
    return 0;
  }

  const start = values[0];
  const end = values[values.length - 1];
  return (end - start) / Math.max(1, values.length - 1);
}

function calculateMomentum(candles: CandlePoint[]) {
  const closes = candles.map((candle) => candle.close);
  const returns = closes.slice(1).map((close, index) => (close - closes[index]) / closes[index]);
  const recent = returns.slice(-3);
  const previous = returns.slice(-6, -3);

  return average(recent) - average(previous);
}

export function scanStocks(stocks: StockProfile[], limit = 8): ScanResultItem[] {
  return stocks
    .map((stock) => {
      const closes = stock.candles.map((candle) => candle.close);
      const lows = stock.candles.map((candle) => candle.low);
      const volumes = stock.candles.map((candle) => candle.volume);
      const shortSma = sma(closes, 5);
      const mediumSma = sma(closes, 20);
      const longSma = sma(closes, 60);
      const recentSlope = slope(closes.slice(-8));
      const momentum = calculateMomentum(stock.candles);
      const latestClose = closes[closes.length - 1];
      const latestVolume = volumes[volumes.length - 1];
      const priorLows = lows.slice(-8, -4);
      const recentLows = lows.slice(-4);
      const h3NotNewLow = recentLows[recentLows.length - 1] > Math.min(...priorLows);
      const volumeDecline = latestVolume < average(volumes.slice(-8)) * 0.88;
      const priceBelowMediumSma = latestClose < mediumSma;
      const shortBelowMedium = shortSma < mediumSma;
      const bigDownTrend = latestClose < mediumSma && mediumSma < longSma && recentSlope < -0.2;
      const followDownTrend = latestClose < shortSma && shortBelowMedium && recentSlope < -0.06;
      const bearishMomentumDecay = momentum > -0.01 && momentum > 0;

      const reasons: string[] = [];
      let score = 35;

      if (bigDownTrend) {
        reasons.push('大級別下降趨勢線');
        score += 23;
      }
      if (followDownTrend) {
        reasons.push('跟隨下降趨勢線');
        score += 20;
      }
      if (h3NotNewLow) {
        reasons.push('H3 後不再創新低');
        score += 18;
      }
      if (bearishMomentumDecay) {
        reasons.push('空方動能衰退');
        score += 18;
      }
      if (priceBelowMediumSma) {
        score += 6;
      }
      if (volumeDecline) {
        score += 5;
      }

      if (reasons.length === 0) {
        reasons.push('觀察中');
      }

      const trend = score >= 80 ? '強勢空頭反轉' : score >= 60 ? '空頭修正' : '觀察區間';

      return {
        ...stock,
        score: Math.min(100, score),
        trend,
        reasons,
        latestClose,
        latestVolume,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}
