import type {
  BacktestSummary,
  Candle,
  StockCandidate,
  Timeframe,
} from "./types";
import { calculateDpo } from "./indicators.ts";

const full = {
  monthlyTrend: 1,
  weeklyTrend: 1,
  dailyBreakout: 1,
  macd: 1,
  dpo: 1,
  keyLevel: 1,
  chipStructure: 1,
  confirmedTrendlineBreakout: true,
  multiTimeframeResonance: true,
  healthyConsolidation: true,
  indicatorsRising: true,
  monthlyHistogramContracting: true,
  monthlyMacdNearZeroOrImproving: true,
  monthlyDpoRising: true,
  monthlyKeyLevel: true,
  shrinkingHistogramSupport: true,
  successfulRetest: true,
  chipStructureStable: true,
};

export const mockCandidates: StockCandidate[] = [
  {
    symbol: "2603",
    name: "長榮",
    sector: "航運",
    paidInCapitalBillion: 211.7,
    averageVolumeLots: 18400,
    currentPrice: 201.5,
    changePercent: 2.15,
    keyLevel: 183,
    stopLoss: 181,
    firstTarget: 214,
    signals: { ...full, chipStructure: 0.9 },
    structureSignals: {
      consolidationDuration: 1,
      trendlineTouches: 1,
      keyLevelTests: 0.8,
      monthlyHistogramDuration: 0.9,
      cleanRetest: 1
    },
    reasons: [
      "日、週、月方向一致，週月 MACD 維持多頭架構",
      "下降趨勢線收盤確認突破，首次回測量縮",
      "關鍵價位 183 附近測試後守穩",
      "預估風險報酬比高於 2:1"
    ],
    missingConditions: [],
    catalyst: "完整示範 S 級條件；待真實行情與籌碼資料驗證"
  },
  {
    symbol: "2615",
    name: "萬海",
    sector: "航運",
    paidInCapitalBillion: 280.6,
    averageVolumeLots: 22600,
    currentPrice: 86.4,
    changePercent: 1.65,
    keyLevel: 82,
    stopLoss: 82,
    firstTarget: 94,
    signals: {
      ...full,
      macd: 0.9,
      keyLevel: 0.9,
      chipStructure: 0.6,
      chipStructureStable: false
    },
    structureSignals: {
      consolidationDuration: 0.9,
      trendlineTouches: 1,
      keyLevelTests: 0.8,
      monthlyHistogramDuration: 0.8,
      cleanRetest: 0.9
    },
    reasons: [
      "已站上主要下降趨勢線右側",
      "日、週、月指標同步向上，DPO 位於 0 軸上方",
      "突破後第一次健康整理，前一根關鍵 K 低點為 82",
      "使用者實戰持倉已納入風控追蹤"
    ],
    missingConditions: ["21:30 籌碼資料尚未接入，暫不升級 S 級"],
    catalyst: "突破後整理，等待量價確認第二波"
  },
  {
    symbol: "3037",
    name: "欣興",
    sector: "電子零組件",
    paidInCapitalBillion: 152.6,
    averageVolumeLots: 13700,
    currentPrice: 176.5,
    changePercent: 3.22,
    keyLevel: 168,
    stopLoss: 165,
    firstTarget: 198,
    signals: {
      ...full,
      keyLevel: 0.8,
      chipStructure: 0.7,
      shrinkingHistogramSupport: false,
      chipStructureStable: false
    },
    structureSignals: {
      consolidationDuration: 0.8,
      trendlineTouches: 0.9,
      keyLevelTests: 0.8,
      monthlyHistogramDuration: 0.6,
      cleanRetest: 0.9
    },
    reasons: [
      "多週期方向一致，日線已突破下降壓力",
      "拉回量縮，價格仍位於突破區上方",
      "DPO 重新上彎，MACD 柱體擴張"
    ],
    missingConditions: ["月線縮柱支撐尚未達最低持續期", "籌碼結構待驗證"],
    catalyst: "突破後整理型示範"
  },
  {
    symbol: "2609",
    name: "陽明",
    sector: "航運",
    paidInCapitalBillion: 349.2,
    averageVolumeLots: 30100,
    currentPrice: 63.8,
    changePercent: 1.11,
    keyLevel: 60.5,
    stopLoss: 59.8,
    firstTarget: 72.5,
    signals: {
      ...full,
      weeklyTrend: 0.8,
      macd: 0.8,
      dpo: 0.8,
      successfulRetest: false,
      healthyConsolidation: false
    },
    structureSignals: {
      consolidationDuration: 0.8,
      trendlineTouches: 1,
      keyLevelTests: 0.7,
      monthlyHistogramDuration: 0.7,
      cleanRetest: 0.2
    },
    reasons: [
      "收盤已突破主要下降趨勢線",
      "MACD 與 DPO 同步改善",
      "量能高於 20 日均量"
    ],
    missingConditions: ["尚未完成突破後首次回測", "週線轉強仍需確認"],
    catalyst: "剛突破，等待回測確認"
  },
  {
    symbol: "2002",
    name: "中鋼",
    sector: "鋼鐵",
    paidInCapitalBillion: 1578.3,
    averageVolumeLots: 16200,
    currentPrice: 24.65,
    changePercent: 0.82,
    keyLevel: 23.7,
    stopLoss: 23.35,
    firstTarget: 27.4,
    signals: {
      ...full,
      monthlyTrend: 0.8,
      weeklyTrend: 0.8,
      dailyBreakout: 0.9,
      macd: 0.8,
      dpo: 0.7,
      keyLevel: 0.8,
      chipStructure: 0.7,
      successfulRetest: false,
      healthyConsolidation: false,
      shrinkingHistogramSupport: false,
      chipStructureStable: false
    },
    structureSignals: {
      consolidationDuration: 1,
      trendlineTouches: 0.8,
      keyLevelTests: 0.9,
      monthlyHistogramDuration: 0.8,
      cleanRetest: 0.1
    },
    reasons: [
      "長時間低檔盤整，月線位置仍低",
      "日線收盤剛站上下降趨勢線",
      "成交量溫和放大"
    ],
    missingConditions: ["尚未完成回測", "籌碼與縮柱支撐未確認"],
    catalyst: "低位階突破示範"
  },
  {
    symbol: "2610",
    name: "華航",
    sector: "航空",
    paidInCapitalBillion: 608.4,
    averageVolumeLots: 32500,
    currentPrice: 18.35,
    changePercent: 0.55,
    keyLevel: 16.5,
    stopLoss: 16.35,
    firstTarget: 21.8,
    signals: {
      ...full,
      monthlyTrend: 0.8,
      weeklyTrend: 0.6,
      dailyBreakout: 0.15,
      macd: 0.8,
      dpo: 0.7,
      chipStructure: 0.7,
      confirmedTrendlineBreakout: false,
      multiTimeframeResonance: false,
      successfulRetest: false,
      chipStructureStable: false
    },
    structureSignals: {
      consolidationDuration: 1,
      trendlineTouches: 0.8,
      keyLevelTests: 1,
      monthlyHistogramDuration: 1,
      cleanRetest: 0
    },
    reasons: [
      "月線 MACD 柱體縮短，動能由弱轉強",
      "月線關鍵價位約 16.5，長時間未被破壞",
      "月 DPO 改善並上彎",
      "低位階長整理，尚未大幅噴出"
    ],
    missingConditions: ["尚未正式突破日線下降趨勢線", "週線共振尚未完成"],
    catalyst: "Seed 種子股；等待突破，不預先升級"
  },
  {
    symbol: "2409",
    name: "友達",
    sector: "光電",
    paidInCapitalBillion: 769.9,
    averageVolumeLots: 48800,
    currentPrice: 14.2,
    changePercent: -0.35,
    keyLevel: 13.4,
    stopLoss: 13.1,
    firstTarget: 16.5,
    signals: {
      ...full,
      monthlyTrend: 0.7,
      weeklyTrend: 0.55,
      dailyBreakout: 0.1,
      macd: 0.7,
      dpo: 0.65,
      keyLevel: 0.85,
      chipStructure: 0.6,
      confirmedTrendlineBreakout: false,
      multiTimeframeResonance: false,
      monthlyDpoRising: false,
      chipStructureStable: false
    },
    structureSignals: {
      consolidationDuration: 0.9,
      trendlineTouches: 0.7,
      keyLevelTests: 0.8,
      monthlyHistogramDuration: 0.8,
      cleanRetest: 0
    },
    reasons: [
      "月線縮柱與低位階整理接近 Seed 條件",
      "法人承接為研究訊號",
      "日線 DPO 已開始上彎"
    ],
    missingConditions: ["缺正式突破 K 棒", "週線尚未明確轉多"],
    catalyst: "觀察池；等待量價突破"
  }
];

function seeded(seed: number) {
  let value = seed % 2147483647;
  return () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
}

export function makeMockCandles(
  symbol: string,
  timeframe: Timeframe,
  basePrice: number
): Candle[] {
  const multiplier = timeframe === "day" ? 1 : timeframe === "week" ? 5 : 18;
  const count = timeframe === "day" ? 68 : timeframe === "week" ? 58 : 48;
  const rand = seeded(Number(symbol) + multiplier * 97);
  let price = basePrice * (timeframe === "month" ? 0.72 : 0.82);

  const candles = Array.from({ length: count }, (_, index) => {
    const phase = index / count;
    const drift =
      basePrice *
      (phase < 0.52 ? 0.0005 : phase < 0.76 ? -0.00015 : 0.0032) *
      multiplier;
    const wave = Math.sin(index / 4.5) * basePrice * 0.005;
    const noise = (rand() - 0.5) * basePrice * 0.018;
    const open = price + noise * 0.35;
    const close = Math.max(basePrice * 0.35, open + drift + wave + noise);
    const high = Math.max(open, close) + rand() * basePrice * 0.012;
    const low = Math.min(open, close) - rand() * basePrice * 0.012;
    const histogram =
      Math.sin((index - count * 0.62) / 7) * 0.55 + phase * 0.32;
    const macd = histogram + Math.sin(index / 10) * 0.25;
    const signal = macd - histogram;
    price = close;
    return {
      time: `${index + 1}`,
      open,
      high,
      low,
      close,
      volume: Math.round(
        (1200 + rand() * 3800) * (phase > 0.8 ? 1.35 : 1)
      ),
      macd,
      signal,
      histogram,
      dpo: Number.NaN
    };
  });

  // Mock charts must still agree with the quote shown in the stock header.
  // Scale the generated OHLC series so the final close equals currentPrice.
  const lastClose = candles.at(-1)?.close ?? basePrice;
  const scale = basePrice / lastClose;
  const scaledCandles = candles.map((candle, index) => ({
    ...candle,
    open: candle.open * scale,
    high: candle.high * scale,
    low: candle.low * scale,
    close: index === candles.length - 1 ? basePrice : candle.close * scale
  }));
  const dpoValues = calculateDpo(
    scaledCandles.map((candle) => candle.close)
  );
  return scaledCandles.map((candle, index) => ({
    ...candle,
    dpo: dpoValues[index]
  }));
}

export const mockBacktest: BacktestSummary[] = [
  {
    sampleSize: 248,
    windowDays: 20,
    targetReturn: 0.1,
    hitRate: 0.54,
    averageReturn: 0.061,
    maximumDrawdown: -0.087,
    mock: true
  },
  {
    sampleSize: 248,
    windowDays: 30,
    targetReturn: 0.15,
    hitRate: 0.43,
    averageReturn: 0.079,
    maximumDrawdown: -0.104,
    mock: true
  },
  {
    sampleSize: 248,
    windowDays: 60,
    targetReturn: 0.2,
    hitRate: 0.38,
    averageReturn: 0.112,
    maximumDrawdown: -0.139,
    mock: true
  },
  {
    sampleSize: 91,
    windowDays: 60,
    targetReturn: 0.2,
    hitRate: 0.49,
    averageReturn: 0.146,
    maximumDrawdown: -0.121,
    mock: true
  }
];
