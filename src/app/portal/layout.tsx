import { Google_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "../gp2.css";

/*
 * Порталын өөрийн сэдэв (Geist + Onest, улбар шар) хэвээр. Google Sans-ыг зөвхөн хувьсагчаар ачаална —
 * порталд шингээсэн AI ажилтны хэсэг (.gp2 брэнд хүрээ) үүнийг хэрэглэнэ. `contents` нь байрлалд нөлөөлөхгүй.
 */
const gsans = Google_Sans({ subsets: ["latin", "cyrillic", "cyrillic-ext"], weight: ["400", "500", "700"], variable: "--font-gsans", display: "swap" });

export default function Layout({ children }: { children: ReactNode }) {
  return <div className={`${gsans.variable} contents`}>{children}</div>;
}
