import type { Metadata } from "next";
import { PaperTradingDashboard } from "../../components/PaperTradingDashboard";
import { RadarShell } from "../../components/RadarShell";

export const metadata: Metadata = { title: "軍師模擬交易" };

export default function PaperTradingPage() {
  return (
    <RadarShell activePath="/paper-trading">
      <div className="page-heading">
        <div className="eyebrow">Paper Trading Lab</div>
        <h1>模擬交易</h1>
        <p>讓軍師用固定規則自己選、自己買、自己賣，成績好壞都留下。</p>
      </div>
      <PaperTradingDashboard />
    </RadarShell>
  );
}
