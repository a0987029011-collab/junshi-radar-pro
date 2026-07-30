"use client";

import { useEffect, useMemo, useState } from "react";
import strategy from "../config/strategy.json";
import { estimatePosition } from "../lib/risk-calculator";
import type { Classification } from "../lib/types";
import { ClassificationBadge } from "./StockUI";

interface PositionDraft {
  symbol: string;
  name: string;
  shares: number;
  entryPrice: number;
  currentPrice: number;
  stopPrice: number;
  targetPrice: number;
}

export function PositionManager({
  currentPrice,
  targetPrice,
  classification
}: {
  currentPrice: number;
  targetPrice: number;
  classification: Classification;
}) {
  const defaultPosition: PositionDraft = {
    symbol: "2615",
    name: "萬海",
    shares: 352,
    entryPrice: 85.3,
    currentPrice,
    stopPrice: 82,
    targetPrice
  };
  const [draft, setDraft] = useState<PositionDraft>(defaultPosition);

  useEffect(() => {
    const saved = localStorage.getItem("junshi-position-2615");
    if (saved) {
      // Device-local data can only be hydrated after the component mounts.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDraft({
        ...JSON.parse(saved),
        currentPrice,
        targetPrice
      });
    }
  }, [currentPrice, targetPrice]);

  const result = useMemo(
    () =>
      estimatePosition(
        {
          shares: Number(draft.shares),
          entryPrice: Number(draft.entryPrice),
          currentPrice: Number(draft.currentPrice),
          stopPrice: Number(draft.stopPrice),
          targetPrice: Number(draft.targetPrice)
        },
        strategy.risk
      ),
    [draft]
  );

  function update(key: keyof PositionDraft, value: string) {
    setDraft((current) => ({
      ...current,
      [key]: key === "symbol" || key === "name" ? value : Number(value)
    }));
  }

  function save() {
    localStorage.setItem("junshi-position-2615", JSON.stringify(draft));
  }

  return (
    <section className="panel info-card">
      <div className="section-head">
        <div>
          <h2>{draft.name} {draft.symbol}</h2>
          <p>前一根關鍵 K 低點作為結構停損</p>
        </div>
        <ClassificationBadge classification={classification} />
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label htmlFor="shares">股數</label>
          <input id="shares" min="1" onChange={(e) => update("shares", e.target.value)} type="number" value={draft.shares} />
        </div>
        <div className="form-field">
          <label htmlFor="entry">平均進場價</label>
          <input id="entry" min="0" onChange={(e) => update("entryPrice", e.target.value)} step="0.05" type="number" value={draft.entryPrice} />
        </div>
        <div className="form-field">
          <label htmlFor="current">目前價格（手動）</label>
          <input id="current" min="0" onChange={(e) => update("currentPrice", e.target.value)} step="0.05" type="number" value={draft.currentPrice} />
        </div>
        <div className="form-field">
          <label htmlFor="stop">停損價</label>
          <input id="stop" min="0" onChange={(e) => update("stopPrice", e.target.value)} step="0.05" type="number" value={draft.stopPrice} />
        </div>
        <div className="form-field">
          <label htmlFor="target">第一目標價</label>
          <input id="target" min="0" onChange={(e) => update("targetPrice", e.target.value)} step="0.05" type="number" value={draft.targetPrice} />
        </div>
      </div>
      <div className="risk-result-grid">
        <div className="result-card">
          <span>投入成本</span>
          <strong>{Math.round(result.entryCost).toLocaleString("zh-TW")} 元</strong>
        </div>
        <div className="result-card">
          <span>浮動損益（估）</span>
          <strong className={result.unrealizedPnl >= 0 ? "positive" : "negative"}>
            {result.unrealizedPnl >= 0 ? "+" : ""}
            {Math.round(result.unrealizedPnl).toLocaleString("zh-TW")} 元
          </strong>
        </div>
        <div className="result-card">
          <span>停損損失（含稅費）</span>
          <strong>{Math.round(result.estimatedLossAtStop).toLocaleString("zh-TW")} 元</strong>
        </div>
        <div className="result-card">
          <span>淨風險報酬比</span>
          <strong>{result.riskReward.toFixed(2)}</strong>
        </div>
        <div className="result-card">
          <span>剩餘虧損額度</span>
          <strong>{Math.round(result.remainingLossBudget).toLocaleString("zh-TW")} 元</strong>
        </div>
        <div className="result-card">
          <span>單筆上限檢查</span>
          <strong className={result.withinLossLimit ? "positive" : "negative"}>
            {result.withinLossLimit ? "通過" : "超標"}
          </strong>
        </div>
      </div>
      <div className="notice">
        已納入 3 折手續費、最低手續費與股票賣出證交稅。實際費率仍以券商成交回報為準。
      </div>
      <div className="button-row">
        <button className="primary-button" onClick={save} type="button">
          儲存在此裝置
        </button>
        <button
          className="secondary-button"
          onClick={() => setDraft(defaultPosition)}
          type="button"
        >
          還原萬海案例
        </button>
      </div>
    </section>
  );
}
