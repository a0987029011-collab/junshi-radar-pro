import type { Metadata } from "next";
import { PositionManager } from "../../components/PositionManager";
import { RadarShell } from "../../components/RadarShell";
import { getMarketCandles } from "../../lib/market-data";

export const metadata: Metadata = { title: "持股風控" };

export default function PositionsPage() {
  const wanHaiCandles = getMarketCandles("2615", "day", "adjusted") ?? [];
  const currentPrice = wanHaiCandles.at(-1)?.close ?? 85;
  return (
    <RadarShell activePath="/positions">
      <div className="page-heading">
        <div className="eyebrow">Risk Desk</div>
        <h1>持股與風控</h1>
        <p>先定義哪裡看錯，再決定能買多少。</p>
      </div>
      <PositionManager
        classification="Watch"
        currentPrice={currentPrice}
        targetPrice={Number((currentPrice * 1.07).toFixed(2))}
      />
      <section className="section dashboard-grid">
        <article className="panel info-card">
          <h3>預設資金規則</h3>
          <div className="position-line"><span>總資金</span><strong>600,000</strong></div>
          <div className="position-line"><span>單檔預設投入</span><strong>60,000</strong></div>
          <div className="position-line"><span>單筆最大停損</span><strong>12,000</strong></div>
        </article>
        <article className="panel info-card">
          <h3>這筆交易的假設</h3>
          <ul className="signal-list">
            <li><span className="signal-check">1</span><span>突破下降趨勢線後第一次整理進場。</span></li>
            <li><span className="signal-check">2</span><span>82 元為前一根關鍵 K 棒低點。</span></li>
            <li><span className="signal-check">3</span><span>跌破代表短線結構失效，重新等待。</span></li>
          </ul>
        </article>
      </section>
    </RadarShell>
  );
}
