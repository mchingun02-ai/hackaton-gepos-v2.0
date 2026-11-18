import type { Metadata } from "next";
import PortalApp from "@/components/portal/PortalApp";

export const metadata: Metadata = {
  title: "Merchant portal — Gerege POS Store Plus",
  description: "Бараа, хүргэлт, урамшуулал, харилцагч, тайлангаа нэг дороос удирдана.",
};

export default function Page() {
  return <PortalApp />;
}
