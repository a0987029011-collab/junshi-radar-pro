'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  getScannableSnapshotProfiles,
  marketSnapshotMeta
} from '../lib/market-data';
import {
  BREAKOUT_TYPE_LABELS,
  scanStocks,
  type ScanResultItem
} from '../lib/scanEngine';
import { importedStocks } from '../lib/stockData';

const marketFilterOptions = ['全部', '上市', '上櫃'] as const;
const sortOptions = [
  { value: 'signal', label: '今日訊號優先' },
  { value: 'date', label: '最近訊號日期' },
  { value: 'h1', label: '最新 H1' }
] as const;

type MarketFilter = (typeof marketFilterOptions)[number];
type SortOption = (typeof sortOptions)[number]['value'];
type SignalPage = 'body-cross' | 'gap-above' | 'intraday-warning';

function formatPrice(value?: number) {
  if (value === undefined || !Number.isFinite(value)) return '—';
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function conditionClass(active: boolean) {
  return active ? 'text-rose-300' : 'text-slate-400';
}

function ResultCard({
  item,
  intraday
}: {
  item: ScanResultItem;
  intraday: boolean;
}) {
  const latestCandle = item.candles.at(-1);
  const redCandle = Boolean(
    latestCandle && latestCandle.close > latestCandle.open
  );

  return (
    <Link
      href={`/stocks/${item.symbol}`}
      className="group block rounded-3xl border border-slate-800 bg-slate-950/55 p-5 transition hover:-translate-y-0.5 hover:border-cyan-500/40"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-cyan-300/80">
            {item.market} · {item.sector}
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {item.symbol} {item.name}
          </h3>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${
          intraday && item.signalOnLatestBar
            ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
            : item.closeConfirmation
            ? 'border-rose-400/50 bg-rose-500/10 text-rose-200'
            : item.intradayWarning
              ? 'border-amber-400/50 bg-amber-500/10 text-amber-200'
              : 'border-slate-700 bg-slate-900 text-slate-300'
        }`}>
          {intraday && item.signalOnLatestBar
            ? '盤中預警'
            : item.breakoutType
            ? BREAKOUT_TYPE_LABELS[item.breakoutType]
            : item.status}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
        <div className="rounded-2xl bg-slate-900/80 p-4">
          <p className="text-slate-500">H1</p>
          <p className="mt-2 font-semibold text-white">{formatPrice(item.h1Price)}</p>
          <p className="mt-1 text-xs text-slate-500">{item.h1?.date ?? '等待確認'}</p>
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-4">
          <p className="text-slate-500">當根既有線價</p>
          <p className="mt-2 font-semibold text-cyan-200">{formatPrice(item.linePrice)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {item.h2 ? `H2 ${item.h2.date}` : '先判斷，後更新'}
          </p>
        </div>
      </div>

      {latestCandle && (item.breakoutType || (intraday && item.signalOnLatestBar)) ? (
        <div className="mt-3 rounded-xl border border-slate-800 bg-slate-900/65 px-3 py-2 font-mono text-xs text-slate-300">
          開 {formatPrice(latestCandle.open)} · 線 {formatPrice(item.linePrice)} · {intraday ? '現' : '收'} {formatPrice(latestCandle.close)}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div className={`rounded-xl bg-slate-900/80 px-3 py-3 ${conditionClass(redCandle)}`}>
          紅 K {redCandle ? '✓' : '—'}
        </div>
        <div className={`rounded-xl bg-slate-900/80 px-3 py-3 ${conditionClass(item.macdWeakening)}`}>
          MACD {item.macdWeakening ? '✓' : '—'}
        </div>
        <div className={`rounded-xl bg-slate-900/80 px-3 py-3 ${conditionClass(item.dpoUpturn)}`}>
          DPO {item.dpoUpturn ? '✓' : '—'}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-slate-800 pt-4 text-xs text-slate-500">
        <span>最近訊號</span>
        <strong className="font-medium text-slate-300">{item.signalDate ?? '尚無'}</strong>
      </div>
    </Link>
  );
}

export default function ScannerDashboard() {
  const [marketFilter, setMarketFilter] = useState<MarketFilter>('全部');
  const [sortOption, setSortOption] = useState<SortOption>('signal');
  const [activeSignalPage, setActiveSignalPage] = useState<SignalPage>('body-cross');
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState('');
  const isIntradaySnapshot =
    marketSnapshotMeta.marketPhase === 'intraday' ||
    marketSnapshotMeta.mode.includes('intraday');

  const sourceStocks = useMemo(() => {
    const snapshotStocks = getScannableSnapshotProfiles();
    return snapshotStocks.length ? snapshotStocks : importedStocks;
  }, []);

  const scanResults = useMemo(() => {
    const results = scanStocks(sourceStocks, sourceStocks.length);
    const filtered =
      marketFilter === '全部'
        ? results
        : results.filter((item) => item.market === marketFilter);

    return filtered.slice().sort((left, right) => {
      if (sortOption === 'date') {
        return (right.signalDate ?? '').localeCompare(left.signalDate ?? '');
      }
      if (sortOption === 'h1') {
        return (right.h1Index ?? -1) - (left.h1Index ?? -1);
      }
      const confirmationOrder = isIntradaySnapshot
        ? 0
        : Number(right.closeConfirmation) - Number(left.closeConfirmation);
      if (confirmationOrder !== 0) return confirmationOrder;
      const warningOrder =
        Number(right.intradayWarning) - Number(left.intradayWarning);
      if (warningOrder !== 0) return warningOrder;
      return (right.signalDate ?? '').localeCompare(left.signalDate ?? '');
    });
  }, [isIntradaySnapshot, marketFilter, sortOption, sourceStocks]);

  const isCurrentIntradaySignal = (item: ScanResultItem) =>
    item.signalOnLatestBar && (item.intradayWarning || item.closeConfirmation);

  const bodyCrossResults = scanResults.filter(
    (item) => !isIntradaySnapshot && item.closeConfirmation && item.breakoutType === 'body-cross'
  );
  const gapAboveResults = scanResults.filter(
    (item) => !isIntradaySnapshot && item.closeConfirmation && item.breakoutType === 'gap-above'
  );
  const intradayWarningResults = scanResults.filter(
    (item) => isIntradaySnapshot
      ? isCurrentIntradaySignal(item)
      : item.intradayWarning && !item.closeConfirmation
  );
  const signalPages = [
    {
      id: 'body-cross',
      title: '紅 K 實體穿越',
      description: 'open ≤ 當根線價 < close；下降線確實穿過紅 K 實體。',
      items: bodyCrossResults,
      tone: 'text-rose-200'
    },
    {
      id: 'gap-above',
      title: '跳空紅 K 站上',
      description: '當根線價 < open < close；開盤時已在線上方，實體沒有穿線。',
      items: gapAboveResults,
      tone: 'text-amber-200'
    },
    {
      id: 'intraday-warning',
      title: '盤中預警',
      description: 'high 已穿越既有線且紅 K、MACD、DPO 成立，但 close 尚未站上線。',
      items: intradayWarningResults,
      tone: 'text-cyan-200'
    }
  ] satisfies Array<{
    id: SignalPage;
    title: string;
    description: string;
    items: ScanResultItem[];
    tone: string;
  }>;
  const activePage = signalPages.find((page) => page.id === activeSignalPage)!;

  const refreshMarketData = async () => {
    setRefreshing(true);
    setRefreshMessage('正在取得市場行情，請不要關閉此頁…');
    try {
      const response = await fetch('/api/market-refresh', { method: 'POST' });
      const payload = (await response.json()) as { error?: string; mode?: string };
      if (!response.ok) throw new Error(payload.error ?? '更新失敗');
      setRefreshMessage(
        payload.mode === 'intraday'
          ? '盤中行情已更新，正在重新整理雷達…'
          : '盤後完整資料已更新，正在重新整理雷達…'
      );
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error) {
      setRefreshMessage(error instanceof Error ? error.message : '市場資料更新失敗');
      setRefreshing(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-3xl border border-slate-800 bg-slate-900/80 p-7 shadow-xl shadow-slate-950/30">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-cyan-300/80">
              軍師雷達 Pro · H1 Tracker
            </p>
            <h1 className="mt-3 text-3xl font-semibold text-white sm:text-4xl">
              下降趨勢線紅 K 穿越
            </h1>
            <p className="mt-4 max-w-3xl leading-7 text-slate-300">
              H1 次根確認後立即連線；每根 K 先用既有線判斷，再於未觸發時接入當根 high。
              訊號同根確認紅 K、MACD 負柱縮短與 DPO 上彎；收盤確認再依開盤價分為實體穿越與跳空站上。
            </p>
            <div className={`mt-5 inline-flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2 text-xs ${
              isIntradaySnapshot
                ? 'border-amber-400/35 bg-amber-500/10 text-amber-100'
                : 'border-emerald-400/25 bg-emerald-500/10 text-emerald-100'
            }`}>
              <span className={`h-2 w-2 rounded-full ${isIntradaySnapshot ? 'bg-amber-300' : 'bg-emerald-300'}`} />
              <strong>{isIntradaySnapshot ? '盤中快照｜僅作預警' : '正式收盤資料'}</strong>
              <span>資料日期 {marketSnapshotMeta.dataAsOf}</span>
              {marketSnapshotMeta.quoteTime ? <span>擷取 {marketSnapshotMeta.quoteTime.slice(0, 8)}</span> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <label className="sr-only" htmlFor="market-filter">市場</label>
            <select
              id="market-filter"
              value={marketFilter}
              onChange={(event) =>
                setMarketFilter(event.target.value as MarketFilter)
              }
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200"
            >
              {marketFilterOptions.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
            <button
              aria-busy={refreshing}
              className="rounded-2xl border border-amber-400/45 bg-amber-400/15 px-5 py-3 text-sm font-semibold text-amber-100 transition hover:bg-amber-400/25 disabled:cursor-wait disabled:opacity-60"
              disabled={refreshing}
              onClick={refreshMarketData}
              type="button"
            >
              {refreshing ? '更新中…' : '更新市場資料'}
            </button>
          </div>
        </div>
        {refreshMessage ? (
          <div className="mt-5 rounded-xl border border-slate-700 bg-slate-950/65 px-4 py-3 text-sm text-slate-300" role="status">
            {refreshMessage}
          </div>
        ) : null}
      </header>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-white">訊號分頁</h2>
            <p className="mt-2 text-slate-400">
              點選條件後，只顯示該條件成立的個股，不混入其他訊號或一般追蹤股。
            </p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-300">
            排序
            <select
              value={sortOption}
              onChange={(event) => setSortOption(event.target.value as SortOption)}
              className="rounded-2xl border border-slate-700 bg-slate-950/80 px-4 py-3 text-sm text-slate-200"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </div>

        <div
          aria-label="訊號條件"
          className="mb-7 grid gap-3 sm:grid-cols-3"
          role="tablist"
        >
          {signalPages.map((page) => {
            const active = page.id === activeSignalPage;
            return (
              <button
                aria-controls="signal-results-panel"
                aria-selected={active}
                className={`rounded-2xl border px-4 py-4 text-left transition ${
                  active
                    ? 'border-cyan-400/60 bg-cyan-400/10 text-white shadow-lg shadow-cyan-950/20'
                    : 'border-slate-700 bg-slate-950/55 text-slate-400 hover:border-slate-600 hover:text-slate-200'
                }`}
                id={`signal-tab-${page.id}`}
                key={page.id}
                onClick={() => setActiveSignalPage(page.id)}
                role="tab"
                type="button"
              >
                <span className="block text-sm font-semibold">{page.title}</span>
                <strong className="mt-2 block text-2xl">{page.items.length} 檔</strong>
              </button>
            );
          })}
        </div>

        <section
          aria-labelledby={`signal-tab-${activePage.id}`}
          id="signal-results-panel"
          role="tabpanel"
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className={`text-xl font-semibold ${activePage.tone}`}>
                {activePage.title}
              </h3>
              <p className="mt-1 text-sm text-slate-400">{activePage.description}</p>
            </div>
            <strong className="text-sm text-slate-300">{activePage.items.length} 檔</strong>
          </div>

          {activePage.items.length ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {activePage.items.map((item) => (
                <ResultCard intraday={isIntradaySnapshot} item={item} key={item.symbol} />
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
              本次掃描沒有符合「{activePage.title}」的股票。
            </div>
          )}
        </section>
      </section>
    </div>
  );
}
