import snapshotJson from "../data/market-snapshot.json" with { type: "json" };
import {
  calculateDpo,
  calculateMacd,
  rollingSma
} from "./indicators.ts";
import {
  findShrinkingHistogramSupport,
  fitDescendingTrendline
} from "./scanner-engine.ts";
import type {
  Candle,
  StockCandidate,
  StructureSignals,
  Timeframe
} from "./types";

export type PriceAdjustment = "adjusted" | "raw";

type SnapshotRow = [
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number,
  adjustmentFactor: number
];

interface SnapshotStock {
  name: string;
  companyName: string;
  industryCode: string;
  sector: string;
  paidInCapital: number;
  issuedShares: number;
  daily: SnapshotRow[];
  corporateActions: {
    date: string;
    previousClose: number;
    referencePrice: number;
    factor: number;
    type: string;
  }[];
  latestVerification: {
    date: string;
    source: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    secondaryVolume: number;
    secondaryVolumeDifference: number;
  };
}

interface MarketSnapshot {
  meta: {
    dataAsOf: string;
    generatedAt: string;
    market: string;
    sources: Record<string, string>;
    verification: string;
    limitations: Record<string, string>;
  };
  stocks: Record<string, SnapshotStock>;
}

const snapshot = snapshotJson as unknown as MarketSnapshot;

export const marketSnapshotMeta = snapshot.meta;
export const verifiedMarketSymbols = Object.keys(snapshot.stocks);

function adjustRows(rows: SnapshotRow[], adjustment: PriceAdjustment) {
  if (adjustment === "raw") return rows.map((row) => row.slice(0, 6));
  const latestFactor = rows.at(-1)?.[6] ?? 1;
  return rows.map((row) => {
    const factor = row[6] / latestFactor;
    return [
      row[0],
      row[1] * factor,
      row[2] * factor,
      row[3] * factor,
      row[4] * factor,
      row[5]
    ];
  });
}

function groupKey(time: string, timeframe: Exclude<Timeframe, "day">) {
  if (timeframe === "month") return time.slice(0, 7);
  const date = new Date(`${time}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function aggregateRows(
  rows: (string | number)[][],
  timeframe: Exclude<Timeframe, "day">
) {
  const groups = new Map<string, (string | number)[][]>();
  for (const row of rows) {
    const key = groupKey(String(row[0]), timeframe);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, group]) => [
    key,
    Number(group[0][1]),
    Math.max(...group.map((row) => Number(row[2]))),
    Math.min(...group.map((row) => Number(row[3]))),
    Number(group.at(-1)![4]),
    group.reduce((total, row) => total + Number(row[5]), 0)
  ]);
}

function withIndicators(rows: (string | number)[][]): Candle[] {
  const closes = rows.map((row) => Number(row[4]));
  const { macd, signal, histogram } = calculateMacd(closes);
  const dpo = calculateDpo(closes);
  return rows.map((row, index) => ({
    time: String(row[0]),
    open: Number(row[1]),
    high: Number(row[2]),
    low: Number(row[3]),
    close: Number(row[4]),
    volume: Number(row[5]),
    macd: macd[index],
    signal: signal[index],
    histogram: histogram[index],
    dpo: dpo[index]
  }));
}

function allCandles(
  symbol: string,
  timeframe: Timeframe,
  adjustment: PriceAdjustment = "adjusted"
) {
  const stock = snapshot.stocks[symbol];
  if (!stock) return null;
  const adjusted = adjustRows(stock.daily, adjustment);
  const rows =
    timeframe === "day" ? adjusted : aggregateRows(adjusted, timeframe);
  return withIndicators(rows);
}

export function getMarketCandles(
  symbol: string,
  timeframe: Timeframe,
  adjustment: PriceAdjustment = "adjusted"
) {
  const candles = allCandles(symbol, timeframe, adjustment);
  if (!candles) return null;
  const limit = timeframe === "day" ? 120 : timeframe === "week" ? 104 : 60;
  return candles.slice(-limit);
}

export function getMarketDataNote(symbol: string) {
  const stock = snapshot.stocks[symbol];
  if (!stock) return null;
  return {
    dataAsOf: snapshot.meta.dataAsOf,
    startDate: stock.daily[0][0],
    endDate: stock.daily.at(-1)![0],
    historyDays: stock.daily.length,
    corporateActions: stock.corporateActions.length,
    latestVerification: stock.latestVerification
  };
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function trendScore(candles: Candle[]) {
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const average = rollingSma(
    candles.map((candle) => candle.close),
    Math.min(10, candles.length),
    false
  ).at(-1)!;
  return (
    (latest.close >= average ? 0.3 : 0) +
    (latest.macd >= latest.signal ? 0.3 : 0) +
    (latest.histogram >= previous.histogram ? 0.2 : 0) +
    (finite(latest.dpo) >= finite(previous.dpo) ? 0.2 : 0)
  );
}

function macdScore(candles: Candle[]) {
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  const nearZero =
    Math.abs(latest.macd / Math.max(0.01, latest.close)) <= 0.006;
  return (
    (latest.macd >= latest.signal ? 0.35 : 0) +
    (latest.histogram >= previous.histogram ? 0.25 : 0) +
    (latest.macd >= 0 ? 0.2 : 0) +
    (nearZero ? 0.2 : 0)
  );
}

function dpoScore(candles: Candle[]) {
  const latest = candles.at(-1)!;
  const previous = candles.at(-2)!;
  if (!Number.isFinite(latest.dpo)) return 0;
  const recentlyCrossed = candles
    .slice(-4)
    .some((candle, index, values) =>
      index > 0 && values[index - 1].dpo <= 0 && candle.dpo > 0
    );
  return (
    (latest.dpo > 0 ? 0.5 : 0) +
    (latest.dpo >= previous.dpo ? 0.3 : 0) +
    (recentlyCrossed ? 0.2 : 0)
  );
}

function swingLowIndexes(candles: Candle[], radius = 2) {
  const result: number[] = [];
  for (let index = radius; index < candles.length - radius; index += 1) {
    const window = candles.slice(index - radius, index + radius + 1);
    if (candles[index].low === Math.min(...window.map((item) => item.low))) {
      result.push(index);
    }
  }
  return result;
}

function roundToTick(value: number) {
  const tick =
    value < 10 ? 0.01 : value < 50 ? 0.05 : value < 100 ? 0.1 : value < 500 ? 0.5 : 1;
  return Math.round(value / tick) * tick;
}

function keyStructure(
  daily: Candle[],
  weekly: Candle[],
  monthly: Candle[]
) {
  const currentPrice = daily.at(-1)!.close;
  const supportSignals = [
    findShrinkingHistogramSupport(monthly, 3),
    findShrinkingHistogramSupport(weekly, 8),
    findShrinkingHistogramSupport(daily, 20)
  ].filter(Boolean);
  const recentDaily = daily.slice(-120);
  const swingSupports = swingLowIndexes(recentDaily)
    .map((index) => ({
      support: recentDaily[index].low,
      index,
      unbrokenBars: recentDaily.length - index - 1
    }))
    .filter(
      (candidate) =>
        candidate.support < currentPrice &&
        recentDaily
          .slice(candidate.index + 1)
          .every((candle) => candle.low >= candidate.support * 0.995)
    );
  const candidates = [
    ...supportSignals.map((signal) => signal!.support),
    ...swingSupports.map((signal) => signal.support)
  ].filter((support) => support > 0 && support < currentPrice);
  const fallback = Math.min(
    ...daily.slice(-20).map((candle) => candle.low)
  );
  const keyLevel = roundToTick(
    candidates.length ? Math.max(...candidates) : fallback
  );
  const recentSwing = swingSupports.at(-1)?.support ?? fallback;
  let stopLoss = roundToTick(Math.min(keyLevel, recentSwing));
  if (stopLoss >= currentPrice) stopLoss = roundToTick(currentPrice * 0.95);
  const tests = recentDaily.filter(
    (candle) => Math.abs(candle.low - keyLevel) / keyLevel <= 0.018
  ).length;
  return {
    keyLevel,
    stopLoss,
    tests,
    shrinkingSupport: supportSignals.length > 0
  };
}

function trendlineState(daily: Candle[]) {
  const chart = daily.slice(-120);
  const line = fitDescendingTrendline(chart, 2);
  if (!line) {
    return {
      line: null,
      above: false,
      confirmedBreakout: false,
      breakoutIndex: -1,
      successfulRetest: false
    };
  }
  const linePrice = (index: number) =>
    line.intercept + line.slope * index;
  let breakoutIndex = -1;
  for (let index = Math.max(1, chart.length - 20); index < chart.length; index += 1) {
    if (
      chart[index - 1].close <= linePrice(index - 1) &&
      chart[index].close > linePrice(index)
    ) {
      breakoutIndex = index;
    }
  }
  const above = chart.at(-1)!.close > linePrice(chart.length - 1);
  const confirmedBreakout = breakoutIndex >= 0 && above;
  const successfulRetest =
    confirmedBreakout &&
    chart.slice(breakoutIndex + 1).some((candle, offset) => {
      const index = breakoutIndex + 1 + offset;
      const resistance = linePrice(index);
      return candle.low <= resistance * 1.025 && candle.close >= resistance;
    });
  return {
    line,
    above,
    confirmedBreakout,
    breakoutIndex,
    successfulRetest
  };
}

function candidateFromSnapshot(symbol: string): StockCandidate {
  const stock = snapshot.stocks[symbol];
  const dailyAll = allCandles(symbol, "day", "adjusted")!;
  const weeklyAll = allCandles(symbol, "week", "adjusted")!;
  const monthlyAll = allCandles(symbol, "month", "adjusted")!;
  const daily = dailyAll.slice(-180);
  const weekly = weeklyAll.slice(-104);
  const monthly = monthlyAll.slice(-60);
  const latest = daily.at(-1)!;
  const previousRaw = stock.daily.at(-2)!;
  const currentRaw = stock.daily.at(-1)!;
  const monthlyLatest = monthly.at(-1)!;
  const monthlyPrevious = monthly.at(-2)!;
  const dailyLatest = daily.at(-1)!;
  const dailyPrevious = daily.at(-2)!;
  const support = keyStructure(daily, weekly, monthly);
  const trendline = trendlineState(daily);
  const monthlyTrend = trendScore(monthly);
  const weeklyTrend = trendScore(weekly);
  const dailyTrend = trendScore(daily);
  const averageVolumeLots =
    stock.daily
      .slice(-20)
      .reduce((total, row) => total + row[5], 0) /
    Math.min(20, stock.daily.length) /
    1000;
  const previousTwentyVolume =
    daily.slice(-30, -10).reduce((total, candle) => total + candle.volume, 0) /
    20;
  const recentVolume =
    daily.slice(-5).reduce((total, candle) => total + candle.volume, 0) / 5;
  const recentRange =
    (Math.max(...daily.slice(-10).map((candle) => candle.high)) -
      Math.min(...daily.slice(-10).map((candle) => candle.low))) /
    latest.close;
  const healthyConsolidation =
    recentRange <= 0.1 && recentVolume <= previousTwentyVolume * 1.05;
  const multiTimeframeResonance =
    monthlyTrend >= 0.65 && weeklyTrend >= 0.65 && dailyTrend >= 0.65;
  const monthlyHistogramContracting =
    Math.abs(monthlyLatest.histogram) < Math.abs(monthlyPrevious.histogram);
  const monthlyMacdNearZeroOrImproving =
    Math.abs(monthlyLatest.macd / monthlyLatest.close) <= 0.006 ||
    monthlyLatest.histogram > monthlyPrevious.histogram;
  const monthlyDpoRising =
    Number.isFinite(monthlyLatest.dpo) &&
    monthlyLatest.dpo > monthlyPrevious.dpo;
  const dailyMacdScore = macdScore(daily);
  const dailyDpoScore = dpoScore(daily);
  const indicatorsRising =
    dailyLatest.histogram >= dailyPrevious.histogram &&
    finite(dailyLatest.dpo) >= finite(dailyPrevious.dpo);
  const firstTarget = roundToTick(
    latest.close + Math.max(0.01, latest.close - support.stopLoss) * 2
  );
  const consolidationBars = (() => {
    let bars = 10;
    for (let length = 10; length <= Math.min(120, daily.length); length += 5) {
      const window = daily.slice(-length);
      const range =
        (Math.max(...window.map((candle) => candle.high)) -
          Math.min(...window.map((candle) => candle.low))) /
        latest.close;
      if (range <= 0.18) bars = length;
      else break;
    }
    return bars;
  })();
  const monthlyContractionBars = (() => {
    let count = 0;
    for (let index = monthly.length - 1; index > 0; index -= 1) {
      if (
        Math.abs(monthly[index].histogram) <=
        Math.abs(monthly[index - 1].histogram)
      ) count += 1;
      else break;
    }
    return count;
  })();
  const trendlineTouches = trendline.line?.touchIndexes.length ?? 0;
  const structureSignals: StructureSignals = {
    consolidationDuration: Math.min(1, consolidationBars / 90),
    trendlineTouches: Math.min(1, trendlineTouches / 3),
    keyLevelTests: Math.min(1, support.tests / 3),
    monthlyHistogramDuration: Math.min(1, monthlyContractionBars / 5),
    cleanRetest: trendline.successfulRetest ? 1 : 0
  };
  const reasons = [
    `截至 ${snapshot.meta.dataAsOf} 證交所收盤 ${currentRaw[4]} 元，近 20 日均量 ${Math.round(averageVolumeLots).toLocaleString("zh-TW")} 張。`,
    `月／週／日趨勢分數 ${Math.round(monthlyTrend * 100)}／${Math.round(weeklyTrend * 100)}／${Math.round(dailyTrend * 100)}。`,
    `MACD ${dailyLatest.macd.toFixed(2)}、訊號 ${dailyLatest.signal.toFixed(2)}；DPO ${Number.isFinite(dailyLatest.dpo) ? dailyLatest.dpo.toFixed(2) : "資料不足"}。`,
    `程式偵測關鍵支撐 ${support.keyLevel} 元，近 120 根測試 ${support.tests} 次。`
  ];
  const missingConditions = [
    !trendline.confirmedBreakout
      ? "近 20 個交易日沒有完成下降趨勢線的收盤突破。"
      : null,
    !multiTimeframeResonance ? "日、週、月尚未全部達到多週期共振門檻。" : null,
    !support.shrinkingSupport ? "尚未偵測到符合規則的縮柱支撐。" : null,
    "法人、融資融券、借券與集中度資料尚未接入；籌碼 10 分目前記為 0。"
  ].filter((value): value is string => Boolean(value));

  return {
    symbol,
    name: stock.name,
    sector: stock.sector,
    paidInCapitalBillion: stock.paidInCapital / 100000000,
    averageVolumeLots,
    currentPrice: currentRaw[4],
    changePercent:
      ((currentRaw[4] - previousRaw[4]) / previousRaw[4]) * 100,
    keyLevel: support.keyLevel,
    stopLoss: support.stopLoss,
    firstTarget,
    signals: {
      monthlyTrend,
      weeklyTrend,
      dailyBreakout: trendline.confirmedBreakout
        ? 1
        : trendline.above
          ? 0.65
          : 0,
      macd: dailyMacdScore,
      dpo: dailyDpoScore,
      keyLevel: Math.min(1, 0.4 + support.tests * 0.2),
      chipStructure: 0,
      confirmedTrendlineBreakout: trendline.confirmedBreakout,
      multiTimeframeResonance,
      healthyConsolidation,
      indicatorsRising,
      monthlyHistogramContracting,
      monthlyMacdNearZeroOrImproving,
      monthlyDpoRising,
      monthlyKeyLevel: support.keyLevel > 0,
      shrinkingHistogramSupport: support.shrinkingSupport,
      successfulRetest: trendline.successfulRetest,
      chipStructureStable: false
    },
    structureSignals,
    reasons,
    missingConditions,
    catalyst:
      `價格與最新 OHLCV 已由 TWSE 逐欄核對；歷史資料共 ${stock.daily.length} 個交易日。` +
      "籌碼資料未接入，因此不會升級為 S 級。",
    dataAsOf: snapshot.meta.dataAsOf,
    dataStatus: "verified-close-partial-factors",
    dataNotes: [
      "最新價、開高低收量與公司基本資料：TWSE 官方。",
      "五年原始歷史：Yahoo Finance；當月交易日與 OHLCV 由 TWSE 覆蓋並核對。",
      "還原 K 因子：TWSE 除權除息計算結果表的參考價／前收比值。",
      snapshot.meta.limitations.chips
    ]
  };
}

export const verifiedCandidates = verifiedMarketSymbols.map(candidateFromSnapshot);
