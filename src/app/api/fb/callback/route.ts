import { NextResponse, type NextRequest } from "next/server";
import { cfg, connectPage, DEMO_PAGES, fbError, graph, isDemo, readState, redirectUri, savePending, type PendingPage } from "@/lib/fb/server";

type Account = { id: string; name: string; access_token: string; category?: string; tasks?: string[]; picture?: { data?: { url?: string } } };

/**
 * Business Login эсвэл бизнес портфолиод (Business Manager) харьяалагдах Page үед `/me/accounts` хоосон ирдэг.
 * Тэр үед мерчантын сонгосон Page-үүдийн ID токены granular_scopes-д байдаг — тэндээс Page бүрийг уншина.
 */
async function grantedPages(userToken: string): Promise<Account[]> {
  const c = cfg();
  const u = new URL(`${c.graph}/debug_token`);
  u.searchParams.set("input_token", userToken);
  u.searchParams.set("access_token", `${c.appId}|${c.secret}`);
  const dbg = (await (await fetch(u, { cache: "no-store" })).json()) as { data?: { granular_scopes?: { scope: string; target_ids?: string[] }[] } };
  const scopes = dbg.data?.granular_scopes ?? [];
  const ids = new Set<string>();
  for (const sc of scopes) if (["pages_messaging", "pages_show_list", "pages_manage_metadata"].includes(sc.scope)) sc.target_ids?.forEach((x) => ids.add(x));
  console.info("[fb] callback: granular page ids", ids.size);
  const out: Account[] = [];
  for (const id of ids) {
    try {
      out.push(await graph<Account>("GET", `/${id}?fields=id,name,access_token,category,picture{url}`, userToken));
    } catch (e) {
      console.warn("[fb] page", id, fbError(e));
    }
  }
  // Токенгүй ирсэн Page-ийг (эрх хүрэлцээгүй) холбох боломжгүй
  return out.filter((a) => a.access_token);
}

/** Facebook-ээс буцаж ирэх хаяг: code → урт хугацаат токен → Page-үүд → порталд сонгуулна */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  const back = (params: Record<string, string>) => {
    const u = new URL("/portal", req.url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    if (params.fberror) console.warn("[fb] callback:", params.fberror);
    u.hash = "chat";
    const res = NextResponse.redirect(u);
    res.cookies.delete({ name: "sp_fb_nonce", path: "/api/fb" });
    return res;
  };
  if (q.get("error")) return back({ fberror: q.get("error") === "access_denied" ? "Facebook холболтыг цуцаллаа." : q.get("error_description") || "Facebook холболт амжилтгүй." });
  const merchant = readState(q.get("state") || "", req.cookies.get("sp_fb_nonce")?.value);
  const code = q.get("code");
  if (!merchant || !code) return back({ fberror: "Холболтын хугацаа дууссан эсвэл буруу хүсэлт. Дахин оролдоно уу." });

  try {
    let pages: PendingPage[];
    if (isDemo()) pages = DEMO_PAGES.map((p) => ({ ...p, token: "demo" }));
    else {
      const c = cfg();
      const ex = new URL(`${c.graph}/oauth/access_token`);
      ex.searchParams.set("client_id", c.appId);
      ex.searchParams.set("client_secret", c.secret);
      ex.searchParams.set("redirect_uri", redirectUri(req));
      ex.searchParams.set("code", code);
      const short = await (await fetch(ex, { cache: "no-store" })).json();
      if (!short.access_token) throw new Error(short.error?.message || "Токен авч чадсангүй");
      // Урт хугацаат хэрэглэгчийн токеноос авсан Page токен хугацаагүй байдаг
      const ll = new URL(`${c.graph}/oauth/access_token`);
      ll.searchParams.set("grant_type", "fb_exchange_token");
      ll.searchParams.set("client_id", c.appId);
      ll.searchParams.set("client_secret", c.secret);
      ll.searchParams.set("fb_exchange_token", short.access_token);
      const long = await (await fetch(ll, { cache: "no-store" })).json();
      const userToken: string = long.access_token || short.access_token;
      const acc = await graph<{ data: Account[] }>("GET", "/me/accounts?fields=id,name,access_token,category,tasks,picture{url}&limit=100", userToken);
      // Оношлогоо: хэрэглэгч ямар эрх олгосныг бүртгэлд бичнэ (токенгүй)
      const perms = await graph<{ data: { permission: string; status: string }[] }>("GET", "/me/permissions", userToken).catch(() => ({ data: [] }));
      console.info("[fb] callback: pages", acc.data?.length ?? 0, "perms", perms.data.map((x) => `${x.permission}:${x.status}`).join(","));
      let list = acc.data || [];
      if (!list.length) list = await grantedPages(userToken);
      pages = list.map((a) => ({
        id: a.id,
        name: a.name,
        category: a.category,
        pic: a.picture?.data?.url,
        // Мессеж бичих эрхтэй эсэх (Page-ийн үүрэг)
        canMessage: !a.tasks || a.tasks.some((t) => t === "MESSAGING" || t === "MODERATE" || t === "MANAGE"),
        token: a.access_token,
      }));
    }
    if (!pages.length) return back({ fberror: "Таны Facebook хаягт удирддаг Page олдсонгүй (эсвэл Page сонгоогүй)." });
    // Facebook дээр нэг Page сонгосон бол порталд дахин асуухгүй — шууд холбоно
    const usable = pages.filter((p) => p.canMessage);
    if (usable.length === 1) {
      await connectPage(merchant, usable[0], "Мерчант", isDemo());
      return back({ fbok: usable[0].name });
    }
    if (!usable.length) return back({ fberror: "Сонгосон Page-д мессеж бичих эрх алга. Page-ийн админ эрхтэй хаягаар холбоно уу." });
    return back({ fbpick: savePending(merchant, pages) });
  } catch (e) {
    return back({ fberror: fbError(e) });
  }
}
