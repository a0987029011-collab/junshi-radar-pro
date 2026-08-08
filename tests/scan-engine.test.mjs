import assert from "node:assert/strict";
import test from "node:test";
import { importedStocks } from "../lib/stockData.ts";
import { scanStocks } from "../lib/scanEngine.ts";

test("scanStocks ranks bearish candidates from the sample universe", () => {
  const results = scanStocks(importedStocks, 5);

  assert.ok(results.length > 0);
  assert.equal(results.length, 5);
  assert.ok(results[0].score >= results.at(-1).score);
  assert.ok(
    results.some((item) =>
      item.reasons.some((reason) =>
        ["大級別下降趨勢線", "跟隨下降趨勢線", "空方動能衰退"].includes(reason)
      )
    )
  );
});
