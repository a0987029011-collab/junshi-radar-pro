import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";

const projectDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  ".."
);
const nextBin = path.join(
  projectDir,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);
const port = 3200 + (process.pid % 1000);
const origin = `http://127.0.0.1:${port}`;
let server;

before(async () => {
  server = spawn(
    process.execPath,
    [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: projectDir,
      env: { ...process.env, NODE_ENV: "production" },
      stdio: ["ignore", "pipe", "pipe"]
    }
  );

  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`Next.js server exited with code ${server.exitCode}`);
    }

    try {
      const response = await fetch(`${origin}/api/radar`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }

    await delay(250);
  }

  throw new Error("Timed out waiting for the Next.js production server");
});

after(() => {
  if (server?.exitCode === null) server.kill();
});

async function render(pathname = "/") {
  return fetch(`${origin}${pathname}`, {
    headers: { accept: "text/html" }
  });
}

test("server-renders the radar dashboard", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /軍師雷達/);
  assert.match(html, /版本 0\.3\.1/);
  assert.match(html, /2026-08-11/);
  assert.doesNotMatch(html, /重新計算/);
  assert.doesNotMatch(html, /aria-label="掃描摘要"/);
  assert.match(html, /下降趨勢線紅 K 穿越/);
  assert.match(html, /上市櫃/);
  assert.match(html, /盤後/);
  assert.match(html, /訊號分頁/);
  assert.match(html, /紅 K 實體穿越/);
  assert.match(html, /跳空紅 K 站上/);
  assert.match(html, /當根既有線價/);
  assert.match(html, /DPO/);
  assert.doesNotMatch(html, /H3 成形/);
  assert.doesNotMatch(html, /A 級雷達/);
  assert.doesNotMatch(html, /MOCK DATA/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("server-renders the position risk page", async () => {
  const response = await render("/positions");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /持股與風控/);
  assert.doesNotMatch(html, /352 股/);
  assert.doesNotMatch(html, /均價 85\.3/);
  assert.match(html, /分批進場/);
  assert.match(html, /追蹤與持股/);
  assert.match(html, /追蹤股票會先進入待登錄/);
  assert.match(html, /浮動損益率/);
  assert.match(html, /實際賣出價/);
  assert.match(html, /賣出股數/);
  assert.match(html, /分批賣出/);
  assert.match(html, /全部賣出/);
  assert.match(html, /券商手續費折扣/);
  assert.match(html, /持股總成本（含手續費）/);
  assert.match(html, /持股盤面觀察/);
  assert.match(html, /日 K/);
  assert.match(html, /週 K/);
  assert.match(html, /月 K/);
  assert.match(html, /按住或點選 K 棒，在這裡查看時間與四價/);
  assert.match(html, /預估浮動損益率（含費稅）/);
  assert.doesNotMatch(html, /預設資金規則/);
  assert.doesNotMatch(html, /第一目標價/);
  assert.doesNotMatch(html, /淨風險報酬比/);
});
