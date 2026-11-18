import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cfg, isDemo, merchantOf, redirectUri, SCOPES, signState } from "@/lib/fb/server";

/** «Facebook холбох» товч энд ирнэ → Facebook-ийн нэвтрэх цонх руу үсэрнэ */
export async function GET(req: NextRequest) {
  let merchant: string;
  try {
    merchant = merchantOf(req);
  } catch {
    return NextResponse.redirect(new URL("/portal?fberror=" + encodeURIComponent("Мерчант тодорхойгүй") + "#chat", req.url));
  }
  const nonce = randomBytes(16).toString("base64url");
  const state = signState(merchant, nonce);
  const c = cfg();
  let to: URL;
  if (isDemo()) {
    // Демо: Facebook руу явахгүй, шууд буцах хаяг руу
    to = new URL("/api/fb/callback", req.url);
    to.searchParams.set("code", "demo");
  } else {
    to = new URL(`https://www.facebook.com/${c.version}/dialog/oauth`);
    to.searchParams.set("client_id", c.appId);
    to.searchParams.set("redirect_uri", redirectUri(req));
    to.searchParams.set("response_type", "code");
    // Facebook Login for Business-ийн тохиргоо байвал түүгээр, эс бөгөөс эрхүүдийг шууд
    if (c.configId) to.searchParams.set("config_id", c.configId);
    else to.searchParams.set("scope", SCOPES.join(","));
  }
  to.searchParams.set("state", state);
  const res = NextResponse.redirect(to);
  res.cookies.set("sp_fb_nonce", nonce, { httpOnly: true, sameSite: "lax", secure: req.nextUrl.protocol === "https:", path: "/api/fb", maxAge: 900 });
  return res;
}
