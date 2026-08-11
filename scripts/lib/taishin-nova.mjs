import { execFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const MARKET_TO_EXCHANGE = {
  TSE: "TWSE",
  OTC: "TPEx"
};

const DEFAULT_MARKETS = ["TSE", "OTC"];
const execFileAsync = promisify(execFile);

function hasDirectCredentials(env) {
  return Boolean(
    env.TAISHIN_PERSONAL_ID &&
      env.TAISHIN_LOGIN_PASSWORD &&
      env.TAISHIN_CERT_PATH
  );
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeDate(value) {
  const match = String(value ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) throw new Error(`Invalid Taishin Nova snapshot date: ${value}`);
  return `${match[1]}-${match[2]}-${match[3]}`;
}

export function hasTaishinNovaConfig(env = process.env) {
  return Boolean(env.TAISHIN_SECURE_CONFIG_DIR || hasDirectCredentials(env));
}

export function normalizeTaishinPersonalId(value) {
  return String(value ?? "").trim().toUpperCase();
}

export function parseTaishinSecureConfig(value) {
  const config = JSON.parse(String(value).replace(/^\uFEFF/, ""));
  if (!config?.certificatePath) {
    throw new Error("Taishin secure config is missing certificatePath");
  }
  return config;
}

async function decryptWindowsDpapi(filePath) {
  if (process.platform !== "win32") {
    throw new Error("Windows DPAPI credentials can only be read on Windows");
  }
  const script = [
    "$encrypted = (Get-Content -Raw -LiteralPath $env:JUNSHI_DPAPI_FILE).Trim()",
    "$secure = $encrypted | ConvertTo-SecureString",
    "$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)",
    "try { [Console]::Out.Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }"
  ].join("; ");
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", script],
    {
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 64 * 1024,
      env: { ...process.env, JUNSHI_DPAPI_FILE: filePath }
    }
  );
  if (!stdout) throw new Error("Windows could not decrypt Taishin credentials");
  return stdout;
}

async function loadSecureCredentials(env, cwd) {
  const configDir = path.resolve(cwd, env.TAISHIN_SECURE_CONFIG_DIR);
  const config = parseTaishinSecureConfig(
    await readFile(path.join(configDir, "config.json"), "utf8")
  );
  const [personalId, loginPassword, certificatePassword] = await Promise.all([
    decryptWindowsDpapi(path.join(configDir, "personal-id.dpapi")),
    decryptWindowsDpapi(path.join(configDir, "login-password.dpapi")),
    decryptWindowsDpapi(path.join(configDir, "certificate-password.dpapi"))
  ]);
  return {
    ...env,
    TAISHIN_PERSONAL_ID: personalId,
    TAISHIN_LOGIN_PASSWORD: loginPassword,
    TAISHIN_CERT_PATH: config.certificatePath,
    TAISHIN_CERT_PASSWORD: certificatePassword,
    TAISHIN_ACCOUNT: config.account ?? env.TAISHIN_ACCOUNT
  };
}

export function parseTaishinNovaSnapshot(payload, market) {
  const exchange = MARKET_TO_EXCHANGE[market];
  if (!exchange) throw new Error(`Unsupported Taishin Nova market: ${market}`);

  const date = normalizeDate(payload?.date);
  const quotes = (Array.isArray(payload?.data) ? payload.data : [])
    .filter((row) => row?.isTrial !== true)
    .map((row) => ({
      symbol: String(row?.symbol ?? "").trim(),
      name: String(row?.name ?? "").trim(),
      exchange,
      date,
      open: finiteNumber(row?.openPrice),
      high: finiteNumber(row?.highPrice),
      low: finiteNumber(row?.lowPrice),
      close: finiteNumber(row?.closePrice),
      // Nova snapshot volume is reported in trading lots. The scanner stores
      // daily volume in shares, matching the TWSE and TPEx official feeds.
      volume: finiteNumber(row?.tradeVolume) * 1000,
      lastUpdated: finiteNumber(row?.lastUpdated),
      source: "Taishin Nova full-market snapshot"
    }))
    .filter(
      (quote) =>
        /^\d{4}$/.test(quote.symbol) &&
        [quote.open, quote.high, quote.low, quote.close, quote.volume].every(
          Number.isFinite
        ) &&
        quote.close > 0
    );

  if (!quotes.length) {
    throw new Error(`Taishin Nova ${market} snapshot contains no usable quotes`);
  }

  return {
    market,
    exchange,
    date,
    time: String(payload?.time ?? ""),
    quotes
  };
}

export async function fetchTaishinNovaSnapshotsWithSdk({
  sdk,
  account,
  markets = DEFAULT_MARKETS,
  type = "COMMONSTOCK",
  registerAuth = false
}) {
  if (registerAuth) {
    const registered = await Promise.resolve(sdk.registerApiAuth(account));
    if (!registered) throw new Error("Taishin Nova API authorization failed");
  }

  await Promise.resolve(sdk.initRealtime(account));
  const client = sdk.marketdata?.restClient;
  if (!client?.stock?.snapshot?.quotes) {
    throw new Error("Taishin Nova market-data client is unavailable");
  }

  const snapshots = await Promise.all(
    markets.map(async (market) =>
      parseTaishinNovaSnapshot(
        await client.stock.snapshot.quotes({ market, type }),
        market
      )
    )
  );
  const quoteDates = Object.fromEntries(
    snapshots.map((snapshot) => [snapshot.exchange, snapshot.date])
  );
  const date = snapshots.map((snapshot) => snapshot.date).sort().at(-1);

  return {
    date,
    quoteDates,
    quoteTime: snapshots.map((snapshot) => snapshot.time).sort().at(-1),
    quoteCapturedAt: new Date().toISOString(),
    quotes: snapshots.flatMap((snapshot) => snapshot.quotes),
    quoteProvider: "taishin-nova",
    quoteSource:
      "https://ml-fugle-api.tssco.com.tw/FugleSDK/docs/market-data/http-api/snapshot/quotes"
  };
}

async function sdkImportSpecifier(configuredPath, cwd) {
  if (!configuredPath) return "taishin-sdk";
  let resolved = path.resolve(cwd, configuredPath);
  const info = await stat(resolved);
  if (info.isDirectory()) resolved = path.join(resolved, "index.js");
  return pathToFileURL(resolved).href;
}

export async function loadTaishinNovaSdk({
  env = process.env,
  cwd = process.cwd()
} = {}) {
  const specifier = await sdkImportSpecifier(
    env.TAISHIN_NOVA_SDK_PATH,
    cwd
  );
  const sdkModule = await import(specifier);
  const TaishinSDK =
    sdkModule.TaishinSDK ?? sdkModule.default?.TaishinSDK;
  if (typeof TaishinSDK !== "function") {
    throw new Error("Taishin Nova SDK does not export TaishinSDK");
  }
  return TaishinSDK;
}

function pickAccount(accounts, configuredAccount) {
  if (!Array.isArray(accounts) || !accounts.length) {
    throw new Error("Taishin Nova login returned no securities account");
  }
  if (!configuredAccount) return accounts[0];
  const account = accounts.find(
    (candidate) => String(candidate?.account ?? "") === configuredAccount
  );
  if (!account) throw new Error("Configured Taishin account was not found");
  return account;
}

export async function fetchTaishinNovaQuotes({
  env = process.env,
  cwd = process.cwd(),
  registerAuth = false,
  sdkClass
} = {}) {
  if (!hasTaishinNovaConfig(env)) {
    throw new Error(
      "Taishin Nova requires TAISHIN_PERSONAL_ID, TAISHIN_LOGIN_PASSWORD and TAISHIN_CERT_PATH"
    );
  }

  const credentials = hasDirectCredentials(env)
    ? env
    : await loadSecureCredentials(env, cwd);

  const TaishinSDK =
    sdkClass ?? (await loadTaishinNovaSdk({ env: credentials, cwd }));
  const sdk = new TaishinSDK();
  const accounts = await Promise.resolve(
    sdk.login(
      normalizeTaishinPersonalId(credentials.TAISHIN_PERSONAL_ID),
      credentials.TAISHIN_LOGIN_PASSWORD,
      path.resolve(cwd, credentials.TAISHIN_CERT_PATH),
      credentials.TAISHIN_CERT_PASSWORD || undefined
    )
  );
  const account = pickAccount(accounts, credentials.TAISHIN_ACCOUNT);
  return fetchTaishinNovaSnapshotsWithSdk({
    sdk,
    account,
    registerAuth
  });
}
