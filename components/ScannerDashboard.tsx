'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { importedStocks } from '../lib/stockData';
import { verifiedCandidates, getMarketCandles } from '../lib/market-data';
import { scanStocks } from '../lib/scanEngine';

const marketFilterOptions = ['全部', '上市', '上櫃'] as const;
const sortOptions = [
  { value: 'structure', label: '結構強度' },
  { value: 'majorTrendline', label: '大級別趨勢線' }
] as const;

type MarketFilter = (typeof marketFilterOptions)[number];
type SortOption = (typeof sortOptions)[number]['value'];

export default function ScannerDashboard() {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('全部');
  const [sortOption, setSortOption] = useState<SortOption>('structure');
  const [version, setVersion] = useState(0);

  const scanResults = useMemo(() => {
    const snapshotStocks = verifiedCandidates
      .map((candidate) => {
        const candles = getMarketCandles(candidate.symbol, 'day', 'adjusted');
        if (!candles?.length) return null;
        return {
          symbol: candidate.symbol,
          name: candidate.name,
          market: (candidate.exchange === 'TPEx' ? '上櫃' : '上市') as '上市' | '上櫃',
          sector: candidate.sector,
          candles: candles.map((item) => ({
            date: item.time,
            open: item.open,
            high: item.high,
            low: item.low,
            close: item.close,
            volume: item.volume
          }))
        };
      })
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
    const sourceStocks = snapshotStocks.length ? snapshotStocks : importedStocks;
    const results = scanStocks(sourceStocks);
    const filtered =
      marketFilter === '全部'
        ? results
        : results.filter((item) => item.market === marketFilter);

    return filtered.slice().sort((left, right) => {
      if (sortOption === 'structure') {
        if (right.structureScore !== left.structureScore) {
          return right.structureScore - left.structureScore;
        }
        return right.score - left.score;
      }
      if (sortOption === 'majorTrendline') {
        if (right.majorTrendline !== left.majorTrendline) {
          return Number(right.majorTrendline) - Number(left.majorTrendline);
        }
        return right.score - left.score;
      }
      return right.score - left.score;
    });
  }, [marketFilter, sortOption, version]);

  const summary = useMemo(() => {
    const topCandidate = scanResults[0];
    return {
      scanned: importedStocks.length,
      hits: scanResults.length,
      topSymbol: topCandidate?.symbol ?? '—',
      topName: topCandidate?.name ?? '—',
    };
  }, [scanResults]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/40">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">軍師雷達 Pro</p>
              <h1 className="mt-3 text-4xl font-semibold text-white">下降趨勢結構雷達</h1>
              <p className="mt-4 max-w-2xl text-slate-300">
                以純趨勢線邏輯展示候選股結構，不包含舊版籌碼、MACD、嘎空或縮柱策略。
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <select
                value={marketFilter}
                onChange={(event) => setMarketFilter(event.target.value as MarketFilter)}
                className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200"
              >
                {marketFilterOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setVersion((value) => value + 1)}
                className="rounded-2xl border border-cyan-500/30 bg-cyan-500/10 px-5 py-3 text-sm text-cyan-200 transition hover:bg-cyan-500/20"
              >
                重新掃描
              </button>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">掃描摘要</h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950/70 p-4">
                <p className="text-sm text-slate-400">匯入股票</p>
                <p className="mt-2 text-2xl font-semibold text-white">{summary.scanned} 檔</p>
              </div>
              <div className="rounded-2xl bg-slate-950/70 p-4">
                <p className="text-sm text-slate-400">命中標的</p>
                <p className="mt-2 text-2xl font-semibold text-white">{summary.hits} 檔</p>
              </div>
              <div className="rounded-2xl bg-slate-950/70 p-4">
                <p className="text-sm text-slate-400">首選候選</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-300">{summary.topSymbol}</p>
                <p className="text-sm text-slate-400">{summary.topName}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">篩選條件</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              {['大級別下降趨勢線', '跟隨下降趨勢線', 'H3 成形', '空方動能衰退', '結構止損價格'].map(
                (item) => (
                  <div key={item} className="rounded-2xl bg-slate-950/70 px-4 py-3">
                    {item}
                  </div>
                )
              )}
            </div>
            <p className="mt-4 text-sm text-slate-400">
              這僅是純趨勢線結構雷達，不包含舊版分類與策略。
            </p>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
          <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">掃描結果</h2>
              <p className="mt-2 text-slate-400">顯示當前下降趨勢結構狀態。</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-slate-300">
                排序
                <select
                  value={sortOption}
                  onChange={(event) => setSortOption(event.target.value as SortOption)}
                  className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200"
                >
                  {sortOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {scanResults.map((item) => (
              <Link
                key={item.symbol}
                href={`/stocks/${item.symbol}`}
                className="group block rounded-3xl border border-slate-800 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20 transition hover:-translate-y-0.5 hover:border-cyan-500/40"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">{item.market}</p>
                    <h3 className="mt-2 text-xl font-semibold text-white">{item.symbol} {item.name}</h3>
                  </div>
                </div>

                <div className="mt-5 grid gap-3">
                  <div className="rounded-2xl bg-slate-950/70 p-4 text-sm">
                    <p className="text-slate-400">大級別下降趨勢線</p>
                    <p className={`mt-2 font-semibold ${item.majorTrendline ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {item.majorTrendline ? '成立' : '未成立'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/70 p-4 text-sm">
                    <p className="text-slate-400">跟隨下降趨勢線</p>
                    <p className={`mt-2 font-semibold ${item.followTrendline ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {item.followTrendline ? '成立' : '未成立'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/70 p-4 text-sm">
                    <p className="text-slate-400">H3 成形</p>
                    <p className={`mt-2 font-semibold ${item.h3Formed ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {item.h3Formed ? '已成形' : '尚未成形'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/70 p-4 text-sm">
                    <p className="text-slate-400">空方動能衰退</p>
                    <p className={`mt-2 font-semibold ${item.momentumDecay ? 'text-emerald-300' : 'text-slate-300'}`}>
                      {item.momentumDecay ? '已衰退' : '未衰退'}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-slate-950/70 p-4 text-sm">
                    <p className="text-slate-400">結構止損價格</p>
                    <p className="mt-2 font-semibold text-white">{item.stopLoss?.toFixed(2) ?? '—'}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
