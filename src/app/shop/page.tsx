import type { Metadata } from "next";
import ShopApp from "@/components/shop/ShopApp";

export const metadata: Metadata = {
  title: "Хүргэлтийн захиалга",
  description: "Дэлгүүрээс бараа захиалж, гэртээ хүлээн аваарай",
};

export default function Page() {
  return <ShopApp />;
}
