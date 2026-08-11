import assert from "node:assert/strict";
import test from "node:test";
import { applyMarketSnapshot } from "../scripts/refresh-intraday-snapshot.mjs";
import {
  isTaipeiMarketWindow,
  marketPhaseAt,
} from "../scripts/lib/market-phase.mjs";

function existingSnapshot() {
  const day = [
    ["2026-08-07", 10, 11, 9, 10.5, 1_000],
    ["2026-08-10", 10.6, 11.2, 10.2, 11, 2_000],
  ];
  return {
    meta: {
      dataAsOf: "2026-08-10",
      generatedAt: "2026-08-10T06:00:00.000Z",
      mode: "taishin-nova-full-market-snapshot",
      provider: "old",
      sources: {},
      limitations: {},
    },
    candidates: [
      { symbol: "6142", name: "友勁", sector: "通信網路", exchange: "TWSE" },
    ],
    charts: {
      6142: {
        raw: { day: structuredClone(day), week: [], month: [] },
        adjusted: { day: structuredClone(day), week: [], month: [] },
      },
    },
    notes: {
      6142: {
        dataAsOf: "2026-08-10",
        startDate: "2021-08-10",
        endDate: "2026-08-10",
        historyDays: 1200,
      },
    },
  };
}

const market = {
  date: "2026-08-11",
  quoteTime: "13:02:00",
  quoteCapturedAt: "2026-08-11T05:02:00.000Z",
  quoteDates: { TWSE: "2026-08-11", TPEx: "2026-08-11" },
  quoteSource: "Nova",
  quotes: [
    {
      symbol: "6142",
      exchange: "TWSE",
      date: "2026-08-11",
      open: 11.1,
      high: 11.8,
      low: 10.9,
      close: 11.6,
      volume: 3_000,
    },
  ],
};

test("Taipei market window remains intraday until the safe post-close cutoff", () => {
  assert.equal(isTaipeiMarketWindow(new Date("2026-08-11T05:02:00Z")), true);
  assert.equal(isTaipeiMarketWindow(new Date("2026-08-11T05:34:00Z")), false);
  assert.equal(marketPhaseAt("2026-08-11", new Date("2026-08-11T05:02:00Z")), "intraday");
});

test("intraday refresh updates daily and aggregate candles without claiming a close", () => {
  const result = applyMarketSnapshot(
    existingSnapshot(),
    market,
    new Date("2026-08-11T05:02:00Z"),
  );

  assert.equal(result.updated, 1);
  assert.equal(result.marketPhase, "intraday");
  assert.equal(result.snapshot.meta.mode, "taishin-nova-intraday-snapshot");
  assert.equal(result.snapshot.meta.dataAsOf, "2026-08-11");
  assert.match(result.snapshot.meta.limitations.realtime, /僅作預警/);
  assert.deepEqual(result.snapshot.charts["6142"].raw.day.at(-1), [
    "2026-08-11", 11.1, 11.8, 10.9, 11.6, 3_000,
  ]);
  assert.equal(result.snapshot.charts["6142"].raw.week.at(-1)[0], "2026-08-10");
  assert.equal(result.snapshot.notes["6142"].historyDays, 1201);
  assert.equal(
    result.snapshot.notes["6142"].latestVerification.source,
    "台新 Nova 盤中市場快照",
  );
});
