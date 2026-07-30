"use client";

import { useEffect, useState } from "react";
import strategy from "../config/strategy.json";

type WeightKey = keyof typeof strategy.weights;

const labels: Record<WeightKey, string> = {
  monthlyTrend: "月線趨勢",
  weeklyTrend: "週線趨勢",
  dailyBreakout: "日線突破",
  macd: "MACD",
  dpo: "DPO",
  keyLevel: "關鍵價位",
  chipStructure: "籌碼結構"
};

export function StrategyEditor() {
  const [weights, setWeights] = useState(strategy.weights);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("junshi-strategy-weights");
    // Device-local data can only be hydrated after the component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setWeights(JSON.parse(stored));
  }, []);

  const total = Object.values(weights).reduce(
    (sum, value) => sum + Number(value),
    0
  );

  function update(key: WeightKey, value: string) {
    setSaved(false);
    setWeights((current) => ({ ...current, [key]: Number(value) }));
  }

  function save() {
    localStorage.setItem(
      "junshi-strategy-weights",
      JSON.stringify(weights)
    );
    setSaved(true);
  }

  function reset() {
    setWeights(strategy.weights);
    localStorage.removeItem("junshi-strategy-weights");
    setSaved(false);
  }

  return (
    <article className="panel info-card">
      <div className="section-head">
        <div>
          <h2>100 分權重</h2>
          <p>此裝置上的人工調整；正式掃描可讀同一份設定</p>
        </div>
        <span className={`badge ${
          total === 100 ? "badge-seed" : "badge-a"
        }`}>
          合計 {total}
        </span>
      </div>
      <div className="settings-list">
        {(Object.keys(weights) as WeightKey[]).map((key) => (
          <div className="setting-row" key={key}>
            <div>
              <strong>{labels[key]}</strong>
              <span>目前預設 {strategy.weights[key]} 分</span>
            </div>
            <input
              aria-label={`${labels[key]}權重`}
              max="100"
              min="0"
              onChange={(event) => update(key, event.target.value)}
              type="number"
              value={weights[key]}
            />
          </div>
        ))}
      </div>
      {total !== 100 && (
        <div className="notice">總分目前不是 100，儲存前建議重新分配。</div>
      )}
      <div className="button-row">
        <button className="primary-button" onClick={save} type="button">
          {saved ? "已儲存" : "儲存權重"}
        </button>
        <button className="secondary-button" onClick={reset} type="button">
          還原預設
        </button>
      </div>
    </article>
  );
}
