import type { Metadata } from "next";
import { Call } from "@/components/ai/Call";

export const metadata: Metadata = { title: "Залгах — AI дуудлагын төв" };

export default function Page() {
  return <Call />;
}
