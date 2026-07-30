import type { Metadata } from "next";
import { RadarShell } from "../../components/RadarShell";

export const metadata: Metadata = { title: "00632R 因子研究" };

export default function ResearchPage() {
  return (
    <RadarShell activePath="/research">
      <div className="page-heading">
        <div className="eyebrow">Research Lab</div>
        <h1>00632R 白線研究</h1>
        <p>先觀察、再驗證，可靠後才考慮寫入正式策略。</p>
      </div>
      <section className="panel research-hero">
        <span className="badge badge-aplus">RESEARCH ONLY</span>
        <h2>個股向上穿越反 1 白線，真的更容易走出波段嗎？</h2>
        <p>
          目前還沒有完成含下市股票與交易成本的正式全市場回測，因此不顯示
          任何假設勝率。資料完整後才會產生百分比。
        </p>
        <div className="backtest-grid">
          {[
            "20 日內 +10%",
            "30 日內 +15%",
            "60 日內 +20%",
            "MACD／DPO 組合條件"
          ].map((label) => (
            <div
              className="backtest-card"
              key={label}
            >
              <span>{label}</span>
              <strong>待回測</strong>
              <span>尚未產生可採信樣本</span>
            </div>
          ))}
        </div>
      </section>
      <section className="section dashboard-grid">
        <article className="panel info-card">
          <h3>回測輸出</h3>
          <div className="position-line"><span>事件後視窗</span><strong>20 / 30 / 60 日</strong></div>
          <div className="position-line"><span>報酬門檻</span><strong>+10 / +15 / +20%</strong></div>
          <div className="position-line"><span>績效</span><strong>命中率、均報酬、最大回撤</strong></div>
          <div className="position-line"><span>可組合因子</span><strong>MACD / DPO / 縮柱 / 突破</strong></div>
        </article>
        <article className="panel info-card">
          <h3>研究防呆</h3>
          <ol className="method-list">
            <li>個股與 00632R 先用同一起點正規化，避免直接比較不同價格尺度。</li>
            <li>事件日只能使用當時已知資料，避免偷看未來。</li>
            <li>納入下市股票、交易成本與流動性門檻，避免存活者偏誤。</li>
            <li>分牛市、熊市與震盪市驗證，不能只挑好看的期間。</li>
          </ol>
        </article>
      </section>
    </RadarShell>
  );
}
