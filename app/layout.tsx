import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description =
    "以日、週、月共振、MACD、DPO、趨勢線與結構支撐掃描台股的人工決策輔助工具。";

  return {
    title: {
      default: "軍師雷達｜台股多週期掃描",
      template: "%s｜軍師雷達",
    },
    description,
    applicationName: "軍師雷達",
    openGraph: {
      type: "website",
      title: "軍師雷達｜台股多週期掃描",
      description,
      images: [`${origin}/og.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "軍師雷達｜台股多週期掃描",
      description,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}
