import type { Metadata } from "next";
import { CustomerChat } from "@/components/ai/CustomerChat";

export const metadata: Metadata = { title: "Чат — AI туслах" };

export default function Page() {
  return <CustomerChat />;
}
