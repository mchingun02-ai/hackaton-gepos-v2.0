import { NextResponse } from "next/server";
import { bunaName, searchBuna } from "@/lib/catalog/server";

/** GET ?q= — БҮНА-гаас нэрээр хайх; ?code= — нэрийг нь авах */
export async function GET(request: Request) {
  const u = new URL(request.url).searchParams;
  const code = u.get("code");
  if (code) return NextResponse.json({ code, name: bunaName(code) ?? null });
  return NextResponse.json(searchBuna(u.get("q") ?? ""));
}
