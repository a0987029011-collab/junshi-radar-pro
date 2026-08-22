import Link from "next/link";
import {
  getScannableSnapshotProfiles,
  marketSnapshotMeta,
} from "../lib/market-data";
import {
  REVERSAL_BREAKOUT_LABELS,
  scanReversalStocks,
  type ReversalScanResult,
} from "../lib/reversal-radar";
import { buildStrategyPerformanceComparison } from "../lib/strategy-performance";
import { importedStocks } from "../lib/stockData";

function formatPrice(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function formatPercent(value: number | null) {
  return value === null ? "樣本累積中" : `${value.toFixed(1)}%`;
}

function ReversalCard({
  result,
  mode,
}: {
  result: ReversalScanResult;
  mode: "signal" | "setup" | "history";
}) {
  const signal = result.latestSignal;
  const setup = result.activeSetup;
  const score = signal?.score ?? setup?.score ?? 0;
  const lastLow = signal?.lastLow ?? setup?.structure.lastLow;
  const linePrice = signal?.descendingLinePrice ?? setup?.descendingLinePrice;
  const reboundHigh = signal?.reboundHigh ?? setup?.reboundHigh;
  const volumeRatio = signal?.volumeRatio ?? setup?.volumeRatio;
  const status =
    mode === "signal" ? "今日轉勢" : mode === "setup" ? "等待突破" : "歷史訊號";

  return (
    <Link
      className="block rounded-3xl border border-slate-800 bg-slate-950/55 p-5 transition hover:-translate-y-0.5 hover:border-emerald-400/40"
      href={`/stocks/${result.symbol}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-emerald-300/75">
            {result.market} · {result.sector}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {result.symbol} {result.name}
          </h3>
        </div>
        <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          {status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-slate-900/80 p-4">
          <p className="text-slate-500">最後有效新低</p>
          <p className="mt-2 font-semibold text-white">{formatPrice(lastLow?.price)}</p>
          <p className="mt-1 text-xs text-slate-500">{lastLow?.date ?? "—"}</p>
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-4">
          <p className="text-slate-500">品質分數</p>
          <p className="mt-2 font-semibold text-emerald-200">{score} 分</p>
          <p className="mt-1 text-xs text-slate-500">
            守住 {signal?.heldTradingDays ?? setup?.heldTradingDays ?? 0} 個交易日
          </p>
        </div>
      </div>

      <div className="mt-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
        <div className="flex justify-between gap-4">
          <span>下降線價</span>
          <strong className="text-cyan-200">{formatPrice(linePrice)}</strong>
        </div>
        <div className="mt-2 flex justify-between gap-4">
          <span>重要反彈高點</span>
          <strong className="text-amber-200">{formatPrice(reboundHigh?.price)}</strong>
        </div>
        {setup ? (
          <div className="mt-2 flex justify-between gap-4">
            <span>下一待突破價</span>
            <strong className="text-white">{formatPrice(setup.nextBreakoutLevel)}</strong>
          </div>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <span className="rounded-xl bg-slate-900/80 px-3 py-3 text-slate-300">
          {signal?.macdWeakeningAfterLow ?? setup?.macdWeakeningAfterLow
            ? "負柱縮短 ✓"
            : "負柱縮短 —"}
        </span>
        <span className="rounded-xl bg-slate-900/80 px-3 py-3 text-slate-300">
          {signal?.macdBullishTurn ?? setup?.macdBullishTurn
            ? "MACD 翻紅 ✓"
            : "MACD 翻紅 —"}
        </span>
        <span className="rounded-xl bg-slate-900/80 px-3 py-3 text-slate-300">
          {volumeRatio === null || volumeRatio === undefined
            ? "量能 —"
            : `量能 ${volumeRatio.toFixed(1)}×`}
        </span>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-500">
        <span>{signal ? REVERSAL_BREAKOUT_LABELS[signal.breakoutType] : "不再創低，等待結構突破"}</span>
        <strong className="font-medium text-slate-300">{signal?.date ?? marketSnapshotMeta.dataAsOf}</strong>
      </div>
    </Link>
  );
}

export default function ReversalRadarDashboard() {
  const snapshotStocks = getScannableSnapshotProfiles();
  const sourceStocks = snapshotStocks.length ? snapshotStocks : importedStocks;
  const results = scanReversalStocks(sourceStocks);
  const currentSignals = results.filter((result) => result.signalOnLatestBar);
  const activeSetups = results
    .filter((result) => result.activeSetup)
    .slice(0, 12);
  const recentSignals = results
    .filter((result) => result.latestSignal && !result.signalOnLatestBar)
    .sort((left, right) =>
      (right.latestSignal?.date ?? "").localeCompare(
        left.latestSignal?.date ?? "",
      ),
    )
    .slice(0, 12);
  const performance = buildStrategyPerformanceComparison(sourceStocks);

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-emerald-400/25 bg-slate-900/80 p-7 shadow-xl shadow-slate-950/30">
        <p className="text-sm uppercase tracking-[0.32em] text-emerald-300/80">
          Long-only structure reversal
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-semibold text-white sm:text-4xl">轉勢雷達</h1>
          <span className="rounded-full border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
            只做多
          </span>
        </div>
        <p className="mt-4 max-w-3xl leading-7 text-slate-300">
          先確認較低高點與較低低點構成下降結構，最後有效新低守住後，再等待紅 K 向上突破下降線或最後重要反彈高點。MACD 與成交量只負責品質加分，不會取代價格結構。
        </p>
        <div className="mt-5 inline-flex flex-wrap items-center gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
          <span className="h-2 w-2 rounded-full bg-emerald-300" />
          <strong>正式資料 {marketSnapshotMeta.dataAsOf}</strong>
          <span>掃描 {sourceStocks.length} 檔 · 與原雷達獨立</span>
        </div>
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">兩套訊號獨立績效</h2>
          <p className="mt-2 text-sm leading-6 text-slate-400">
            統一比較訊號後 20 個交易日；勝率以期間內曾上漲 10% 計算，未走完 20 日的訊號不進入勝率分母。
          </p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {performance.map((summary) => (
            <article className="rounded-3xl border border-slate-800 bg-slate-950/55 p-5" key={summary.strategyId}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-500">獨立樣本</p>
                  <h3 className="mt-2 text-lg font-semibold text-white">{summary.strategyName}</h3>
                </div>
                <strong className="font-mono text-3xl text-cyan-200">{summary.signalCount}</strong>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="text-xs text-slate-500">勝率</span>
                  <strong className="mt-2 block text-white">{formatPercent(summary.winRatePercent)}</strong>
                </div>
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="text-xs text-slate-500">平均漲幅</span>
                  <strong className="mt-2 block text-rose-200">{formatPercent(summary.averageMaxGainPercent)}</strong>
                </div>
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="text-xs text-slate-500">最大回撤</span>
                  <strong className="mt-2 block text-emerald-200">{formatPercent(summary.maximumDrawdownPercent)}</strong>
                </div>
              </div>
              <p className="mt-4 text-xs text-slate-500">
                成熟樣本 {summary.maturedSignalCount} 筆 · 達標 {summary.winningSignalCount} 筆
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-emerald-400/20 bg-slate-900/80 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">今日轉勢訊號</h2>
            <p className="mt-2 text-sm text-slate-400">最後新低守住，且今天紅 K 已向上突破關鍵結構。</p>
          </div>
          <strong className="text-emerald-200">{currentSignals.length} 檔</strong>
        </div>
        {currentSignals.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {currentSignals.map((result) => (
              <ReversalCard key={result.symbol} mode="signal" result={result} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
            今日沒有同時完成「最後新低守住＋紅 K 突破」的股票；不會用較寬鬆的原雷達訊號補入。
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">不再創低，等待突破</h2>
            <p className="mt-2 text-sm text-slate-400">下降結構已成立且最後有效新低仍守住，尚未發出轉勢訊號。</p>
          </div>
          <strong className="text-cyan-200">{activeSetups.length} 檔</strong>
        </div>
        {activeSetups.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {activeSetups.map((result) => (
              <ReversalCard key={result.symbol} mode="setup" result={result} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">目前沒有等待突破的完整 setup。</div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-semibold text-white">最近歷史轉勢訊號</h2>
            <p className="mt-2 text-sm text-slate-400">只列轉勢雷達自己的訊號，不混入既有下降線突破候選。</p>
          </div>
          <strong className="text-slate-300">最近 {recentSignals.length} 檔</strong>
        </div>
        {recentSignals.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {recentSignals.map((result) => (
              <ReversalCard key={result.symbol} mode="history" result={result} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">歷史樣本仍在累積。</div>
        )}
      </section>
    </div>
  );
}
