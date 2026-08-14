import type { Metadata } from "next";
import { RadarShell } from "../../components/RadarShell";
import SignalResearchDashboard from "../../components/SignalResearchDashboard";
import { ClosedPositionResearch } from "../../components/ClosedPositionResearch";

export const metadata: Metadata = { title: "訊號歷史研究" };

export default function ResearchPage() {
  return (
    <RadarShell activePath="/research">
      <div className="page-heading">
        <div className="eyebrow">Research Lab</div>
        <h1>軍師訊號研究後台</h1>
        <p>不需要投入真實資金；每個訊號先累積成可核對的紙上觀察樣本。</p>
      </div>
      <ClosedPositionResearch />
      <SignalResearchDashboard />
    </RadarShell>
  );
}
