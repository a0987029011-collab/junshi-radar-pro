"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type {
  ClosedPositionCase,
  ClosedPositionResearchSummary,
} from "../lib/position-transactions";

interface ClosedCasePayload {
  summary?: ClosedPositionResearchSummary;
  cases?: ClosedPositionCase[];
  error?: string;
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function formatMoney(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return `${value >= 0 ? "+" : "-"}$${Math.abs(value).toLocaleString("zh-TW", {
    maximumFractionDigits: 0,
  })}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

export function ClosedPositionResearch() {
  const [payload, setPayload] = useState<ClosedCasePayload | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/position-cases", { cache: "no-store" })
      .then(async (response) => {
        const next = (await response.json()) as ClosedCasePayload;
        if (!response.ok) throw new Error(next.error ?? "結案資料讀取失敗");
        if (!cancelled) setPayload(next);
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "結案資料讀取失敗");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <section className="rounded-3xl border border-rose-400/20 bg-slate-900/80 p-6 text-sm text-rose-200">
        {error}
      </section>
    );
  }
  if (!payload?.summary) {
    return (
      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-6 text-sm text-slate-400">
        正在讀取實際交易結案資料…
      </section>
    );
  }
  const summary = payload.summary;
  const cases = payload.cases ?? [];

  return (
    <section className="rounded-3xl border border-amber-300/20 bg-slate-900/80 p-6 shadow-xl shadow-slate-950/20">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <span className="rounded-full border border-amber-300/35 bg-amber-300/10 px-3 py-1 text-xs font-semibold text-amber-100">
            REAL TRADE CASES
          </span>
          <h2 className="mt-3 text-2xl font-semibold text-white">實際持股結案資料庫</h2>
          <p className="mt-2 text-sm leading-6 text-slate-300">
            全部賣完後自動歸檔，依買賣費稅後的真實淨損益判定是否達成短期 +10%。成功與失敗都保留，不只挑好看的案例。
          </p>
        </div>
        <span className="rounded-2xl border border-slate-700 bg-slate-950/55 px-4 py-3 text-xs text-slate-400">
          目標：短期淨利 +10%
        </span>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["已結案", `${summary.totalCases} 檔`],
          ["達成 +10%", `${summary.targetReachedCases} 檔`],
          ["目標達成率", formatPercent(summary.targetHitRatePercent)],
          ["平均淨報酬", formatPercent(summary.averageReturnPercent)],
          ["平均持有", summary.averageHoldingDays === null ? "—" : `${summary.averageHoldingDays.toFixed(1)} 天`],
        ].map(([label, value]) => (
          <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4" key={label}>
            <span className="text-xs text-slate-500">{label}</span>
            <strong className="mt-2 block text-lg text-white">{value}</strong>
          </div>
        ))}
      </div>

      {cases.length ? (
        <div className="mt-5 space-y-3">
          {cases.slice(0, 10).map((item) => (
            <Link
              className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/45 p-4 transition hover:border-cyan-400/35 sm:grid-cols-[1.2fr_1fr_1fr_1fr]"
              href={`/stocks/${item.symbol}`}
              key={item.caseKey}
            >
              <div>
                <strong className="text-white">{item.symbol} {item.name}</strong>
                <span className="mt-1 block text-xs text-slate-500">{formatDate(item.openedAt)} ～ {formatDate(item.closedAt)}</span>
              </div>
              <div className="text-sm"><span className="block text-xs text-slate-500">持有期間</span><strong className="text-slate-200">{item.holdingDays} 天</strong></div>
              <div className="text-sm"><span className="block text-xs text-slate-500">實際淨損益</span><strong className={item.realizedProfit >= 0 ? "text-emerald-200" : "text-rose-200"}>{formatMoney(item.realizedProfit)} · {formatPercent(item.realizedReturnPercent)}</strong></div>
              <div className="text-sm"><span className="block text-xs text-slate-500">短期 +10%</span><strong className={item.targetReached ? "text-emerald-200" : "text-slate-400"}>{item.targetReached ? "達成" : "未達"}</strong></div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-700 px-5 py-8 text-center text-sm text-slate-500">
          尚無結案資料；下一次持股歸零後會自動出現在這裡。
        </div>
      )}
    </section>
  );
}
