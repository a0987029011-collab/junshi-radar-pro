"use client";

import { useEffect } from "react";
import { readJsonResponse } from "../lib/read-json-response";
import type { PaperTradingDashboard } from "../lib/paper-trading";

export const PAPER_TRADING_SYNC_EVENT = "junshi-paper-trading-sync";

export function PaperTradingSync() {
  useEffect(() => {
    let cancelled = false;
    const sync = async () => {
      try {
        const response = await fetch("/api/paper-trading", {
          method: "POST",
          cache: "no-store",
        });
        const payload = await readJsonResponse<
          PaperTradingDashboard & { error?: string }
        >(response, "模擬交易服務暫時無法讀取");
        if (!response.ok) {
          throw new Error(payload.error ?? "模擬交易同步失敗");
        }
        if (!cancelled) {
          window.dispatchEvent(
            new CustomEvent(PAPER_TRADING_SYNC_EVENT, { detail: payload }),
          );
        }
      } catch (error) {
        if (!cancelled) {
          window.dispatchEvent(
            new CustomEvent(PAPER_TRADING_SYNC_EVENT, {
              detail: {
                error:
                  error instanceof Error
                    ? error.message
                    : "模擬交易同步失敗",
              },
            }),
          );
        }
      }
    };
    const timer = window.setTimeout(() => void sync(), 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  return null;
}
