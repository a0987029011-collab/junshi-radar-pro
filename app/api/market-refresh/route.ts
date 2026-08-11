import path from "node:path";
import { promisify } from "node:util";
import { isTaipeiMarketWindow, taipeiClock } from "../../../scripts/lib/market-phase.mjs";

type RefreshResult = {
  mode: "intraday" | "full-close";
  message: string;
};

let activeRefresh: Promise<RefreshResult> | null = null;

function isLocalDevelopment(request: Request) {
  const hostname = new URL(request.url).hostname;
  return (
    process.env.NODE_ENV === "development" &&
    (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]")
  );
}

async function runMarketRefresh(): Promise<RefreshResult> {
  const { execFile } = await import("node:child_process");
  const execFileAsync = promisify(execFile);
  const intraday = isTaipeiMarketWindow();
  const script = intraday
    ? "scripts/refresh-intraday-snapshot.mjs"
    : "scripts/fetch-market-snapshot.mjs";
  const { stdout } = await execFileAsync(
    process.execPath,
    ["--env-file-if-exists=.env.local", script],
    {
      cwd: path.resolve(/* turbopackIgnore: true */ process.cwd()),
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 2 * 1024 * 1024,
      env: process.env
    }
  );
  const finalLine = stdout.trim().split(/\r?\n/).at(-1) ?? "市場資料更新完成";
  return {
    mode: intraday ? "intraday" : "full-close",
    message: finalLine
  };
}

export async function POST(request: Request) {
  if (!isLocalDevelopment(request)) {
    return Response.json(
      { error: "市場更新目前只允許在本機開發網站執行。" },
      { status: 403 }
    );
  }

  if (activeRefresh) {
    return Response.json(
      { error: "市場資料正在更新，請等待目前這次完成。" },
      { status: 409 }
    );
  }

  activeRefresh = runMarketRefresh();
  try {
    const result = await activeRefresh;
    return Response.json({
      ...result,
      completedAt: taipeiClock().time
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知錯誤";
    console.error("Market refresh failed", error);
    return Response.json(
      { error: `市場資料更新失敗：${detail}` },
      { status: 500 }
    );
  } finally {
    activeRefresh = null;
  }
}
