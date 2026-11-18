import { NextResponse } from "next/server";
import { taxpayer } from "@/lib/catalog/server";

/** GET ?reg= — и-Баримтаас НӨАТ, НХАТ төлөгч эсэх (getTinInfo → getInfo) */
export async function GET(request: Request) {
  const reg = new URL(request.url).searchParams.get("reg")?.trim() ?? "";
  if (!/^[\dА-ЯӨҮЁа-яөүё]{7,10}$/.test(reg)) return NextResponse.json({ error: "bad_reg" }, { status: 400 });
  try {
    return NextResponse.json(await taxpayer(reg));
  } catch (e) {
    return NextResponse.json({ error: "ebarimt_unreachable", message: e instanceof Error ? e.message : "" }, { status: 503 });
  }
}
