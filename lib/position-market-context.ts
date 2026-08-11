import { getMarketCandles } from "./market-data.ts";
import { getScannedStock } from "./scoring-engine.ts";
import { scanH1Trendline } from "./scanEngine.ts";
import {
  getCorrectionTrackingLine,
  getDisplayedActiveSupportLine
} from "./trendline-display.ts";
import type { TrendlineCorrection } from "./trendline-corrections.ts";
import type { WatchlistItem, WatchlistPositionItem } from "./watchlist.ts";

export function getPositionMarketContext(
  item: Pick<WatchlistItem, "symbol" | "name" | "addedAt">,
  correction?: TrendlineCorrection | null
): WatchlistPositionItem {
  const candles = getMarketCandles(item.symbol, "day", "adjusted") ?? [];
  const currentPrice = candles.at(-1)?.close ?? 0;
  const trace = scanH1Trendline(
    candles.map((candle) => ({
      date: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    })),
    {
      macdHistogram: candles.map((candle) => candle.histogram),
      dpo: candles.map((candle) => candle.dpo)
    }
  );
  const stopLine = getDisplayedActiveSupportLine(
    candles,
    trace,
    getCorrectionTrackingLine(candles, correction)
  );
  const stock = getScannedStock(item.symbol);

  return {
    ...item,
    currentPrice,
    stopPrice: stopLine?.price ?? null,
    stopSourceDate:
      stopLine === undefined
        ? "目前沒有有效防守線"
        : candles[stopLine.signalIndex]?.time ?? "最近突破 K",
    classification: stock?.classification ?? "Watch"
  };
}
