"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import strategy from "../config/strategy.json";
import type { Classification, ScannedStock } from "../lib/types";
import { estimatePosition } from "../lib/risk-calculator";
import {
  ClassificationBadge,
  formatPrice,
  MaturityBar
} from "./StockUI";
import { ReviewControls } from "./ReviewControls";

const filters: { value: "All" | Classification; label: string }[] = [
  { value: "All", label: "全部" },
  { value: "S", label: "S 級" },
  { value: "A", label: "A 級" },
  { value: "A+", label: "A+" },
  { value: "Seed", label: "Seed" },
  { value: "Watch", label: "觀察" }
];

export function RadarDashboard({ stocks }: { stocks: ScannedStock[] }) {
  const [filter, setFilter] = useState<"All" | Classification>("All");
  const visible = useMemo(
    () =>
      filter === "All"
        ? stocks
        : stocks.filter((stock) => stock.classification === filter),
    [filter, stocks]
  );
  const counts = filters.slice(1).map((item) => ({
    ...item,
    count: stocks.filter((stock) => stock.classification === item.value).length
  }));
  const wanHai = stocks.find((stock) => stock.symbol === "2615")!;
  const dataAsOf = stocks[0]?.dataAsOf ?? "—";
  const position = estimatePosition(
    {
      shares: 352,
      entryPrice: 85.3,
      currentPrice: wanHai.currentPrice,
      stopPrice: 82,
      targetPrice: wanHai.firstTarget
    },
    strategy.risk
  );

  return (
    <>
      <section className="hero">
        <div className="eyebrow">今日策略台 · MVP</div>
        <h1>只打最漂亮的第一槍。</h1>
        <p>
          現有 7 檔候選已改用一致的五年歷史重新計算，最新開高低收量逐檔與
          TWSE 核對。分類會隨資料改變，不再沿用原本的示範結論。
        </p>
        <div className="hero-note">
          盤後資料截至 {dataAsOf}｜籌碼尚未接入，不作自動下單
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>雷達概況</h2>
            <p>通過股本與日均量門檻後的候選數</p>
          </div>
          <Link className="text-link" href="/strategy">調整策略 →</Link>
        </div>
        <div className="count-grid">
          {counts.map((item) => (
            <button
              className="count-card"
              key={item.value}
              onClick={() => setFilter(item.value)}
              type="button"
            >
              <ClassificationBadge
                classification={item.value as Classification}
              />
              <strong>{item.count}</strong>
              <span>待人工審核</span>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <h2>已核對候選排行榜</h2>
            <p>總分 100 + 結構品質 20，依綜合強度排序</p>
          </div>
          <span className="eyebrow">{visible.length} 檔</span>
        </div>
        <div className="rank-panel">
          <div className="filter-row" role="tablist" aria-label="分類篩選">
            {filters.map((item) => (
              <button
                aria-selected={filter === item.value}
                className={`filter-button ${
                  filter === item.value ? "active" : ""
                }`}
                key={item.value}
                onClick={() => setFilter(item.value)}
                role="tab"
                type="button"
              >
                {item.label}
              </button>
            ))}
          </div>
          {visible.length ? (
            <>
              <table className="desktop-table">
                <thead>
                  <tr>
                    <th>#</th><th>股票</th><th>分類</th><th>總分</th>
                    <th>成熟度</th><th>現價</th><th>關鍵價</th>
                    <th>停損</th><th>2R 推估</th><th>R/R</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((stock, index) => (
                    <tr key={stock.symbol}>
                      <td className="rank-number">{index + 1}</td>
                      <td className="stock-cell">
                        <Link href={`/stocks/${stock.symbol}`}>
                          <div className="stock-name">{stock.name}</div>
                          <div className="stock-symbol">
                            {stock.symbol} · {stock.sector}
                          </div>
                        </Link>
                      </td>
                      <td>
                        <ClassificationBadge
                          classification={stock.classification}
                        />
                      </td>
                      <td>
                        <strong>{stock.score}</strong>
                        <span style={{ color: "var(--quiet)" }}>
                          {" "}+{stock.structureScore}
                        </span>
                      </td>
                      <td style={{ minWidth: 110 }}>
                        <MaturityBar value={stock.maturity} />
                      </td>
                      <td className={
                        stock.changePercent >= 0 ? "positive" : "negative"
                      }>
                        {formatPrice(stock.currentPrice)}
                      </td>
                      <td>{formatPrice(stock.keyLevel)}</td>
                      <td>{formatPrice(stock.stopLoss)}</td>
                      <td>{formatPrice(stock.firstTarget)}</td>
                      <td>{stock.riskReward.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="stock-list">
                {visible.map((stock) => (
                  <article className="stock-card" key={stock.symbol}>
                    <Link
                      className="stock-card-top"
                      href={`/stocks/${stock.symbol}`}
                    >
                      <div>
                        <ClassificationBadge
                          classification={stock.classification}
                        />
                        <div className="stock-name" style={{ marginTop: 9 }}>
                          {stock.name}{" "}
                          <span className="stock-symbol">{stock.symbol}</span>
                        </div>
                      </div>
                      <div className="stock-card-price">
                        <strong>{formatPrice(stock.currentPrice)}</strong>
                        <span className={
                          stock.changePercent >= 0 ? "positive" : "negative"
                        }>
                          {stock.changePercent >= 0 ? "+" : ""}
                          {stock.changePercent.toFixed(2)}%
                        </span>
                      </div>
                    </Link>
                    <MaturityBar value={stock.maturity} />
                    <div className="stock-card-metrics">
                      <div className="tiny-metric"><span>總分</span><strong>{stock.score}</strong></div>
                      <div className="tiny-metric"><span>關鍵價</span><strong>{formatPrice(stock.keyLevel)}</strong></div>
                      <div className="tiny-metric"><span>停損</span><strong>{formatPrice(stock.stopLoss)}</strong></div>
                      <div className="tiny-metric"><span>R/R</span><strong>{stock.riskReward.toFixed(1)}</strong></div>
                    </div>
                    <ReviewControls symbol={stock.symbol} />
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">這個分類目前沒有候選股。</div>
          )}
        </div>
      </section>

      <section className="section dashboard-grid">
        <article className="panel position-card">
          <div className="section-head">
            <div>
              <h3>實戰持股 · 萬海 2615</h3>
              <p>352 股，均價 85.3，結構停損 82</p>
            </div>
            <ClassificationBadge classification={wanHai.classification} />
          </div>
          <div className={`position-price ${
            position.unrealizedPnl >= 0 ? "positive" : "negative"
          }`}>
            {position.unrealizedPnl >= 0 ? "+" : ""}
            {Math.round(position.unrealizedPnl).toLocaleString("zh-TW")} 元
          </div>
          <div className="position-line">
            <span>投入成本（含手續費）</span>
            <strong>{Math.round(position.entryCost).toLocaleString("zh-TW")}</strong>
          </div>
          <div className="position-line">
            <span>停損預估損失（含稅費）</span>
            <strong>{Math.round(position.estimatedLossAtStop).toLocaleString("zh-TW")}</strong>
          </div>
          <div className="position-line">
            <span>風控上限使用率</span>
            <strong>
              {(
                (position.estimatedLossAtStop /
                  strategy.risk.maxLossPerTrade) *
                100
              ).toFixed(1)}%
            </strong>
          </div>
          <Link
            className="primary-button"
            href="/positions"
            style={{ display: "grid", placeItems: "center", marginTop: 14 }}
          >
            打開持股風控
          </Link>
        </article>

        <article className="panel schedule-card">
          <h3>掃描節奏</h3>
          <div className="schedule-list">
            {strategy.reports.map((report) => (
              <div className="schedule-item" key={`${report.time}-${report.name}`}>
                <div className="schedule-time">{report.time}</div>
                <div>
                  <strong>{report.name}</strong>
                  <span>{report.description}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>
    </>
  );
}
