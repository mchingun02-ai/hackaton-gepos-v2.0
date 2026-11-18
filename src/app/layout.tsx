import type { Metadata, Viewport } from "next";
import { Geist, Onest } from "next/font/google";
import "./globals.css";
import "./sp.css";

/* Geist — тоо, латин. Onest — монгол кирилл. Браузер үсэг бүрээр сонгоно. */
const geist = Geist({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-geist" });
const onest = Onest({ subsets: ["latin", "cyrillic"], weight: ["400", "500", "600", "700", "800"], variable: "--font-onest" });

export const metadata: Metadata = {
  title: "Gerege POS — кассын дэлгэц",
  description: "Дизайн батлуулах хувилбар",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ff6a00",
};

/* Эхний будалтаас ӨМНӨ сэдвийг тавина — эс бөгөөс харанхуй горим
   цагаанаар анивчина (skill-ийн "hard-won implementation rules"). */
const noFlash = `try{var t=localStorage.getItem('gp-theme');if(t){document.documentElement.dataset.theme=t}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" data-theme="light" className={`${geist.variable} ${onest.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: noFlash }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
