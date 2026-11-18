import type { Metadata } from "next";
import TaxSetup from "@/components/admin/TaxSetup";

export const metadata: Metadata = {
  title: "Хэрэглэгч бүртгэх · Татвар — admin.geregepos.mn",
};

export default function Page() {
  return <TaxSetup />;
}
