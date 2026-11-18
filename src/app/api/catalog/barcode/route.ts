import { NextResponse } from "next/server";
import { contribute, isBuna, lookup } from "@/lib/catalog/server";

/** GET ?code= — баркодоор нэр, БҮНА хайна (и-Баримтын сан → GePOS-ын сан) */
export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.replace(/\D/g, "") ?? "";
  if (code.length < 6 || code.length > 14) return NextResponse.json({ error: "bad_code" }, { status: 400 });
  return NextResponse.json(lookup(code));
}

/** POST {code,name,buna} — санд олдоогүй баркодын нэр, ангиллыг GePOS-ын санд нэмнэ */
export async function POST(request: Request) {
  const b = (await request.json().catch(() => ({}))) as { code?: string; name?: string; buna?: string };
  const code = String(b.code ?? "").replace(/\D/g, "");
  const name = String(b.name ?? "").trim();
  const buna = String(b.buna ?? "");
  if (code.length < 6 || !name || !isBuna(buna)) return NextResponse.json({ error: "bad_input" }, { status: 400 });
  contribute(code, name, buna);
  return NextResponse.json({ ok: true });
}
