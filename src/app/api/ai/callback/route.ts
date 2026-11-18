import { legacyNotFound, legacyOn } from "@/lib/ai/legacy";
import { NextResponse, type NextRequest } from "next/server";
import { aiDemo, exchangeCode, gError, saveAccount } from "@/lib/ai/server";
import { readState } from "@/lib/fb/server";

/** Google-ээс буцаж ирэх хаяг: code → refresh token (шифрлэж хадгална) → порталд project сонгуулна */
export async function GET(req: NextRequest) {
  if (!legacyOn()) return legacyNotFound();
  const q = req.nextUrl.searchParams;
  const back = (params: Record<string, string>) => {
    const u = new URL("/portal", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (params.aierror) console.warn("[ai] callback:", params.aierror);
    u.hash = "ai";
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: "sp_ai_nonce", path: "/api/ai" });
    return res;
  };
  if (q.get("error")) return back({ aierror: q.get("error") === "access_denied" ? "Google холболтыг цуцаллаа." : `Google: ${q.get("error")}` });
  const merchant = readState(q.get("state") || "", req.cookies.get("sp_ai_nonce")?.value);
  const code = q.get("code");
  if (!merchant || !code) return back({ aierror: "Холболтын хугацаа дууссан эсвэл буруу хүсэлт. Дахин оролдоно уу." });
  try {
    if (aiDemo()) saveAccount(merchant, "demo.merchant@gmail.com", "demo", true);
    else {
      const t = await exchangeCode(req, code);
      saveAccount(merchant, t.email, t.refresh, false, { t: t.access, until: t.expires });
    }
    return back({ aiok: "1" });
  } catch (e) {
    return back({ aierror: gError(e) });
  }
}
