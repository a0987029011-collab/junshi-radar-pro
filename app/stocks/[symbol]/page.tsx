import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CandleChart } from "../../../components/CandleChart";
import { RadarShell } from "../../../components/RadarShell";
import { WatchButton } from "../../../components/ReviewControls";
import { formatPrice } from "../../../components/StockUI";
import {
  getMarketCandles,
  getMarketDataNote,
  marketSnapshotMeta
} from "../../../lib/market-data";
import { getScannedStock } from "../../../lib/scoring-engine";
import {
  BREAKOUT_TYPE_LABELS,
  scanStock
} from "../../../lib/scanEngine";

export async function generateMetadata({
  params
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const stock = getScannedStock(symbol);
  return {
    title: stock
      ? `${stock.name} ${stock.symbol}｜下降趨勢線紅 K 穿越`
      : "個股 H1 追蹤"
  };
}

function stateTone(active: boolean) {
  return active ? "text-rose-300" : "text-slate-400";
}

export default async function StockPage({
  params
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const stock = getScannedStock(symbol);
  const dailyCandles = getMarketCandles(symbol, "day", "adjusted") ?? [];
  if (!stock || !dailyCandles.length) notFound();

  const profile = {
    symbol,
    name: stock.name,
    market: (stock.exchange === "TPEx" ? "上櫃" : "上市") as "上市" | "上櫃",
    sector: stock.sector,
    candles: dailyCandles.map((candle) => ({
      date: candle.time,
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume
    }))
  };
  const scanResult = scanStock(profile);
  const latestCandle = profile.candles.at(-1)!;
  const latestEvaluation = scanResult.evaluations.at(-1);
  const currentEvaluation =
    latestEvaluation?.index === profile.candles.length - 1
      ? latestEvaluation
      : undefined;
  const latestSignal = scanResult.signals.at(-1);
  const dataNote = getMarketDataNote(symbol);
  const redCandle = latestCandle.close > latestCandle.open;
  const intradaySnapshot =
    marketSnapshotMeta.marketPhase === "intraday" ||
    marketSnapshotMeta.mode.includes("intraday");

  return (
    <RadarShell activePath="/">
      <section className="panel p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <Link
              aria-label="返回 H1 雷達"
              className="stock-floating-back"
              href="/"
              title="返回 H1 雷達"
            >
              <span aria-hidden="true" className="stock-floating-back-arrow">←</span>
              <span className="stock-floating-back-label">返回雷達</span>
            </Link>
            <p className="text-xs uppercase tracking-[0.3em] text-cyan-300/80">
              {profile.market} · {profile.sector} · H1 Tracker
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              {stock.name} <span className="text-slate-500">{stock.symbol}</span>
            </h1>
            <p className="mt-2 text-sm text-slate-400">
              {latestCandle.date} {intradaySnapshot ? "盤中快照（僅作預警）" : "收盤"} · 只執行「下降趨勢線紅 K 穿越」
            </p>
          </div>
          <div className="flex items-center gap-4 sm:text-right">
            <div>
              <p className="font-mono text-3xl font-semibold text-white">
                {formatPrice(latestCandle.close)}
              </p>
              <span className={`mt-2 inline-flex rounded-full border px-3 py-1 text-xs ${
                intradaySnapshot && scanResult.signalOnLatestBar
                  ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                  : scanResult.closeConfirmation
                  ? "border-rose-400/50 bg-rose-500/10 text-rose-200"
                  : scanResult.intradayWarning
                    ? "border-amber-400/50 bg-amber-500/10 text-amber-200"
                    : "border-slate-700 text-slate-300"
              }`}>
                {intradaySnapshot && scanResult.signalOnLatestBar
                  ? "盤中預警"
                  : scanResult.breakoutType
                  ? BREAKOUT_TYPE_LABELS[scanResult.breakoutType]
                  : scanResult.status}
              </span>
            </div>
            <WatchButton name={stock.name} symbol={stock.symbol} />
          </div>
        </div>
      </section>

      <section className="panel mt-3 p-5 sm:p-7">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.26em] text-rose-300">
              唯一提示名稱
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-white">
              {scanResult.signalName}
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              當根先對既有線判斷；未有效穿越才接入當根 high。
            </p>
          </div>
          <p className="text-sm text-slate-400">
            最近訊號 <strong className="text-white">{scanResult.signalDate ?? "尚無"}</strong>
          </p>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">H1 影線高點</p>
            <strong className="mt-2 block text-lg text-amber-200">
              {scanResult.h1Price !== undefined ? formatPrice(scanResult.h1Price) : "等待確認"}
            </strong>
            <small className="mt-1 block text-slate-500">
              {scanResult.h1
                ? `${scanResult.h1.date} · ${scanResult.h1.confirmedDate} 確認`
                : "下一根未創新高才成立"}
            </small>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">H2 追蹤高點</p>
            <strong className="mt-2 block text-lg text-cyan-200">
              {scanResult.h2Price !== undefined ? formatPrice(scanResult.h2Price) : "等待形成"}
            </strong>
            <small className="mt-1 block text-slate-500">
              {scanResult.h2 ? `${scanResult.h2.date} · 當根既有線第二錨點` : "等待前一根 high"}
            </small>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">當根判斷線價</p>
            <strong className="mt-2 block text-lg text-cyan-200">
              {scanResult.linePrice !== undefined ? formatPrice(scanResult.linePrice) : "—"}
            </strong>
            <small className="mt-1 block text-slate-500">
              {currentEvaluation
                ? `來源截至第 ${currentEvaluation.sourceEndIndex + 1} 根 K`
                : "等待追蹤線"}
            </small>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">盤中 high 穿線</p>
            <strong className={`mt-2 block text-lg ${stateTone(Boolean(currentEvaluation?.highCrossed))}`}>
              {currentEvaluation?.highCrossed ? "已穿越" : "未穿越"}
            </strong>
            <small className="mt-1 block text-slate-500">盤中預警仍需三項確認條件</small>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">{intradaySnapshot ? "盤中現價" : "收盤價"}站線</p>
            <strong className={`mt-2 block text-lg ${stateTone(Boolean(currentEvaluation?.closeCrossed))}`}>
              {currentEvaluation?.closeCrossed ? "已站上" : "未站上"}
            </strong>
            <small className="mt-1 block text-slate-500">
              {intradaySnapshot ? "目前只列預警，紅 K 收盤後才確認" : "紅 K 收盤才確認"}
            </small>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-950/65 p-4">
            <p className="text-xs text-slate-500">收盤穿越型態</p>
            <strong className={`mt-2 block text-lg ${stateTone(Boolean(scanResult.breakoutType))}`}>
              {intradaySnapshot
                ? "等待收盤確認"
                : scanResult.breakoutType
                ? BREAKOUT_TYPE_LABELS[scanResult.breakoutType]
                : "尚未確認"}
            </strong>
            <small className="mt-1 block text-slate-500">
              {scanResult.breakoutType === "body-cross"
                ? "開盤價 ≤ 線價 < 收盤價，實體直接穿線"
                : scanResult.breakoutType === "gap-above"
                  ? "線價 < 開盤價 < 收盤價，開盤已在線上"
                  : "等待紅 K 收盤站上線"}
            </small>
          </div>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {[
            ["紅 K", redCandle, "收盤價 > 開盤價"],
            ["MACD weakening", scanResult.macdWeakening, "負 histogram 絕對值縮小"],
            ["DPO upturn", scanResult.dpoUpturn, "前一根為低點，本根上彎"]
          ].map(([label, active, description]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <strong className="text-sm text-white">{label}</strong>
                <span className={stateTone(Boolean(active))}>{active ? "成立" : "未成立"}</span>
              </div>
              <p className="mt-2 text-xs text-slate-500">{description}</p>
            </div>
          ))}
        </div>

        {latestSignal ? (
          <div className="mt-4 rounded-2xl border border-rose-400/25 bg-rose-500/5 px-4 py-3 text-sm text-rose-100">
            最近一次通知：{latestSignal.date}，同一追蹤線第 {latestSignal.roundId} 輪僅記錄一次；
            {!intradaySnapshot && latestSignal.closeConfirmation && latestSignal.breakoutType
              ? `${BREAKOUT_TYPE_LABELS[latestSignal.breakoutType]}確認成立`
              : intradaySnapshot
                ? "目前為盤中預警，需待收盤後確認"
                : "盤中預警後未收上線"}。
          </div>
        ) : null}
      </section>

      <CandleChart symbol={stock.symbol} />

      <section className="mt-3 grid gap-3 lg:grid-cols-2">
        <article className="panel p-5">
          <h2 className="text-lg font-semibold text-white">逐 K 稽核</h2>
          <ul className="mt-4 grid gap-3 text-sm leading-6 text-slate-400">
            <li>H1 候選下一根未創新高即確認，不等待傳統第二波段高點。</li>
            <li>本根線價只使用前一根結束時已存在的 H1 追蹤線。</li>
            <li>同一組 H1→H2 只通知一次；通知後保留 H1，後續再逐根更新 H2。</li>
            <li>本提示只回報條件穿越，不宣稱趨勢反轉，也不套用其他策略分級。</li>
          </ul>
        </article>
        <article className="panel p-5">
          <h2 className="text-lg font-semibold text-white">資料稽核</h2>
          <dl className="mt-4 grid gap-3 text-sm">
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">
              <dt className="text-slate-500">資料日期</dt>
              <dd className="text-slate-200">{dataNote?.dataAsOf ?? latestCandle.date}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-slate-800 pb-3">
              <dt className="text-slate-500">歷史日數</dt>
              <dd className="text-slate-200">{dataNote?.historyDays ?? profile.candles.length}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">最新核對來源</dt>
              <dd className="text-right text-slate-200">
                {dataNote?.latestVerification?.source ?? "市場快照"}
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </RadarShell>
  );
}
