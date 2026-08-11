"use client";

import { useEffect, useMemo, useState } from "react";
import {
  calculateNetSaleProceeds,
  DEFAULT_COMMISSION_DISCOUNT,
  summarizePositionTransactions,
  type PositionTransaction
} from "../lib/position-transactions";
import type { Classification } from "../lib/types";
import { ClassificationBadge } from "./StockUI";

const BROKER_DISCOUNT_OPTIONS = [
  { value: 0.1, label: "一折" },
  { value: 0.2, label: "二折" },
  { value: 0.3, label: "三折" },
  { value: 0.5, label: "五折" },
  { value: 0.6, label: "六折" },
  { value: 1, label: "不打折" }
];

function formatPrice(value: number) {
  return value.toLocaleString("zh-TW", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(value));
}

export function PositionManager({
  symbol,
  name,
  currentPrice,
  stopPrice,
  stopSourceDate,
  classification
}: {
  symbol: string;
  name: string;
  currentPrice: number;
  stopPrice: number | null;
  stopSourceDate: string;
  classification: Classification;
}) {
  const [transactions, setTransactions] = useState<PositionTransaction[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [newShares, setNewShares] = useState("100");
  const [newPrice, setNewPrice] = useState(currentPrice.toFixed(2));
  const [sellShares, setSellShares] = useState("100");
  const [sellPrice, setSellPrice] = useState(currentPrice.toFixed(2));
  const [commissionDiscount, setCommissionDiscount] = useState(
    DEFAULT_COMMISSION_DISCOUNT
  );
  const apiUrl = `/api/positions?symbol=${encodeURIComponent(symbol)}`;

  useEffect(() => {
    const savedDiscount = Number(
      localStorage.getItem("junshi-broker-commission-discount")
    );
    const effectiveDiscount =
      Number.isFinite(savedDiscount) && savedDiscount > 0 && savedDiscount <= 1
        ? savedDiscount
        : DEFAULT_COMMISSION_DISCOUNT;
    // Device-local broker preference is applied to new transaction records.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCommissionDiscount(effectiveDiscount);
    localStorage.removeItem(`junshi-position-${symbol}`);

    let cancelled = false;
    fetch(apiUrl, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          transactions?: PositionTransaction[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "持股紀錄讀取失敗");
        if (!cancelled) {
          const nextTransactions = body.transactions ?? [];
          setTransactions(nextTransactions);
          const nextSummary = summarizePositionTransactions(
            nextTransactions,
            effectiveDiscount
          );
          if (nextSummary.totalShares > 0) {
            setSellShares(String(nextSummary.totalShares));
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : "持股紀錄讀取失敗");
        }
      })
      .finally(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiUrl, symbol]);

  const summary = useMemo(
    () => summarizePositionTransactions(transactions, commissionDiscount),
    [commissionDiscount, transactions]
  );
  const currentNetProceeds = calculateNetSaleProceeds(
    summary.totalShares,
    currentPrice,
    commissionDiscount
  );
  const unrealizedPercent =
    summary.totalCostWithFees > 0
      ? ((currentNetProceeds - summary.totalCostWithFees) /
          summary.totalCostWithFees) *
        100
      : 0;

  async function postPosition(body: Record<string, unknown>) {
    const response = await fetch("/api/positions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const data = (await response.json()) as {
      transactions?: PositionTransaction[];
      error?: string;
    };
    if (!response.ok) throw new Error(data.error ?? "持股紀錄儲存失敗");
    return data.transactions ?? [];
  }

  async function addLot() {
    setBusy(true);
    setFeedback("");
    try {
      const next = await postPosition({
        action: "buy",
        symbol,
        name,
        shares: Number(newShares),
        price: Number(newPrice),
        commissionDiscount,
        occurredAt: new Date().toISOString()
      });
      setTransactions(next);
      setSellShares(
        String(
          summarizePositionTransactions(next, commissionDiscount).totalShares
        )
      );
      setNewShares("100");
      setNewPrice(currentPrice.toFixed(2));
      setFeedback("已新增一批進場，平均進場價已重新計算。 ");
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "新增進場失敗");
    } finally {
      setBusy(false);
    }
  }

  async function sell(shares: number, sellEverything: boolean) {
    setBusy(true);
    setFeedback("");
    try {
      const next = await postPosition({
        action: "sell",
        symbol,
        name,
        shares,
        price: Number(sellPrice),
        commissionDiscount,
        occurredAt: new Date().toISOString()
      });
      setTransactions(next);
      const remainingShares = summarizePositionTransactions(
        next,
        commissionDiscount
      ).totalShares;
      setSellShares(String(remainingShares || 1));
      setFeedback(
        sellEverything
          ? "已全部賣出，成交與費稅後損益已存入交易歷史。"
          : `已分批賣出 ${shares.toLocaleString("zh-TW")} 股，剩餘 ${remainingShares.toLocaleString("zh-TW")} 股。`
      );
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "賣出紀錄失敗");
    } finally {
      setBusy(false);
    }
  }

  async function clearRecords() {
    if (!window.confirm(`確定清除 ${name} ${symbol} 的全部買進與賣出紀錄？`)) {
      return;
    }
    setBusy(true);
    setFeedback("");
    try {
      const response = await fetch(apiUrl, { method: "DELETE" });
      const data = (await response.json()) as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(data.error ?? "持股紀錄清除失敗");
      setTransactions([]);
      setSellShares("100");
      setFeedback(`已清除 ${data.deleted ?? 0} 筆持股與交易紀錄。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "持股紀錄清除失敗");
    } finally {
      setBusy(false);
    }
  }

  const hasOpenPosition = summary.totalShares > 0;

  function updateCommissionDiscount(value: number) {
    setCommissionDiscount(value);
    localStorage.setItem(
      "junshi-broker-commission-discount",
      String(value)
    );
  }

  return (
    <section className="panel info-card position-manager">
      <div className="section-head">
        <div>
          <h2>{name} {symbol}</h2>
          <p>分批進場自動計算均價，停損跟隨最近有效防守線</p>
        </div>
        <ClassificationBadge classification={classification} />
      </div>

      <div className="position-summary-card" aria-label="持股摘要">
        <div><span>股數</span><strong>{summary.totalShares.toLocaleString("zh-TW")}</strong></div>
        <div><span>平均進場價</span><strong>{summary.averageEntryPrice > 0 ? formatPrice(summary.averageEntryPrice) : "—"}</strong></div>
        <div><span>目前價格</span><strong>{formatPrice(currentPrice)}</strong></div>
        <div><span>自動停損價</span><strong>{stopPrice === null ? "—" : formatPrice(stopPrice)}</strong></div>
        <div className="position-total-cost"><span>持股總成本（含手續費）</span><strong>{summary.totalShares > 0 ? `$${formatPrice(summary.totalCostWithFees)}` : "—"}</strong></div>
      </div>
      <div className="position-stop-note">
        {stopPrice === null
          ? "防守依據：目前沒有仍有效的突破水平線"
          : `防守依據：${stopSourceDate} 目前圖上趨勢線的突破紅 K 最低價`}
      </div>

      <div className="broker-discount-setting">
        <div>
          <strong>券商手續費折扣</strong>
          <span>損益已計入買賣手續費與賣出證交稅</span>
        </div>
        <label>
          <span>選擇折扣</span>
          <select
            aria-label="券商手續費折扣"
            onChange={(event) => updateCommissionDiscount(Number(event.target.value))}
            value={commissionDiscount}
          >
            {BROKER_DISCOUNT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="position-performance">
        <span>預估浮動損益率（含費稅）</span>
        <strong className={unrealizedPercent >= 0 ? "positive" : "negative"}>
          {unrealizedPercent >= 0 ? "+" : ""}{unrealizedPercent.toFixed(2)}%
        </strong>
      </div>

      <section className="position-action-card">
        <div className="position-action-head">
          <div><strong>分批進場</strong><span>每一批股數與成交價都會保留</span></div>
          <em>自動均價</em>
        </div>
        <div className="position-entry-row">
          <label>
            <span>新增股數</span>
            <input aria-label="新增股數" min="1" onChange={(event) => setNewShares(event.target.value)} step="1" type="number" value={newShares} />
          </label>
          <label>
            <span>買進價</span>
            <input aria-label="買進價" min="0.01" onChange={(event) => setNewPrice(event.target.value)} step="0.05" type="number" value={newPrice} />
          </label>
          <button className="primary-button" disabled={busy} onClick={addLot} type="button">＋ 新增一批</button>
        </div>
        <div className="position-lot-list">
          {summary.activeBuys.map((transaction, index) => (
            <div className="position-lot-row" key={transaction.id}>
              <span>第 {index + 1} 批 · {formatDate(transaction.occurredAt)}</span>
              <strong>{transaction.shares.toLocaleString("zh-TW")} 股 × {formatPrice(transaction.price)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="position-action-card position-sell-card">
        <div className="position-action-head">
          <div><strong>賣出紀錄</strong><span>可分批賣出，也可一次全部賣出</span></div>
        </div>
        <div className="position-sell-row">
          <label>
            <span>賣出股數</span>
            <input aria-label="賣出股數" max={summary.totalShares || undefined} min="1" onChange={(event) => setSellShares(event.target.value)} step="1" type="number" value={sellShares} />
          </label>
          <label>
            <span>實際賣出價</span>
            <input aria-label="實際賣出價" min="0.01" onChange={(event) => setSellPrice(event.target.value)} step="0.05" type="number" value={sellPrice} />
          </label>
          <div className="position-sell-actions">
            <button className="position-sell-button" disabled={busy || !hasOpenPosition} onClick={() => sell(Number(sellShares), false)} type="button">分批賣出</button>
            <button className="position-sell-button sell-all" disabled={busy || !hasOpenPosition} onClick={() => sell(summary.totalShares, true)} type="button">全部賣出</button>
          </div>
        </div>
      </section>

      {summary.saleHistory.length > 0 ? (
        <section className="position-history">
          <strong>最近賣出歷史</strong>
          {summary.saleHistory.slice(-3).reverse().map(({ transaction, returnPercent }) => (
            <div key={transaction.id}>
              <span>{formatDate(transaction.occurredAt)} · {transaction.shares.toLocaleString("zh-TW")} 股 · {formatPrice(transaction.price)} 元</span>
              <em className={returnPercent >= 0 ? "positive" : "negative"}>{returnPercent >= 0 ? "+" : ""}{returnPercent.toFixed(2)}%</em>
            </div>
          ))}
        </section>
      ) : null}

      {!loaded ? <div className="position-feedback">正在讀取持股歷史…</div> : null}
      {feedback ? <div className="position-feedback" role="status">{feedback}</div> : null}
      <div className="notice">
        買進與賣出成交會保存為歷史資料，供後續檢查分批進場、停損與實際報酬。
      </div>
      {loaded && transactions.length > 0 ? (
        <button
          className="text-link position-clear-button"
          disabled={busy}
          onClick={clearRecords}
          type="button"
        >
          清除這檔全部紀錄
        </button>
      ) : null}
    </section>
  );
}
