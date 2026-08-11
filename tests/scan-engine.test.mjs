import assert from "node:assert/strict";
import test from "node:test";
import {
  BREAKOUT_SIGNAL_NAME,
  scanH1Trendline,
  scanStock,
  scanStocks,
} from "../lib/scanEngine.ts";
import {
  getMarketCandles,
  getScannableSnapshotProfiles,
} from "../lib/market-data.ts";
import { importedStocks } from "../lib/stockData.ts";

function candle(index, high, { open = high - 2, close = high - 1 } = {}) {
  return {
    date: `2026-08-${String(index + 1).padStart(2, "0")}`,
    open,
    high,
    low: Math.min(open, close) - 1,
    close,
    volume: 1_000,
  };
}

test("H1 is confirmed immediately by the next candle that does not make a new high", () => {
  const trace = scanH1Trendline([
    candle(0, 10),
    candle(1, 12),
    candle(2, 11),
  ]);

  assert.equal(trace.h1Points.length, 1);
  assert.deepEqual(trace.h1Points[0], {
    roundId: 1,
    index: 1,
    date: "2026-08-02",
    price: 12,
    confirmedIndex: 2,
    confirmedDate: "2026-08-03",
  });
  assert.equal(trace.lineSegments[0].endIndex, 2);
  assert.equal(trace.lineSegments[0].endPrice, 11);
});

test("a next-candle new high resets the H1 candidate", () => {
  const trace = scanH1Trendline([
    candle(0, 10),
    candle(1, 12),
    candle(2, 13),
    candle(3, 12.5),
  ]);

  assert.equal(trace.h1Points.length, 1);
  assert.equal(trace.h1Points[0].index, 2);
  assert.equal(trace.h1Points[0].confirmedIndex, 3);
  assert.equal(trace.h1Points[0].price, 13);
});

test("a higher high found during tracking replaces H1 after the old line is evaluated", () => {
  const trace = scanH1Trendline(
    [candle(0, 10), candle(1, 8), candle(2, 12), candle(3, 11)],
    {
      macdHistogram: [-1, -0.9, -1.1, -1.2],
      dpo: [0, -1, -2, -3],
    },
  );

  assert.equal(trace.evaluations[0].index, 2);
  assert.equal(trace.evaluations[0].resetH1Candidate, true);
  assert.equal(trace.evaluations[0].updatedWithHigh, false);
  assert.equal(trace.h1Points.at(-1).index, 2);
  assert.equal(trace.h1Points.at(-1).price, 12);
  assert.equal(trace.h1Points.at(-1).confirmedIndex, 3);
});

test("3059 keeps the June 3 highest high as its latest H1", () => {
  const candles = getMarketCandles("3059", "day", "adjusted") ?? [];
  const trace = scanH1Trendline(
    candles.map((item) => ({
      date: item.time,
      open: item.open,
      high: item.high,
      low: item.low,
      close: item.close,
      volume: item.volume,
    })),
    {
      macdHistogram: candles.map((item) => item.histogram),
      dpo: candles.map((item) => item.dpo),
    },
  );

  assert.equal(trace.h1Points.at(-1).date, "2026-06-03");
  assert.equal(trace.h1Points.at(-1).price, 54.5);
  assert.equal(trace.h1Points.at(-1).confirmedDate, "2026-06-04");
  const latestSignal = trace.signals.at(-1);
  const signalLine = trace.lineSegments.find(
    (line) =>
      line.roundId === latestSignal.roundId &&
      line.endIndex === latestSignal.sourceEndIndex,
  );
  assert.equal(signalLine.endDate, "2026-07-30");
  assert.equal(signalLine.endPrice, 37.900001525878906);
  assert.equal(latestSignal.date, "2026-07-31");
  assert.equal(latestSignal.closeConfirmation, true);
  assert.equal(latestSignal.bodyCrossed, false);
  assert.equal(latestSignal.gapAboveLine, true);
  assert.equal(latestSignal.breakoutType, "gap-above");
  assert.ok(trace.currentLine.endIndex > signalLine.endIndex);
});

test("each candle is judged with the previous line before its high updates the line", () => {
  const trace = scanH1Trendline(
    [candle(0, 10), candle(1, 8), candle(2, 7)],
    { macdHistogram: [-1, -0.9, -1.1], dpo: [0, -1, -2] },
  );

  const evaluation = trace.evaluations[0];
  assert.equal(evaluation.index, 2);
  assert.equal(evaluation.sourceEndIndex, 1);
  assert.equal(evaluation.linePrice, 6);
  assert.equal(evaluation.highCrossed, true);
  assert.equal(evaluation.intradayWarning, false);
  assert.equal(evaluation.updatedWithHigh, true);
  assert.equal(trace.currentLine?.endIndex, 2);
  assert.equal(trace.currentLine?.endPrice, 7);
});

test("a candle without an effective breakout keeps extending the H1 tracking line", () => {
  const trace = scanH1Trendline(
    [candle(0, 10), candle(1, 8), candle(2, 7), candle(3, 5)],
    {
      macdHistogram: [-1, -0.9, -1.1, -1.2],
      dpo: [0, -1, -2, -3],
    },
  );

  assert.deepEqual(
    trace.lineSegments.map((line) => line.endIndex),
    [1, 2, 3],
  );
  assert.equal(trace.evaluations.every((item) => item.updatedWithHigh), true);
  assert.equal(trace.signals.length, 0);
});

test("red K plus a weakening negative MACD histogram and DPO upturn triggers on the same candle", () => {
  const trace = scanH1Trendline(
    [
      candle(0, 10),
      candle(1, 8),
      candle(2, 7, { open: 5.5, close: 6.5 }),
    ],
    { macdHistogram: [-1, -0.8, -0.4], dpo: [0, -2, -1] },
  );

  assert.equal(trace.signals.length, 1);
  assert.equal(trace.signals[0].name, BREAKOUT_SIGNAL_NAME);
  assert.equal(trace.signals[0].linePrice, 6);
  assert.equal(trace.signals[0].intradayWarning, true);
  assert.equal(trace.signals[0].closeConfirmation, true);
  assert.equal(trace.signals[0].bodyCrossed, true);
  assert.equal(trace.signals[0].gapAboveLine, false);
  assert.equal(trace.signals[0].breakoutType, "body-cross");
  assert.equal(trace.signals[0].macdWeakening, true);
  assert.equal(trace.signals[0].dpoUpturn, true);
  assert.equal(trace.signals[0].date, "2026-08-03");
});

test("a red K that opens above the line is classified separately from a body cross", () => {
  const trace = scanH1Trendline(
    [
      candle(0, 10),
      candle(1, 8),
      candle(2, 7, { open: 6.2, close: 6.5 }),
    ],
    { macdHistogram: [-1, -0.8, -0.4], dpo: [0, -2, -1] },
  );

  assert.equal(trace.signals.length, 1);
  assert.equal(trace.signals[0].linePrice, 6);
  assert.equal(trace.signals[0].closeConfirmation, true);
  assert.equal(trace.signals[0].bodyCrossed, false);
  assert.equal(trace.signals[0].gapAboveLine, true);
  assert.equal(trace.signals[0].breakoutType, "gap-above");
});

test("one H1-H2 line notifies once while H1 continues with later H2 anchors", () => {
  const trace = scanH1Trendline(
    [
      candle(0, 10),
      candle(1, 8),
      candle(2, 7, { open: 5.5, close: 6.5 }),
      candle(3, 6, { open: 5, close: 5.5 }),
      candle(4, 7, { open: 5, close: 6 }),
    ],
    {
      macdHistogram: [-1, -0.8, -0.4, -0.5, -0.3],
      dpo: [0, -2, -1, -3, -2],
    },
  );

  assert.equal(trace.signals.length, 2);
  assert.deepEqual(
    trace.signals.map((signal) => signal.sourceEndIndex),
    [1, 3],
  );
  assert.equal(
    new Set(
      trace.signals.map(
        (signal) => `${signal.roundId}:${signal.sourceEndIndex}`,
      ),
    ).size,
    trace.signals.length,
  );
  assert.equal(trace.h1Points.length, 1);
  assert.equal(trace.activeH1?.index, 0);
  assert.equal(trace.currentLine?.endIndex, 3);
});

test("scanStocks exposes only the current H1 breakout strategy contract", () => {
  const results = scanStocks(importedStocks, importedStocks.length);

  assert.equal(results.length, importedStocks.length);
  assert.ok(results.every((item) => item.signalName === BREAKOUT_SIGNAL_NAME));
  assert.ok(
    results.every((item) =>
      ["收盤確認", "盤中預警", "追蹤中", "等待 H1"].includes(item.status),
    ),
  );
  assert.ok(results.every((item) => Array.isArray(item.lineSegments)));
  assert.ok(results.every((item) => !("majorTrendline" in item)));
  assert.ok(results.every((item) => !("structureGrade" in item)));
});

test("every snapshot stock follows the same H1-H2 no-look-ahead contract", () => {
  const stocks = getScannableSnapshotProfiles();

  assert.ok(stocks.length > 0);

  for (const stock of stocks) {
    const result = scanStock(stock);
    const trace = scanH1Trendline(stock.candles);
    const h1ByRound = new Map();

    assert.deepEqual(result.signals, trace.signals);

    for (const line of result.lineSegments) {
      const knownH1 = h1ByRound.get(line.roundId);
      if (knownH1 === undefined) {
        h1ByRound.set(line.roundId, line.h1Index);
      } else {
        assert.equal(
          line.h1Index,
          knownH1,
          `${stock.symbol}: H1 changed inside round ${line.roundId}`,
        );
      }
    }

    for (let index = 1; index < trace.h1Points.length; index += 1) {
      assert.ok(
        trace.h1Points[index].price > trace.h1Points[index - 1].price,
        `${stock.symbol}: a later H1 did not make a higher high`,
      );
    }

    for (const signal of result.signals) {
      const sourceLine = result.lineSegments.find(
        (line) =>
          line.roundId === signal.roundId &&
          line.endIndex === signal.sourceEndIndex,
      );

      assert.ok(sourceLine, `${stock.symbol}: signal has no H1-H2 source line`);
      assert.ok(
        signal.sourceEndIndex < signal.index,
        `${stock.symbol}: signal used the current candle as H2`,
      );
      assert.equal(signal.redCandle, true, `${stock.symbol}: signal is not red K`);
      assert.equal(
        signal.macdWeakening,
        true,
        `${stock.symbol}: MACD is not weakening`,
      );
      assert.equal(signal.dpoUpturn, true, `${stock.symbol}: DPO is not turning up`);
      assert.equal(signal.highCrossed, true, `${stock.symbol}: high did not cross`);
      if (signal.closeConfirmation) {
        assert.ok(
          ["body-cross", "gap-above"].includes(signal.breakoutType),
          `${stock.symbol}: close confirmation has no breakout type`,
        );
        assert.notEqual(
          signal.bodyCrossed,
          signal.gapAboveLine,
          `${stock.symbol}: close confirmation belongs to both or neither type`,
        );
      } else {
        assert.equal(signal.breakoutType, undefined);
      }
    }
  }
});
