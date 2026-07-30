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
  assert.match(html, /只打最漂亮的第一槍/);
  assert.match(html, /萬海/);
  assert.match(html, /上市櫃盤後/);
  assert.match(html, /全市場候選排行榜/);
  assert.doesNotMatch(html, /MOCK DATA/);
  assert.doesNotMatch(html, /codex-preview/);
});

test("server-renders the position risk page", async () => {
  const response = await render("/positions");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /持股與風控/);
  assert.match(html, /352/);
  assert.match(html, /85.3/);
});
