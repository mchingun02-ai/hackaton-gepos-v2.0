/**
 * Хамгаалалтын толгойнууд (docs/ARCHITECTURE.md §4.4, §4A.4, §11) — DB хандалтгүй.
 *   /ai/chat, /ai/call  → frame-ancestors *   (widget iframe — эзэн сайтын JS чат руу хүрэхгүй)
 *   /connect, /ai       → frame-ancestors 'self' + түншийн frame_origins (embed токен ?e= эсвэл HMAC-тай gp_fa cookie-оос)
 *   бусад               → frame-ancestors 'self'
 */
import { NextResponse, type NextRequest } from "next/server";
import { FA_COOKIE, verifyEmbed, verifyFa } from "@/lib/tenant/embed";

export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  const res = NextResponse.next();
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", p.startsWith("/connect") ? "no-referrer" : "strict-origin-when-cross-origin");
  let fa = "'self'";
  if (p.startsWith("/ai/chat") || p.startsWith("/ai/call")) fa = "*";
  else if (p.startsWith("/connect") || p === "/ai" || p.startsWith("/ai/")) {
    const e = req.nextUrl.searchParams.get("e");
    const list = e ? (verifyEmbed(e)?.fa ?? []) : verifyFa(req.cookies.get(FA_COOKIE)?.value);
    if (list.length) fa = ["'self'", ...list].join(" ");
  }
  res.headers.set("Content-Security-Policy", `frame-ancestors ${fa}`);
  return res;
}

export const config = {
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|icon.png|manifest|.*\\.(?:js|css|png|jpg|svg|webp|ico|json|txt|map)$).*)"],
};
