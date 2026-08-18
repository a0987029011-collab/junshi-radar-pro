"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "../lib/read-json-response";
import type {
  SignalResearchObservation,
  SignalResearchSummary,
  TimeframeResearchSnapshot,
} from "../lib/signal-research";
import { SIGNAL_RESEARCH_SYNC_EVENT } from "./SignalResearchSync";

interface ResearchPayload {
  dataAsOf: string;
  generatedAt: string;
  summary: SignalResearchSummary;
  successfulCases: SignalResearchObservation[];
  recentCases: SignalResearchObservation[];
  error?: string;
}

function formatPercent(value: number | null, digits = 1) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatPrice(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

function macdLabel(snapshot: TimeframeResearchSnapshot) {
  const labels = {
    "positive-strengthening": "紅柱增強",
    "positive-weakening": "紅柱縮短",
    "negative-strengthening": "綠柱增強",
    "negative-weakening": "綠柱縮短",
  } as const;
  return labels[snapshot.macd.state];
}

function dpoLabel(snapshot: TimeframeResearchSnapshot) {
  return snapshot.dpo.direction === "rising"
    ? "上彎"
    : snapshot.dpo.direction === "falling"
      ? "下彎"
      : "走平";
}

function timeframeLabel(timeframe: TimeframeResearchSnapshot["timeframe"]) {
  return timeframe === "month" ? "月" : timeframe === "week" ? "週" : "日";
}

function TimeframeRow({ snapshot }: { snapshot: TimeframeResearchSnapshot }) {
  const ma35 = snapshot.movingAverages.find((average) => average.period === 35);
  return (
    <div className="grid gap-2 border-t border-slate-800 py-3 text-xs text-slate-300 sm:grid-cols-[2.5rem_1fr_1fr]">
      <strong className="text-cyan-200">{timeframeLabel(snapshot.timeframe)} K</strong>
      <span>
        {snapshot.candlePattern} · 量 {snapshot.volume.ratioToAverage20.toFixed(2)} 倍
      </span>
      <span>
        {macdLabel(snapshot)} · DPO {dpoLabel(snapshot)} · MA35 扣抵 {formatPrice(ma35?.deductionValue ?? null)}
      </span>
    </div>
  );
}

function SuccessfulCaseCard({ item }: { item: SignalResearchObservation }) {
  const outcome = item.outcomes[20];
  const snapshots = [item.snapshot.month, item.snapshot.week, item.snapshot.day].filter(
    (snapshot): snapshot is TimeframeResearchSnapshot => snapshot !== null,
  );
  return (
    <article className="rounded-3xl border border-emerald-400/20 bg-slate-950/55 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500">{item.signalDate} · {item.market} · {item.sector}</p>
          <Link className="mt-1 block text-xl font-semibold text-white hover:text-cyan-200" href={`/stocks/${item.symbol}`}>
            {item.symbol} {item.name}
          </Link>
        </div>
        <span className="rounded-full border border-emerald-400/35 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-200">
          20日達標
        </span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
        <div className="rounded-2xl bg-slate-900/80 p-3">
          <span className="block text-xs text-slate-500">訊號收盤</span>
          <strong className="mt-1 block text-white">{formatPrice(item.entryPrice)}</strong>
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-3">
          <span className="block text-xs text-slate-500">20日最高</span>
          <strong className="mt-1 block text-emerald-200">{formatPercent(outcome.maxReturnPercent)}</strong>
        </div>
        <div className="rounded-2xl bg-slate-900/80 p-3">
          <span className="block text-xs text-slate-500">最大不利幅度</span>
          <strong className="mt-1 block text-rose-200">{formatPercent(outcome.maxDrawdownPercent)}</strong>
        </div>
      </div>
      <div className="mt-3">
        {snapshots.map((snapshot) => (
          <TimeframeRow key={snapshot.timeframe} snapshot={snapshot} />
        ))}
      </div>
    </article>
  );
}

export default function SignalResearchDashboard() {
  const [payload, setPayload] = useState<ResearchPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncProgress, setSyncProgress] = useState("");

  const loadResearch = useCallback(async () => {
    try {
      const response = await fetch("/api/signal-research", { cache: "no-store" });
      const next = await readJsonResponse<ResearchPayload>(
        response,
        "研究資料服務暫時無法讀取",
      );
      if (!response.ok) throw new Error(next.error ?? "研究資料讀取失敗");
      setPayload(next);
      setError("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "研究資料讀取失敗");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadResearch(), 0);
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<{
        completed?: boolean;
        nextProfileIndex?: number;
        totalProfiles?: number;
        error?: string;
      }>).detail;
      if (detail.error) {
        setSyncProgress(detail.error);
        return;
      }
      if (detail.completed) {
        setSyncProgress("今日樣本已補齊");
        void loadResearch();
        return;
      }
      if (detail.totalProfiles) {
        const percent = Math.round(
          ((detail.nextProfileIndex ?? 0) / detail.totalProfiles) * 100,
        );
        setSyncProgress(`正在補齊歷史樣本 ${percent}%`);
      }
    };
    window.addEventListener(SIGNAL_RESEARCH_SYNC_EVENT, handleSync);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener(SIGNAL_RESEARCH_SYNC_EVENT, handleSync);
    };
  }, [loadResearch]);

  if (loading) {
    return <section className="panel p-8 text-slate-300">正在讀取紙上觀察樣本…</section>;
  }

  if (error) {
    return (
      <section className="panel p-8">
        <h2 className="text-xl font-semibold text-white">研究後台暫時無法讀取</h2>
        <p className="mt-2 text-rose-200">{error}</p>
      </section>
    );
  }

  if (!payload) return null;
  const { summary } = payload;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <span className="badge badge-aplus">PAPER OBSERVATION</span>
            <h2 className="mt-3 text-2xl font-semibold text-white">訊號歷史樣本庫</h2>
            <p className="mt-2 max-w-3xl leading-7 text-slate-300">
              每個雷達訊號都先當成紙上觀察，不需要真的買進。系統保存訊號當下的月、週、日 K 棒、量價、均線與扣抵、MACD、DPO，再回頭補算 5、20、60 個交易日結果。
            </p>
          </div>
          <div className="rounded-2xl border border-slate-700 bg-slate-950/60 px-4 py-3 text-xs text-slate-400">
            <strong className="block text-emerald-200">{syncProgress || "每日行情更新後自動補算"}</strong>
            <span className="mt-1 block">資料至 {payload.dataAsOf}</span>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["累積訊號", `${summary.totalSamples} 筆`],
            ["完成 60 日", `${summary.maturedSamples} 筆`],
            ["持續追蹤", `${summary.monitoringSamples} 筆`],
            ["樣本期間", summary.firstSignalDate ? `${summary.firstSignalDate} ～ ${summary.latestSignalDate}` : "建立中"],
          ].map(([label, value]) => (
            <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4" key={label}>
              <span className="text-xs text-slate-500">{label}</span>
              <strong className="mt-2 block text-lg text-white">{value}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <div>
          <h2 className="text-2xl font-semibold text-white">分段結果</h2>
          <p className="mt-2 text-sm text-slate-400">成功定義先固定為：5 日內最高 +5%、20 日內 +10%、60 日內 +20%。門檻可再依你的實戰邏輯調整。</p>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-3">
          {summary.windows.map((window) => (
            <article className="rounded-2xl border border-slate-800 bg-slate-950/55 p-5" key={window.windowDays}>
              <div className="flex items-center justify-between">
                <strong className="text-lg text-white">{window.windowDays} 日觀察</strong>
                <span className="text-xs text-cyan-200">目標 +{window.targetReturnPercent}%</span>
              </div>
              <strong className="mt-4 block text-3xl text-emerald-200">{window.hitRatePercent === null ? "—" : `${window.hitRatePercent.toFixed(1)}%`}</strong>
              <span className="mt-1 block text-xs text-slate-500">{window.hitSamples} / {window.eligibleSamples} 筆達標</span>
              <div className="mt-4 space-y-2 border-t border-slate-800 pt-4 text-sm">
                <div className="flex justify-between"><span className="text-slate-500">期末平均</span><strong className="text-slate-200">{formatPercent(window.averageCloseReturnPercent)}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">期間最高平均</span><strong className="text-emerald-200">{formatPercent(window.averageMaxReturnPercent)}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">最大不利幅度平均</span><strong className="text-rose-200">{formatPercent(window.averageMaxDrawdownPercent)}</strong></div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
        <h2 className="text-2xl font-semibold text-white">成功上漲案例整合</h2>
        <p className="mt-2 text-sm text-slate-400">先列出 20 個交易日內曾上漲至少 10% 的案例，並把訊號當下三個週期的狀態放在一起比較。</p>
        {payload.successfulCases.length ? (
          <div className="mt-5 grid gap-4 xl:grid-cols-2">
            {payload.successfulCases.map((item) => (
              <SuccessfulCaseCard item={item} key={item.observationKey} />
            ))}
          </div>
        ) : (
          <div className="mt-5 rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
            {summary.totalSamples === 0 ? "正在建立第一批歷史樣本，完成後會自動顯示。" : "目前尚無完成 20 日且達標的樣本。"}
          </div>
        )}
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-white">MACD 訊號拆分</h3>
          <div className="mt-4 space-y-3">
            {summary.signalModes.map((mode) => (
              <div className="rounded-2xl bg-slate-950/55 px-4 py-3" key={mode.mode}>
                <div className="flex justify-between gap-3 text-sm">
                  <span className="text-slate-300">{mode.mode === "negative-weakening" ? "負柱縮短" : mode.mode === "positive-rising" ? "零軸上雙線向上" : "其他"}</span>
                  <strong className="text-white">{mode.samples} 筆</strong>
                </div>
                <p className="mt-1 text-xs text-slate-500">20 日達標率 {mode.hitRate20DayPercent === null ? "—" : `${mode.hitRate20DayPercent.toFixed(1)}%`}（成熟 {mode.eligible20DaySamples} 筆）</p>
              </div>
            ))}
          </div>
        </article>
        <article className="rounded-3xl border border-amber-400/20 bg-slate-900/80 p-6">
          <h3 className="text-lg font-semibold text-amber-100">自動交易前的防線</h3>
          <ol className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li>1. 現階段只記錄與分析，不送出任何買賣委託。</li>
            <li>2. 命中率只計算已走完觀察期的樣本，未成熟樣本不灌入分母。</li>
            <li>3. 現有歷史回補只涵蓋目前合格股票池，仍要加入退出股票、交易成本、滑價、停損與不同市場階段驗證。</li>
            <li>4. 自動下單必須另外取得你的明確授權，並先設定單筆與總資金上限。</li>
          </ol>
        </article>
      </section>
    </div>
  );
}
