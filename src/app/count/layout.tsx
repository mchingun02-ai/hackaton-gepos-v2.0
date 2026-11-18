import type { Metadata, Viewport } from "next";
import { Google_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "../gp2.css";

/* GePOS v2.0 брэнд: Google Sans (кирилл + Ө, Ү-д cyrillic-ext) */
const gsans = Google_Sans({ subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "700"], variable: "--font-gsans", display: "swap" });

export const metadata: Metadata = {
  title: "Тооллого — GePOS",
  description: "Ажилтан утсаараа бараа тоолох: тавиурын зураг, баркод, гараар.",
  manifest: "/count.webmanifest",
  appleWebApp: { capable: true, title: "Тооллого", statusBarStyle: "default" },
  icons: { apple: "/count-icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0046E2",
};

export default function Layout({ children }: { children: ReactNode }) {
  return <div className={`gp2 ${gsans.variable} min-h-dvh`}>{children}</div>;
}
