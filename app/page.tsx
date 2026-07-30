import { RadarDashboard } from "../components/RadarDashboard";
import { RadarShell } from "../components/RadarShell";
import { scanMarket } from "../lib/scoring-engine";

export default function Home() {
  const stocks = scanMarket();
  return (
    <RadarShell activePath="/">
      <RadarDashboard stocks={stocks} />
    </RadarShell>
  );
}
