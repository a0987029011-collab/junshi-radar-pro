"use client";

import type { ReviewStatus } from "../lib/types";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { WatchlistPositionItem } from "../lib/watchlist";

const statuses: { value: ReviewStatus; label: string }[] = [
  { value: "passed", label: "通過" },
  { value: "watching", label: "觀察" },
  { value: "excluded", label: "排除" }
];

export function ReviewControls({ symbol }: { symbol: string }) {
  const [status, setStatus] = useState<ReviewStatus | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(`junshi-review-${symbol}`);
    // Device-local data can only be hydrated after the component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (stored) setStatus(stored as ReviewStatus);
  }, [symbol]);

  function update(next: ReviewStatus) {
    setStatus(next);
    localStorage.setItem(`junshi-review-${symbol}`, next);
  }

  return (
    <div className="review-row" aria-label="人工審核">
      {statuses.map((item) => (
        <button
          className={`review-button ${status === item.value ? "selected" : ""}`}
          key={item.value}
          onClick={() => update(item.value)}
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function WatchButton({ symbol, name }: { symbol: string; name: string }) {
  const router = useRouter();
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const legacySymbols = JSON.parse(
      localStorage.getItem("junshi-watchlist") || "[]"
    ) as string[];

    async function hydrate() {
      try {
        const response = await fetch("/api/watchlist", { cache: "no-store" });
        const body = (await response.json()) as {
          items?: WatchlistPositionItem[];
          error?: string;
        };
        if (!response.ok) throw new Error(body.error ?? "追蹤清單讀取失敗");
        let isActive = Boolean(body.items?.some((item) => item.symbol === symbol));

        if (!isActive && legacySymbols.includes(symbol)) {
          const migration = await fetch("/api/watchlist", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ symbol, name })
          });
          if (!migration.ok) throw new Error("舊追蹤資料轉存失敗");
          isActive = true;
          localStorage.setItem(
            "junshi-watchlist",
            JSON.stringify(legacySymbols.filter((item) => item !== symbol))
          );
        }

        if (!cancelled) setActive(isActive);
      } catch {
        if (!cancelled) setActive(legacySymbols.includes(symbol));
      }
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [name, symbol]);

  async function toggle() {
    setBusy(true);
    try {
      const response = await fetch(
        active ? `/api/watchlist?symbol=${encodeURIComponent(symbol)}` : "/api/watchlist",
        active
          ? { method: "DELETE" }
          : {
              method: "PUT",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ symbol, name })
            }
      );
      if (!response.ok) throw new Error("追蹤清單更新失敗");
      setActive(!active);
      if (!active) router.push(`/positions?symbol=${encodeURIComponent(symbol)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="watch-flow-actions">
      <button
        className={`watch-button ${active ? "active" : ""}`}
        disabled={busy}
        onClick={toggle}
        type="button"
      >
        {busy ? "處理中…" : active ? "已加入追蹤" : "加入追蹤"}
      </button>
      {active ? (
        <button
          className="watch-position-button"
          onClick={() => router.push(`/positions?symbol=${encodeURIComponent(symbol)}`)}
          type="button"
        >
          登錄持股 →
        </button>
      ) : null}
    </div>
  );
}
