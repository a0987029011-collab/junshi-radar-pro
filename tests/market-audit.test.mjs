import assert from "node:assert/strict";
import test from "node:test";
import {
  getMarketCandles,
  marketSnapshotMeta,
  verifiedCandidates,
  verifiedMarketSymbols
} from "../lib/market-data.ts";

test("radar snapshot has one consistent market date and universe audit", () => {
  assert.match(marketSnapshotMeta.dataAsOf, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(marketSnapshotMeta.generatedAt);
  assert.ok(marketSnapshotMeta.universeStats.discovered >= verifiedCandidates.length);
  assert.equal(verifiedMarketSymbols.length, verifiedCandidates.length);
  assert.ok(verifiedCandidates.length > 0);
  assert.deepEqual(
    new Set(verifiedCandidates.map((candidate) => candidate.exchange)),
    new Set(["TWSE", "TPEx"])
  );

  for (const candidate of verifiedCandidates) {
    assert.match(candidate.symbol, /^\d{4}$/);
    assert.ok(candidate.name);
    assert.ok(candidate.sector);
    assert.ok(["TWSE", "TPEx"].includes(candidate.exchange));
    assert.deepEqual(
      Object.keys(candidate).sort(),
      ["exchange", "name", "sector", "symbol"]
    );
  }
});

test("every chart closes on the same price shown in the ranking", () => {
  for (const candidate of verifiedCandidates) {
    for (const timeframe of ["day", "week", "month"]) {
      const adjusted = getMarketCandles(
        candidate.symbol,
        timeframe,
        "adjusted"
      );
      const raw = getMarketCandles(candidate.symbol, timeframe, "raw");
      assert.ok(adjusted?.length);
      assert.ok(raw?.length);
      assert.equal(adjusted.at(-1).close, raw.at(-1).close);
      assert.ok(Number.isFinite(adjusted.at(-1).dpo));
    }
  }
});
