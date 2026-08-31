import {
  deriveHighConfidenceSignalReview,
  selectSuccessfulSignalCases,
  summarizeSignalResearch,
  type HighConfidenceSignalReview,
  type SignalResearchObservation,
  type SignalResearchSummary,
} from "./signal-research.ts";
import { PAPER_TRADING_START_DATE } from "./paper-trading.ts";

export interface SignalResearchPayload {
  dataAsOf: string;
  generatedAt: string;
  summary: SignalResearchSummary;
  highConfidenceReview: HighConfidenceSignalReview;
  successfulCases: SignalResearchObservation[];
  recentCases: SignalResearchObservation[];
  paperTradingCandidates: SignalResearchObservation[];
}

export function buildSignalResearchPayload(
  observations: SignalResearchObservation[],
  meta: { dataAsOf: string; generatedAt: string },
): SignalResearchPayload {
  const recentCases = observations
    .slice()
    .sort((left, right) => right.signalDate.localeCompare(left.signalDate))
    .slice(0, 20);

  return {
    dataAsOf: meta.dataAsOf,
    generatedAt: meta.generatedAt,
    summary: summarizeSignalResearch(observations),
    highConfidenceReview: deriveHighConfidenceSignalReview(
      observations,
      meta.dataAsOf,
    ),
    successfulCases: selectSuccessfulSignalCases(observations),
    recentCases,
    paperTradingCandidates: observations
      .filter(
        (observation) =>
          observation.signalKind === "close-confirmed" &&
          observation.signalDate >= PAPER_TRADING_START_DATE,
      )
      .sort(
        (left, right) =>
          left.signalDate.localeCompare(right.signalDate) ||
          left.symbol.localeCompare(right.symbol),
      ),
  };
}
