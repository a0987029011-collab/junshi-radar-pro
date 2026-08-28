"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent
} from "react";
import { DPO_PERIOD } from "../lib/indicators.ts";
import {
  getCurrentTrendlineWave,
  getTrendlineWaveStates,
  type TrendlineWaveState
} from "../lib/multi-wave-strategy";
import {
  getAnchoredEndOffset,
  getPannedEndOffset,
  getPinchVisibleBars,
  getTrendlineAnchorRadius,
  resolveChartViewport
} from "../lib/chart-viewport";
import {
  getMarketCandles,
  getMarketDataNote,
  marketSnapshotMeta,
  type PriceAdjustment
} from "../lib/market-data";
import {
  BREAKOUT_TYPE_LABELS,
  getLatestBreakoutLowLine,
  getTrendlineBreakoutLowLine,
  priceOnTrackingLine,
  scanH1Trendline,
  type BreakoutLowLine,
  type H1TrendlineScan,
  type TrackingLineSegment
} from "../lib/scanEngine";
import type { Candle, Timeframe } from "../lib/types";
import { getSystemDisplayTrendline } from "../lib/trendline-display";
import {
  trendlineCorrectionReasons,
  type TrendlineCorrection,
  type TrendlineCorrectionInput,
  type TrendlineCorrectionReason
} from "../lib/trendline-corrections";

const timeframeLabels: { value: Timeframe; label: string }[] = [
  { value: "day", label: "日 K" },
  { value: "week", label: "週 K" },
  { value: "month", label: "月 K" }
];

const DEFAULT_VISIBLE_BARS = 180;
const MIN_VISIBLE_BARS = 1;
const getProjectionBarCount = (visibleCount: number) =>
  Math.min(12, Math.max(6, Math.round(visibleCount * 0.08)));
const getPointDistance = (
  first: { x: number; y: number },
  second: { x: number; y: number }
) => Math.hypot(second.x - first.x, second.y - first.y);
const priceFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2
});
const percentFormatter = new Intl.NumberFormat("zh-TW", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "always"
});

function formatPrice(value: number) {
  return priceFormatter.format(value);
}

function formatPercent(value: number) {
  return `${percentFormatter.format(value)}%`;
}

type EditableTrendline = {
  h1Index: number;
  h2Index: number;
  reason: TrendlineCorrectionReason | "";
  notes: string;
  submittedForLearning: boolean;
};

function lineFromEditable(candles: Candle[], editable?: EditableTrendline) {
  if (!editable) return undefined;
  const h1 = candles[editable.h1Index];
  const h2 = candles[editable.h2Index];
  if (!h1 || !h2 || editable.h2Index <= editable.h1Index) return undefined;
  return {
    roundId: -1,
    h1Index: editable.h1Index,
    h1Date: h1.time,
    startPrice: h1.high,
    endIndex: editable.h2Index,
    endDate: h2.time,
    endPrice: h2.high,
    slope: (h2.high - h1.high) / (editable.h2Index - editable.h1Index)
  } satisfies TrackingLineSegment;
}

function drawChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  trace: H1TrendlineScan,
  requestedVisibleBars: number,
  requestedViewEndOffset: number,
  inspectedIndex?: number,
  manualLine?: TrackingLineSegment,
  historicalWaves: TrendlineWaveState[] = []
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
  const viewport = resolveChartViewport(
    candles.length,
    requestedVisibleBars,
    MIN_VISIBLE_BARS,
    requestedViewEndOffset
  );
  const visibleCount = viewport.visibleCount;
  const viewEnd = viewport.endIndex;
  const viewStart = viewport.startIndex;
  const visibleCandles = candles.slice(viewStart, viewEnd + 1);
  const historicalBreakoutLowLine = getLatestBreakoutLowLine(candles, trace.signals);
  const supportTrendline = manualLine ?? getSystemDisplayTrendline(trace).line;
  const currentBreakoutLowLine = supportTrendline
    ? getTrendlineBreakoutLowLine(candles, supportTrendline)
    : undefined;
  const sameSupportLine =
    historicalBreakoutLowLine !== undefined &&
    currentBreakoutLowLine !== undefined &&
    historicalBreakoutLowLine.signalIndex === currentBreakoutLowLine.signalIndex &&
    historicalBreakoutLowLine.price === currentBreakoutLowLine.price;
  const breakoutLowLines: Array<{
    line: BreakoutLowLine;
    current: boolean;
    label: string;
  }> = [];
  for (const wave of historicalWaves) {
    if (wave.defense) {
      breakoutLowLines.push({
        line: wave.defense,
        current: false,
        label: `第 ${wave.waveNumber} 波防守`
      });
    }
  }
  if (
    historicalWaves.length === 0 &&
    historicalBreakoutLowLine &&
    !sameSupportLine
  ) {
    breakoutLowLines.push({
      line: historicalBreakoutLowLine,
      current: false,
      label: "過往防守"
    });
  }
  if (currentBreakoutLowLine) {
    breakoutLowLines.push({
      line: currentBreakoutLowLine,
      current: true,
      label: historicalWaves.length
        ? `第 ${historicalWaves.length + 1} 波防守`
        : "目前防守"
    });
  } else if (historicalBreakoutLowLine) {
    breakoutLowLines.push({
      line: historicalBreakoutLowLine,
      current: true,
      label: "目前防守"
    });
  }
  const visibleBreakoutLowLines = breakoutLowLines.filter(
    ({ line }) => line.endIndex >= viewStart && line.signalIndex <= viewEnd
  );
  const highs = visibleCandles.map((candle) => candle.high);
  const lows = [
    ...visibleCandles.map((candle) => candle.low),
    ...visibleBreakoutLowLines.map(({ line }) => line.price)
  ];
  const range = Math.max(...highs) - Math.min(...lows) || 1;
  const maxPrice = Math.max(...highs) + range * 0.06;
  const minPrice = Math.min(...lows) - range * 0.04;
  const maxVolume = Math.max(1, ...visibleCandles.map((candle) => candle.volume));
  const projectionBarCount = getProjectionBarCount(visibleCount);
  const xStep = chartWidth / (visibleCount + projectionBarCount);
  const candleWidth = Math.max(1.5, xStep * 0.58);
  const systemAnchorRadius = getTrendlineAnchorRadius(candleWidth);
  const manualAnchorRadius = getTrendlineAnchorRadius(candleWidth, true);
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

  visibleBreakoutLowLines.forEach(({ line, current, label }) => {
    const startIndex = Math.max(line.signalIndex, viewStart);
    const clippedEndIndex = Math.min(line.endIndex, viewEnd);
    const y = toPriceY(line.price);
    const startX =
      line.signalIndex < viewStart ? pad.left : toX(startIndex);
    const endX = line.active
      ? width - pad.right
      : toX(clippedEndIndex);

    ctx.save();
    ctx.globalAlpha = current ? 0.98 : 0.48;
    ctx.strokeStyle = current ? "#ffd166" : "#ff9aa1";
    ctx.fillStyle = current ? "#ffe29a" : "#ffb7bd";
    ctx.lineWidth = current ? 2 : 1.25;
    ctx.setLineDash(current ? [8, 4] : [3, 4]);
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillText(
      `${label} ${formatPrice(line.price)}`,
      line.active
        ? Math.max(pad.left, endX - 112)
        : Math.min(width - pad.right - 48, endX + 6),
      Math.max(12, y - 5)
    );
    ctx.restore();
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

  const {
    h1: displayedH1,
    latestSignal,
    line: displayedLine
  } = getSystemDisplayTrendline(trace);

  historicalWaves.forEach((wave) => {
    if (wave.line) drawLine(wave.line, viewEnd, "#c08add", 0.52, true);
  });

  if (displayedLine && displayedLine.slope < 0) {
    drawLine(
      displayedLine,
      latestSignal?.index ?? displayedLine.endIndex,
      "#77a7ff",
      manualLine ? 0.58 : 0.95,
      Boolean(manualLine)
    );
  }

  if (manualLine && manualLine.slope < 0) {
    drawLine(manualLine, viewEnd, "#d894ff", 0.98);
  }

  if (
    displayedH1 &&
    displayedH1.index >= viewStart &&
    displayedH1.index <= viewEnd
  ) {
    const x = toX(displayedH1.index);
    const y = toPriceY(displayedH1.price);
    ctx.globalAlpha = manualLine ? 0.58 : 1;
    ctx.fillStyle = "#f6bd4b";
    ctx.strokeStyle = "#090e13";
    ctx.lineWidth = Math.max(0.8, systemAnchorRadius * 0.34);
    ctx.beginPath();
    ctx.arc(x, y, systemAnchorRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#f6bd4b";
    ctx.fillText(manualLine ? "原 H1" : "H1", x + 6, Math.max(12, y - 7));
    ctx.globalAlpha = 1;
  }

  if (
    displayedLine &&
    displayedLine.endIndex >= viewStart &&
    displayedLine.endIndex <= viewEnd
  ) {
    const x = toX(displayedLine.endIndex);
    const y = toPriceY(displayedLine.endPrice);
    ctx.globalAlpha = manualLine ? 0.58 : 1;
    ctx.fillStyle = "#63d8ee";
    ctx.strokeStyle = "#090e13";
    ctx.lineWidth = Math.max(0.8, systemAnchorRadius * 0.34);
    ctx.beginPath();
    ctx.arc(x, y, systemAnchorRadius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#63d8ee";
    ctx.fillText(manualLine ? "原 H2" : "H2", x - 28, Math.max(12, y - 7));
    ctx.globalAlpha = 1;
  }

  if (manualLine) {
    const drawManualAnchor = (
      index: number,
      price: number,
      label: string,
      labelOffset: number
    ) => {
      if (index < viewStart || index > viewEnd) return;
      const x = toX(index);
      const y = toPriceY(price);
      ctx.fillStyle = "#d894ff";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = Math.max(0.8, manualAnchorRadius * 0.34);
      ctx.beginPath();
      ctx.arc(x, y, manualAnchorRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#efd2ff";
      ctx.fillText(label, x + labelOffset, Math.max(12, y - 8));
    };
    drawManualAnchor(manualLine.h1Index, manualLine.startPrice, "校正 H1", 8);
    drawManualAnchor(manualLine.endIndex, manualLine.endPrice, "校正 H2", -48);
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
  if (
    !manualLine &&
    latestEvaluation?.index === candles.length - 1 &&
    latestEvaluation.index >= viewStart &&
    latestEvaluation.index <= viewEnd
  ) {
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

  const latestCandle = candles[viewEnd];
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
  for (let index = Math.max(1, viewStart + 1); index <= viewEnd; index += 1) {
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
    const x = toX(inspectedIndex);
    ctx.save();
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(99, 216, 238, .72)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, pad.top);
    ctx.lineTo(x, height - pad.bottom);
    ctx.stroke();
    ctx.restore();
  }
}

export function CandleChart({ symbol }: { symbol: string }) {
  const intradaySnapshot =
    marketSnapshotMeta.marketPhase === "intraday" ||
    marketSnapshotMeta.mode.includes("intraday");
  const [timeframe, setTimeframe] = useState<Timeframe>("day");
  const [adjustment, setAdjustment] = useState<PriceAdjustment>("adjusted");
  const [visibleBars, setVisibleBars] = useState(DEFAULT_VISIBLE_BARS);
  const [viewEndOffset, setViewEndOffset] = useState(0);
  const [inspectedIndex, setInspectedIndex] = useState<number>();
  const [corrections, setCorrections] = useState<TrendlineCorrection[]>([]);
  const [correctionLoading, setCorrectionLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editingMode, setEditingMode] = useState<"edit" | "append">("edit");
  const [draft, setDraft] = useState<EditableTrendline>();
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);
  const inspectingRef = useRef(false);
  const draggingAnchorRef = useRef<"h1" | "h2" | null>(null);
  const touchPointsRef = useRef(new Map<number, { x: number; y: number }>());
  const touchPanRef = useRef<{
    pointerId: number;
    startX: number;
    startEndOffset: number;
    visibleCount: number;
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    startDistance: number;
    startVisibleCount: number;
    anchorIndex: number;
  } | null>(null);
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
  const historicalBreakoutLowLine = useMemo(
    () => getLatestBreakoutLowLine(candles, trace.signals),
    [candles, trace]
  );
  const systemTrendline = useMemo(() => getSystemDisplayTrendline(trace), [trace]);
  const visibleCorrections = useMemo(
    () => corrections.filter(
      (item) =>
        item.symbol === symbol &&
        item.timeframe === timeframe &&
        item.adjustment === adjustment
    ),
    [adjustment, corrections, symbol, timeframe]
  );
  const correction = visibleCorrections.at(-1) ?? null;
  const visibleCorrection =
    correction?.symbol === symbol &&
    correction.timeframe === timeframe &&
    correction.adjustment === adjustment
      ? correction
      : null;
  const waveStates = useMemo(
    () => getTrendlineWaveStates(candles, visibleCorrections),
    [candles, visibleCorrections]
  );
  const currentWave = getCurrentTrendlineWave(waveStates);
  const historicalWaves = useMemo(
    () => currentWave
      ? waveStates.filter(
          (wave) => wave.correction.id !== currentWave.correction.id
        )
      : [],
    [currentWave, waveStates]
  );
  const correctionEditable = useMemo<EditableTrendline | undefined>(() => {
    if (!visibleCorrection) return undefined;
    const h1Index = candles.findIndex((candle) => candle.time === visibleCorrection.h1.date);
    const h2Index = candles.findIndex((candle) => candle.time === visibleCorrection.h2.date);
    if (h1Index < 0 || h2Index <= h1Index) return undefined;
    return {
      h1Index,
      h2Index,
      reason: visibleCorrection.reason,
      notes: visibleCorrection.notes,
      submittedForLearning: visibleCorrection.submittedForLearning
    };
  }, [candles, visibleCorrection]);
  const activeEditable = editing ? draft : correctionEditable;
  const manualLine = useMemo(
    () => lineFromEditable(candles, activeEditable),
    [activeEditable, candles]
  );
  const currentBreakoutLowLine = useMemo(() => {
    const displayedTrendline = manualLine ?? systemTrendline.line;
    return displayedTrendline
      ? getTrendlineBreakoutLowLine(candles, displayedTrendline)
      : undefined;
  }, [candles, manualLine, systemTrendline]);
  const currentSupportLine =
    (editing && currentBreakoutLowLine?.active
      ? currentBreakoutLowLine
      : currentWave?.defense?.active
        ? currentWave.defense
        : undefined) ??
    historicalBreakoutLowLine;
  const historicalSupportLine =
    historicalWaves.find((wave) => wave.defense?.active)?.defense ??
    (historicalBreakoutLowLine &&
    currentBreakoutLowLine &&
    (historicalBreakoutLowLine.signalIndex !== currentBreakoutLowLine.signalIndex ||
      historicalBreakoutLowLine.price !== currentBreakoutLowLine.price)
      ? historicalBreakoutLowLine
      : undefined);
  const dataNote = getMarketDataNote(symbol);
  const minimumVisibleBars = Math.min(MIN_VISIBLE_BARS, candles.length);
  const viewport = resolveChartViewport(
    candles.length,
    visibleBars,
    minimumVisibleBars,
    viewEndOffset
  );
  const visibleBarCount = viewport.visibleCount;
  const inspectedCandle =
    inspectedIndex === undefined ? undefined : candles[inspectedIndex];
  const inspectedPreviousClose =
    inspectedIndex === undefined || inspectedIndex === 0
      ? undefined
      : candles[inspectedIndex - 1]?.close;
  const inspectedChangePercent =
    inspectedCandle && inspectedPreviousClose && inspectedPreviousClose !== 0
      ? ((inspectedCandle.close - inspectedPreviousClose) / inspectedPreviousClose) * 100
      : undefined;
  const currentBreakoutDate =
    currentSupportLine === undefined
      ? undefined
      : candles[currentSupportLine.signalIndex]?.time;
  const correctionUrl = `/api/trendline-corrections?${new URLSearchParams({
    symbol,
    timeframe,
    adjustment
  })}`;
  const setChartZoom = (
    requestedVisibleBars: number,
    anchor?: { index: number; ratio: number }
  ) => {
    const nextVisibleCount = resolveChartViewport(
      candles.length,
      requestedVisibleBars,
      minimumVisibleBars,
      0
    ).visibleCount;
    setVisibleBars(nextVisibleCount);
    setViewEndOffset((current) =>
      anchor
        ? getAnchoredEndOffset(
            candles.length,
            nextVisibleCount,
            anchor.index,
            anchor.ratio
          )
        : Math.min(current, Math.max(0, candles.length - nextVisibleCount))
    );
    setInspectedIndex(undefined);
  };
  const zoomIn = () => {
    setChartZoom(Math.max(minimumVisibleBars, Math.round(visibleBarCount * 0.72)));
  };
  const zoomOut = () => {
    setChartZoom(
      Math.min(
        candles.length,
        Math.max(visibleBarCount + 1, Math.round(visibleBarCount * 1.4))
      )
    );
  };
  const ratioAtClientX = (clientX: number, count: number) => {
    const canvas = canvasRef.current;
    if (!canvas || count <= 1) return 0;
    const rect = canvas.getBoundingClientRect();
    const chartLeft = 12;
    const chartRight = 58;
    const chartWidth = Math.max(1, rect.width - chartLeft - chartRight);
    const xStep = chartWidth / (count + getProjectionBarCount(count));
    const localX = Math.max(
      0,
      Math.min(chartWidth - 0.01, clientX - rect.left - chartLeft)
    );
    const barPosition = Math.max(
      0,
      Math.min(count - 1, localX / xStep - 0.5)
    );
    return barPosition / (count - 1);
  };
  const indexAtClientX = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return undefined;
    const rect = canvas.getBoundingClientRect();
    const chartLeft = 12;
    const chartRight = 58;
    const chartWidth = Math.max(1, rect.width - chartLeft - chartRight);
    const count = viewport.visibleCount;
    const startIndex = viewport.startIndex;
    const xStep = chartWidth / (count + getProjectionBarCount(count));
    const localX = Math.max(
      0,
      Math.min(chartWidth - 0.01, clientX - rect.left - chartLeft)
    );
    const offset = Math.min(count - 1, Math.floor(localX / xStep));
    return startIndex + offset;
  };
  const inspectAtClientX = (clientX: number) => {
    const index = indexAtClientX(clientX);
    if (index !== undefined) setInspectedIndex(index);
  };
  const resetChartView = () => {
    setVisibleBars(DEFAULT_VISIBLE_BARS);
    setViewEndOffset(0);
    setInspectedIndex(undefined);
  };

  const createSystemDraft = (): EditableTrendline | undefined => {
    const h1Index = systemTrendline.h1?.index;
    const h2Index = systemTrendline.line?.endIndex;
    if (h1Index === undefined || h2Index === undefined || h2Index <= h1Index) {
      return undefined;
    }
    return {
      h1Index,
      h2Index,
      reason: visibleCorrection?.reason ?? "",
      notes: visibleCorrection?.notes ?? "",
      submittedForLearning: visibleCorrection?.submittedForLearning ?? false
    };
  };

  const startEditing = (mode: "edit" | "append" = "edit") => {
    const nextDraft = mode === "edit"
      ? correctionEditable ?? createSystemDraft()
      : createSystemDraft();
    if (!nextDraft) {
      setFeedback("目前沒有可編輯的下降趨勢線。");
      return;
    }
    setDraft(nextDraft);
    setVisibleBars((current) =>
      Math.min(candles.length, Math.max(current, candles.length - nextDraft.h1Index))
    );
    setViewEndOffset(0);
    setInspectedIndex(undefined);
    setFeedback("");
    setEditingMode(mode);
    setEditing(true);
  };

  const beginAnchorDrag = (clientX: number) => {
    const canvas = canvasRef.current;
    if (!canvas || !draft) return false;
    const rect = canvas.getBoundingClientRect();
    const count = viewport.visibleCount;
    const startIndex = viewport.startIndex;
    const xStep = Math.max(
      1,
      (rect.width - 12 - 58) / (count + getProjectionBarCount(count))
    );
    const pointerX = clientX - rect.left;
    const anchorX = (index: number) =>
      12 + xStep * (index - startIndex) + xStep / 2;
    const options = [
      { anchor: "h1" as const, distance: Math.abs(pointerX - anchorX(draft.h1Index)) },
      { anchor: "h2" as const, distance: Math.abs(pointerX - anchorX(draft.h2Index)) }
    ].sort((left, right) => left.distance - right.distance);
    if (options[0].distance > 32) {
      setFeedback("請按住紫色的校正 H1 或 H2 圓點再拖曳。");
      return false;
    }
    draggingAnchorRef.current = options[0].anchor;
    setFeedback("");
    return true;
  };

  const dragAnchorTo = (clientX: number) => {
    const index = indexAtClientX(clientX);
    const anchor = draggingAnchorRef.current;
    if (index === undefined || !anchor) return;
    setDraft((current) => {
      if (!current) return current;
      return anchor === "h1"
        ? { ...current, h1Index: Math.min(index, current.h2Index - 1) }
        : { ...current, h2Index: Math.max(index, current.h1Index + 1) };
    });
  };

  const saveCorrection = async () => {
    if (!draft?.reason) {
      setFeedback("請先選擇校正原因。");
      return;
    }
    const h1 = candles[draft.h1Index];
    const h2 = candles[draft.h2Index];
    if (!h1 || !h2 || draft.h2Index <= draft.h1Index) {
      setFeedback("H1 必須位於 H2 之前。");
      return;
    }
    if (h1.high <= h2.high) {
      setFeedback("下降趨勢線的 H1 必須高於 H2，請重新拖曳。");
      return;
    }

    const input: TrendlineCorrectionInput = {
      symbol,
      timeframe,
      adjustment,
      h1: { date: h1.time, price: h1.high },
      h2: { date: h2.time, price: h2.high },
      originalH1: systemTrendline.h1
        ? { date: systemTrendline.h1.date, price: systemTrendline.h1.price }
        : null,
      originalH2: systemTrendline.line
        ? { date: systemTrendline.line.endDate, price: systemTrendline.line.endPrice }
        : null,
      reason: draft.reason,
      notes: draft.notes,
      submittedForLearning: draft.submittedForLearning
    };

    setSaving(true);
    setFeedback("正在儲存校正…");
    try {
      const response = await fetch(correctionUrl, {
        method: editingMode === "append" ? "POST" : "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...input,
          ...(editingMode === "edit" && visibleCorrection
            ? { correctionId: visibleCorrection.id }
            : {})
        })
      });
      const payload = (await response.json()) as {
        correction?: TrendlineCorrection;
        corrections?: TrendlineCorrection[];
        error?: string;
      };
      if (!response.ok || !payload.correction || !payload.corrections) {
        throw new Error(payload.error ?? "儲存失敗");
      }
      setCorrections(payload.corrections);
      setEditing(false);
      const savedWaveNumber =
        payload.corrections.findIndex(
          (item) => item.id === payload.correction?.id
        ) + 1;
      setFeedback(
        payload.correction.submittedForLearning
          ? `已儲存第 ${savedWaveNumber} 波，並加入邏輯學習案例。`
          : `已儲存第 ${savedWaveNumber} 波趨勢線。`
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "儲存失敗");
    } finally {
      setSaving(false);
    }
  };

  const deleteCorrection = async () => {
    setSaving(true);
    setFeedback("正在還原系統趨勢線…");
    try {
      const deleteUrl = visibleCorrection
        ? `${correctionUrl}&correctionId=${encodeURIComponent(visibleCorrection.id)}`
        : correctionUrl;
      const response = await fetch(deleteUrl, { method: "DELETE" });
      const payload = (await response.json()) as {
        corrections?: TrendlineCorrection[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "還原失敗");
      setCorrections(payload.corrections ?? []);
      setDraft(undefined);
      setEditing(false);
      setFeedback(
        payload.corrections?.length
          ? "已刪除目前波段，前一波仍保留。"
          : "已刪除人工波段，恢復顯示系統趨勢線。"
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "還原失敗");
    } finally {
      setSaving(false);
    }
  };

  const handleChartPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    if (editing) {
      if (beginAnchorDrag(event.clientX)) {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragAnchorTo(event.clientX);
      }
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    if (event.pointerType !== "touch") {
      inspectingRef.current = true;
      inspectAtClientX(event.clientX);
      return;
    }

    event.preventDefault();
    const points = touchPointsRef.current;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    setInspectedIndex(undefined);

    if (points.size === 1) {
      touchPanRef.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startEndOffset: viewport.endOffset,
        visibleCount: viewport.visibleCount,
        moved: false
      };
      pinchRef.current = null;
      return;
    }

    const [first, second] = Array.from(points.values());
    const midpointX = (first.x + second.x) / 2;
    pinchRef.current = {
      startDistance: Math.max(1, getPointDistance(first, second)),
      startVisibleCount: viewport.visibleCount,
      anchorIndex: indexAtClientX(midpointX) ?? viewport.endIndex
    };
    touchPanRef.current = null;
  };

  const handleChartPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    if (editing) {
      dragAnchorTo(event.clientX);
      return;
    }
    if (event.pointerType !== "touch") {
      if (inspectingRef.current) inspectAtClientX(event.clientX);
      return;
    }

    const points = touchPointsRef.current;
    if (!points.has(event.pointerId)) return;
    event.preventDefault();
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });

    const pinch = pinchRef.current;
    if (points.size >= 2 && pinch) {
      const [first, second] = Array.from(points.values());
      const currentDistance = Math.max(1, getPointDistance(first, second));
      const nextVisibleCount = getPinchVisibleBars(
        pinch.startVisibleCount,
        pinch.startDistance,
        currentDistance,
        minimumVisibleBars,
        candles.length
      );
      const midpointX = (first.x + second.x) / 2;
      setChartZoom(nextVisibleCount, {
        index: pinch.anchorIndex,
        ratio: ratioAtClientX(midpointX, nextVisibleCount)
      });
      return;
    }

    const pan = touchPanRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const chartWidth = Math.max(1, rect.width - 12 - 58);
    const pixelsPerBar =
      chartWidth / (pan.visibleCount + getProjectionBarCount(pan.visibleCount));
    const horizontalDelta = event.clientX - pan.startX;
    pan.moved ||= Math.abs(horizontalDelta) >= 6;
    setViewEndOffset(
      getPannedEndOffset(
        pan.startEndOffset,
        horizontalDelta,
        pixelsPerBar,
        Math.max(0, candles.length - pan.visibleCount)
      )
    );
  };

  const handleChartPointerUp = (
    event: ReactPointerEvent<HTMLCanvasElement>
  ) => {
    draggingAnchorRef.current = null;
    inspectingRef.current = false;

    if (event.pointerType === "touch") {
      const points = touchPointsRef.current;
      const pan = touchPanRef.current;
      const wasTap =
        points.size === 1 &&
        pan?.pointerId === event.pointerId &&
        !pan.moved &&
        pinchRef.current === null;
      points.delete(event.pointerId);
      if (points.size === 0) {
        touchPanRef.current = null;
        pinchRef.current = null;
        if (wasTap) inspectAtClientX(event.clientX);
      }
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleChartPointerCancel = () => {
    draggingAnchorRef.current = null;
    inspectingRef.current = false;
    touchPointsRef.current.clear();
    touchPanRef.current = null;
    pinchRef.current = null;
    setInspectedIndex(undefined);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch(correctionUrl, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = (await response.json()) as {
          correction?: TrendlineCorrection | null;
          corrections?: TrendlineCorrection[];
          error?: string;
        };
        if (!response.ok) throw new Error(payload.error ?? "讀取校正失敗");
        setCorrections(payload.corrections ?? (payload.correction ? [payload.correction] : []));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setFeedback(error instanceof Error ? error.message : "讀取校正失敗");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCorrectionLoading(false);
      });
    return () => controller.abort();
  }, [correctionUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !candles.length) return;
    const redraw = () =>
      drawChart(
        canvas,
        candles,
        trace,
        visibleBars,
        viewEndOffset,
        inspectedIndex,
        manualLine,
        historicalWaves
      );
    redraw();
    const observer = new ResizeObserver(redraw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [
    candles,
    historicalWaves,
    inspectedIndex,
    manualLine,
    trace,
    viewEndOffset,
    visibleBars
  ]);

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
                if (item.value !== timeframe) {
                  setCorrectionLoading(true);
                  setCorrections([]);
                  setDraft(undefined);
                  setEditing(false);
                  setFeedback("");
                }
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
                if (adjustment !== "adjusted") {
                  setCorrectionLoading(true);
                  setCorrections([]);
                  setDraft(undefined);
                  setEditing(false);
                  setFeedback("");
                }
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
                if (adjustment !== "raw") {
                  setCorrectionLoading(true);
                  setCorrections([]);
                  setDraft(undefined);
                  setEditing(false);
                  setFeedback("");
                }
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
            onClick={() => setChartZoom(candles.length)}
            type="button"
          >
            全部
          </button>
        </div>
        <button
          className={`trendline-edit-button ${editing ? "active" : ""}`}
          disabled={correctionLoading || saving || !systemTrendline.line}
          onClick={() => {
            if (editing) {
              setDraft(undefined);
              setEditing(false);
              setFeedback("");
            } else {
              startEditing("edit");
            }
          }}
          type="button"
        >
          {editing ? "取消編輯" : visibleCorrection ? "編輯目前波" : "編輯趨勢線"}
        </button>
        {visibleCorrection && !editing ? (
          <button
            className="trendline-edit-button"
            disabled={correctionLoading || saving || !systemTrendline.line}
            onClick={() => startEditing("append")}
            type="button"
          >
            ＋ 新增下一波
          </button>
        ) : null}
        <div className="chart-legend">
          <span><i className="legend-dot" style={{ background: "var(--amber)" }} />H1</span>
          <span><i className="legend-dot" style={{ background: "var(--blue)" }} />系統趨勢線</span>
          {manualLine ? <span><i className="legend-dot trendline-manual-dot" />人工波段線</span> : null}
          <span><i className="legend-dot" style={{ background: "var(--up)" }} />紅 K 穿越</span>
          {historicalSupportLine ? <span><i className="legend-dot" style={{ background: "#ff9aa1" }} />過往防守</span> : null}
          {currentSupportLine ? <span><i className="legend-dot" style={{ background: "#ffd166" }} />目前防守</span> : null}
        </div>
      </div>
      <div className={`chart-inspection-bar ${inspectedCandle ? "active" : ""}`} aria-live="polite">
        {inspectedCandle ? (
          <>
            <span className="chart-inspection-item chart-inspection-time"><small>時間</small><strong>{inspectedCandle.time.replaceAll("-", "/")}</strong></span>
            <span className="chart-inspection-item"><small>高</small><strong>{formatPrice(inspectedCandle.high)}</strong></span>
            <span className="chart-inspection-item"><small>低</small><strong>{formatPrice(inspectedCandle.low)}</strong></span>
            <span className="chart-inspection-item"><small>開</small><strong>{formatPrice(inspectedCandle.open)}</strong></span>
            <span className="chart-inspection-item"><small>{intradaySnapshot ? "現" : "收"}</small><strong>{formatPrice(inspectedCandle.close)}</strong></span>
            {inspectedChangePercent !== undefined ? (
              <span className="chart-inspection-item chart-inspection-change">
                <small>漲跌幅</small>
                <strong className={inspectedChangePercent > 0 ? "positive" : inspectedChangePercent < 0 ? "negative" : ""}>
                  {formatPercent(inspectedChangePercent)}
                </strong>
              </span>
            ) : null}
          </>
        ) : (
          <span className="chart-inspection-hint">輕點 K 棒查看時間、四價與漲跌幅；單指左右拖曳可移動圖表</span>
        )}
      </div>
      <canvas
        aria-label={`${symbol} ${timeframe} K 線、最近 H1、H2 與突破紅 K、MACD 與 DPO${
          historicalSupportLine
            ? `；過往防守線 ${formatPrice(historicalSupportLine.price)}`
            : ""
        }${
          currentSupportLine
            ? `；目前防守線 ${currentBreakoutDate ?? "穿越紅 K"} 低點 ${formatPrice(currentSupportLine.price)}，收盤尚未跌破`
            : ""
        }${
          inspectedCandle
            ? `；已選取 ${inspectedCandle.time}，最高 ${formatPrice(inspectedCandle.high)}，最低 ${formatPrice(inspectedCandle.low)}，開盤 ${formatPrice(inspectedCandle.open)}，${intradaySnapshot ? "現價" : "收盤"} ${formatPrice(inspectedCandle.close)}${inspectedChangePercent === undefined ? "" : `，漲跌幅 ${formatPercent(inspectedChangePercent)}`}`
            : ""
        }`}
        className="chart-canvas"
        onDoubleClick={() => {
          if (editing) return;
          setChartZoom(candles.length);
        }}
        onPointerCancel={handleChartPointerCancel}
        onPointerDown={handleChartPointerDown}
        onPointerMove={handleChartPointerMove}
        onPointerUp={handleChartPointerUp}
        onWheel={(event) => {
          event.preventDefault();
          if (event.deltaY < 0) zoomIn();
          else zoomOut();
        }}
        ref={canvasRef}
        style={{ touchAction: "none" }}
        title={editing
          ? "按住紫色的校正 H1 或 H2 圓點，拖到你認定的 K 棒"
          : `輕點查看日期、最高、最低、開盤、${intradaySnapshot ? "現價" : "收盤價"}與漲跌幅；單指左右移動；兩指或滾輪縮放；雙擊顯示全部 K 棒`}
      />
      {editing && draft && manualLine ? (
        <div className="trendline-editor">
          <div className="trendline-editor-head">
            <div>
              <strong>
                {editingMode === "append"
                  ? `新增第 ${visibleCorrections.length + 1} 波趨勢線`
                  : `編輯第 ${Math.max(1, visibleCorrections.length)} 波趨勢線`}
              </strong>
              <p>每一波會分開保存；新增下一波不會覆蓋第一波與原始生命線。</p>
            </div>
            <span className="trendline-local-badge">只影響 {symbol}</span>
          </div>
          <div className="trendline-compare-grid">
            <div className="trendline-compare-card system">
              <span>系統原始線</span>
              <strong>
                {systemTrendline.h1?.date ?? "—"} → {systemTrendline.line?.endDate ?? "—"}
              </strong>
              <small>
                H1 {systemTrendline.h1 ? formatPrice(systemTrendline.h1.price) : "—"} · H2 {systemTrendline.line ? formatPrice(systemTrendline.line.endPrice) : "—"}
              </small>
            </div>
            <div className="trendline-compare-card manual">
              <span>{editingMode === "append" ? "新的波段線" : "目前波段線"}</span>
              <strong>{manualLine.h1Date} → {manualLine.endDate}</strong>
              <small>H1 {formatPrice(manualLine.startPrice)} · H2 {formatPrice(manualLine.endPrice)}</small>
            </div>
          </div>
          <div className="trendline-editor-form">
            <label className="trendline-field">
              <span>為什麼要校正？</span>
              <select
                onChange={(event) =>
                  setDraft((current) => current
                    ? { ...current, reason: event.target.value as TrendlineCorrectionReason }
                    : current)
                }
                value={draft.reason}
              >
                <option value="">請選擇原因</option>
                {trendlineCorrectionReasons.map((reason) => (
                  <option key={reason} value={reason}>{reason}</option>
                ))}
              </select>
            </label>
            <label className="trendline-field trendline-notes">
              <span>補充你的判斷邏輯（選填）</span>
              <textarea
                maxLength={1000}
                onChange={(event) =>
                  setDraft((current) => current
                    ? { ...current, notes: event.target.value }
                    : current)
                }
                placeholder="例如：應以 6/18 的反彈高點連到 7/9，因為中間高點沒有形成有效壓力。"
                rows={3}
                value={draft.notes}
              />
            </label>
          </div>
          <label className="trendline-learning-option">
            <input
              checked={draft.submittedForLearning}
              onChange={(event) =>
                setDraft((current) => current
                  ? { ...current, submittedForLearning: event.target.checked }
                  : current)
              }
              type="checkbox"
            />
            <span>
              <strong>提交為邏輯學習案例</strong>
              <small>先保存成可分析的案例，不會自動改動全站選股與掃描結果。</small>
            </span>
          </label>
          <div className="trendline-editor-actions">
            <button
              className="secondary-button"
              disabled={saving}
              onClick={() => {
                const next = createSystemDraft();
                if (next) setDraft(next);
                setFeedback("已把編輯中的錨點重設為系統原始線，尚未儲存。");
              }}
              type="button"
            >
              重設錨點
            </button>
            {visibleCorrection && editingMode === "edit" ? (
              <button
                className="danger-button"
                disabled={saving}
                onClick={deleteCorrection}
                type="button"
              >
                刪除校正
              </button>
            ) : null}
            <button
              className="primary-button"
              disabled={saving}
              onClick={saveCorrection}
              type="button"
            >
              {saving
                ? "儲存中…"
                : editingMode === "append"
                  ? `儲存第 ${visibleCorrections.length + 1} 波`
                  : "儲存目前波段"}
            </button>
          </div>
        </div>
      ) : waveStates.length ? (
        <div className="trendline-wave-list">
          <div className="trendline-wave-list-head">
            <div>
              <strong>多波段策略紀錄</strong>
              <span>新增後保留前波；賣出持股不會刪除仍有效的大結構。</span>
            </div>
            <em>{waveStates.length} 波</em>
          </div>
          <div className="trendline-wave-grid">
            {waveStates.map((wave) => (
              <article
                className={`trendline-wave-card ${wave.status}`}
                key={wave.correction.id}
              >
                <div>
                  <strong>第 {wave.waveNumber} 波</strong>
                  <span>{wave.correction.h1.date} → {wave.correction.h2.date}</span>
                </div>
                <div>
                  <small>{wave.defense ? "突破生命線" : "目前狀態"}</small>
                  <b>
                    {wave.status === "active" && wave.defense
                      ? formatPrice(wave.defense.price)
                      : wave.status === "failed"
                        ? "本波已失效"
                        : wave.status === "parent-invalid"
                          ? "第一波已失效"
                          : "等待紅 K 穿線"}
                  </b>
                </div>
                {wave.correction.submittedForLearning ? <em>學習案例</em> : null}
              </article>
            ))}
          </div>
          <div className="trendline-wave-actions">
            <button disabled={saving} onClick={() => startEditing("edit")} type="button">
              編輯目前波
            </button>
            <button disabled={saving} onClick={deleteCorrection} type="button">
              刪除目前波
            </button>
          </div>
        </div>
      ) : null}
      {feedback ? <div className="trendline-feedback" role="status">{feedback}</div> : null}
    </section>
  );
}
