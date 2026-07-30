import Link from "next/link";
import type { ReactNode } from "react";
import { marketSnapshotMeta } from "../lib/market-data";

const nav = [
  { href: "/", icon: "⌁", label: "雷達" },
  { href: "/positions", icon: "◎", label: "持股" },
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
  return (
    <div className="app-shell">
      <header className="topbar">
        <Link className="brand" href="/" aria-label="軍師雷達首頁">
          <span className="brand-mark">軍</span>
          <span>
            <span className="brand-name">軍師雷達</span>
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
          <span>上市櫃盤後 · {marketSnapshotMeta.dataAsOf.slice(5)}</span>
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
