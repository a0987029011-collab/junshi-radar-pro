import { verifiedCandidates } from "./market-data.ts";

export function scanMarket() {
  return verifiedCandidates;
}

export function getScannedStock(symbol: string) {
  return verifiedCandidates.find((item) => item.symbol === symbol);
}
