"use client";

import { useEffect, useState } from "react";
import type { WatchlistPositionItem } from "../lib/watchlist";
import type { ClosedPositionCase } from "../lib/position-transactions";
import { CandleChart } from "./CandleChart";
import { PositionManager } from "./PositionManager";

export function PositionWorkspace({
  initialItem,
  initialSelectedSymbol
}: {
  initialItem: WatchlistPositionItem;
  initialSelectedSymbol?: string;
}) {
  const [items, setItems] = useState<WatchlistPositionItem[]>([initialItem]);
  const [selectedSymbol, setSelectedSymbol] = useState(
    initialSelectedSymbol ?? initialItem.symbol
  );
  const [feedback, setFeedback] = useState("正在同步追蹤清單…");

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

  return (
    <>
      <section className="panel position-watch-panel">
        <div>
          <strong>追蹤與持股</strong>
          <span>追蹤股票會先進入待登錄；填入第一批股數與買價後才成為正式持股。</span>
        </div>
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
        {feedback ? <small>{feedback}</small> : null}
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
