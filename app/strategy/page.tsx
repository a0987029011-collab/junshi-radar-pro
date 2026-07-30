import type { Metadata } from "next";
import { RadarShell } from "../../components/RadarShell";
import { StrategyEditor } from "../../components/StrategyEditor";
import strategy from "../../config/strategy.json";

export const metadata: Metadata = { title: "策略設定" };

export default function StrategyPage() {
  return (
    <RadarShell activePath="/strategy">
      <div className="page-heading">
        <div className="eyebrow">Strategy Console</div>
        <h1>策略設定</h1>
        <p>所有門檻與規則集中管理，不散落在畫面程式裡。</p>
      </div>
      <div className="dashboard-grid">
        <StrategyEditor />
        <article className="panel info-card">
          <h3>市場與風控門檻</h3>
          <div className="position-line"><span>最低股本</span><strong>20 億</strong></div>
          <div className="position-line"><span>最低日均量</span><strong>1,000 張</strong></div>
          <div className="position-line"><span>突破量能倍數</span><strong>{strategy.indicators.volume.breakoutMultiplier}×</strong></div>
          <div className="position-line"><span>拉回量比上限</span><strong>{strategy.indicators.volume.pullbackVolumeRatioMax}</strong></div>
          <div className="position-line"><span>趨勢線最少觸點</span><strong>{strategy.patterns.descendingTrendlineBreakout.minimumTouchPoints}</strong></div>
          <div className="position-line"><span>S 級最低 R/R</span><strong>{strategy.classificationRules.S.minimumRiskReward.toFixed(1)}</strong></div>
          <div className="notice">
            00632R 白線仍是 Research 因子，設定明確禁止它單獨把股票升級成正式策略。
          </div>
        </article>
      </div>

      <section className="section panel info-card">
        <h3>分類規則摘要</h3>
        <div className="settings-list" style={{ marginTop: 14 }}>
          {Object.entries(strategy.classificationRules).map(([key, rule]) => (
            <div className="setting-row" key={key}>
              <div>
                <strong>{rule.label}</strong>
                <span>
                  {"requires" in rule
                    ? rule.requires.join(" · ")
                    : `最多缺 ${rule.maximumMissingCoreConditions} 個核心條件`}
                </span>
              </div>
              <span className={`badge ${
                key === "S"
                  ? "badge-s"
                  : key === "Seed"
                    ? "badge-seed"
                    : "badge-a"
              }`}>
                {key}
              </span>
            </div>
          ))}
        </div>
      </section>
    </RadarShell>
  );
}
