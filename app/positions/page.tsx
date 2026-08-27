import type { Metadata } from "next";
import signalResearchPayloadJson from "../../data/signal-research-payload.json" with {
  type: "json"
};
import { PositionWorkspace } from "../../components/PositionWorkspace";
import { RadarShell } from "../../components/RadarShell";
import { verifiedCandidates } from "../../lib/market-data";
import { getPositionMarketContext } from "../../lib/position-market-context";
import type { SignalResearchPayload } from "../../lib/signal-research-payload";
import { buildWatchlistStockOptions } from "../../lib/watchlist";

export const metadata: Metadata = { title: "持股風控" };

const signalResearchPayload =
  signalResearchPayloadJson as unknown as SignalResearchPayload;
const manualStockOptions = buildWatchlistStockOptions(
  verifiedCandidates,
  signalResearchPayload.recentCases,
  signalResearchPayload.successfulCases
);

export default async function PositionsPage({
  searchParams
}: {
  searchParams: Promise<{ symbol?: string }>;
}) {
  const { symbol } = await searchParams;
  const initialItem = getPositionMarketContext({
    symbol: "2615",
    name: "萬海",
    addedAt: "2026-08-11T00:00:00.000Z"
  });
  return (
    <RadarShell activePath="/positions">
      <div className="page-heading">
        <div className="eyebrow">Risk Desk</div>
        <h1>持股與風控</h1>
        <p>先定義哪裡看錯，再決定能買多少。</p>
      </div>
      <PositionWorkspace
        initialItem={initialItem}
        initialSelectedSymbol={symbol}
        stockOptions={manualStockOptions}
      />
      <section className="section">
        <article className="panel info-card">
          <h3>追蹤轉持股流程</h3>
          <ul className="signal-list">
            <li><span className="signal-check">1</span><span>加入追蹤後先進入待登錄，不會假設你已經買進。</span></li>
            <li><span className="signal-check">2</span><span>填入第一批股數與成交價後，才開始計算正式持股。</span></li>
            <li><span className="signal-check">3</span><span>停損會自動跟隨該股最近仍有效的突破防守線。</span></li>
            <li><span className="signal-check">4</span><span>股數歸零時自動移出持股名單，完整結果保留在研究資料庫。</span></li>
          </ul>
        </article>
      </section>
    </RadarShell>
  );
}
