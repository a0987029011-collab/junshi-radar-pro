import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  marketDateToIso,
  mergeOfficialQuote,
  parseCompanyBasics,
  parseTpexQuotes,
  parseTwseLegacyQuotes,
  parseTwseMiIndexQuotes,
  parseTwseOpenApiQuotes
} from "../scripts/fetch-market-snapshot.mjs";
import {
  classifyCandidate,
  detectProfitPlan
} from "../scripts/lib/strategy-engine.mjs";

const strategy = JSON.parse(
  await readFile(new URL("../config/strategy.json", import.meta.url), "utf8")
);

test("market date parser accepts Gregorian and ROC formats", () => {
  assert.equal(marketDateToIso("20260730"), "2026-07-30");
  assert.equal(marketDateToIso("1150730"), "2026-07-30");
  assert.equal(marketDateToIso("115/07/30"), "2026-07-30");
});

test("TWSE legacy and OpenAPI rows normalize to the same quote shape", () => {
  const legacy = parseTwseLegacyQuotes({
    date: "20260730",
    data: [
      ["2603", "長榮", "6,941,425", "1,395,000,000", "202.5", "202.5", "199.5", "201.0", "-0.5", "8,000"]
    ]
  });
  const openApi = parseTwseOpenApiQuotes(
    [
      {
        Date: "1150730",
        Code: "2603",
        Name: "長榮",
        TradeVolume: "6,941,425",
        OpeningPrice: "202.5",
        HighestPrice: "202.5",
        LowestPrice: "199.5",
        ClosingPrice: "201.0"
      }
    ],
    "2026-07-30"
  );
  assert.deepEqual(legacy.quotes[0], openApi.quotes[0]);
});

test("TWSE MI_INDEX rows normalize the current official close", () => {
  const current = parseTwseMiIndexQuotes({
    date: "20260730",
    tables: [
      {
        fields: [
          "證券代號",
          "證券名稱",
          "成交股數",
          "成交筆數",
          "成交金額",
          "開盤價",
          "最高價",
          "最低價",
          "收盤價"
        ],
        data: [
          [
            "2603",
            "長榮",
            "6,941,425",
            "8,000",
            "1,395,000,000",
            "202.5",
            "202.5",
            "199.5",
            "201.0"
          ]
        ]
      }
    ]
  });
  assert.equal(current.date, "2026-07-30");
  assert.equal(current.quotes[0].symbol, "2603");
  assert.equal(current.quotes[0].close, 201);
  assert.equal(current.quotes[0].volume, 6941425);
});

test("TPEx quotes and company basics accept official field names", () => {
  const tpex = parseTpexQuotes(
    [
      {
        Date: "1150730",
        SecuritiesCompanyCode: "5347",
        CompanyName: "世界",
        TradingShares: "12,345,000",
        Open: "100",
        High: "103",
        Low: "99",
        Close: "102"
      }
    ],
    "2026-07-30"
  );
  assert.equal(tpex.quotes[0].exchange, "TPEx");
  assert.equal(tpex.quotes[0].volume, 12345000);

  const basics = parseCompanyBasics(
    [
      {
        公司代號: "5347",
        公司簡稱: "世界",
        公司名稱: "世界先進積體電路股份有限公司",
        產業別: "24",
        實收資本額: "16,389,827,670",
        已發行普通股數或TDR原股發行股數: "1,638,982,767"
      }
    ],
    "TPEx"
  );
  assert.equal(basics[0].symbol, "5347");
  assert.equal(basics[0].sector, "半導體業");
  assert.equal(basics[0].paidInCapital, 16389827670);
});

test("TPEx company basics accept the live OpenAPI field names", () => {
  const basics = parseCompanyBasics(
    [
      {
        SecuritiesCompanyCode: "5347",
        CompanyName: "世界先進積體電路股份有限公司",
        CompanyAbbreviation: "世界",
        SecuritiesIndustryCode: "24",
        "Paidin.Capital.NTDollars": "16,389,827,670",
        IssueShares: "1,638,982,767"
      }
    ],
    "TPEx"
  );
  assert.equal(basics[0].symbol, "5347");
  assert.equal(basics[0].name, "世界");
  assert.equal(basics[0].industryCode, "24");
  assert.equal(basics[0].paidInCapital, 16389827670);
  assert.equal(basics[0].issuedShares, 1638982767);
});

test("official quote replaces the latest delayed historical row", () => {
  const rows = [
    ["2026-07-29", 200, 205, 198, 201.5, 1000, 0.9],
    ["2026-07-30", 201, 202, 199, 200, 2000, 0.9]
  ];
  const merged = mergeOfficialQuote(rows, {
    date: "2026-07-30",
    open: 202.5,
    high: 202.5,
    low: 199.5,
    close: 201,
    volume: 6941425
  });
  assert.deepEqual(merged.at(-1), [
    "2026-07-30",
    202.5,
    202.5,
    199.5,
    201,
    6941425,
    0.9
  ]);
});

test("deep scan converts a structural low and engulfing ceiling into a profit zone", () => {
  const candles = Array.from({ length: 24 }, (_, index) => ({
    time: `2026-01-${String(index + 1).padStart(2, "0")}`,
    open: 14.2,
    high: 14.5,
    low: 13.9,
    close: 14.1,
    volume: 1000000,
    macd: 0,
    signal: 0,
    histogram: 0,
    dpo: 0
  }));
  candles[2] = {
    ...candles[2],
    open: 15.2,
    high: 17.35,
    low: 15.1,
    close: 17
  };
  candles[3] = {
    ...candles[3],
    open: 17.25,
    high: 17.4,
    low: 15.05,
    close: 15.15
  };
  candles.at(-1).open = 13.5;
  candles.at(-1).high = 13.8;
  candles.at(-1).low = 13.2;
  candles.at(-1).close = 13.7;

  const plan = detectProfitPlan(
    candles,
    { keyLevel: 13.1, stopLoss: 13.1, tests: 4 },
    {
      above: true,
      confirmedBreakout: true,
      successfulRetest: true
    },
    strategy
  );

  assert.equal(plan.entryZoneLow, 13.1);
  assert.equal(plan.entryZoneHigh, 13.6);
  assert.equal(plan.profitZoneLow, 15.05);
  assert.equal(plan.profitZoneHigh, 17.4);
  assert.equal(plan.source, "bearish-engulfing");
  assert.equal(plan.phase, "entry-ready");
  assert.equal(plan.isClear, true);
  assert.ok(plan.lowRiskReward >= 2);
});

function candidateWithSignals(overrides = {}) {
  return {
    signals: {
      monthlyTrend: 1,
      weeklyTrend: 1,
      dailyBreakout: 1,
      macd: 1,
      dpo: 1,
      keyLevel: 1,
      chipStructure: 1,
      confirmedTrendlineBreakout: true,
      multiTimeframeResonance: true,
      healthyConsolidation: true,
      indicatorsRising: true,
      monthlyHistogramContracting: true,
      monthlyMacdNearZeroOrImproving: true,
      monthlyDpoRising: true,
      monthlyKeyLevel: true,
      shrinkingHistogramSupport: true,
      successfulRetest: true,
      chipStructureStable: true,
      ...overrides
    }
  };
}

test("classification engine produces S, A+, A, Seed and Watch", () => {
  assert.equal(classifyCandidate(candidateWithSignals(), 2, strategy), "S");
  assert.equal(
    classifyCandidate(
      candidateWithSignals({ chipStructureStable: false }),
      2,
      strategy
    ),
    "A+"
  );
  assert.equal(
    classifyCandidate(
      candidateWithSignals({
        chipStructureStable: false,
        multiTimeframeResonance: false
      }),
      2,
      strategy
    ),
    "A"
  );
  assert.equal(
    classifyCandidate(
      candidateWithSignals({
        chipStructureStable: false,
        confirmedTrendlineBreakout: false,
        dailyBreakout: 0,
        multiTimeframeResonance: false
      }),
      2,
      strategy
    ),
    "Seed"
  );
  assert.equal(
    classifyCandidate(
      candidateWithSignals({
        chipStructureStable: false,
        confirmedTrendlineBreakout: false,
        dailyBreakout: 0,
        multiTimeframeResonance: false,
        monthlyDpoRising: false
      }),
      2,
      strategy
    ),
    "Watch"
  );
});
