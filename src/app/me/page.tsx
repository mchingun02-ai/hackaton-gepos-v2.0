import { redirect } from "next/navigation";

/* Хэрэглэгчийн булан одоо Gerege аппын нэг хэсэг — хуучин холбоосыг дагуулна */
export default async function Page({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const { code } = await searchParams;
  redirect(code ? `/app?code=${encodeURIComponent(code)}` : "/app");
}
