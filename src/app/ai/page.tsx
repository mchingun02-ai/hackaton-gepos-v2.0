import type { Metadata } from "next";
import AiApp from "@/components/ai/AiApp";

export const metadata: Metadata = {
  title: "AI ажилтан — Gerege POS",
  description: "Захирлын тушаалыг гүйцэтгэдэг, харилцагчид хариулдаг AI ажилтан.",
};

export default function Page() {
  return <AiApp />;
}
