import type { Metadata } from "next";
import Connect from "@/components/connect/Connect";

export const metadata: Metadata = {
  title: "AI ажилтан холбох — Gerege AI",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

/** /connect?e=<embed токен> — түншийн ПОС-оос нээгдэх onboarding (нөхцөл → багц → QPay sandbox → самбар) */
export default async function Page({ searchParams }: PageProps<"/connect">) {
  const e = (await searchParams).e;
  return <Connect token={typeof e === "string" ? e : ""} />;
}
