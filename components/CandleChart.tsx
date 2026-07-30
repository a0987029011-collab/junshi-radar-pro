"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DPO_PERIOD } from "../lib/indicators.ts";
import {
  getMarketCandles,
  getMarketDataNote,
  type PriceAdjustment
} from "../lib/market-data";
import { fitDescendingTrendline } from "../lib/scanner-engine";
import type { Candle, Timeframe } from "../lib/types";

const timeframeLabels: { value: Timeframe; label: string }[] = [
  { value: "day", label: "日 K" },
  { value: "week", label: "週 K" },
  { value: "month", label: "月 K" }
];

function drawChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  keyLevel: number
) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, rect.width * ratio);
  canvas.height = Math.max(1, rect.height * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(ratio, ratio);

  const width = rect.width;
  const height = rect.height;
  const pad = { left: 12, right: 54, top: 20, bottom: 16 };
  const priceHeight = height * 0.44;
  const volumeTop = priceHeight + 10;
  const volumeHeight = height * 0.08;
  const macdTop = volumeTop + volumeHeight + 22;
  const macdHeight = height * 0.2;
  const dpoTop = macdTop + macdHeight + 18;
  const dpoHeight = height - dpoTop - pad.bottom;
  const chartWidth = width - pad.left - pad.right;
  const maxPrice = Math.max(...candles.map((item) => item.high)) * 1.015;
  const minPrice = Math.min(...candles.map((item) => item.low)) * 0.985;
  const maxVolume = Math.max(...candles.map((item) => item.volume));
  const xStep = chartWidth / candles.length;
  const candleWidth = Math.max(2, xStep * 0.58);
  const toX = (index: number) => pad.left + xStep * index + xStep / 2;
  const toPriceY = (value: number) =>
    pad.top +
    ((maxPrice - value) / (maxPrice - minPrice)) *
      (priceHeight - pad.top);

  ctx.fillStyle = "#090e13";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#18212b";
  ctx.lineWidth = 1;
  ctx.font = "10px Consolas, monospace";
  ctx.fillStyle = "#5f6c79";

  for (let i = 0; i <= 4; i += 1) {
    const y = pad.top + ((priceHeight - pad.top) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad.left, y);
    ctx.lineTo(width - pad.right, y);
    ctx.stroke();
    const label = maxPrice - ((maxPrice - minPrice) / 4) * i;
    ctx.fillText(
      label.toFixed(label >= 100 ? 1 : 2),
      width - pad.right + 7,
      y + 3
    );
  }

  candles.forEach((candle, index) => {
    const x = toX(index);
    const openY = toPriceY(candle.open);
    const closeY = toPriceY(candle.close);
    const highY = toPriceY(candle.high);
    const lowY = toPriceY(candle.low);
    const up = candle.close >= candle.open;
    ctx.strokeStyle = up ? "#ff5864" : "#2ed69b";
    ctx.fillStyle = up ? "#ff5864" : "#2ed69b";
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
      volumeTop +
      volumeHeight -
      (candle.volume / maxVolume) * volumeHeight;
    ctx.globalAlpha = 0.46;
    ctx.fillRect(
      x - candleWidth / 2,
      volumeY,
      candleWidth,
      volumeTop + volumeHeight - volumeY
    );
    ctx.globalAlpha = 1;
  });

  const keyY = toPriceY(keyLevel);
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = "#f6bd4b";
  ctx.beginPath();
  ctx.moveTo(pad.left, keyY);
  ctx.lineTo(width - pad.right, keyY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "#f6bd4b";
  ctx.fillText(`關鍵 ${keyLevel}`, width - pad.right + 4, keyY - 5);

  const trendline = fitDescendingTrendline(candles, 2);
  if (trendline) {
    const startIndex = trendline.touchIndexes[0];
    const lastTouchIndex = trendline.touchIndexes.at(-1)!;
    const endIndex = Math.min(
      candles.length - 1,
      lastTouchIndex + Math.max(4, Math.round(candles.length * 0.14))
    );
    const linePriceAt = (index: number) =>
      trendline.intercept + trendline.slope * index;

    ctx.strokeStyle = "#77a7ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(toX(startIndex), toPriceY(linePriceAt(startIndex)));
    ctx.lineTo(toX(endIndex), toPriceY(linePriceAt(endIndex)));
    ctx.stroke();

    // Mark the exact swing highs used by the detector so the user can audit
    // whether the automatically fitted resistance line is reasonable.
    ctx.fillStyle = "#77a7ff";
    trendline.touchIndexes.forEach((index) => {
      ctx.beginPath();
      ctx.arc(toX(index), toPriceY(candles[index].high), 3.2, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillText(
      `下降趨勢線 · ${trendline.touchIndexes.length} 點`,
      toX(startIndex),
      Math.max(12, toPriceY(linePriceAt(startIndex)) - 8)
    );
  }

  const latestCandle = candles.at(-1)!;
  const macdAbsoluteMax =
    Math.max(
      0.1,
      ...candles.flatMap((candle) => [
        Math.abs(candle.macd),
        Math.abs(candle.signal),
        Math.abs(candle.histogram)
      ])
    ) * 1.14;
  const macdZero = macdTop + macdHeight / 2;
  const toMacdY = (value: number) =>
    macdZero - (value / macdAbsoluteMax) * (macdHeight / 2);

  ctx.strokeStyle = "#49a89d";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, macdZero);
  ctx.lineTo(width - pad.right, macdZero);
  ctx.stroke();

  candles.forEach((candle, index) => {
    const x = toX(index);
    const previousHistogram =
      index === 0 ? candle.histogram : candles[index - 1].histogram;
    const rising = candle.histogram >= previousHistogram;
    ctx.fillStyle =
      candle.histogram > 0
        ? rising
          ? "#58cbd2"
          : "#aa4c54"
        : rising
          ? "#b8782d"
          : "#d63224";
    const histogramY = toMacdY(candle.histogram);
    ctx.globalAlpha = 0.82;
    ctx.fillRect(
      x - candleWidth / 2,
      Math.min(histogramY, macdZero),
      candleWidth,
      Math.max(1, Math.abs(macdZero - histogramY))
    );
    ctx.globalAlpha = 1;
  });

  // ChrisMoody CM_Ult_MacD_MTF: a thick MACD line that changes color
  // relative to the signal, plus the yellow signal line.
  ctx.lineCap = "round";
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    ctx.strokeStyle =
      candle.macd >= candle.signal ? "#45b832" : "#ca3021";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(toX(index - 1), toMacdY(candles[index - 1].macd));
    ctx.lineTo(toX(index), toMacdY(candle.macd));
    ctx.stroke();
  }

  ctx.strokeStyle = "#c8c02c";
  ctx.lineWidth = 2;
  ctx.beginPath();
  candles.forEach((candle, index) => {
    const x = toX(index);
    const y = toMacdY(candle.signal);
    if (index === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  candles.forEach((candle, index) => {
    if (index === 0) return;
    const previous = candles[index - 1];
    const crossedUp =
      previous.macd < previous.signal && candle.macd >= candle.signal;
    const crossedDown =
      previous.macd > previous.signal && candle.macd <= candle.signal;
    if (!crossedUp && !crossedDown) return;
    ctx.fillStyle = crossedUp ? "#45b832" : "#ca3021";
    ctx.beginPath();
    ctx.arc(toX(index), toMacdY(candle.signal), 4.5, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.lineCap = "butt";

  ctx.fillStyle = "#8e9baa";
  ctx.fillText("CM_Ult_MacD_MTF · 60 12 26 9", pad.left, macdTop - 5);

  const valueX = width - pad.right + 5;
  ctx.font = "bold 10px Consolas, monospace";
  ctx.fillStyle =
    latestCandle.macd >= latestCandle.signal ? "#45b832" : "#ca3021";
  ctx.fillText(latestCandle.macd.toFixed(2), valueX, macdTop + 12);
  ctx.fillStyle = "#c8c02c";
  ctx.fillText(latestCandle.signal.toFixed(2), valueX, macdTop + 25);
  ctx.fillStyle =
    latestCandle.histogram >= 0 ? "#58cbd2" : "#d63224";
  ctx.fillText(latestCandle.histogram.toFixed(2), valueX, macdTop + 38);
  ctx.font = "10px Consolas, monospace";

  const finiteDpoValues = candles
    .map((candle) => candle.dpo)
    .filter((value) => Number.isFinite(value));
  const dpoAbsoluteMax =
    Math.max(0.1, ...finiteDpoValues.map((value) => Math.abs(value))) * 1.12;
  const dpoZero = dpoTop + dpoHeight / 2;
  const toDpoY = (value: number) =>
    dpoZero - (value / dpoAbsoluteMax) * (dpoHeight / 2);

  ctx.strokeStyle = "#787b86";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.left, dpoZero);
  ctx.lineTo(width - pad.right, dpoZero);
  ctx.stroke();

  ctx.strokeStyle = "#dedede";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let dpoLineStarted = false;
  candles.forEach((candle, index) => {
    if (!Number.isFinite(candle.dpo)) {
      dpoLineStarted = false;
      return;
    }
    const y = toDpoY(candle.dpo);
    if (!dpoLineStarted) {
      ctx.moveTo(toX(index), y);
      dpoLineStarted = true;
    } else {
      ctx.lineTo(toX(index), y);
    }
  });
  ctx.stroke();

  ctx.fillStyle = "#8e9baa";
  ctx.fillText(`DPO ${DPO_PERIOD}`, pad.left, dpoTop - 5);
  if (Number.isFinite(latestCandle.dpo)) {
    ctx.fillStyle = "#dedede";
    ctx.font = "bold 10px Consolas, monospace";
    ctx.fillText(
      latestCandle.dpo.toFixed(2),
      width - pad.right + 5,
      Math.max(
        dpoTop + 12,
        Math.min(dpoTop + dpoHeight - 2, toDpoY(latestCandle.dpo) + 3)
      )
    );
    ctx.font = "10px Consolas, monospace";
  }
}

export function CandleChart({
  symbol,
  keyLevel
}: {
  symbol: string;
  keyLevel: number;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const [adjustment, setAdjustment] =
    useState<PriceAdjustment>("adjusted");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const candles = useMemo(
    () => getMarketCandles(symbol, timeframe, adjustment) ?? [],
    [symbol, timeframe, adjustment]
  );
  const dataNote = getMarketDataNote(symbol);
  const hasVerifiedData = Boolean(dataNote);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const redraw = () => drawChart(canvas, candles, keyLevel);
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [candles, keyLevel, timeframe]);

  return (
    <section className="panel chart-shell">
      <div className="chart-toolbar">
        <div className="timeframes" role="tablist" aria-label="K 線週期">
          {timeframeLabels.map((item) => (
            <button
              aria-selected={timeframe === item.value}
              className={`timeframe-button ${
                timeframe === item.value ? "active" : ""
              }`}
              key={item.value}
              onClick={() => setTimeframe(item.value)}
              role="tab"
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
        {hasVerifiedData ? (
          <div
            aria-label="價格還原方式"
            className="adjustment-toggle"
            role="group"
          >
            <button
              aria-pressed={adjustment === "adjusted"}
              className={adjustment === "adjusted" ? "active" : ""}
              onClick={() => setAdjustment("adjusted")}
              type="button"
            >
              還原 K
            </button>
            <button
              aria-pressed={adjustment === "raw"}
              className={adjustment === "raw" ? "active" : ""}
              onClick={() => setAdjustment("raw")}
              type="button"
            >
              原始 K
            </button>
          </div>
        ) : null}
        <div className="chart-legend">
          <span><i className="legend-dot" style={{ background: "var(--up)" }} />漲</span>
          <span><i className="legend-dot" style={{ background: "var(--down)" }} />跌</span>
          <span><i className="legend-dot" style={{ background: "var(--amber)" }} />關鍵價</span>
          <span><i className="legend-dot" style={{ background: "var(--blue)" }} />趨勢線</span>
        </div>
      </div>
      {dataNote ? (
        <div className="chart-source">
          {symbol}｜最新 OHLCV 已由 TWSE 核對（{dataNote.dataAsOf}）・
          五年歷史 {dataNote.historyDays} 日・
          {adjustment === "adjusted"
            ? `還原 K：依 TWSE 除權息參考價，事件 ${dataNote.corporateActions} 筆`
            : "原始 K：未還原除權息"}
        </div>
      ) : null}
      <canvas
        aria-label={`${symbol} ${timeframe} K 線與技術指標`}
        className="chart-canvas"
        ref={canvasRef}
      />
    </section>
  );
}
