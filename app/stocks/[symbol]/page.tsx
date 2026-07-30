import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { CandleChart } from "../../../components/CandleChart";
import { RadarShell } from "../../../components/RadarShell";
import { ReviewControls, WatchButton } from "../../../components/ReviewControls";
import {
  ClassificationBadge,
  formatPrice,
  MaturityBar
} from "../../../components/StockUI";
import { getScannedStock } from "../../../lib/scoring-engine";

export async function generateMetadata({
  params
}: {
  params: Promise<{ symbol: string }>;
}): Promise<Metadata> {
  const { symbol } = await params;
  const stock = getScannedStock(symbol);
  return { title: stock ? `${stock.name} ${stock.symbol}` : "個股分析" };
}

export default async function StockPage({
  params
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  const stock = getScannedStock(symbol);
  if (!stock) notFound();

  return (
    <RadarShell activePath="/">
      <section className="panel detail-head">
        <div>
          <div className="detail-title-row">
            <div>
              <ClassificationBadge classification={stock.classification} />
              <h1>{stock.name}</h1>
              <p>
                {stock.symbol} · {stock.sector} · {stock.exchange ?? "TWSE"} 收盤{" "}
                {stock.dataAsOf}
              </p>
            </div>
            <div>
              <div className="detail-price">
                {formatPrice(stock.currentPrice)}
              </div>
              <div
                className={stock.changePercent >= 0 ? "positive" : "negative"}
                style={{
                  textAlign: "right",
                  fontFamily: "var(--mono)"
                }}
              >
                {stock.changePercent >= 0 ? "+" : ""}
                {stock.changePercent.toFixed(2)}%
              </div>
            </div>
          </div>
          <div style={{ marginTop: 16, maxWidth: 420 }}>
            <MaturityBar value={stock.maturity} />
          </div>
        </div>
        <div className="detail-actions">
          <WatchButton symbol={stock.symbol} />
          <a
            className="primary-button"
            href="#review"
            style={{ display: "grid", placeItems: "center" }}
          >
            開始審核
          </a>
        </div>
      </section>

      <CandleChart
        keyLevel={stock.keyLevel}
        symbol={stock.symbol}
      />

      <section className="stock-analysis-grid">
        <article className="panel info-card">
          <h3>為何入選</h3>
          <ul className="signal-list">
            {stock.reasons.map((reason) => (
              <li key={reason}>
                <span className="signal-check">✓</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel info-card">
          <h3>還缺哪些條件</h3>
          {stock.missingConditions.length ? (
            <ul className="signal-list">
              {stock.missingConditions.map((condition) => (
                <li key={condition}>
                  <span className="signal-check signal-missing">△</span>
                  <span>{condition}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 12 }}>
              目前沒有額外的自動缺漏條件；仍需人工確認畫線與交易假設。
            </p>
          )}
        </article>
        <article className="panel info-card">
          <h3>評分與結構</h3>
          <div className="score-summary">
            <div className="score-ring">
              <div style={{ textAlign: "center" }}>
                <strong>{stock.score}</strong>
                <span style={{ display: "block" }}>/ 100</span>
              </div>
            </div>
            <div className="score-copy">
              <strong>結構品質 {stock.structureScore} / 20</strong>
              <p>{stock.catalyst}</p>
            </div>
          </div>
          <div className="risk-result-grid">
            <div className="result-card">
              <span>關鍵價位</span>
              <strong>{formatPrice(stock.keyLevel)}</strong>
            </div>
            <div className="result-card">
              <span>結構停損</span>
              <strong>{formatPrice(stock.stopLoss)}</strong>
            </div>
            <div className="result-card">
              <span>2R 推估目標</span>
              <strong>{formatPrice(stock.firstTarget)}</strong>
            </div>
            <div className="result-card">
              <span>風險報酬</span>
              <strong>{stock.riskReward.toFixed(2)}</strong>
            </div>
          </div>
        </article>
        <article className="panel info-card">
          <h3>資料稽核</h3>
          <ul className="signal-list">
            {(stock.dataNotes ?? []).map((note) => (
              <li key={note}>
                <span className="signal-check">i</span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </article>
        <article className="panel info-card" id="review">
          <h3>人工最終審核</h3>
          <p style={{
            color: "var(--muted)",
            fontSize: 12,
            lineHeight: 1.7
          }}>
            自動評分只負責縮小範圍。請確認趨勢線畫法、K
            棒位置與量價結構後再決定。
          </p>
          <ReviewControls symbol={stock.symbol} />
        </article>
      </section>
    </RadarShell>
  );
}
