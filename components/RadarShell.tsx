import Link from "next/link";
import type { ReactNode } from "react";
import { AutoReloadOnDataChange } from "./AutoReloadOnDataChange";
import { APP_RELEASE_DATE, APP_VERSION } from "../lib/app-version";
import { marketSnapshotMeta } from "../lib/market-data";
import { SignalResearchSync } from "./SignalResearchSync";
import { PaperTradingSync } from "./PaperTradingSync";

const nav = [
  { href: "/", icon: "⌁", label: "雷達" },
  { href: "/reversal", icon: "↗", label: "轉勢" },
  { href: "/positions", icon: "◎", label: "持股" },
  { href: "/paper-trading", icon: "▣", label: "模擬" },
  { href: "/research", icon: "⌬", label: "研究" },
  { href: "/strategy", icon: "⚙", label: "策略" }
];

export function RadarShell({
  children,
  activePath
}: {
  children: ReactNode;
  activePath: string;
}) {
  const intraday =
    marketSnapshotMeta.marketPhase === "intraday" ||
    marketSnapshotMeta.mode.includes("intraday");
  return (
    <div className="app-shell">
      <SignalResearchSync />
      <PaperTradingSync />
      <AutoReloadOnDataChange
        initialSnapshotGeneratedAt={marketSnapshotMeta.generatedAt}
      />
      <header className="topbar">
        <Link className="brand" href="/" aria-label="軍師雷達首頁">
          <span className="brand-mark">軍</span>
          <span>
            <span className="brand-title-row">
              <span className="brand-name">軍師雷達</span>
              <span
                className="brand-version"
                title={`版本 ${APP_VERSION}，改版日期 ${APP_RELEASE_DATE}`}
              >
                <span className="brand-version-short">
                  v{APP_VERSION.split(".").slice(0, 2).join(".")} · {APP_RELEASE_DATE.slice(5)}
                </span>
                <span className="brand-version-long">v{APP_VERSION} · {APP_RELEASE_DATE}</span>
              </span>
            </span>
            <span className="brand-subtitle">TW Market Signal Desk</span>
          </span>
        </Link>
        <nav className="desktop-nav" aria-label="主要導覽">
          {nav.map((item) => (
            <Link
              className={`nav-link ${activePath === item.href ? "active" : ""}`}
              href={item.href}
              key={item.href}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <div className="market-state">
          <span className="state-dot" />
          <span>
            上市櫃{intraday ? "盤中" : "盤後"} · {marketSnapshotMeta.dataAsOf.slice(5)}
            {intraday && marketSnapshotMeta.quoteTime
              ? ` ${marketSnapshotMeta.quoteTime.slice(0, 5)}`
              : ""}
          </span>
        </div>
      </header>
      <main className="page-wrap">{children}</main>
      <nav className="bottom-nav" aria-label="手機導覽">
        {nav.map((item) => (
          <Link
            className={`nav-link ${activePath === item.href ? "active" : ""}`}
            href={item.href}
            key={item.href}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
    </div>
  );
}
