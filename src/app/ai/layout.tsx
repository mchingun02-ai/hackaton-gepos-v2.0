import { Google_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "../gp2.css";

/* GePOS v2.0 брэнд: Google Sans (кирилл + Ө, Ү-д cyrillic-ext) */
const gsans = Google_Sans({ subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "700"], variable: "--font-gsans", display: "swap" });

export default function Layout({ children }: { children: ReactNode }) {
  return <div className={`gp2 ${gsans.variable}`}>{children}</div>;
}
