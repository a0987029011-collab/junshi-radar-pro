import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchTaishinNovaSnapshotsWithSdk,
  hasTaishinNovaConfig,
  normalizeTaishinPersonalId,
  parseTaishinSecureConfig,
  parseTaishinNovaSnapshot
} from "../scripts/lib/taishin-nova.mjs";

function payload(symbol, overrides = {}) {
  return {
    date: "2026-08-11",
    time: "134500",
    data: [
      {
        symbol,
        name: "測試股票",
        openPrice: 100,
        highPrice: 105,
        lowPrice: 99,
        closePrice: 104,
        tradeVolume: 1234,
        lastUpdated: 1786436700000000,
        isTrial: false,
        ...overrides
      }
    ]
  };
}

test("Nova snapshot normalizes TSE and converts lots to shares", () => {
  const snapshot = parseTaishinNovaSnapshot(payload("2330"), "TSE");
  assert.equal(snapshot.exchange, "TWSE");
  assert.equal(snapshot.date, "2026-08-11");
  assert.deepEqual(snapshot.quotes[0], {
    symbol: "2330",
    name: "測試股票",
    exchange: "TWSE",
    date: "2026-08-11",
    open: 100,
    high: 105,
    low: 99,
    close: 104,
    volume: 1234000,
    lastUpdated: 1786436700000000,
    source: "Taishin Nova full-market snapshot"
  });
});

test("Nova snapshot rejects trial quotes and invalid market data", () => {
  assert.throws(
    () => parseTaishinNovaSnapshot(payload("2330", { isTrial: true }), "TSE"),
    /no usable quotes/
  );
  assert.throws(
    () => parseTaishinNovaSnapshot(payload("2330"), "UNKNOWN"),
    /Unsupported/
  );
});

test("Nova client reads both markets without touching order functions", async () => {
  const calls = [];
  const sdk = {
    registerApiAuth() {
      calls.push("register");
      return true;
    },
    initRealtime(account) {
      calls.push(["init", account.account]);
      this.marketdata = {
        restClient: {
          stock: {
            snapshot: {
              quotes: async ({ market, type }) => {
                calls.push(["quotes", market, type]);
                return payload(market === "TSE" ? "2330" : "5347");
              }
            }
          }
        }
      };
    },
    get stock() {
      throw new Error("order API must not be accessed");
    }
  };

  const result = await fetchTaishinNovaSnapshotsWithSdk({
    sdk,
    account: { account: "masked" }
  });

  assert.equal(result.quotes.length, 2);
  assert.equal(result.quoteDates.TWSE, "2026-08-11");
  assert.equal(result.quoteDates.TPEx, "2026-08-11");
  assert.deepEqual(calls, [
    ["init", "masked"],
    ["quotes", "TSE", "COMMONSTOCK"],
    ["quotes", "OTC", "COMMONSTOCK"]
  ]);
});

test("Nova credential check requires ID, login password and certificate", () => {
  assert.equal(hasTaishinNovaConfig({}), false);
  assert.equal(
    hasTaishinNovaConfig({
      TAISHIN_SECURE_CONFIG_DIR: ".local/taishin-nova/credentials"
    }),
    true
  );
  assert.equal(
    hasTaishinNovaConfig({
      TAISHIN_PERSONAL_ID: "id",
      TAISHIN_LOGIN_PASSWORD: "password",
      TAISHIN_CERT_PATH: "certificate.pfx"
    }),
    true
  );
});

test("Nova secure config accepts the BOM written by Windows PowerShell", () => {
  assert.deepEqual(
    parseTaishinSecureConfig(
      '\uFEFF{"certificatePath":"C:\\\\secure\\\\certificate.pfx"}'
    ),
    { certificatePath: "C:\\secure\\certificate.pfx" }
  );
  assert.throws(() => parseTaishinSecureConfig("{}"), /certificatePath/);
});

test("Nova personal ID is normalized before login", () => {
  assert.equal(normalizeTaishinPersonalId("  a123456789  "), "A123456789");
});
