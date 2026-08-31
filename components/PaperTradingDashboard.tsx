"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type {
  PaperExitReason,
  PaperTradingDashboard as PaperTradingDashboardData,
} from "../lib/paper-trading";
import { readJsonResponse } from "../lib/read-json-response";
import { PAPER_TRADING_SYNC_EVENT } from "./PaperTradingSync";

function money(value: number) {
  return new Intl.NumberFormat("zh-TW", {
    style: "currency",
    currency: "TWD",
    maximumFractionDigits: 0,
  }).format(value);
}

function price(value: number | null) {
  return value === null
    ? "—"
    : new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 2 }).format(value);
}

function percent(value: number | null, signed = true) {
  if (value === null) return "—";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function returnColor(value: number | null) {
  if (value === null || value === 0) return "text-slate-200";
  return value > 0 ? "text-rose-200" : "text-emerald-200";
}

function exitReason(reason: PaperExitReason | null) {
  switch (reason) {
    case "target":
      return "淨利 10% 目標";
    case "stop-loss":
      return "10% 一般停損";
    case "early-profit":
      return "多頭轉弱提前獲利";
    case "early-stop":
      return "買進初期黑 K 提前止損";
    case "time-limit":
      return "20 日到期";
    default:
      return "—";
  }
}

function SummaryCard({
  label,
  value,
  note,
  tone = "text-white",
}: {
  label: string;
  value: string;
  note: string;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4">
      <span className="text-xs text-slate-500">{label}</span>
      <strong className={`mt-2 block text-2xl ${tone}`}>{value}</strong>
      <span className="mt-2 block text-xs leading-5 text-slate-500">{note}</span>
    </article>
  );
}

export function PaperTradingDashboard() {
  const [dashboard, setDashboard] =
    useState<PaperTradingDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/paper-trading", { cache: "no-store" });
      const payload = await readJsonResponse<
        PaperTradingDashboardData & { error?: string }
      >(response, "模擬交易服務暫時無法讀取");
      if (!response.ok) {
        throw new Error(payload.error ?? "模擬交易資料讀取失敗");
      }
      setDashboard(payload);
      setError("");
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "模擬交易資料讀取失敗",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    const handleSync = (event: Event) => {
      const detail = (event as CustomEvent<
        PaperTradingDashboardData & { error?: string }
      >).detail;
      if (detail.error) {
        setError(detail.error);
        setLoading(false);
        return;
      }
      setDashboard(detail);
      setError("");
      setLoading(false);
    };
    window.addEventListener(PAPER_TRADING_SYNC_EVENT, handleSync);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener(PAPER_TRADING_SYNC_EVENT, handleSync);
    };
  }, [load]);

  if (loading) {
    return (
      <section className="panel mt-6 p-8 text-slate-300">
        正在接續模擬帳戶的最新進度…
      </section>
    );
  }
  if (error) {
    return (
      <section className="panel mt-6 p-8">
        <h2 className="text-xl font-semibold text-white">模擬帳戶暫時無法讀取</h2>
        <p className="mt-2 text-sm text-rose-200">{error}</p>
        <button
          className="mt-4 rounded-xl border border-slate-700 bg-slate-900 px-4 py-2 text-sm text-white"
          onClick={() => {
            setLoading(true);
            void load();
          }}
          type="button"
        >
          重新讀取
        </button>
      </section>
    );
  }
  if (!dashboard) return null;

  const allocation =
    dashboard.currentEquity *
    (dashboard.rules.maximumAllocationPercent / 100);

  return (
    <div className="mt-6 flex flex-col gap-6">
      <section className="rounded-3xl border border-cyan-400/25 bg-slate-900/80 p-5 shadow-xl shadow-slate-950/20 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <span className="rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold text-cyan-100">
              PAPER ONLY · 不會送出真實委託
            </span>
            <h2 className="mt-4 text-2xl font-semibold text-white">軍師自主模擬帳戶</h2>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-slate-300">
              每個交易日只用當時已知的盤後資料決策。資料更新完成後立即選股，選中的標的一律以當日收盤價假設成交；這是比較選股盈虧的固定試驗規則，不代表真實盤後委託一定成交。
            </p>
          </div>
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/10 p-4 lg:max-w-sm">
            <strong className="text-sm text-amber-100">
              {dashboard.readiness.label}
            </strong>
            <p className="mt-2 text-xs leading-5 text-amber-100/70">
              {dashboard.readiness.reason}
            </p>
          </div>
        </div>
        <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard
            label="目前總資產"
            note={`起始本金 ${money(dashboard.account.startingCash)}`}
            value={money(dashboard.currentEquity)}
          />
          <SummaryCard
            label="總報酬率"
            note={`現金 ${money(dashboard.account.cash)}`}
            tone={returnColor(dashboard.totalReturnPercent)}
            value={percent(dashboard.totalReturnPercent)}
          />
          <SummaryCard
            label="下一筆 10% 上限"
            note="總資產成長後會自動跟著增加"
            value={money(allocation)}
          />
          <SummaryCard
            label="完成交易勝率"
            note={`${dashboard.profitableTrades} 勝／${dashboard.closedTrades} 筆`}
            value={percent(dashboard.winRatePercent, false)}
          />
          <SummaryCard
            label="最大回撤"
            note={`已實現 ${money(dashboard.realizedProfit)}`}
            tone="text-emerald-200"
            value={percent(dashboard.account.maximumDrawdownPercent)}
          />
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="rounded-3xl border border-amber-400/20 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">盤後成交待處理</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                正常情況會在同次盤後更新直接建立持股；只有缺少行情或資料異常才會留在這裡。
              </p>
            </div>
            <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100">
              {dashboard.pendingOrders.length} 檔
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.pendingOrders.length ? (
              dashboard.pendingOrders.map((order) => (
                <div
                  className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"
                  key={order.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs text-slate-500">
                        訊號 {order.signalDate} · {order.sector}
                      </span>
                      <Link
                        className="mt-1 block text-lg font-semibold text-white hover:text-cyan-200"
                        href={`/stocks/${order.symbol}`}
                      >
                        {order.symbol} {order.name}
                      </Link>
                    </div>
                    <span className="rounded-full border border-cyan-400/30 px-3 py-1 text-xs font-semibold text-cyan-100">
                      {order.selectionScore} 分
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="block text-xs text-slate-500">訊號收盤價</span>
                      <strong className="mt-1 block text-white">{price(order.signalClose)}</strong>
                    </div>
                    <div className="rounded-xl bg-slate-900 p-3">
                      <span className="block text-xs text-slate-500">突破線</span>
                      <strong className="mt-1 block text-white">{price(order.linePrice)}</strong>
                    </div>
                  </div>
                  <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400">
                    {order.selectionReasons.slice(0, 6).map((reason) => (
                      <li key={reason}>• {reason}</li>
                    ))}
                  </ul>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
                目前沒有待處理選擇。沒有通過條件時，保留現金也是一筆正式決策。
              </div>
            )}
          </div>
        </article>

        <article className="rounded-3xl border border-emerald-400/20 bg-slate-900/80 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold text-white">模擬持股</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">
                一般目標為費稅滑價後淨利 10%，停損先設 10%。
              </p>
            </div>
            <span className="rounded-full bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100">
              {dashboard.openTrades.length} 檔
            </span>
          </div>
          <div className="mt-5 space-y-3">
            {dashboard.openTrades.length ? (
              dashboard.openTrades.map((trade) => (
                <div
                  className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"
                  key={trade.id}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-xs text-slate-500">
                        {trade.entryDate} 盤後假設買進 · {trade.shares} 股
                      </span>
                      <Link
                        className="mt-1 block text-lg font-semibold text-white hover:text-cyan-200"
                        href={`/stocks/${trade.symbol}`}
                      >
                        {trade.symbol} {trade.name}
                      </Link>
                    </div>
                    <strong className={returnColor(trade.unrealizedReturnPercent)}>
                      {percent(trade.unrealizedReturnPercent)}
                    </strong>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                    {[
                      ["買進價", price(trade.entryPrice)],
                      ["目前收盤價", price(trade.currentPrice)],
                      ["10% 防守價", price(trade.stopPrice)],
                      ["淨利 10% 目標價", price(trade.targetPrice)],
                    ].map(([label, value]) => (
                      <div className="rounded-xl bg-slate-900 p-3" key={label}>
                        <span className="block text-xs text-slate-500">{label}</span>
                        <strong className="mt-1 block text-white">{value}</strong>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                    <span>最高有利 {percent(trade.maximumFavorablePercent)}</span>
                    <span>最大不利 {percent(trade.maximumAdversePercent)}</span>
                    <span>持有 {trade.holdingDays} 個交易日</span>
                  </div>
                  {trade.queuedExitReason ? (
                    <div className="mt-3 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                      已於 {trade.queuedExitSignalDate} 判定「{exitReason(trade.queuedExitReason)}」，下一交易日開盤紙上出場。
                    </div>
                  ) : null}
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
                目前沒有模擬持股。下一次盤後若有標的通過，會以當日收盤價直接列為假設成交。
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
        <h2 className="text-xl font-semibold text-white">自主決策紀錄</h2>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          買、賣、取消與觀望都記錄；無法用事後結果刪除失敗判斷。
        </p>
        <div className="mt-5 space-y-3">
          {dashboard.decisions.map((decision) => (
            <article
              className="rounded-2xl border border-slate-800 bg-slate-950/55 p-4"
              key={decision.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-xs text-slate-500">{decision.marketDate}</span>
                  <strong className="ml-3 text-sm text-white">
                    {decision.actionSummary}
                  </strong>
                </div>
                <span className="text-xs text-slate-500">
                  候選 {decision.candidatesEvaluated} · 總資產 {money(decision.equity)}
                </span>
              </div>
              <ul className="mt-3 space-y-1 text-xs leading-5 text-slate-400">
                {decision.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </article>
          ))}
          {!dashboard.decisions.length ? (
            <div className="rounded-2xl border border-dashed border-slate-700 px-5 py-10 text-center text-sm text-slate-500">
              首次同步後會建立第一筆正式決策紀錄。
            </div>
          ) : null}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <article className="rounded-3xl border border-cyan-400/20 bg-slate-900/80 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-white">目前操作契約</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li>• 起始資金 50 萬；每筆最多使用當下總資產 10%，不是固定 5 萬。</li>
            <li>• 最多同時 3 檔，單日最多新增 2 檔，避免持股越買越亂。</li>
            <li>• 盤後資料完成後立即選股；所有入選標的固定以當日收盤價假設成交，不模擬排隊順位。</li>
            <li>• 一般目標為費稅與滑價後淨利 10%；一般停損為買進價下方 10%。</li>
            <li>• 曾漲至少 5% 後出現黑 K 與動能弱化，可在隔日開盤提前獲利。</li>
            <li>• 買進前 5 日若黑 K 收破前一根最低價，可在隔日開盤提前止損。</li>
          </ul>
        </article>
        <article className="rounded-3xl border border-amber-400/20 bg-slate-900/80 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-amber-100">成本與保守假設</h2>
          <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-300">
            <li>• 買進固定採當日收盤價、不另加滑價；賣出計 0.1% 保守滑價，另計券商手續費與證交稅。</li>
            <li>• 同一根 K 同時碰到停損與目標時，保守視為先停損。</li>
            <li>• 依收盤 K 棒判斷的提前離場，一律下一交易日開盤才成交。</li>
            <li>• 這個區域不串券商、不讀取你的真實持股，也不會產生任何真實委託。</li>
          </ul>
        </article>
      </section>

      {dashboard.history.length ? (
        <section className="rounded-3xl border border-slate-800 bg-slate-900/80 p-5 sm:p-6">
          <h2 className="text-xl font-semibold text-white">已完成模擬交易</h2>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs text-slate-500">
                <tr>
                  <th className="px-3 py-2">股票</th>
                  <th className="px-3 py-2">買進／賣出</th>
                  <th className="px-3 py-2">結果</th>
                  <th className="px-3 py-2">出場原因</th>
                  <th className="px-3 py-2">版本</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.history.map((trade) => (
                  <tr className="border-t border-slate-800" key={trade.id}>
                    <td className="px-3 py-3 text-white">
                      {trade.symbol} {trade.name}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {trade.entryDate}／{trade.exitDate}
                    </td>
                    <td
                      className={`px-3 py-3 font-semibold ${returnColor(
                        trade.realizedReturnPercent,
                      )}`}
                    >
                      {percent(trade.realizedReturnPercent)} · {money(trade.realizedProfit ?? 0)}
                    </td>
                    <td className="px-3 py-3 text-slate-300">
                      {exitReason(trade.exitReason)}
                    </td>
                    <td className="px-3 py-3 text-slate-500">
                      {trade.strategyVersion}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="text-center text-xs text-slate-600">
        資料至 {dashboard.dataAsOf} · 策略版本 {dashboard.account.strategyVersion}
      </p>
    </div>
  );
}
