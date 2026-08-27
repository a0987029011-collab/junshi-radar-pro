"use client";

import { type FormEvent, useEffect, useMemo, useState } from "react";
import type {
  WatchlistPositionItem,
  WatchlistStockOption
} from "../lib/watchlist";
import type { ClosedPositionCase } from "../lib/position-transactions";
import { CandleChart } from "./CandleChart";
import { PositionManager } from "./PositionManager";

export function PositionWorkspace({
  initialItem,
  initialSelectedSymbol,
  stockOptions
}: {
  initialItem: WatchlistPositionItem;
  initialSelectedSymbol?: string;
  stockOptions: WatchlistStockOption[];
}) {
  const [items, setItems] = useState<WatchlistPositionItem[]>([initialItem]);
  const [selectedSymbol, setSelectedSymbol] = useState(
    initialSelectedSymbol ?? initialItem.symbol
  );
  const [feedback, setFeedback] = useState("正在同步追蹤清單…");
  const [manualSymbol, setManualSymbol] = useState("");
  const [manualName, setManualName] = useState("");
  const [adding, setAdding] = useState(false);
  const stockOptionMap = useMemo(
    () => new Map(stockOptions.map((item) => [item.symbol, item])),
    [stockOptions]
  );

  useEffect(() => {
    let cancelled = false;
    fetch("/api/watchlist", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as {
          items?: WatchlistPositionItem[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "追蹤清單讀取失敗");
        if (cancelled) return;
        const nextItems = body.items ?? [];
        setItems(nextItems);
        setSelectedSymbol((current) =>
          nextItems.some((item) => item.symbol === current)
            ? current
            : nextItems[0]?.symbol ?? ""
        );
        setFeedback("");
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFeedback(error instanceof Error ? error.message : "追蹤清單讀取失敗");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [initialItem]);

  const selected = items.find((item) => item.symbol === selectedSymbol) ?? null;

  function removeItem(symbol: string, feedbackMessage?: string) {
    const remaining = items.filter((item) => item.symbol !== symbol);
    setItems(remaining);
    if (remaining.length === 0) {
      setSelectedSymbol("");
      setFeedback(
        feedbackMessage ?? "已刪除誤選的持股與全部交易紀錄。"
      );
      return;
    }
    setSelectedSymbol(remaining[0].symbol);
    setFeedback(
      feedbackMessage ?? "已刪除誤選的持股與全部交易紀錄。"
    );
  }

  function closeItem(symbol: string, closedCase: ClosedPositionCase) {
    removeItem(
      symbol,
      `${closedCase.name} 已全部賣出並歸檔；實際淨損益 ${
        closedCase.realizedReturnPercent >= 0 ? "+" : ""
      }${closedCase.realizedReturnPercent.toFixed(2)}%，${
        closedCase.targetReached ? "已達成短期 +10% 目標" : "未達短期 +10% 目標"
      }。`
    );
  }

  function updateManualSymbol(value: string) {
    const symbol = value.replace(/\D/g, "").slice(0, 6);
    const matched = stockOptionMap.get(symbol);
    setManualSymbol(symbol);
    setManualName(matched?.name ?? "");
  }

  async function addManualPosition(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const symbol = manualSymbol.trim();
    const name = manualName.trim();
    if (!/^\d{4,6}$/.test(symbol)) {
      setFeedback("請輸入 4 至 6 碼股票代號。");
      return;
    }
    if (!name) {
      setFeedback("目前資料找不到股票名稱，請補上股票名稱後再加入。");
      return;
    }
    const existing = items.find((item) => item.symbol === symbol);
    if (existing) {
      setSelectedSymbol(symbol);
      setFeedback(`${existing.name} 已經在追蹤與持股清單中。`);
      return;
    }

    setAdding(true);
    try {
      const response = await fetch("/api/watchlist", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol, name })
      });
      const body = (await response.json()) as {
        items?: WatchlistPositionItem[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error ?? "新增持股失敗");
      const nextItems = body.items ?? [];
      setItems(nextItems);
      setSelectedSymbol(symbol);
      setManualSymbol("");
      setManualName("");
      setFeedback(`${name} 已加入；請在下方填入第一批股數、買價與買入日期。`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "新增持股失敗");
    } finally {
      setAdding(false);
    }
  }

  return (
    <>
      <section className="panel position-watch-panel">
        <div>
          <strong>追蹤與持股</strong>
          <span>追蹤股票會先進入待登錄；填入第一批股數與買價後才成為正式持股。</span>
        </div>
        <form className="position-manual-add" onSubmit={addManualPosition}>
          <div className="position-manual-add-heading">
            <strong>自行新增持股</strong>
            <span>推薦隔天消失也沒關係，輸入股票代號即可重新加入。</span>
          </div>
          <div className="position-manual-add-fields">
            <label>
              <span>股票代號</span>
              <input
                aria-label="股票代號"
                autoComplete="off"
                inputMode="numeric"
                list="position-stock-options"
                onChange={(event) => updateManualSymbol(event.target.value)}
                placeholder="例如 1808"
                value={manualSymbol}
              />
            </label>
            <label>
              <span>股票名稱</span>
              <input
                aria-label="股票名稱"
                onChange={(event) => setManualName(event.target.value)}
                placeholder="輸入代號後自動帶入"
                value={manualName}
              />
            </label>
            <button disabled={adding} type="submit">
              {adding ? "新增中…" : "＋ 加入追蹤／持股"}
            </button>
          </div>
          <datalist id="position-stock-options">
            {stockOptions.map((item) => (
              <option key={item.symbol} value={item.symbol}>
                {item.name}
              </option>
            ))}
          </datalist>
        </form>
        <div aria-label="追蹤股票" className="position-symbol-tabs" role="tablist">
          {items.map((item) => (
            <button
              aria-selected={selected?.symbol === item.symbol}
              className={selected?.symbol === item.symbol ? "active" : ""}
              key={item.symbol}
              onClick={() => setSelectedSymbol(item.symbol)}
              role="tab"
              type="button"
            >
              {item.name} <span>{item.symbol}</span>
            </button>
          ))}
        </div>
        {feedback ? <small aria-live="polite">{feedback}</small> : null}
      </section>

      {selected ? (
        <>
          <PositionManager
            classification={selected.classification}
            currentPrice={selected.currentPrice}
            key={selected.symbol}
            name={selected.name}
            onClosed={closeItem}
            onDelete={removeItem}
            stopPrice={selected.stopPrice}
            stopSourceDate={selected.stopSourceDate}
            symbol={selected.symbol}
          />

          <section className="position-market-observation">
            <div className="panel position-market-heading">
              <div>
                <strong>持股盤面觀察</strong>
                <span>{selected.name} {selected.symbol}｜直接查看日、週、月 K 與目前防守線</span>
              </div>
            </div>
            <CandleChart key={selected.symbol} symbol={selected.symbol} />
          </section>
        </>
      ) : (
        <section className="panel info-card">
          <h2>目前沒有持股或追蹤股票</h2>
          <p>全部賣完的股票會自動從這裡移除，交易結果仍保留在研究資料庫。</p>
        </section>
      )}
    </>
  );
}
