import type { Metadata, Viewport } from "next";
import CustomerApp from "@/components/app/CustomerApp";

export const metadata: Metadata = {
  title: "Gerege — урамшуулал, хэтэвч",
  description: "Gerege POS-той хамтрагч дэлгүүрүүдийн урамшуулал, хүргэлт, оноо, хэтэвч",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Gerege", statusBarStyle: "default" },
  icons: { icon: "/app-icon-192.png", apple: "/app-icon-180.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff6a00",
};

export default function Page() {
  return <CustomerApp />;
}
