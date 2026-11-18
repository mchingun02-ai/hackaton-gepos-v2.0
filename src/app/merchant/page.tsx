import type { Metadata } from "next";
import MerchantApp from "@/components/merchant/MerchantApp";

export const metadata: Metadata = {
  title: "Gerege POS — мерчантын апп",
  description: "Захиалга, харилцагч, маркетинг, тайлангаа утаснаасаа хянах",
};

export default function Page() {
  return <MerchantApp />;
}
