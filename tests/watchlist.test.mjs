import assert from "node:assert/strict";
import test from "node:test";
import { getPositionMarketContext } from "../lib/position-market-context.ts";
import {
  normalizeWatchlistInput,
  watchlistItemKey,
} from "../lib/watchlist.ts";

test("watchlist input keeps the stock identity needed by the position page", () => {
  assert.deepEqual(
    normalizeWatchlistInput({ symbol: "6505", name: "台塑化" }),
    { symbol: "6505", name: "台塑化" },
  );
  assert.equal(watchlistItemKey("user-1", "6505"), "user-1:6505");
});

test("a tracked stock is enriched with live position context", () => {
  const item = getPositionMarketContext({
    symbol: "6505",
    name: "台塑化",
    addedAt: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(item.symbol, "6505");
  assert.equal(item.currentPrice, 71.1);
  assert.ok(item.stopPrice > 0 && item.stopPrice < item.currentPrice);
});

test("a position stop follows the displayed corrected trendline support", () => {
  const item = getPositionMarketContext(
    {
      symbol: "6505",
      name: "台塑化",
      addedAt: "2026-08-11T00:00:00.000Z",
    },
    {
      symbol: "6505",
      timeframe: "day",
      adjustment: "adjusted",
      h1: { date: "2026-07-24", price: 97.9000015258789 },
      h2: { date: "2026-08-03", price: 71.4000015258789 },
      originalH1: null,
      originalH2: null,
      reason: "H2 應接觸另一根 K 棒",
      notes: "",
      submittedForLearning: true,
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
    },
  );

  assert.equal(item.stopPrice, 65.4000015258789);
  assert.equal(item.stopSourceDate, "2026-08-04");
});

test("a stock without an active horizontal defense line has no invented stop", () => {
  const item = getPositionMarketContext({
    symbol: "999999",
    name: "無資料",
    addedAt: "2026-08-11T00:00:00.000Z",
  });

  assert.equal(item.stopPrice, null);
  assert.equal(item.stopSourceDate, "目前沒有有效防守線");
});

test("watchlist input rejects an invalid symbol", () => {
  assert.throws(
    () => normalizeWatchlistInput({ symbol: "ABC", name: "測試" }),
    /股票代號格式不正確/,
  );
});
