import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const symbols = ["2002", "2409", "2603", "2609", "2610", "2615", "3037"];
const dataAsOf = "2026-07-29";
const outputPath = path.resolve("data/market-snapshot.json");

async function fetchJson(url, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json",
          "user-agent": "JunshiRadarDataAudit/1.0"
        }
      });
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 800));
    }
  }
  throw lastError;
}

function rocSlashDateToIso(value) {
  const [rocYear, month, day] = value.split("/").map(Number);
  return `${rocYear + 1911}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rocTextDateToIso(value) {
  const match = value.match(/(\d+)年(\d+)月(\d+)日/);
  if (!match) throw new Error(`Unexpected ROC date: ${value}`);
  return `${Number(match[1]) + 1911}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function numberFromTwse(value) {
  const normalized = String(value).replaceAll(",", "").trim();
  if (!normalized || normalized === "--") return Number.NaN;
  return Number(normalized);
}

function isoDateFromUnix(timestamp) {
  const date = new Date(timestamp * 1000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function assertNear(symbol, field, yahooValue, twseValue, tolerance = 0.011) {
  if (Math.abs(yahooValue - twseValue) > tolerance) {
    throw new Error(
      `${symbol} ${field} mismatch: history=${yahooValue}, TWSE=${twseValue}`
    );
  }
}

const basics = await fetchJson(
  "https://openapi.twse.com.tw/v1/opendata/t187ap03_L"
);
const basicBySymbol = new Map(
  basics
    .filter((item) => symbols.includes(item["公司代號"]))
    .map((item) => [item["公司代號"], item])
);

const actionReport = await fetchJson(
  "https://www.twse.com.tw/rwd/zh/exRight/TWT49U?startDate=20210101&endDate=20260729&response=json"
);
const actionsBySymbol = Object.fromEntries(symbols.map((symbol) => [symbol, []]));
for (const row of actionReport.data ?? []) {
  const symbol = row[1];
  if (!symbols.includes(symbol)) continue;
  const previousClose = numberFromTwse(row[3]);
  const referencePrice = numberFromTwse(row[4]);
  if (!Number.isFinite(previousClose) || !Number.isFinite(referencePrice)) {
    continue;
  }
  actionsBySymbol[symbol].push({
    date: rocTextDateToIso(row[0]),
    previousClose,
    referencePrice,
    factor: referencePrice / previousClose,
    type: row[6]
  });
}

const industryNames = {
  "10": "鋼鐵工業",
  "15": "航運業",
  "26": "光電業",
  "28": "電子零組件業"
};

const stocks = {};
for (const symbol of symbols) {
  const [officialMonth, historyResponse] = await Promise.all([
    fetchJson(
      `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260729&stockNo=${symbol}&response=json`
    ),
    fetchJson(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=5y&interval=1d&events=div%2Csplits&includeAdjustedClose=true`
    )
  ]);

  const chart = historyResponse.chart?.result?.[0];
  const quote = chart?.indicators?.quote?.[0];
  if (!chart || !quote) {
    throw new Error(`Missing historical chart for ${symbol}`);
  }

  let daily = chart.timestamp
    .map((timestamp, index) => {
      const values = [
        quote.open[index],
        quote.high[index],
        quote.low[index],
        quote.close[index],
        quote.volume[index],
        quote.close[index]
      ];
      if (values.some((value) => value == null || !Number.isFinite(value))) {
        return null;
      }
      const date = isoDateFromUnix(timestamp);
      const adjustmentFactor = actionsBySymbol[symbol]
        .filter((event) => date < event.date)
        .reduce((factor, event) => factor * event.factor, 1);
      return [
        date,
        quote.open[index],
        quote.high[index],
        quote.low[index],
        quote.close[index],
        quote.volume[index],
        adjustmentFactor
      ];
    })
    .filter(Boolean)
    .filter((row) => row[0] <= dataAsOf);

  const officialRows = new Map(
    (officialMonth.data ?? []).map((row) => [
      rocSlashDateToIso(row[0]),
      {
        volume: numberFromTwse(row[1]),
        open: numberFromTwse(row[3]),
        high: numberFromTwse(row[4]),
        low: numberFromTwse(row[5]),
        close: numberFromTwse(row[6])
      }
    ])
  );
  const historyLatest = daily.at(-1);
  const officialLatest = officialRows.get(dataAsOf);
  if (!historyLatest || historyLatest[0] !== dataAsOf || !officialLatest) {
    throw new Error(`${symbol} does not contain verified ${dataAsOf} data`);
  }

  assertNear(symbol, "open", historyLatest[1], officialLatest.open);
  assertNear(symbol, "high", historyLatest[2], officialLatest.high);
  assertNear(symbol, "low", historyLatest[3], officialLatest.low);
  assertNear(symbol, "close", historyLatest[4], officialLatest.close);

  // TWSE is authoritative for the entire current month. Remove any secondary
  // rows on dates where TWSE had no trading, then replace every surviving
  // current-month row with official OHLCV.
  daily = daily
    .filter(
      (row) =>
        !row[0].startsWith(dataAsOf.slice(0, 7)) ||
        officialRows.has(row[0])
    )
    .map((row) => {
      const official = officialRows.get(row[0]);
      if (!official) return row;
      return [
        row[0],
        official.open,
        official.high,
        official.low,
        official.close,
        official.volume,
        row[6]
      ];
    });

  const basic = basicBySymbol.get(symbol);
  if (!basic) throw new Error(`Missing TWSE basic data for ${symbol}`);
  stocks[symbol] = {
    name: basic["公司簡稱"],
    companyName: basic["公司名稱"],
    industryCode: basic["產業別"],
    sector: industryNames[basic["產業別"]] ?? `產業別 ${basic["產業別"]}`,
    paidInCapital: Number(basic["實收資本額"]),
    issuedShares: Number(basic["已發行普通股數或TDR原股發行股數"]),
    daily,
    corporateActions: actionsBySymbol[symbol],
    latestVerification: {
      date: dataAsOf,
      source: "TWSE STOCK_DAY",
      open: officialLatest.open,
      high: officialLatest.high,
      low: officialLatest.low,
      close: officialLatest.close,
      volume: officialLatest.volume,
      secondaryVolume: historyLatest[5],
      secondaryVolumeDifference: historyLatest[5] - officialLatest.volume
    }
  };
  console.log(
    `${symbol} ${basic["公司簡稱"]}: ${officialLatest.close} (${daily.length} days verified)`
  );
}

const snapshot = {
  meta: {
    dataAsOf,
    generatedAt: new Date().toISOString(),
    market: "TWSE",
    sources: {
      basic:
        "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
      latestOfficial:
        "https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY",
      historical:
        "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}.TW",
      adjustment:
        "https://www.twse.com.tw/rwd/zh/exRight/TWT49U"
    },
    verification:
      "Every latest OHLCV row is required to match TWSE STOCK_DAY before build.",
    limitations: {
      realtime: "盤後快照，非即時行情",
      chips: "法人、融資融券、借券與集中度尚未接入，不納入肯定判定",
      universe: "本版核對既有 7 檔候選，尚非全上市櫃自動掃描"
    }
  },
  stocks
};

await mkdir(path.dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(snapshot)}\n`, "utf8");
console.log(`Wrote ${outputPath}`);
