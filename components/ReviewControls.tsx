"use client";

import type { ReviewStatus } from "../lib/types";
import { useEffect, useState } from "react";

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

export function WatchButton({ symbol }: { symbol: string }) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const symbols = JSON.parse(
      localStorage.getItem("junshi-watchlist") || "[]"
    ) as string[];
    // Device-local data can only be hydrated after the component mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActive(symbols.includes(symbol));
  }, [symbol]);

  function toggle() {
    const symbols = JSON.parse(
      localStorage.getItem("junshi-watchlist") || "[]"
    ) as string[];
    const next = active
      ? symbols.filter((item) => item !== symbol)
      : [...new Set([...symbols, symbol])];
    localStorage.setItem("junshi-watchlist", JSON.stringify(next));
    setActive(!active);
  }

  return (
    <button
      className={`watch-button ${active ? "active" : ""}`}
      onClick={toggle}
      type="button"
    >
      {active ? "已加入追蹤" : "加入追蹤"}
    </button>
  );
}
