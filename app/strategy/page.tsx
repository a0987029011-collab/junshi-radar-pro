import type { Metadata } from "next";
import { RadarShell } from "../../components/RadarShell";
import strategy from "../../config/strategy.json";

export const metadata: Metadata = { title: "多波段策略" };

const waveRules = strategy.patterns.multiWaveCycle;

export default function StrategyPage() {
  return (
    <RadarShell activePath="/strategy">
      <div className="page-heading">
        <div className="eyebrow">Multi-wave Strategy</div>
        <h1>下降趨勢線多波段策略</h1>
        <p>第一波不被後續波段覆蓋；賣出持股後，保留大結構等待第二波。</p>
      </div>

      <section className="panel info-card strategy-wave-hero">
        <div>
          <span className="badge badge-s">唯一正式策略</span>
          <h2>同一個大結構，可以依序出現第一波、第二波與後續波段</h2>
          <p>
            每一組 H1→H2 都獨立保存。第一波突破紅 K 的低點是整段行情生命線；
            只要收盤未跌破，途中賣出也不會清除第一波背景。
          </p>
        </div>
        <div className="strategy-wave-switches" aria-label="多波段策略狀態">
          <div><span>保留前波紀錄</span><strong>{waveRules.appendNewWaveWithoutReplacingHistory ? "開啟" : "關閉"}</strong></div>
          <div><span>賣出後保留結構</span><strong>{waveRules.preserveParentWaveAfterPositionExit ? "開啟" : "關閉"}</strong></div>
          <div><span>跌破判定</span><strong>收盤跌破生命線</strong></div>
        </div>
      </section>

      <section className="strategy-wave-flow" aria-label="多波段策略流程">
        <article className="panel info-card">
          <span className="strategy-wave-number">1</span>
          <h3>第一波成立</h3>
          <p>下降 H1→H2、紅 K 收盤站線，MACD 與 DPO 條件同時確認。</p>
          <strong>保存第一波突破紅 K 低點</strong>
        </article>
        <article className="panel info-card">
          <span className="strategy-wave-number">2</span>
          <h3>持有或先賣出</h3>
          <p>持股狀態與訊號結構分開。賣到零股，只改成「等待下一波」。</p>
          <strong>不刪除第一波生命線</strong>
        </article>
        <article className="panel info-card">
          <span className="strategy-wave-number">3</span>
          <h3>第二波再觸發</h3>
          <p>第一波生命線未破，且市場形成新的下降 H1→H2，再次等紅 K 與指標確認。</p>
          <strong>新增近端防守，不覆蓋第一波</strong>
        </article>
      </section>

      <div className="dashboard-grid strategy-wave-detail-grid">
        <article className="panel info-card">
          <h3>每一波的五項確認</h3>
          <ul className="signal-list">
            <li><span className="signal-check">1</span><span>前一波生命線仍未被收盤跌破</span></li>
            <li><span className="signal-check">2</span><span>形成全新的下降 H1→H2，不沿用已遠離價格的舊線</span></li>
            <li><span className="signal-check">3</span><span>紅 K 收盤站上新趨勢線</span></li>
            <li><span className="signal-check">4</span><span>MACD 負柱縮短，或零軸上雙線向上</span></li>
            <li><span className="signal-check">5</span><span>DPO 前一根為低點、本根上彎</span></li>
          </ul>
        </article>

        <article className="panel info-card">
          <h3>雙層防守與失效順序</h3>
          <div className="position-line"><span>大結構防守</span><strong>第一波突破 K 低點</strong></div>
          <div className="position-line"><span>近端防守</span><strong>最新一波突破 K 低點</strong></div>
          <div className="position-line"><span>近端跌破</span><strong>最新波失效，第一波可仍存活</strong></div>
          <div className="position-line"><span>第一波跌破</span><strong>整個週期歸零</strong></div>
          <div className="notice">
            防守跌破以後續 K 棒收盤低於突破紅 K 低點判定，不以盤中影線單獨判死刑。
          </div>
        </article>
      </div>

      <section className="section panel info-card strategy-case-study">
        <div className="section-head">
          <div>
            <h2>2637 慧洋-KY｜邏輯學習案例</h2>
            <p>這個案例用來校正「第二波不能覆蓋第一波」的策略規則。</p>
          </div>
          <span className="badge badge-seed">多波段</span>
        </div>
        <div className="strategy-case-grid">
          <div>
            <span>第一波</span>
            <strong>2022-05 H1 → 2023-10 H2</strong>
            <small>2023-11 突破｜大結構生命線 35.17</small>
          </div>
          <div>
            <span>第二波</span>
            <strong>2025-03 H1 → 2025-06 H2</strong>
            <small>2025-07 突破｜近端生命線 50.52</small>
          </div>
          <div>
            <span>正確解讀</span>
            <strong>第二波新增，不取代第一波</strong>
            <small>35.17 未破，第一波大結構持續有效</small>
          </div>
        </div>
      </section>

      <section className="section panel info-card">
        <h3>軍師雷達的責任邊界</h3>
        <p className="mt-2 text-slate-400">
          雷達負責保存波段、確認條件與提示風險；不會因訊號自動下單，也不會把「賣出」誤判為結構失效。
        </p>
      </section>
    </RadarShell>
  );
}
