export const DPO_PERIOD = 21;

export function ema(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((result, value, index) => {
    result.push(
      index === 0
        ? value
        : value * multiplier + result[index - 1] * (1 - multiplier)
    );
    return result;
  }, []);
}

export function rollingSma(
  values: number[],
  period: number,
  requireFullWindow = true
) {
  return values.map((_, index) => {
    if (requireFullWindow && index < period - 1) return Number.NaN;
    const start = Math.max(0, index - period + 1);
    const window = values.slice(start, index + 1);
    return (
      window.reduce((total, value) => total + value, 0) / window.length
    );
  });
}

export function calculateMacd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
) {
  const fast = ema(closes, fastPeriod);
  const slow = ema(closes, slowPeriod);
  const macd = closes.map((_, index) => fast[index] - slow[index]);
  // CM_Ult_MacD_MTF uses SMA for its signal line.
  const signal = rollingSma(macd, signalPeriod, false);
  return {
    macd,
    signal,
    histogram: macd.map((value, index) => value - signal[index])
  };
}

/**
 * TradingView built-in Detrended Price Oscillator formula.
 *
 * Default mode:
 *   barsBack = floor(length / 2) + 1
 *   DPO = close - SMA(close, length)[barsBack]
 *
 * Centered mode is included for adapter compatibility, although the chart
 * currently follows the user's non-centered TradingView setting.
 */
export function calculateDpo(
  closes: number[],
  period = DPO_PERIOD,
  centered = false
) {
  const barsBack = Math.floor(period / 2) + 1;
  const movingAverage = rollingSma(closes, period);

  return closes.map((close, index) => {
    if (centered) {
      const closeIndex = index - barsBack;
      return closeIndex >= 0 && Number.isFinite(movingAverage[index])
        ? closes[closeIndex] - movingAverage[index]
        : Number.NaN;
    }

    const averageIndex = index - barsBack;
    return averageIndex >= 0 && Number.isFinite(movingAverage[averageIndex])
      ? close - movingAverage[averageIndex]
      : Number.NaN;
  });
}
