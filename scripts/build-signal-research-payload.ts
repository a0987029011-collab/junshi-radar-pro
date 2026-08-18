import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  getScannableSnapshotProfiles,
  marketSnapshotMeta,
} from "../lib/market-data.ts";
import { buildSignalResearchObservations } from "../lib/signal-research.ts";
import { buildSignalResearchPayload } from "../lib/signal-research-payload.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data", "signal-research-payload.json");
const observations = buildSignalResearchObservations(
  getScannableSnapshotProfiles(),
);
const payload = buildSignalResearchPayload(observations, marketSnapshotMeta);

await writeFile(outputPath, JSON.stringify(payload), "utf8");

console.log(
  `Wrote data/signal-research-payload.json: ${payload.summary.totalSamples} observations as of ${payload.dataAsOf}`,
);
