import type { Candle, Timeframe } from "./types";
import { calculateDpo } from "./indicators.ts";

type OhlcvRow = [
  time: string,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number
];

export type PriceAdjustment = "adjusted" | "raw";

interface CashDividendAction {
  exDate: string;
  cashDividend: number;
  previousClose: number;
  referencePrice: number;
}

// The latest price stays unchanged. Prices before each ex-dividend date are
// multiplied by referencePrice / previousClose, matching percentage-based
// backward adjustment on total-return charts.
const evergreenCashDividends: CashDividendAction[] = [
  {
    exDate: "2026-06-17",
    cashDividend: 16,
    previousClose: 220.5,
    referencePrice: 204.5
  }
];

// TWSE STOCK_DAY, 2603 Evergreen Marine, 2026-04-01 through 2026-07-29.
// This static official sample keeps the MVP auditable until a live adapter is
// enabled. It is intentionally isolated so it can be replaced without touching
// the chart or strategy engines.
const evergreenDaily: OhlcvRow[] = [
  ["2026-04-01", 202, 205, 201, 204.5, 7574196],
  ["2026-04-02", 204, 204.5, 201, 202.5, 6011232],
  ["2026-04-07", 203, 204.5, 202.5, 203, 4466949],
  ["2026-04-08", 203.5, 203.5, 200, 202, 13540511],
  ["2026-04-09", 201, 203, 200, 203, 7093237],
  ["2026-04-10", 203.5, 204, 201.5, 202.5, 8319682],
  ["2026-04-13", 202.5, 203, 200, 200, 8348217],
  ["2026-04-14", 202, 202, 200.5, 201, 7674459],
  ["2026-04-15", 202, 204, 200.5, 203, 10154229],
  ["2026-04-16", 203, 204.5, 200, 201.5, 13533108],
  ["2026-04-17", 201.5, 201.5, 198, 198, 15107817],
  ["2026-04-20", 198.5, 199, 196, 197, 14106910],
  ["2026-04-21", 199, 202, 198.5, 201.5, 11588845],
  ["2026-04-22", 202, 203, 201, 202, 8216975],
  ["2026-04-23", 203.5, 204.5, 199.5, 201, 13838153],
  ["2026-04-24", 202, 202.5, 199.5, 201.5, 10071742],
  ["2026-04-27", 201.5, 202, 199, 199.5, 8671680],
  ["2026-04-28", 200.5, 201.5, 199, 200, 8472131],
  ["2026-04-29", 201.5, 203, 200.5, 201.5, 5632412],
  ["2026-04-30", 200.5, 203, 200, 202, 6460050],
  ["2026-05-04", 202, 208.5, 202, 206, 13725270],
  ["2026-05-05", 206, 211, 204.5, 208, 11638738],
  ["2026-05-06", 211, 213.5, 209, 212, 14157694],
  ["2026-05-07", 212.5, 214.5, 211.5, 213.5, 10470314],
  ["2026-05-08", 212.5, 214, 211, 211.5, 12482776],
  ["2026-05-11", 213.5, 215, 212.5, 214, 9248306],
  ["2026-05-12", 216, 216.5, 213.5, 214, 8784167],
  ["2026-05-13", 215, 215, 209.5, 210, 9333619],
  ["2026-05-14", 209.5, 213, 207, 211.5, 9016120],
  ["2026-05-15", 208, 208.5, 200.5, 200.5, 24800761],
  ["2026-05-18", 200, 200.5, 197, 197.5, 18153627],
  ["2026-05-19", 197.5, 200, 195.5, 197, 16654864],
  ["2026-05-20", 210, 216.5, 207, 212.5, 48098610],
  ["2026-05-21", 212, 214.5, 210.5, 212, 20652548],
  ["2026-05-22", 214.5, 219, 214, 219, 30119281],
  ["2026-05-25", 220, 222, 214, 214, 31059614],
  ["2026-05-26", 215.5, 218.5, 211.5, 211.5, 27903221],
  ["2026-05-27", 213, 216.5, 209, 211.5, 33951659],
  ["2026-05-28", 212, 215, 211, 211, 27762878],
  ["2026-05-29", 212.5, 216.5, 211, 213, 30658046],
  ["2026-06-01", 217, 225, 216.5, 224, 38077211],
  ["2026-06-02", 225, 231, 220.5, 231, 35901526],
  ["2026-06-03", 233, 242.5, 228.5, 237, 38862223],
  ["2026-06-04", 237, 240.5, 231, 236, 27370783],
  ["2026-06-05", 239, 241, 232, 232, 23664933],
  ["2026-06-08", 222, 228.5, 222, 224, 22448385],
  ["2026-06-09", 226.5, 228, 221, 222, 22446254],
  ["2026-06-10", 223.5, 225.5, 221, 223, 21589807],
  ["2026-06-11", 223.5, 227.5, 222, 226, 22523796],
  ["2026-06-12", 227, 232, 226.5, 228, 18918943],
  ["2026-06-15", 230, 230.5, 223.5, 224.5, 20566934],
  ["2026-06-16", 223, 223, 219, 220.5, 32459152],
  ["2026-06-17", 198, 198, 192, 194, 60644249],
  ["2026-06-18", 194.5, 196, 193, 193, 16196533],
  ["2026-06-22", 194.5, 194.5, 192.5, 193, 16263171],
  ["2026-06-23", 194, 194, 188, 189, 21854642],
  ["2026-06-24", 189, 189, 185.5, 186.5, 24847075],
  ["2026-06-25", 187, 188, 185, 185, 14311569],
  ["2026-06-26", 184.5, 185, 180.5, 181, 26717213],
  ["2026-06-29", 184.5, 186, 181, 184, 17830028],
  ["2026-06-30", 186, 186, 183, 184.5, 14830332],
  ["2026-07-01", 186.5, 187.5, 185, 185.5, 10739428],
  ["2026-07-02", 185.5, 187, 183.5, 185.5, 6849654],
  ["2026-07-03", 185.5, 197.5, 185.5, 195, 25022271],
  ["2026-07-06", 197, 198.5, 194.5, 195.5, 8533574],
  ["2026-07-07", 191, 191.5, 186.5, 188, 23280960],
  ["2026-07-08", 190, 196, 189.5, 196, 16209496],
  ["2026-07-09", 196.5, 196.5, 193.5, 194.5, 5366030],
  ["2026-07-13", 194, 196.5, 191.5, 195, 8993958],
  ["2026-07-14", 196.5, 197.5, 192, 194.5, 9326188],
  ["2026-07-15", 194.5, 200, 194, 199.5, 15588366],
  ["2026-07-16", 199.5, 201, 198, 200, 6497582],
  ["2026-07-17", 200, 202.5, 198, 198, 17211340],
  ["2026-07-20", 201, 202.5, 196, 196, 10069119],
  ["2026-07-21", 198, 206, 198, 203, 19176764],
  ["2026-07-22", 204, 208.5, 204, 206, 11781418],
  ["2026-07-23", 206, 207, 203, 203.5, 6148889],
  ["2026-07-24", 205, 206, 203.5, 206, 6759905],
  ["2026-07-27", 203.5, 206, 202.5, 203.5, 6810641],
  ["2026-07-28", 203, 203, 199, 200, 7097030],
  ["2026-07-29", 205, 205.5, 198, 201.5, 13258719]
];

function adjustForCashDividends(
  rows: OhlcvRow[],
  actions: CashDividendAction[]
): OhlcvRow[] {
  return rows.map((row) => {
    const factor = actions
      .filter((action) => row[0] < action.exDate)
      .reduce(
        (combined, action) =>
          combined * (action.referencePrice / action.previousClose),
        1
      );
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

function ema(values: number[], period: number) {
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((result, value, index) => {
    result.push(index === 0 ? value : value * multiplier + result[index - 1] * (1 - multiplier));
    return result;
  }, []);
}

function sma(values: number[], period: number) {
  return values.map((_, index) => {
    const start = Math.max(0, index - period + 1);
    const window = values.slice(start, index + 1);
    return window.reduce((total, value) => total + value, 0) / window.length;
  });
}

function withIndicators(rows: OhlcvRow[]): Candle[] {
  const closes = rows.map((row) => row[4]);
  const fast = ema(closes, 12);
  const slow = ema(closes, 26);
  const macdValues = closes.map((_, index) => fast[index] - slow[index]);
  // CM_Ult_MacD_MTF uses EMA(12) - EMA(26) for MACD and SMA(9) for
  // the signal line. This intentionally differs from the common EMA signal.
  const signalValues = sma(macdValues, 9);
  const dpoValues = calculateDpo(closes);

  return rows.map((row, index) => {
    return {
      time: row[0],
      open: row[1],
      high: row[2],
      low: row[3],
      close: row[4],
      volume: row[5],
      macd: macdValues[index],
      signal: signalValues[index],
      histogram: macdValues[index] - signalValues[index],
      dpo: dpoValues[index]
    };
  });
}

function groupKey(time: string, timeframe: Exclude<Timeframe, "day">) {
  if (timeframe === "month") return time.slice(0, 7);
  const date = new Date(`${time}T00:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

function aggregate(
  rows: OhlcvRow[],
  timeframe: Exclude<Timeframe, "day">
): OhlcvRow[] {
  const groups = new Map<string, OhlcvRow[]>();
  for (const row of rows) {
    const key = groupKey(row[0], timeframe);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return Array.from(groups.entries()).map(([key, group]) => [
    key,
    group[0][1],
    Math.max(...group.map((row) => row[2])),
    Math.min(...group.map((row) => row[3])),
    group.at(-1)![4],
    group.reduce((total, row) => total + row[5], 0)
  ]);
}

export function getOfficialSampleCandles(
  symbol: string,
  timeframe: Timeframe,
  adjustment: PriceAdjustment = "adjusted"
): Candle[] | null {
  if (symbol !== "2603") return null;
  const dailyRows =
    adjustment === "adjusted"
      ? adjustForCashDividends(evergreenDaily, evergreenCashDividends)
      : evergreenDaily;
  const rows =
    timeframe === "day" ? dailyRows : aggregate(dailyRows, timeframe);
  return withIndicators(rows);
}

export function getOfficialSampleAdjustmentNote(symbol: string) {
  if (symbol !== "2603") return null;
  const action = evergreenCashDividends[0];
  return {
    exDate: action.exDate,
    cashDividend: action.cashDividend,
    factor: action.referencePrice / action.previousClose
  };
}
