import ScannerDashboard from "../components/ScannerDashboard";
import { RadarShell } from "../components/RadarShell";

export default function Home() {
  return (
    <RadarShell activePath="/">
      <ScannerDashboard />
    </RadarShell>
  );
}
