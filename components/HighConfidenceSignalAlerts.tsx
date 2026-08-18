"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { readJsonResponse } from "../lib/read-json-response";
import type { HighConfidenceSignalReview } from "../lib/signal-research";
import { SIGNAL_RESEARCH_SYNC_EVENT } from "./SignalResearchSync";

interface ResearchAlertPayload {
  highConfidenceReview?: HighConfidenceSignalReview;
  error?: string;
}

function formatPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatPrice(value: number) {
  return value >= 100 ? value.toFixed(1) : value.toFixed(2);
}

export function HighConfidenceSignalAlerts() {
  const [review, setReview] = useState<HighConfidenceSignalReview | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  const loadReview = useCallback(async () => {
    try {
      const response = await fetch("/api/signal-research", {
        cache: "no-store",
      });
      const payload = await readJsonResponse<ResearchAlertPayload>(
        response,
        "候選評估服務暫時無法讀取",
      );
      if (!response.ok) throw new Error(payload.error ?? "候選評估讀取失敗");
      setReview(payload.highConfidenceReview ?? null);
      setMessage("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "候選評估讀取失敗",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadReview(), 0);
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<{ completed?: boolean }>).detail;
      if (detail.completed) void loadReview();
    };
    window.addEventListener(SIGNAL_RESEARCH_SYNC_EVENT, handleSync);
    return () => {
      window.clearTimeout(initialLoad);
      window.removeEventListener(SIGNAL_RESEARCH_SYNC_EVENT, handleSync);
    };
  }, [loadReview]);

  return (
    <section
      aria-live="polite"
      className="overflow-hidden rounded-3xl border border-amber-300/30 bg-gradient-to-br from-amber-400/10 via-slate-900/90 to-emerald-400/10 shadow-xl shadow-slate-950/25"
      role="status"
    >
      <div className="flex flex-col gap-4 border-b border-amber-200/15 p-6 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/40 bg-amber-300/10 px-3 py-1 text-xs font-semibold tracking-wide text-amber-100">
              小資金實測候選
            </span>
            <span className="text-xs text-slate-500">獨立通知欄 · 不會自動下單</span>
          </div>
          <h2 className="mt-3 text-2xl font-semibold text-white">軍師高信心研究通知</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">
            只有歷史樣本、近期驗證、相對基準提升與風險幅度同時過關才會出現。這裡是小額市場驗證候選，不是保證上漲或買進指令。
          </p>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-950/55 px-4 py-3 text-xs text-slate-400">
          {loading ? (
            <strong className="text-amber-100">正在核對今日訊號…</strong>
          ) : message ? (
            <strong className="text-rose-200">{message}</strong>
          ) : review ? (
            <>
              <strong className={review.qualifiedSignals ? "text-emerald-200" : "text-slate-200"}>
                今日評估 {review.evaluatedSignals} 檔 · 通過 {review.qualifiedSignals} 檔
              </strong>
              <span className="mt-1 block">資料日期 {review.dataAsOf}</span>
            </>
          ) : (
            <strong className="text-slate-300">等待研究樣本同步</strong>
          )}
        </div>
      </div>

      {review?.candidates.length ? (
        <div className="grid gap-4 p-6 xl:grid-cols-2">
          {review.candidates.map((candidate) => (
            <article
              className="rounded-3xl border border-emerald-300/30 bg-slate-950/65 p-5"
              key={candidate.observationKey}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-slate-500">
                    {candidate.signalDate} · {candidate.market} · {candidate.sector}
                  </p>
                  <Link
                    className="mt-1 block text-xl font-semibold text-white hover:text-cyan-200"
                    href={`/stocks/${candidate.symbol}`}
                  >
                    {candidate.symbol} {candidate.name}
                  </Link>
                </div>
                <span className="rounded-full border border-emerald-300/40 bg-emerald-300/10 px-3 py-1 text-xs font-semibold text-emerald-100">
                  通過驗證
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {candidate.logicLabels.map((label) => (
                  <span
                    className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-300"
                    key={label}
                  >
                    {label}
                  </span>
                ))}
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="block text-xs text-slate-500">訊號價</span>
                  <strong className="mt-1 block text-white">{formatPrice(candidate.entryPrice)}</strong>
                </div>
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="block text-xs text-slate-500">成熟樣本</span>
                  <strong className="mt-1 block text-white">{candidate.evidence.samples} 筆</strong>
                </div>
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="block text-xs text-slate-500">20日達標率</span>
                  <strong className="mt-1 block text-emerald-200">{candidate.evidence.hitRatePercent.toFixed(1)}%</strong>
                </div>
                <div className="rounded-2xl bg-slate-900/80 p-3">
                  <span className="block text-xs text-slate-500">近期達標率</span>
                  <strong className="mt-1 block text-amber-100">{candidate.evidence.recentHitRatePercent.toFixed(1)}%</strong>
                </div>
              </div>

              <div className="mt-4 grid gap-2 border-t border-slate-800 pt-4 text-xs text-slate-400 sm:grid-cols-2">
                <span>涵蓋 {candidate.evidence.uniqueStocks} 檔、{candidate.evidence.uniqueSignalDates} 個訊號日</span>
                <span>相對全體基準 {formatPercent(candidate.evidence.liftPercent)}</span>
                <span>20 日期末平均 {formatPercent(candidate.evidence.averageCloseReturnPercent)}</span>
                <span>最大不利幅度平均 {formatPercent(candidate.evidence.averageAdversePercent)}</span>
              </div>

              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-amber-300/20 bg-amber-300/5 px-4 py-3 text-xs text-amber-100 sm:flex-row sm:items-center sm:justify-between">
                <span>小資金實測額度：尚未設定</span>
                <Link className="font-semibold text-cyan-200 hover:text-cyan-100" href={`/stocks/${candidate.symbol}`}>
                  查看 K 線與風險位 →
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="p-6">
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/35 px-5 py-7 text-center">
            <strong className="text-slate-200">
              {loading
                ? "正在比對歷史邏輯"
                : review?.evaluatedSignals
                  ? "本次訊號沒有同時通過全部門檻，軍師先不通知實測。"
                  : "今日尚無可評估的新訊號。"}
            </strong>
            <p className="mt-2 text-xs text-slate-500">
              寧可少報，也不因短期漂亮數字放寬條件。
            </p>
          </div>
        </div>
      )}

      <div className="border-t border-slate-800/80 bg-slate-950/35 px-6 py-4 text-xs leading-5 text-slate-500">
        固定門檻：至少 80 筆成熟樣本、40 檔股票、20 個訊號日；20 日內 +10% 的歷史達標率至少 70%，95% 保守下界至少 65%，近期樣本至少 30 筆且達標率至少 60%，並須優於全體基準至少 10 個百分點。
        現階段資料仍來自目前合格股票池的歷史重建，尚未完整涵蓋退出股票、交易成本與滑價，因此只能用於小額驗證，不能視為未來勝率保證。
      </div>
    </section>
  );
}
