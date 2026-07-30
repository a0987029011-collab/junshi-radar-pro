import assert from "node:assert/strict";
import test from "node:test";
import { estimatePosition } from "../lib/risk-calculator.ts";

const settings = {
  commissionRate: 0.001425,
  commissionDiscount: 0.3,
  minimumCommission: 20,
  stockTransactionTaxRate: 0.003,
  maxLossPerTrade: 12000
};

test("calculates the Wan Hai example with fees and tax", () => {
  const result = estimatePosition(
    {
      shares: 352,
      entryPrice: 85.3,
      currentPrice: 86.4,
      stopPrice: 82,
      targetPrice: 94
    },
    settings
  );
  assert.equal(result.entryGross, 30025.6);
  assert.equal(result.entryFee, 20);
  assert.ok(result.estimatedLossAtStop > 1161);
  assert.ok(result.estimatedLossAtStop < 1300);
  assert.equal(result.withinLossLimit, true);
});
