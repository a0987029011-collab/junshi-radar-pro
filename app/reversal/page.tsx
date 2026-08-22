import type { Metadata } from "next";
import { RadarShell } from "../../components/RadarShell";
import ReversalRadarDashboard from "../../components/ReversalRadarDashboard";

export const metadata: Metadata = { title: "轉勢雷達" };

export default function ReversalRadarPage() {
  return (
    <RadarShell activePath="/reversal">
      <ReversalRadarDashboard />
    </RadarShell>
  );
}
