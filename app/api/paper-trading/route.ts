import signalResearchPayloadJson from "../../../data/signal-research-payload.json" with {
  type: "json",
};
import {
  getMarketCandles,
  marketSnapshotMeta,
  verifiedMarketSymbols,
} from "../../../lib/market-data";
import {
  advancePaperTradingState,
  buildPaperTradingDashboard,
  type PaperMarketProfile,
} from "../../../lib/paper-trading";
import type { SignalResearchPayload } from "../../../lib/signal-research-payload";

const payload = signalResearchPayloadJson as unknown as SignalResearchPayload;

function marketProfiles(): PaperMarketProfile[] {
  return verifiedMarketSymbols.flatMap((symbol) => {
    const candles = getMarketCandles(symbol, "day", "adjusted");
    return candles?.length ? [{ symbol, candles }] : [];
  });
}

function errorResponse(error: unknown) {
  const message =
    error instanceof Error ? error.message : "模擬交易資料處理失敗";
  return Response.json({ error: message }, { status: 500 });
}

export async function GET() {
  try {
    const profiles = marketProfiles();
    const { loadD1PaperTradingState } = await import(
      "../../../lib/paper-trading-store.d1"
    );
    const state = await loadD1PaperTradingState();
    return Response.json(
      buildPaperTradingDashboard(
        state,
        profiles,
        marketSnapshotMeta.dataAsOf,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST() {
  try {
    const profiles = marketProfiles();
    const { loadD1PaperTradingState, saveD1PaperTradingState } = await import(
      "../../../lib/paper-trading-store.d1"
    );
    const current = await loadD1PaperTradingState();
    const next = advancePaperTradingState(
      current,
      payload.paperTradingCandidates,
      profiles,
      marketSnapshotMeta.dataAsOf,
    );
    await saveD1PaperTradingState(next);
    return Response.json(
      buildPaperTradingDashboard(
        next,
        profiles,
        marketSnapshotMeta.dataAsOf,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
