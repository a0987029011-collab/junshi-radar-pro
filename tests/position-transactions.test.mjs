import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizePositionBuyInput,
  normalizePositionSellInput,
  summarizePositionTransactions,
} from "../lib/position-transactions.ts";

function transaction(id, kind, shares, price, occurredAt) {
  return {
    id,
    symbol: "2615",
    name: "萬海",
    kind,
    shares,
    price,
    occurredAt,
    createdAt: occurredAt,
  };
}

test("multiple entry lots calculate a share-weighted average price", () => {
  const summary = summarizePositionTransactions([
    transaction("a", "buy", 100, 80, "2026-08-01T00:00:00.000Z"),
    transaction("b", "buy", 300, 90, "2026-08-02T00:00:00.000Z"),
  ]);

  assert.equal(summary.totalShares, 400);
  assert.equal(summary.totalCost, 35_000);
  assert.equal(summary.totalCostWithFees, 35_040);
  assert.equal(summary.averageEntryPrice, 87.5);
});

test("a full sale closes the prior lots and includes fees and tax", () => {
  const summary = summarizePositionTransactions([
    transaction("a", "buy", 100, 80, "2026-08-01T00:00:00.000Z"),
    transaction("b", "buy", 100, 90, "2026-08-02T00:00:00.000Z"),
    transaction("c", "sell", 200, 93.5, "2026-08-03T00:00:00.000Z"),
  ]);

  assert.equal(summary.totalShares, 0);
  assert.equal(summary.saleHistory.length, 1);
  assert.equal(summary.saleHistory[0].averageEntryPrice, 85);
  assert.ok(summary.saleHistory[0].returnPercent > 9.2);
  assert.ok(summary.saleHistory[0].returnPercent < 9.4);
});

test("a partial sale keeps the remaining shares and weighted average", () => {
  const summary = summarizePositionTransactions([
    transaction("a", "buy", 100, 80, "2026-08-01T00:00:00.000Z"),
    transaction("b", "buy", 100, 90, "2026-08-02T00:00:00.000Z"),
    transaction("c", "sell", 50, 100, "2026-08-03T00:00:00.000Z"),
  ]);

  assert.equal(summary.totalShares, 150);
  assert.equal(summary.totalCostWithFees, 12_780);
  assert.equal(summary.averageEntryPrice, 85);
  assert.equal(summary.saleHistory[0].transaction.shares, 50);
  assert.ok(summary.saleHistory[0].returnPercent > 16.5);
  assert.ok(summary.saleHistory[0].returnPercent < 16.6);
});

test("stored realized metrics remain authoritative for later analysis", () => {
  const sale = {
    ...transaction("c", "sell", 200, 93.5, "2026-08-03T00:00:00.000Z"),
    averageEntryPrice: 86,
    realizedReturnPercent: 8.72,
  };
  const summary = summarizePositionTransactions([
    transaction("a", "buy", 100, 80, "2026-08-01T00:00:00.000Z"),
    transaction("b", "buy", 100, 90, "2026-08-02T00:00:00.000Z"),
    sale,
  ]);

  assert.equal(summary.saleHistory[0].averageEntryPrice, 86);
  assert.equal(summary.saleHistory[0].returnPercent, 8.72);
});

test("position transaction inputs reject invalid shares and prices", () => {
  assert.throws(
    () => normalizePositionBuyInput({ symbol: "2615", name: "萬海", shares: 1.5, price: 85 }),
    /股數必須是整數/,
  );
  assert.throws(
    () => normalizePositionSellInput({ symbol: "2615", name: "萬海", shares: 100, price: 0 }),
    /賣出價必須大於 0/,
  );
  assert.throws(
    () => normalizePositionSellInput({ symbol: "2615", name: "萬海", shares: 1.5, price: 85 }),
    /賣出股數必須是整數/,
  );
});

test("transaction inputs default the broker commission to 30 percent", () => {
  const buy = normalizePositionBuyInput({
    symbol: "2615",
    name: "萬海",
    shares: 100,
    price: 85,
  });
  const sale = normalizePositionSellInput({
    symbol: "2615",
    name: "萬海",
    shares: 50,
    price: 90,
  });

  assert.equal(buy.commissionDiscount, 0.3);
  assert.equal(sale.commissionDiscount, 0.3);
});
