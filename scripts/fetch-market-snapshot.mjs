import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  analyzeStock,
  numberFromMarket,
  sortCandidates
} from "./lib/strategy-engine.mjs";

const ROOT = process.cwd();
const STRATEGY_PATH = path.resolve(ROOT, "config/strategy.json");
const OUTPUT_PATH = path.resolve(ROOT, "data/radar-snapshot.json");
const LEGACY_SNAPSHOT_PATH = path.resolve(ROOT, "data/market-snapshot.json");
const HISTORY_YEARS = Number(process.env.HISTORY_YEARS ?? 5);
const CONCURRENCY = Math.max(1, Number(process.env.SCAN_CONCURRENCY ?? 6));
const PROVIDER = process.env.MARKET_DATA_PROVIDER ?? "auto";
const FUGLE_API_KEY = process.env.FUGLE_API_KEY ?? "";

const URLS = {
  twseBasics: "https://openapi.twse.com.tw/v1/opendata/t187ap03_L",
  tpexBasics: "https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O",
  twseQuotes:
    "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=json",
  twseQuotesOpenApi:
    "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  tpexQuotes:
    "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_quotes",
  fugleHistorical:
    "https://api.fugle.tw/marketdata/v1.0/stock/historical/candles"
};

const industryNames = {
  "01": "水泥工業",
  "02": "食品工業",
  "03": "塑膠工業",
  "04": "紡織纖維",
  "05": "電機機械",
  "06": "電器電纜",
  "08": "玻璃陶瓷",
  "09": "造紙工業",
  "10": "鋼鐵工業",
  "11": "橡膠工業",
  "12": "汽車工業",
  "14": "建材營造",
  "15": "航運業",
  "16": "觀光餐旅",
  "17": "金融保險",
  "18": "貿易百貨",
  "20": "其他業",
  "21": "化學工業",
  "22": "生技醫療",
  "23": "油電燃氣",
  "24": "半導體業",
  "25": "電腦及週邊",
  "26": "光電業",
  "27": "通信網路",
  "28": "電子零組件",
  "29": "電子通路",
  "30": "資訊服務",
  "31": "其他電子",
  "32": "文化創意",
  "33": "農業科技",
  "34": "電子商務",
  "35": "綠能環保",
  "36": "數位雲端",
  "37": "運動休閒",
  "38": "居家生活"
};

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function fetchJson(url, options = {}, attempts = 4) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          accept: "application/json",
          "user-agent": "JunshiRadarPro/2.0",
          ...(options.headers ?? {})
        },
        signal: AbortSignal.timeout(30_000)
      });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(attempt * 1200);
    }
  }
  throw new Error(`Request failed: ${url}`, { cause: lastError });
}

const pad = (value) => String(value).padStart(2, "0");

export function marketDateToIso(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 8) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
  }
  if (digits.length === 7) {
    return `${Number(digits.slice(0, 3)) + 1911}-${digits.slice(3, 5)}-${digits.slice(5, 7)}`;
  }
  const slash = String(value ?? "").match(
    /^(\d{2,4})[/-](\d{1,2})[/-](\d{1,2})$/
  );
  if (!slash) return null;
  const rawYear = Number(slash[1]);
  const year = rawYear < 1911 ? rawYear + 1911 : rawYear;
  return `${year}-${pad(slash[2])}-${pad(slash[3])}`;
}

function taipeiToday() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function isoDateFromUnix(timestamp) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp * 1000));
}

function subtractYears(isoDate, years) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() - years);
  return date.toISOString().slice(0, 10);
}

function pick(object, keys) {
  for (const key of keys) {
    if (object?.[key] != null && String(object[key]).trim() !== "") {
      return object[key];
    }
  }
  return undefined;
}

function finiteQuote(quote) {
  return (
    quote &&
    Number.isFinite(quote.open) &&
    Number.isFinite(quote.high) &&
    Number.isFinite(quote.low) &&
    Number.isFinite(quote.close) &&
    Number.isFinite(quote.volume) &&
    quote.close > 0
  );
}

export function parseTwseLegacyQuotes(payload) {
  const date = marketDateToIso(payload.date) ?? taipeiToday();
  const quotes = (Array.isArray(payload.data) ? payload.data : [])
    .map((row) => ({
      symbol: String(row[0] ?? "").trim(),
      name: String(row[1] ?? "").trim(),
      exchange: "TWSE",
      date,
      volume: numberFromMarket(row[2]),
      open: numberFromMarket(row[4]),
      high: numberFromMarket(row[5]),
      low: numberFromMarket(row[6]),
      close: numberFromMarket(row[7])
    }))
    .filter(finiteQuote);
  return { date, quotes };
}

export function parseTwseOpenApiQuotes(rows, fallbackDate = taipeiToday()) {
  const quotes = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      symbol: String(pick(row, ["Code", "證券代號"]) ?? "").trim(),
      name: String(pick(row, ["Name", "證券名稱"]) ?? "").trim(),
      exchange: "TWSE",
      date: marketDateToIso(pick(row, ["Date", "日期"])) ?? fallbackDate,
      volume: numberFromMarket(pick(row, ["TradeVolume", "成交股數"])),
      open: numberFromMarket(pick(row, ["OpeningPrice", "開盤價"])),
      high: numberFromMarket(pick(row, ["HighestPrice", "最高價"])),
      low: numberFromMarket(pick(row, ["LowestPrice", "最低價"])),
      close: numberFromMarket(pick(row, ["ClosingPrice", "收盤價"]))
    }))
    .filter(finiteQuote);
  return { date: quotes[0]?.date ?? fallbackDate, quotes };
}

export function parseTpexQuotes(rows, fallbackDate) {
  const quotes = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      symbol: String(
        pick(row, [
          "SecuritiesCompanyCode",
          "SecuritiesCode",
          "Code",
          "證券代號",
          "股票代號",
          "代號"
        ]) ?? ""
      ).trim(),
      name: String(
        pick(row, [
          "CompanyName",
          "SecuritiesCompanyName",
          "Name",
          "證券名稱",
          "股票名稱",
          "名稱"
        ]) ?? ""
      ).trim(),
      exchange: "TPEx",
      date:
        marketDateToIso(
          pick(row, ["Date", "TradeDate", "資料日期", "日期"])
        ) ?? fallbackDate,
      volume: numberFromMarket(
        pick(row, [
          "TradingShares",
          "TradeVolume",
          "成交股數",
          "成交量"
        ])
      ),
      open: numberFromMarket(
        pick(row, ["Open", "OpeningPrice", "開盤價"])
      ),
      high: numberFromMarket(
        pick(row, ["High", "HighestPrice", "最高價"])
      ),
      low: numberFromMarket(
        pick(row, ["Low", "LowestPrice", "最低價"])
      ),
      close: numberFromMarket(
        pick(row, ["Close", "ClosingPrice", "收盤價", "最後成交價"])
      )
    }))
    .filter(finiteQuote);
  return { date: quotes[0]?.date ?? fallbackDate, quotes };
}

export function parseCompanyBasics(rows, exchange) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const symbol = String(
        pick(row, ["公司代號", "Code", "SecuritiesCompanyCode"]) ?? ""
      ).trim();
      const industryCode = String(
        pick(row, ["產業別", "IndustryCode"]) ?? ""
      ).padStart(2, "0");
      return {
        symbol,
        exchange,
        name: String(
          pick(row, ["公司簡稱", "公司名稱", "Name", "CompanyName"]) ?? ""
        ).trim(),
        companyName: String(
          pick(row, ["公司名稱", "CompanyName"]) ?? ""
        ).trim(),
        industryCode,
        sector: industryNames[industryCode] ?? `產業別 ${industryCode}`,
        paidInCapital: numberFromMarket(
          pick(row, ["實收資本額", "PaidInCapital"])
        ),
        issuedShares: numberFromMarket(
          pick(row, [
            "已發行普通股數或TDR原股發行股數",
            "IssuedShares"
          ])
        )
      };
    })
    .filter(
      (company) =>
        /^\d{4}$/.test(company.symbol) &&
        company.name &&
        Number.isFinite(company.paidInCapital)
    );
}

async function fetchOfficialMarket() {
  let twse;
  try {
    twse = parseTwseLegacyQuotes(await fetchJson(URLS.twseQuotes));
  } catch (error) {
    console.warn(`TWSE legacy fallback: ${error.message}`);
    twse = parseTwseOpenApiQuotes(
      await fetchJson(URLS.twseQuotesOpenApi)
    );
  }
  const [twseBasicsRows, tpexBasicsRows, tpexQuoteRows] = await Promise.all([
    fetchJson(URLS.twseBasics),
    fetchJson(URLS.tpexBasics),
    fetchJson(URLS.tpexQuotes)
  ]);
  const tpex = parseTpexQuotes(tpexQuoteRows, twse.date);
  return {
    date: twse.date,
    basics: [
      ...parseCompanyBasics(twseBasicsRows, "TWSE"),
      ...parseCompanyBasics(tpexBasicsRows, "TPEx")
    ],
    quotes: [...twse.quotes, ...tpex.quotes]
  };
}

export function parseYahooHistory(payload, symbol, exchange, dataAsOf) {
  const chart = payload.chart?.result?.[0];
  const quote = chart?.indicators?.quote?.[0];
  const adjusted = chart?.indicators?.adjclose?.[0]?.adjclose ?? [];
  if (!chart || !quote || !Array.isArray(chart.timestamp)) {
    throw new Error(`${symbol} Yahoo history is unavailable`);
  }
  return chart.timestamp
    .map((timestamp, index) => {
      const values = [
        quote.open[index],
        quote.high[index],
        quote.low[index],
        quote.close[index],
        quote.volume[index]
      ];
      if (values.some((value) => value == null || !Number.isFinite(value))) {
        return null;
      }
      const date = isoDateFromUnix(timestamp);
      if (date > dataAsOf) return null;
      const factor =
        Number.isFinite(adjusted[index]) && quote.close[index] > 0
          ? adjusted[index] / quote.close[index]
          : 1;
      return [date, ...values, factor];
    })
    .filter(Boolean);
}

async function fetchYahooHistory(company, dataAsOf) {
  const suffix = company.exchange === "TPEx" ? "TWO" : "TW";
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${company.symbol}.${suffix}` +
    `?range=${HISTORY_YEARS}y&interval=1d&events=div%2Csplits&includeAdjustedClose=true`;
  const payload = await fetchJson(url);
  return {
    provider: "Yahoo Finance 延遲歷史行情（官方收盤校正）",
    rows: parseYahooHistory(payload, company.symbol, company.exchange, dataAsOf)
  };
}

export function parseFugleHistory(payload, dataAsOf) {
  return (payload.data ?? [])
    .filter((row) => row.date <= dataAsOf)
    .map((row) => [
      row.date.slice(0, 10),
      Number(row.open),
      Number(row.high),
      Number(row.low),
      Number(row.close),
      Number(row.volume),
      1
    ])
    .filter((row) => row.slice(1, 6).every(Number.isFinite))
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
}

async function fetchFugleHistory(company, dataAsOf) {
  const query = new URLSearchParams({
    from: subtractYears(dataAsOf, HISTORY_YEARS),
    to: dataAsOf,
    timeframe: "D",
    adjusted: "true",
    fields: "open,high,low,close,volume",
    sort: "asc"
  });
  const payload = await fetchJson(
    `${URLS.fugleHistorical}/${company.symbol}?${query}`,
    { headers: { "X-API-KEY": FUGLE_API_KEY } }
  );
  return {
    provider: "富果授權還原歷史行情",
    rows: parseFugleHistory(payload, dataAsOf)
  };
}

async function fetchHistory(company, dataAsOf) {
  if ((PROVIDER === "fugle" || PROVIDER === "auto") && FUGLE_API_KEY) {
    try {
      return await fetchFugleHistory(company, dataAsOf);
    } catch (error) {
      if (PROVIDER === "fugle") throw error;
      console.warn(`${company.symbol} Fugle fallback: ${error.message}`);
    }
  }
  return fetchYahooHistory(company, dataAsOf);
}

export function mergeOfficialQuote(rows, quote) {
  const result = rows
    .filter((row) => row[0] <= quote.date)
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])));
  const index = result.findIndex((row) => row[0] === quote.date);
  const latestFactor =
    index >= 0
      ? Number(result[index][6] ?? 1)
      : Number(result.at(-1)?.[6] ?? 1);
  const officialRow = [
    quote.date,
    quote.open,
    quote.high,
    quote.low,
    quote.close,
    quote.volume,
    latestFactor
  ];
  if (index >= 0) result[index] = officialRow;
  else result.push(officialRow);
  return result;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

function snapshotFromAnalyses(meta, analyses) {
  const candidates = sortCandidates(analyses.map((item) => item.candidate));
  const bySymbol = new Map(
    analyses.map((item) => [item.candidate.symbol, item])
  );
  return {
    meta,
    candidates,
    charts: Object.fromEntries(
      candidates.map((candidate) => [
        candidate.symbol,
        bySymbol.get(candidate.symbol).charts
      ])
    ),
    notes: Object.fromEntries(
      candidates.map((candidate) => [
        candidate.symbol,
        bySymbol.get(candidate.symbol).note
      ])
    )
  };
}

async function scanLegacySnapshot(strategy) {
  const legacy = JSON.parse(await readFile(LEGACY_SNAPSHOT_PATH, "utf8"));
  const symbols = Object.keys(legacy.stocks);
  const meta = {
    dataAsOf: legacy.meta.dataAsOf,
    generatedAt: new Date().toISOString(),
    market: legacy.meta.market,
    mode: "verified-delayed-snapshot",
    provider: "既有已核對歷史快照",
    sources: legacy.meta.sources,
    limitations: legacy.meta.limitations,
    universeStats: {
      discovered: symbols.length,
      capitalEligible: symbols.length,
      volumeEligible: symbols.length,
      analyzed: symbols.length,
      failed: 0
    }
  };
  const analyses = Object.entries(legacy.stocks).map(([symbol, stock]) =>
    analyzeStock(
      {
        ...stock,
        symbol,
        exchange: "TWSE",
        historyProvider: "既有已核對歷史快照"
      },
      strategy,
      meta
    )
  );
  return snapshotFromAnalyses(meta, analyses);
}

async function scanFullMarket(strategy) {
  const official = await fetchOfficialMarket();
  const quoteByKey = new Map(
    official.quotes.map((quote) => [
      `${quote.exchange}:${quote.symbol}`,
      quote
    ])
  );
  const capitalEligible = official.basics.filter(
    (company) =>
      company.paidInCapital >= strategy.universe.minimumPaidInCapital &&
      quoteByKey.has(`${company.exchange}:${company.symbol}`)
  );
  console.log(
    `Official ${official.date}: ${official.basics.length} companies, ` +
      `${capitalEligible.length} pass paid-in capital`
  );

  let failed = 0;
  const loaded = await mapConcurrent(
    capitalEligible,
    CONCURRENCY,
    async (company, index) => {
      try {
        const quote = quoteByKey.get(`${company.exchange}:${company.symbol}`);
        const history = await fetchHistory(company, official.date);
        const daily = mergeOfficialQuote(history.rows, quote);
        if (daily.length < 260) {
          throw new Error(`only ${daily.length} historical rows`);
        }
        if ((index + 1) % 25 === 0) {
          console.log(`History ${index + 1}/${capitalEligible.length}`);
        }
        return {
          ...company,
          daily,
          corporateActions: [],
          historyProvider: history.provider,
          latestVerification: {
            date: official.date,
            source: `${company.exchange} official close`,
            open: quote.open,
            high: quote.high,
            low: quote.low,
            close: quote.close,
            volume: quote.volume
          }
        };
      } catch (error) {
        failed += 1;
        console.warn(`${company.exchange} ${company.symbol}: ${error.message}`);
        return null;
      }
    }
  );

  const meta = {
    dataAsOf: official.date,
    generatedAt: new Date().toISOString(),
    market: "TWSE+TPEx",
    mode: FUGLE_API_KEY
      ? "licensed-adjusted-history-official-close"
      : "delayed-history-official-close",
    provider: FUGLE_API_KEY
      ? "Fugle licensed adjusted history + official TWSE/TPEx close"
      : "Delayed adjusted history + official TWSE/TPEx close",
    sources: {
      twseBasics: URLS.twseBasics,
      tpexBasics: URLS.tpexBasics,
      twseLatest: URLS.twseQuotes,
      tpexLatest: URLS.tpexQuotes,
      history: FUGLE_API_KEY
        ? URLS.fugleHistorical
        : "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
    },
    limitations: {
      realtime: FUGLE_API_KEY
        ? "目前排程使用授權歷史 REST；盤中 WebSocket Worker 尚未啟用"
        : "未設定 FUGLE_API_KEY，目前為官方盤後校正的延遲行情",
      chips:
        "法人、融資融券、借券與集中度尚未形成連續序列，S 級不會僅憑價格訊號成立",
      universe:
        "上市與上櫃公司皆掃描；排除 ETF、權證與股本或 20 日均量未達門檻者"
    },
    universeStats: {
      discovered: official.basics.length,
      capitalEligible: capitalEligible.length,
      volumeEligible: 0,
      analyzed: 0,
      failed
    }
  };

  const analyses = [];
  for (const stock of loaded.filter(Boolean)) {
    try {
      const analysis = analyzeStock(stock, strategy, meta);
      if (
        analysis.candidate.averageVolumeLots >=
        strategy.universe.minimumAverageDailyVolumeLots
      ) {
        analyses.push(analysis);
      }
    } catch (error) {
      failed += 1;
      console.warn(`${stock.symbol} analysis: ${error.message}`);
    }
  }
  meta.universeStats.volumeEligible = analyses.length;
  meta.universeStats.analyzed = analyses.length;
  meta.universeStats.failed = failed;
  if (!analyses.length) {
    throw new Error("No stocks passed the full-market scanner");
  }
  console.log(
    `${analyses.length} stocks pass capital and 20-day volume filters`
  );
  return snapshotFromAnalyses(meta, analyses);
}

export async function runRefresh({ fromExisting = false } = {}) {
  const strategy = JSON.parse(await readFile(STRATEGY_PATH, "utf8"));
  const snapshot = fromExisting
    ? await scanLegacySnapshot(strategy)
    : await scanFullMarket(strategy);
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(snapshot)}\n`, "utf8");
  console.log(
    `Wrote ${path.relative(ROOT, OUTPUT_PATH)}: ` +
      `${snapshot.candidates.length} candidates as of ${snapshot.meta.dataAsOf}`
  );
  return snapshot;
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) {
  await runRefresh({
    fromExisting: process.argv.includes("--from-existing")
  });
}
