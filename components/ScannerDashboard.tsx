'use client';

import { useMemo, useState } from 'react';
import { importedStocks } from '../lib/stockData';
import { scanStocks } from '../lib/scanEngine';

const marketFilterOptions = ['全部', '上市', '上櫃'] as const;

type MarketFilter = (typeof marketFilterOptions)[number];

export default function ScannerDashboard() {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('全部');
  const [version, setVersion] = useState(0);

  const scanResults = useMemo(() => {
    const results = scanStocks(importedStocks);
    if (marketFilter === '全部') {
      return results;
    }

    return results.filter((item) => item.market === marketFilter);
  }, [marketFilter, version]);

  const summary = useMemo(() => {
    const topCandidates = scanResults.slice(0, 5);
    return {
      scanned: importedStocks.length,
      hits: scanResults.length,
      topScore: topCandidates[0]?.score ?? 0,
      topSymbol: topCandidates[0]?.symbol ?? '—',
    };
  }, [scanResults]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-slate-100">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-8 shadow-xl shadow-slate-950/40">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm uppercase tracking-[0.35em] text-cyan-300/80">軍師雷達 Pro</p>
              <h1 className="mt-3 text-4xl font-semibold text-white">股票掃描頁面</h1>
              <p className="mt-4 max-w-2xl text-slate-300">
                已匯入上市櫃樣本股票資料，並依照「大級別下降趨勢線、跟隨下降趨勢線、H3 後不再創新低、空方動能衰退」建立掃描引擎。
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

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
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
                <p className="text-sm text-slate-400">最高分</p>
                <p className="mt-2 text-2xl font-semibold text-cyan-300">{summary.topSymbol}</p>
                <p className="text-sm text-slate-400">分數 {summary.topScore}</p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
            <h2 className="text-xl font-semibold text-white">策略條件</h2>
            <div className="mt-5 space-y-3 text-sm text-slate-300">
              {[
                '大級別下降趨勢線',
                '跟隨下降趨勢線',
                'H3 後不再創新低',
                '空方動能衰退',
              ].map((item) => (
                <div key={item} className="rounded-2xl bg-slate-950/70 px-4 py-3">
                  {item}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-white">掃描結果</h2>
              <p className="mt-2 text-slate-400">依照分數排序，優先檢視高信號標的。</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-left text-sm text-slate-300">
              <thead className="bg-slate-950/80 text-slate-400">
                <tr>
                  <th className="px-4 py-4">代號</th>
                  <th className="px-4 py-4">名稱</th>
                  <th className="px-4 py-4">市場</th>
                  <th className="px-4 py-4">策略</th>
                  <th className="px-4 py-4">分數</th>
                  <th className="px-4 py-4">最新價</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {scanResults.map((item) => (
                  <tr key={item.symbol} className="hover:bg-slate-900/80">
                    <td className="px-4 py-4 font-semibold text-white">{item.symbol}</td>
                    <td className="px-4 py-4">{item.name}</td>
                    <td className="px-4 py-4">{item.market}</td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        {item.reasons.map((reason) => (
                          <span key={reason} className="rounded-full bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200">
                            {reason}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-cyan-300">{item.score}</td>
                    <td className="px-4 py-4">{item.latestClose.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
