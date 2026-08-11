export const trendlineCorrectionReasons = [
  "系統抓錯主高點",
  "H2 應接觸另一根 K 棒",
  "趨勢線穿越了不該穿越的 K 棒",
  "這不是有效的下降趨勢",
  "其他",
] as const;

export type TrendlineCorrectionReason =
  (typeof trendlineCorrectionReasons)[number];
export type TrendlineCorrectionTimeframe = "day" | "week" | "month";
export type TrendlineCorrectionAdjustment = "adjusted" | "raw";

export interface TrendlineAnchorSnapshot {
  date: string;
  price: number;
}

export interface TrendlineCorrectionInput {
  symbol: string;
  timeframe: TrendlineCorrectionTimeframe;
  adjustment: TrendlineCorrectionAdjustment;
  h1: TrendlineAnchorSnapshot;
  h2: TrendlineAnchorSnapshot;
  originalH1: TrendlineAnchorSnapshot | null;
  originalH2: TrendlineAnchorSnapshot | null;
  reason: TrendlineCorrectionReason;
  notes: string;
  submittedForLearning: boolean;
}

export interface TrendlineCorrection extends TrendlineCorrectionInput {
  createdAt: string;
  updatedAt: string;
}

const validTimeframes = new Set<TrendlineCorrectionTimeframe>([
  "day",
  "week",
  "month",
]);
const validAdjustments = new Set<TrendlineCorrectionAdjustment>([
  "adjusted",
  "raw",
]);
const validReasons = new Set<TrendlineCorrectionReason>(
  trendlineCorrectionReasons,
);

function normalizeAnchor(
  value: unknown,
  label: string,
): TrendlineAnchorSnapshot {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} 資料不完整`);
  }

  const candidate = value as { date?: unknown; price?: unknown };
  const date = typeof candidate.date === "string" ? candidate.date.trim() : "";
  const price = Number(candidate.price);
  if (!date || date.length > 32) throw new Error(`${label} 日期無效`);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`${label} 價格無效`);

  return { date, price };
}

function normalizeOptionalAnchor(
  value: unknown,
  label: string,
): TrendlineAnchorSnapshot | null {
  return value == null ? null : normalizeAnchor(value, label);
}

export function normalizeTrendlineCorrectionInput(
  value: unknown,
): TrendlineCorrectionInput {
  if (!value || typeof value !== "object") {
    throw new Error("校正資料格式錯誤");
  }

  const candidate = value as Record<string, unknown>;
  const symbol =
    typeof candidate.symbol === "string"
      ? candidate.symbol.trim().toUpperCase()
      : "";
  if (!/^[0-9A-Z.-]{1,16}$/.test(symbol)) throw new Error("股票代號無效");

  const timeframe = candidate.timeframe as TrendlineCorrectionTimeframe;
  if (!validTimeframes.has(timeframe)) throw new Error("K 線週期無效");

  const adjustment = candidate.adjustment as TrendlineCorrectionAdjustment;
  if (!validAdjustments.has(adjustment)) throw new Error("價格還原方式無效");

  const reason = candidate.reason as TrendlineCorrectionReason;
  if (!validReasons.has(reason)) throw new Error("請選擇校正原因");

  const notes = typeof candidate.notes === "string" ? candidate.notes.trim() : "";
  if (notes.length > 1_000) throw new Error("補充說明不可超過 1,000 字");

  const h1 = normalizeAnchor(candidate.h1, "H1");
  const h2 = normalizeAnchor(candidate.h2, "H2");
  if (h1.date >= h2.date) throw new Error("H1 必須早於 H2");
  if (h1.price <= h2.price) throw new Error("下降趨勢線的 H1 必須高於 H2");

  return {
    symbol,
    timeframe,
    adjustment,
    h1,
    h2,
    originalH1: normalizeOptionalAnchor(candidate.originalH1, "原始 H1"),
    originalH2: normalizeOptionalAnchor(candidate.originalH2, "原始 H2"),
    reason,
    notes,
    submittedForLearning: candidate.submittedForLearning === true,
  };
}

export function trendlineCorrectionKey(
  ownerId: string,
  symbol: string,
  timeframe: TrendlineCorrectionTimeframe,
  adjustment: TrendlineCorrectionAdjustment,
) {
  return [ownerId, symbol, timeframe, adjustment]
    .map((part) => encodeURIComponent(part))
    .join(":");
}
