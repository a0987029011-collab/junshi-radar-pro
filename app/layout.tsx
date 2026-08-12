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
    "以 H1 次根確認、無前視逐 K 追蹤線、MACD 負柱縮短或零軸上雙線向上，以及 DPO 上彎掃描台股紅 K 穿越訊號。";

  return {
    title: {
      default: "軍師雷達｜下降趨勢線紅 K 穿越",
      template: "%s｜軍師雷達",
    },
    description,
    applicationName: "軍師雷達",
    openGraph: {
      type: "website",
      title: "軍師雷達｜下降趨勢線紅 K 穿越",
      description,
      images: [`${origin}/og.png`],
    },
    twitter: {
      card: "summary_large_image",
      title: "軍師雷達｜下降趨勢線紅 K 穿越",
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
