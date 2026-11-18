import { legacyNotFound, legacyOn } from "@/lib/ai/legacy";
import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { aiDemo, authUrl } from "@/lib/ai/server";
import { merchantOf, signState } from "@/lib/fb/server";

/** «Google-ээр холбох» → Google-ийн зөвшөөрлийн цонх */
export async function GET(req: NextRequest) {
  if (!legacyOn()) return legacyNotFound();
  let merchant: string;
  try {
    merchant = merchantOf(req);
  } catch {
    return NextResponse.redirect(new URL("/portal?aierror=" + encodeURIComponent("Мерчант тодорхойгүй") + "#ai", req.url));
  }
  const nonce = randomBytes(16).toString("base64url");
  const state = signState(merchant, nonce);
  let to: URL;
  if (aiDemo()) {
    to = new URL("/api/ai/callback", req.url);
    to.searchParams.set("code", "demo");
    to.searchParams.set("state", state);
  } else to = authUrl(req, state);
  const res = NextResponse.redirect(to);
  res.cookies.set("sp_ai_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/ai", maxAge: 900 });
  return res;
}
