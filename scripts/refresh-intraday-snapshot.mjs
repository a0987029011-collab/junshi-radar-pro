import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { aggregateRows } from "./lib/strategy-engine.mjs";
import { marketPhaseAt } from "./lib/market-phase.mjs";
import { fetchTaishinNovaQuotes } from "./lib/taishin-nova.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.resolve(ROOT, "data/radar-snapshot.json");

function upsertDaily(rows, quote) {
  const next = rows.filter((row) => row[0] !== quote.date);
  next.push([
    quote.date,
    quote.open,
    quote.high,
    quote.low,
    quote.close,
    quote.volume
  ]);
  return next
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .slice(-120);
}

function upsertPeriod(existing, daily, timeframe, limit) {
  const latest = aggregateRows(daily, timeframe).at(-1);
  if (!latest) return existing;
  return existing
    .filter((row) => row[0] !== latest[0])
    .concat([latest])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .slice(-limit);
}

function updateChartSet(charts, quote) {
  const day = upsertDaily(charts.day, quote);
  return {
    day,
    week: upsertPeriod(charts.week, day, "week", 104),
    month: upsertPeriod(charts.month, day, "month", 60)
  };
}

export function applyMarketSnapshot(snapshot, market, now = new Date()) {
  const next = structuredClone(snapshot);
  const quoteByKey = new Map(
    market.quotes.map((quote) => [`${quote.exchange}:${quote.symbol}`, quote])
  );
  let updated = 0;

  for (const candidate of next.candidates) {
    const quote = quoteByKey.get(`${candidate.exchange}:${candidate.symbol}`);
    const charts = next.charts[candidate.symbol];
    if (!quote || !charts) continue;

    // 盤中先以原始成交價更新今日 K；正式還原因子會在盤後完整更新時校正。
    charts.raw = updateChartSet(charts.raw, quote);
    charts.adjusted = updateChartSet(charts.adjusted, quote);

    const note = next.notes[candidate.symbol];
    if (note) {
      const isNewDate = note.endDate !== quote.date;
      note.dataAsOf = quote.date;
      note.endDate = quote.date;
      if (isNewDate) note.historyDays += 1;
      note.latestVerification = {
        date: quote.date,
        source: "台新 Nova 盤中市場快照",
        open: quote.open,
        high: quote.high,
        low: quote.low,
        close: quote.close,
        volume: quote.volume
      };
    }
    updated += 1;
  }

  if (!updated) throw new Error("盤中快照沒有符合目前雷達名單的股票");

  const marketPhase = marketPhaseAt(market.date, now);
  next.meta = {
    ...next.meta,
    dataAsOf: market.date,
    generatedAt: now.toISOString(),
    marketPhase,
    quoteTime: market.quoteTime ?? null,
    quoteCapturedAt: market.quoteCapturedAt ?? now.toISOString(),
    quoteDates: market.quoteDates,
    mode:
      marketPhase === "intraday"
        ? "taishin-nova-intraday-snapshot"
        : "taishin-nova-latest-snapshot",
    provider: "Taishin Nova full-market snapshot + existing adjusted history",
    sources: {
      ...next.meta.sources,
      latestQuotes: market.quoteSource
    },
    limitations: {
      ...next.meta.limitations,
      realtime:
        marketPhase === "intraday"
          ? "盤中快照僅作預警；收盤確認與還原因子須待盤後完整更新"
          : "行情快照已結束盤中階段；仍建議執行盤後完整更新"
    }
  };

  return { snapshot: next, updated, marketPhase };
}

export async function runIntradayRefresh({ now = new Date() } = {}) {
  const [snapshot, market] = await Promise.all([
    readFile(OUTPUT_PATH, "utf8").then(JSON.parse),
    fetchTaishinNovaQuotes()
  ]);
  const result = applyMarketSnapshot(snapshot, market, now);
  await writeFile(OUTPUT_PATH, `${JSON.stringify(result.snapshot)}\n`, "utf8");
  console.log(
    `Updated ${result.updated} radar stocks as of ${market.date} ${market.quoteTime ?? ""} (${result.marketPhase})`
  );
  return result;
}

const isCli =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isCli) await runIntradayRefresh();
