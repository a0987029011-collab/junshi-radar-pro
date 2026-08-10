"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DPO_PERIOD } from "../lib/indicators.ts";
import {
  getMarketCandles,
  getMarketDataNote,
  type PriceAdjustment
} from "../lib/market-data";
import {
  BREAKOUT_SIGNAL_NAME,
  BREAKOUT_TYPE_LABELS,
  priceOnTrackingLine,
  scanH1Trendline,
  type H1TrendlineScan,
  type TrackingLineSegment
} from "../lib/scanEngine";
import type { Candle, Timeframe } from "../lib/types";

const timeframeLabels: { value: Timeframe; label: string }[] = [
  { value: "day", label: "日 K" },
  { value: "week", label: "週 K" },
  { value: "month", label: "月 K" }
];

const DEFAULT_VISIBLE_BARS = 180;
const MIN_VISIBLE_BARS = 30;
const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});

function formatPrice(value: number) {
  return priceFormatter.format(value);
}

function drawChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  trace: H1TrendlineScan,
  requestedVisibleBars: number,
  inspectedIndex?: number
) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * ratio);
  canvas.height = Math.max(1, rect.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx || !candles.length) return;
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const pad = { left: 12, right: 58, top: 20, bottom: 16 };
  const priceBottom = height * 0.48;
  const volumeTop = priceBottom + 8;
  const volumeHeight = height * 0.08;
  const macdTop = volumeTop + volumeHeight + 22;
  const macdHeight = height * 0.19;
  const dpoTop = macdTop + macdHeight + 18;
  const dpoHeight = height - dpoTop - pad.bottom;
  const chartWidth = width - pad.left - pad.right;
  const visibleCount = Math.min(
    candles.length,
    Math.max(MIN_VISIBLE_BARS, requestedVisibleBars)
  );
  const viewStart = candles.length - visibleCount;
  const viewEnd = candles.length - 1;
  const visibleCandles = candles.slice(viewStart);
  const highs = visibleCandles.map((candle) => candle.high);
  const lows = visibleCandles.map((candle) => candle.low);
  const range = Math.max(...highs) - Math.min(...lows) || 1;
  const maxPrice = Math.max(...highs) + range * 0.06;
  const minPrice = Math.min(...lows) - range * 0.04;
  const maxVolume = Math.max(1, ...visibleCandles.map((candle) => candle.volume));
  const xStep = chartWidth / visibleCount;
  const candleWidth = Math.max(1.5, xStep * 0.58);
  const toX = (index: number) =>
    pad.left + xStep * (index - viewStart) + xStep / 2;
  const toPriceY = (value: number) =>
    pad.top +
    ((maxPrice - value) / (maxPrice - minPrice)) * (priceBottom - pad.top);

  ctx.fillStyle = "#090e13";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#18212b";
  ctx.lineWidth = 1;
  ctx.font = "10px Consolas, monospace";

  for (let gridIndex = 0; gridIndex <= 4; gridIndex += 1) {
    const y = pad.top + ((priceBottom - pad.top) / 4) * gridIndex;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const label = maxPrice - ((maxPrice - minPrice) / 4) * gridIndex;
    ctx.fillStyle = "#5f6c79";
    ctx.fillText(label.toFixed(label >= 100 ? 1 : 2), width - pad.right + 7, y + 3);
  }

  visibleCandles.forEach((candle, offset) => {
    const index = viewStart + offset;
    const x = toX(index);
    const openY = toPriceY(candle.open);
    const closeY = toPriceY(candle.close);
    const highY = toPriceY(candle.high);
    const lowY = toPriceY(candle.low);
    const red = candle.close > candle.open;
    ctx.strokeStyle = red ? "#ff5864" : "#2ed69b";
    ctx.fillStyle = red ? "#ff5864" : "#2ed69b";
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();
    ctx.fillRect(
      x - candleWidth / 2,
      Math.min(openY, closeY),
      candleWidth,
      Math.max(1.5, Math.abs(closeY - openY))
    );
    const volumeY =
      volumeTop + volumeHeight - (candle.volume / maxVolume) * volumeHeight;
    ctx.globalAlpha = 0.42;
    ctx.fillRect(
      x - candleWidth / 2,
      volumeY,
      candleWidth,
      volumeTop + volumeHeight - volumeY
    );
    ctx.globalAlpha = 1;
  });

  const drawLine = (
    line: TrackingLineSegment,
    endIndex: number,
    color: string,
    alpha: number,
    dashed = false
  ) => {
    if (
      line.slope >= 0 ||
      endIndex < viewStart ||
      line.h1Index > viewEnd
    ) return;
    const startIndex = Math.max(line.h1Index, viewStart);
    const clippedEndIndex = Math.min(endIndex, viewEnd);
    if (clippedEndIndex <= startIndex) return;
    ctx.globalAlpha = alpha;
    ctx.setLineDash(dashed ? [5, 4] : []);
    ctx.strokeStyle = color;
    ctx.lineWidth = alpha > 0.7 ? 2 : 1;
    ctx.beginPath();
    ctx.moveTo(
      toX(startIndex),
      toPriceY(priceOnTrackingLine(line, startIndex))
    );
    ctx.lineTo(
      toX(clippedEndIndex),
      toPriceY(priceOnTrackingLine(line, clippedEndIndex))
    );
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  };

  const latestSignal = [...trace.signals].reverse().find((signal) =>
    trace.lineSegments.some(
      (line) =>
        line.roundId === signal.roundId &&
        line.endIndex === signal.sourceEndIndex &&
        line.slope < 0
    )
  );
  const latestSignalH1 = latestSignal
    ? trace.h1Points.find((h1) => h1.roundId === latestSignal.roundId)
    : undefined;
  const latestSignalLine = latestSignal
    ? trace.lineSegments.find(
        (line) =>
          line.roundId === latestSignal.roundId &&
          line.endIndex === latestSignal.sourceEndIndex
      )
    : undefined;
  const displayedH1 = latestSignalH1 ?? trace.activeH1;
  const displayedLine = latestSignalLine ?? (!latestSignal ? trace.currentLine : undefined);

  if (displayedLine && displayedLine.slope < 0) {
    drawLine(
      displayedLine,
      latestSignal?.index ?? displayedLine.endIndex,
      "#77a7ff",
      0.95
    );
  }

  if (
    displayedH1 &&
    displayedH1.index >= viewStart &&
    displayedH1.index <= viewEnd
  ) {
    const x = toX(displayedH1.index);
    const y = toPriceY(displayedH1.price);
    ctx.fillStyle = "#f6bd4b";
    ctx.strokeStyle = "#090e13";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6bd4b";
    ctx.fillText("H1", x + 6, Math.max(12, y - 7));
  }

  if (
    displayedLine &&
    displayedLine.endIndex >= viewStart &&
    displayedLine.endIndex <= viewEnd
  ) {
    const x = toX(displayedLine.endIndex);
    const y = toPriceY(displayedLine.endPrice);
    ctx.fillStyle = "#63d8ee";
    ctx.strokeStyle = "#090e13";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#63d8ee";
    ctx.fillText("H2", x - 18, Math.max(12, y - 7));
  }

  if (
    latestSignal &&
    latestSignal.index >= viewStart &&
    latestSignal.index <= viewEnd
  ) {
    const candle = candles[latestSignal.index];
    const x = toX(latestSignal.index);
    const y = toPriceY(candle.high) - 8;
    ctx.fillStyle = "#ff5864";
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - 5, y - 8);
    ctx.lineTo(x + 5, y - 8);
    ctx.closePath();
    ctx.fill();
    ctx.fillText(
      latestSignal.breakoutType
        ? BREAKOUT_TYPE_LABELS[latestSignal.breakoutType]
        : "盤中紅 K 穿線",
      x + 7,
      y - 4
    );
  }

  const latestEvaluation = trace.latestEvaluation;
  if (latestEvaluation?.index === candles.length - 1) {
    const y = toPriceY(latestEvaluation.linePrice);
    ctx.fillStyle = "#63d8ee";
    ctx.beginPath();
    ctx.arc(toX(latestEvaluation.index), y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(
      `既有線 ${latestEvaluation.linePrice.toFixed(2)}`,
      Math.max(pad.left, width - pad.right - 116),
      y - 6
    );
  }

  const latestCandle = candles.at(-1)!;
  const macdAbsoluteMax =
    Math.max(
      0.1,
      ...visibleCandles.flatMap((candle) => [
        Math.abs(candle.macd),
        Math.abs(candle.signal),
        Math.abs(candle.histogram)
      ])
    ) * 1.14;
  const macdZero = macdTop + macdHeight / 2;
  const toMacdY = (value: number) =>
    macdZero - (value / macdAbsoluteMax) * (macdHeight / 2);

  ctx.strokeStyle = "#384451";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, macdZero);
  ctx.lineTo(width - pad.right, macdZero);
  ctx.stroke();

  visibleCandles.forEach((candle, offset) => {
    const index = viewStart + offset;
    const previous = index === 0 ? candle.histogram : candles[index - 1].histogram;
    const weakening =
      candle.histogram < 0 &&
      previous < 0 &&
      Math.abs(candle.histogram) < Math.abs(previous);
    ctx.fillStyle = candle.histogram >= 0
      ? "#58cbd2"
      : weakening
        ? "#f6bd4b"
        : "#d63224";
    const histogramY = toMacdY(candle.histogram);
    ctx.globalAlpha = 0.82;
    ctx.fillRect(
      toX(index) - candleWidth / 2,
      Math.min(histogramY, macdZero),
      candleWidth,
      Math.max(1, Math.abs(macdZero - histogramY))
    );
    ctx.globalAlpha = 1;
  });

  ctx.lineCap = "round";
  for (let index = Math.max(1, viewStart + 1); index < candles.length; index += 1) {
    ctx.strokeStyle = candles[index].macd >= candles[index].signal
      ? "#45b832"
      : "#ca3021";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(toX(index - 1), toMacdY(candles[index - 1].macd));
    ctx.lineTo(toX(index), toMacdY(candles[index].macd));
    ctx.stroke();
  }
  ctx.strokeStyle = "#c8c02c";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  visibleCandles.forEach((candle, offset) => {
    const index = viewStart + offset;
    if (offset === 0) ctx.moveTo(toX(index), toMacdY(candle.signal));
    else ctx.lineTo(toX(index), toMacdY(candle.signal));
  });
  ctx.stroke();
  ctx.lineCap = "butt";
  ctx.fillStyle = "#8e9baa";
  ctx.fillText("MACD · 負柱縮短為黃", pad.left, macdTop - 5);
  ctx.fillStyle = latestCandle.histogram < 0 ? "#f6bd4b" : "#58cbd2";
  ctx.fillText(latestCandle.histogram.toFixed(2), width - pad.right + 5, macdTop + 12);

  const finiteDpoValues = visibleCandles
    .map((candle) => candle.dpo)
    .filter((value) => Number.isFinite(value));
  const dpoAbsoluteMax =
    Math.max(0.1, ...finiteDpoValues.map((value) => Math.abs(value))) * 1.12;
  const dpoZero = dpoTop + dpoHeight / 2;
  const toDpoY = (value: number) =>
    dpoZero - (value / dpoAbsoluteMax) * (dpoHeight / 2);

  ctx.strokeStyle = "#384451";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, dpoZero);
  ctx.lineTo(width - pad.right, dpoZero);
  ctx.stroke();
  ctx.strokeStyle = "#dedede";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let dpoStarted = false;
  visibleCandles.forEach((candle, offset) => {
    const index = viewStart + offset;
    if (!Number.isFinite(candle.dpo)) {
      dpoStarted = false;
      return;
    }
    const y = toDpoY(candle.dpo);
    if (!dpoStarted) {
      ctx.moveTo(toX(index), y);
      dpoStarted = true;
    } else {
      ctx.lineTo(toX(index), y);
    }
  });
  ctx.stroke();
  ctx.fillStyle = "#8e9baa";
  ctx.fillText(`DPO ${DPO_PERIOD} · 低點上彎確認`, pad.left, dpoTop - 5);
  if (Number.isFinite(latestCandle.dpo)) {
    ctx.fillStyle = "#dedede";
    ctx.fillText(
      latestCandle.dpo.toFixed(2),
      width - pad.right + 5,
      Math.max(dpoTop + 12, Math.min(dpoTop + dpoHeight - 2, toDpoY(latestCandle.dpo) + 3))
    );
  }

  if (
    inspectedIndex !== undefined &&
    inspectedIndex >= viewStart &&
    inspectedIndex <= viewEnd
  ) {
    const inspectedCandle = candles[inspectedIndex];
    const x = toX(inspectedIndex);
    const labelLines = [
      inspectedCandle.time,
      `最高 ${formatPrice(inspectedCandle.high)}　最低 ${formatPrice(inspectedCandle.low)}`,
      `開盤 ${formatPrice(inspectedCandle.open)}　收盤 ${formatPrice(inspectedCandle.close)}`
    ];
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(99, 216, 238, .72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = "bold 11px Consolas, monospace";
    const labelWidth =
      Math.max(...labelLines.map((line) => ctx.measureText(line).width)) + 16;
    const labelHeight = 58;
    const labelX = Math.max(
      pad.left,
      Math.min(width - pad.right - labelWidth, x - labelWidth / 2)
    );
    ctx.fillStyle = "rgba(13, 18, 24, .96)";
    ctx.fillRect(labelX, pad.top + 4, labelWidth, labelHeight);
    ctx.strokeStyle = "#63d8ee";
    ctx.strokeRect(labelX, pad.top + 4, labelWidth, labelHeight);
    ctx.fillStyle = "#d8f8ff";
    ctx.fillText(labelLines[0], labelX + 8, pad.top + 20);
    ctx.font = "10px Consolas, monospace";
    ctx.fillStyle = "#f2f6fa";
    ctx.fillText(labelLines[1], labelX + 8, pad.top + 37);
    ctx.fillText(labelLines[2], labelX + 8, pad.top + 52);
    ctx.restore();
  }
}

export function CandleChart({ symbol }: { symbol: string }) {
  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const [adjustment, setAdjustment] = useState<PriceAdjustment>("adjusted");
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [inspectedIndex, setInspectedIndex] = useState<number>();
  const inspectingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candles = useMemo(
    () => getMarketCandles(symbol, timeframe, adjustment) ?? [],
    [symbol, timeframe, adjustment]
  );
  const trace = useMemo(
    () => scanH1Trendline(
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
    ),
    [candles]
  );
  const dataNote = getMarketDataNote(symbol);
  const visibleBarCount = Math.min(visibleBars, candles.length);
  const minimumVisibleBars = Math.min(MIN_VISIBLE_BARS, candles.length);
  const inspectedCandle =
    inspectedIndex === undefined ? undefined : candles[inspectedIndex];
  const zoomIn = () => {
    setVisibleBars((current) =>
      Math.max(minimumVisibleBars, Math.round(current * 0.72))
    );
  };
  const zoomOut = () => {
    setVisibleBars((current) =>
      Math.min(candles.length, Math.max(current + 1, Math.round(current * 1.4)))
    );
  };
  const inspectAtClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const rect = canvas.getBoundingClientRect();
    const chartLeft = 12;
    const chartRight = 58;
    const chartWidth = Math.max(1, rect.width - chartLeft - chartRight);
    const count = Math.min(visibleBars, candles.length);
    const startIndex = candles.length - count;
    const localX = Math.max(
      0,
      Math.min(chartWidth - 0.01, clientX - rect.left - chartLeft)
    );
    const offset = Math.floor(localX / (chartWidth / count));
    setInspectedIndex(startIndex + offset);
  };
  const resetChartView = () => {
    setVisibleBars(DEFAULT_VISIBLE_BARS);
    setInspectedIndex(undefined);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const redraw = () =>
      drawChart(canvas, candles, trace, visibleBars, inspectedIndex);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [candles, inspectedIndex, trace, visibleBars]);

  return (
    <section className="panel chart-shell">
      <div className="chart-toolbar">
        <div className="timeframes" role="tablist" aria-label="K 線週期">
          {timeframeLabels.map((item) => (
            <button
              aria-selected={timeframe === item.value}
              className={`timeframe-button ${timeframe === item.value ? "active" : ""}`}
              key={item.value}
              onClick={() => {
                setTimeframe(item.value);
                resetChartView();
              }}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {dataNote ? (
          <div aria-label="價格還原方式" className="adjustment-toggle" role="group">
            <button
              aria-pressed={adjustment === "adjusted"}
              className={adjustment === "adjusted" ? "active" : ""}
              onClick={() => {
                setAdjustment("adjusted");
                resetChartView();
              }}
              type="button"
            >
              還原 K
            </button>
            <button
              aria-pressed={adjustment === "raw"}
              className={adjustment === "raw" ? "active" : ""}
              onClick={() => {
                setAdjustment("raw");
                resetChartView();
              }}
              type="button"
            >
              原始 K
            </button>
          </div>
        ) : null}
        <div aria-label="圖表縮放" className="chart-zoom" role="group">
          <button
            aria-label="顯示更多 K 棒，縮小圖表"
            disabled={visibleBarCount >= candles.length}
            onClick={zoomOut}
            title="縮小（顯示更多 K 棒）"
            type="button"
          >
            −
          </button>
          <span>{visibleBarCount} 根</span>
          <button
            aria-label="顯示更少 K 棒，放大圖表"
            disabled={visibleBarCount <= minimumVisibleBars}
            onClick={zoomIn}
            title="放大（顯示更少 K 棒）"
            type="button"
          >
            ＋
          </button>
          <button
            aria-label="顯示全部 K 棒"
            disabled={visibleBarCount >= candles.length}
            onClick={() => setVisibleBars(candles.length)}
            type="button"
          >
            全部
          </button>
        </div>
        <div className="chart-legend">
          <span><i className="legend-dot" style={{ background: "var(--amber)" }} />H1</span>
          <span><i className="legend-dot" style={{ background: "var(--blue)" }} />逐 K 追蹤線</span>
          <span><i className="legend-dot" style={{ background: "var(--up)" }} />紅 K 穿越</span>
          <span><i className="legend-dot" style={{ background: "var(--cyan)" }} />當根既有線價</span>
        </div>
      </div>
      {dataNote ? (
        <div className="chart-source">
          {symbol}｜最新 OHLCV 已由
          {dataNote.latestVerification?.source ?? "官方市場"}核對（{dataNote.dataAsOf}） ·
          五年歷史 {dataNote.historyDays} 日 ·
          {adjustment === "adjusted"
            ? "還原 K：使用歷史資料供應商的還原因子"
            : "原始 K：未還原除權息"}
        </div>
      ) : null}
      <div className="chart-source">
        {BREAKOUT_SIGNAL_NAME}｜顯示最近 {visibleBarCount} 根 · 可用按鈕或滑鼠滾輪縮放 · 按住或點選 K 棒查看日期與四價
        {trace.activeH1 && trace.currentLine
          ? `｜H1 ${trace.activeH1.date} → H2 ${trace.currentLine.endDate}`
          : ""}
        {inspectedCandle
          ? `｜${inspectedCandle.time} · 最高 ${formatPrice(inspectedCandle.high)} · 最低 ${formatPrice(inspectedCandle.low)} · 開盤 ${formatPrice(inspectedCandle.open)} · 收盤 ${formatPrice(inspectedCandle.close)}`
          : ""}
      </div>
      <canvas
        aria-label={`${symbol} ${timeframe} K 線、最近 H1、H2 與突破紅 K、MACD 與 DPO${
          inspectedCandle
            ? `；已選取 ${inspectedCandle.time}，最高 ${formatPrice(inspectedCandle.high)}，最低 ${formatPrice(inspectedCandle.low)}，開盤 ${formatPrice(inspectedCandle.open)}，收盤 ${formatPrice(inspectedCandle.close)}`
            : ""
        }`}
        className="chart-canvas"
        onDoubleClick={() => {
          setVisibleBars(candles.length);
          setInspectedIndex(undefined);
        }}
        onPointerCancel={() => {
          inspectingRef.current = false;
          setInspectedIndex(undefined);
        }}
        onPointerDown={(event) => {
          inspectingRef.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          inspectAtClientX(event.clientX);
        }}
        onPointerMove={(event) => {
          if (inspectingRef.current) inspectAtClientX(event.clientX);
        }}
        onPointerUp={(event) => {
          inspectingRef.current = false;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
          }
        }}
        onWheel={(event) => {
          event.preventDefault();
          setInspectedIndex(undefined);
          if (event.deltaY < 0) zoomIn();
          else zoomOut();
        }}
        ref={canvasRef}
        style={{ touchAction: "pan-y" }}
        title="按住或點選查看日期、最高、最低、開盤、收盤價；滾輪縮放；雙擊顯示全部 K 棒"
      />
    </section>
  );
}
