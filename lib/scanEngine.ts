import { calculateDpo, calculateMacd } from './indicators.ts';
import type { CandlePoint, StockProfile } from './stockData.ts';

export const BREAKOUT_SIGNAL_NAME = '下降趨勢線紅 K 穿越';

export type BreakoutType = 'body-cross' | 'gap-above';

export const BREAKOUT_TYPE_LABELS: Record<BreakoutType, string> = {
  'body-cross': '紅 K 實體穿越',
  'gap-above': '跳空紅 K 站上'
};

export interface H1Point {
  roundId: number;
  index: number;
  date: string;
  price: number;
  confirmedIndex: number;
  confirmedDate: string;
}

export interface H2Point {
  roundId: number;
  index: number;
  date: string;
  price: number;
}

export interface TrackingLineSegment {
  roundId: number;
  h1Index: number;
  h1Date: string;
  startPrice: number;
  endIndex: number;
  endDate: string;
  endPrice: number;
  slope: number;
}

export interface TrendlineEvaluation {
  roundId: number;
  index: number;
  date: string;
  h1Index: number;
  sourceEndIndex: number;
  linePrice: number;
  highCrossed: boolean;
  closeCrossed: boolean;
  bodyCrossed: boolean;
  gapAboveLine: boolean;
  breakoutType?: BreakoutType;
  redCandle: boolean;
  macdWeakening: boolean;
  dpoUpturn: boolean;
  intradayWarning: boolean;
  closeConfirmation: boolean;
  updatedWithHigh: boolean;
  resetH1Candidate: boolean;
}

export interface TrendlineSignal extends TrendlineEvaluation {
  name: typeof BREAKOUT_SIGNAL_NAME;
}

export interface H1TrendlineScan {
  h1Points: H1Point[];
  lineSegments: TrackingLineSegment[];
  evaluations: TrendlineEvaluation[];
  signals: TrendlineSignal[];
  activeH1?: H1Point;
  currentLine?: TrackingLineSegment;
  currentLinePrice?: number;
  latestEvaluation?: TrendlineEvaluation;
}

export interface IndicatorInput {
  macdHistogram?: number[];
  dpo?: number[];
}

export interface ScanResultItem extends StockProfile {
  signalName: typeof BREAKOUT_SIGNAL_NAME;
  status: '收盤確認' | '盤中預警' | '追蹤中' | '等待 H1';
  latestClose: number;
  latestVolume: number;
  h1?: H1Point;
  h1Index?: number;
  h1Price?: number;
  h2?: H2Point;
  h2Index?: number;
  h2Price?: number;
  lineSegments: TrackingLineSegment[];
  evaluations: TrendlineEvaluation[];
  currentLine?: TrackingLineSegment;
  linePrice?: number;
  intradayWarning: boolean;
  closeConfirmation: boolean;
  breakoutType?: BreakoutType;
  macdWeakening: boolean;
  dpoUpturn: boolean;
  signalDate?: string;
  signalOnLatestBar: boolean;
  signals: TrendlineSignal[];
}

function lineFromH1(
  h1: H1Point,
  candle: CandlePoint,
  endIndex: number
): TrackingLineSegment {
  return {
    roundId: h1.roundId,
    h1Index: h1.index,
    h1Date: h1.date,
    startPrice: h1.price,
    endIndex,
    endDate: candle.date,
    endPrice: candle.high,
    slope: (candle.high - h1.price) / (endIndex - h1.index)
  };
}

export function priceOnTrackingLine(
  line: TrackingLineSegment,
  index: number
) {
  return line.startPrice + line.slope * (index - line.h1Index);
}

export function isMacdWeakening(histogram: number[], index: number) {
  if (index < 1) return false;
  const previous = histogram[index - 1];
  const current = histogram[index];
  return (
    Number.isFinite(previous) &&
    Number.isFinite(current) &&
    previous < 0 &&
    current < 0 &&
    Math.abs(current) < Math.abs(previous)
  );
}

export function isDpoUpturn(dpo: number[], index: number) {
  if (index < 2) return false;
  const beforeLow = dpo[index - 2];
  const low = dpo[index - 1];
  const current = dpo[index];
  return (
    Number.isFinite(beforeLow) &&
    Number.isFinite(low) &&
    Number.isFinite(current) &&
    low <= beforeLow &&
    current > low
  );
}

/**
 * Walks candles from left to right. The current candle is always evaluated
 * against the line that existed after the previous candle. Its high is only
 * added after the evaluation and only when the line did not signal.
 */
export function scanH1Trendline(
  candles: CandlePoint[],
  indicatorInput: IndicatorInput = {}
): H1TrendlineScan {
  const closes = candles.map((candle) => candle.close);
  const macdHistogram =
    indicatorInput.macdHistogram ?? calculateMacd(closes).histogram;
  const dpo = indicatorInput.dpo ?? calculateDpo(closes);

  const h1Points: H1Point[] = [];
  const lineSegments: TrackingLineSegment[] = [];
  const evaluations: TrendlineEvaluation[] = [];
  const signals: TrendlineSignal[] = [];

  let candidateIndex: number | undefined;
  let activeH1: H1Point | undefined;
  let currentLine: TrackingLineSegment | undefined;
  let roundId = 0;
  const notifiedLineKeys = new Set<string>();

  for (let index = 0; index < candles.length; index += 1) {
    const candle = candles[index];

    if (!activeH1 || !currentLine) {
      if (candidateIndex === undefined) {
        const previousH1 = h1Points.at(-1);
        if (previousH1 && candle.high <= previousH1.price) {
          continue;
        }
        candidateIndex = index;
        continue;
      }

      if (candle.high > candles[candidateIndex].high) {
        candidateIndex = index;
        continue;
      }

      roundId += 1;
      activeH1 = {
        roundId,
        index: candidateIndex,
        date: candles[candidateIndex].date,
        price: candles[candidateIndex].high,
        confirmedIndex: index,
        confirmedDate: candle.date
      };
      h1Points.push(activeH1);
      currentLine = lineFromH1(activeH1, candle, index);
      lineSegments.push(currentLine);
      candidateIndex = undefined;
      continue;
    }

    // Important: this price is derived exclusively from data through index - 1.
    const linePrice = priceOnTrackingLine(currentLine, index);
    const highCrossed = candle.high > linePrice;
    const closeCrossed = candle.close > linePrice;
    const bodyCrossed = candle.open <= linePrice && closeCrossed;
    const gapAboveLine = candle.open > linePrice && closeCrossed;
    const redCandle = candle.close > candle.open;
    const macdWeakening = isMacdWeakening(macdHistogram, index);
    const dpoUpturn = isDpoUpturn(dpo, index);
    const lineKey = `${activeH1.roundId}:${currentLine.endIndex}`;
    const lineAlreadyNotified = notifiedLineKeys.has(lineKey);
    const intradayWarning =
      !lineAlreadyNotified &&
      highCrossed &&
      redCandle &&
      macdWeakening &&
      dpoUpturn;
    const closeConfirmation =
      !lineAlreadyNotified &&
      closeCrossed &&
      redCandle &&
      macdWeakening &&
      dpoUpturn;
    const breakoutType: BreakoutType | undefined = closeConfirmation
      ? bodyCrossed
        ? 'body-cross'
        : 'gap-above'
      : undefined;
    const resetH1Candidate =
      !intradayWarning && candle.high > activeH1.price;
    const evaluation: TrendlineEvaluation = {
      roundId: activeH1.roundId,
      index,
      date: candle.date,
      h1Index: activeH1.index,
      sourceEndIndex: currentLine.endIndex,
      linePrice,
      highCrossed,
      closeCrossed,
      bodyCrossed,
      gapAboveLine,
      breakoutType,
      redCandle,
      macdWeakening,
      dpoUpturn,
      intradayWarning,
      closeConfirmation,
      updatedWithHigh: !intradayWarning && !resetH1Candidate,
      resetH1Candidate
    };
    evaluations.push(evaluation);

    if (intradayWarning) {
      signals.push({ ...evaluation, name: BREAKOUT_SIGNAL_NAME });
      // This exact H1-H2 line can notify only once. H1 remains active; the
      // following candle still judges against the pre-existing line before H2
      // can advance again.
      notifiedLineKeys.add(lineKey);
      continue;
    }

    if (resetH1Candidate) {
      // The old line was evaluated first. A higher high starts the next H1
      // candidate only after that no-look-ahead evaluation has completed.
      candidateIndex = index;
      activeH1 = undefined;
      currentLine = undefined;
      continue;
    }

    // Update only after the current candle has been judged with the old line.
    currentLine = lineFromH1(activeH1, candle, index);
    lineSegments.push(currentLine);
  }

  const latestEvaluation = evaluations.at(-1);
  const lastIndex = candles.length - 1;
  const currentLinePrice =
    latestEvaluation?.index === lastIndex
      ? latestEvaluation.linePrice
      : currentLine && lastIndex >= 0
        ? priceOnTrackingLine(currentLine, lastIndex)
        : undefined;

  return {
    h1Points,
    lineSegments,
    evaluations,
    signals,
    activeH1,
    currentLine,
    currentLinePrice,
    latestEvaluation
  };
}

export function scanStock(stock: StockProfile): ScanResultItem {
  const trace = scanH1Trendline(stock.candles);
  const lastIndex = stock.candles.length - 1;
  const currentEvaluation =
    trace.latestEvaluation?.index === lastIndex
      ? trace.latestEvaluation
      : undefined;
  const latestSignal = trace.signals.at(-1);
  const signalOnLatestBar = latestSignal?.index === lastIndex;
  const h1 = trace.activeH1 ?? trace.h1Points.at(-1);
  const h2 = trace.currentLine
    ? {
        roundId: trace.currentLine.roundId,
        index: trace.currentLine.endIndex,
        date: trace.currentLine.endDate,
        price: trace.currentLine.endPrice
      }
    : undefined;
  const intradayWarning = Boolean(
    currentEvaluation?.intradayWarning && signalOnLatestBar
  );
  const closeConfirmation = Boolean(
    currentEvaluation?.closeConfirmation && signalOnLatestBar
  );

  return {
    ...stock,
    signalName: BREAKOUT_SIGNAL_NAME,
    status: closeConfirmation
      ? '收盤確認'
      : intradayWarning
        ? '盤中預警'
        : trace.currentLine
          ? '追蹤中'
          : '等待 H1',
    latestClose: stock.candles.at(-1)?.close ?? 0,
    latestVolume: stock.candles.at(-1)?.volume ?? 0,
    h1,
    h1Index: h1?.index,
    h1Price: h1?.price,
    h2,
    h2Index: h2?.index,
    h2Price: h2?.price,
    lineSegments: trace.lineSegments,
    evaluations: trace.evaluations,
    currentLine: trace.currentLine,
    linePrice: trace.currentLinePrice,
    intradayWarning,
    closeConfirmation,
    breakoutType: signalOnLatestBar ? latestSignal?.breakoutType : undefined,
    macdWeakening: currentEvaluation?.macdWeakening ?? false,
    dpoUpturn: currentEvaluation?.dpoUpturn ?? false,
    signalDate: latestSignal?.date,
    signalOnLatestBar,
    signals: trace.signals
  };
}

export function scanStocks(
  stocks: StockProfile[],
  limit = 8
): ScanResultItem[] {
  return stocks
    .map(scanStock)
    .sort((left, right) => {
      if (right.closeConfirmation !== left.closeConfirmation) {
        return Number(right.closeConfirmation) - Number(left.closeConfirmation);
      }
      if (right.breakoutType !== left.breakoutType) {
        if (right.breakoutType === 'body-cross') return 1;
        if (left.breakoutType === 'body-cross') return -1;
      }
      if (right.intradayWarning !== left.intradayWarning) {
        return Number(right.intradayWarning) - Number(left.intradayWarning);
      }
      if (right.signalOnLatestBar !== left.signalOnLatestBar) {
        return Number(right.signalOnLatestBar) - Number(left.signalOnLatestBar);
      }
      const dateOrder = (right.signalDate ?? '').localeCompare(
        left.signalDate ?? ''
      );
      if (dateOrder !== 0) return dateOrder;
      return (right.h1Index ?? -1) - (left.h1Index ?? -1);
    })
    .slice(0, limit);
}
