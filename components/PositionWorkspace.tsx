"use client";

import { useEffect, useState } from "react";
import type { WatchlistPositionItem } from "../lib/watchlist";
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
        const merged = [...(body.items ?? []), initialItem].filter(
          (item, index, all) =>
            all.findIndex((candidate) => candidate.symbol === item.symbol) === index
        );
        setItems(merged);
        setSelectedSymbol((current) =>
          merged.some((item) => item.symbol === current)
            ? current
            : initialItem.symbol
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

  const selected =
    items.find((item) => item.symbol === selectedSymbol) ?? initialItem;

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
              aria-selected={selected.symbol === item.symbol}
              className={selected.symbol === item.symbol ? "active" : ""}
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

      <PositionManager
        classification={selected.classification}
        currentPrice={selected.currentPrice}
        defaultLot={
          selected.symbol === "2615"
            ? { shares: 352, price: 85.3 }
            : undefined
        }
        key={selected.symbol}
        name={selected.name}
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
  );
}
