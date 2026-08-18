"use client";

import { useEffect } from "react";
import { readJsonResponse } from "../lib/read-json-response";

export const SIGNAL_RESEARCH_SYNC_EVENT = "signal-research-sync";

interface SyncResponse {
  completed: boolean;
  nextProfileIndex: number;
  totalProfiles: number;
  observationCount: number;
  error?: string;
}

export function SignalResearchSync() {
  useEffect(() => {
    const controller = new AbortController();

    const synchronize = async () => {
      try {
        for (let attempt = 0; attempt < 40; attempt += 1) {
          const response = await fetch("/api/signal-research", {
            method: "POST",
            signal: controller.signal,
          });
          const payload = await readJsonResponse<SyncResponse>(
            response,
            "研究樣本同步服務暫時無法讀取",
          );
          if (!response.ok) throw new Error(payload.error ?? "研究樣本同步失敗");
          window.dispatchEvent(
            new CustomEvent(SIGNAL_RESEARCH_SYNC_EVENT, { detail: payload }),
          );
          if (payload.completed) return;
        }
        throw new Error("研究樣本尚未完成，稍後會繼續補齊");
      } catch (error) {
        if (controller.signal.aborted) return;
        window.dispatchEvent(
          new CustomEvent(SIGNAL_RESEARCH_SYNC_EVENT, {
            detail: {
              error:
                error instanceof Error ? error.message : "研究樣本同步失敗",
            },
          }),
        );
      }
    };

    void synchronize();
    return () => controller.abort();
  }, []);

  return null;
}
