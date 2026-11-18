import { after } from "next/server";
import { fbInbound } from "@/lib/agent/channels";
import { cfg, handleEvent, validSignature } from "@/lib/fb/server";

/** Meta webhook-ийн баталгаажуулалт (App → Webhooks → Callback URL, Verify token) */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const token = cfg().verifyToken;
  if (q.get("hub.mode") !== "subscribe" || !token || q.get("hub.verify_token") !== token) return new Response("forbidden", { status: 403 });
  return new Response(q.get("hub.challenge") || "", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

/** Бүх мерчантын Page-ийн мессеж энд ирнэ — entry.id (Page id)-аар мерчантыг олно */
export async function POST(req: Request) {
  if (!cfg().secret) return new Response("not configured", { status: 503 });
  const raw = Buffer.from(await req.arrayBuffer());
  if (raw.length > 2_000_000) return new Response("too large", { status: 413 });
  if (!validSignature(raw, req.headers.get("x-hub-signature-256"))) return new Response("bad signature", { status: 403 });
  let data: { object?: string; entry?: { id: string; messaging?: Parameters<typeof handleEvent>[0][]; standby?: Parameters<typeof handleEvent>[0][] }[] };
  try {
    data = JSON.parse(raw.toString("utf8"));
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (data.object === "page")
    for (const entry of data.entry ?? [])
      // standby — өөр апп мессеж хүлээн авагч үед ирэх (агуулга нь messaging-тэй ижил)
      for (const ev of [...(entry.messaging ?? []), ...(entry.standby ?? [])]) {
        try {
          const inbound = handleEvent(ev, entry.id);
          // AI ажилтан: тохиргоонд FB суваг асаалттай бол хариулна (webhook-ийг хүлээлгэхгүй)
          if (inbound) after(() => fbInbound(inbound, entry.id));
        } catch (e) {
          console.warn("[fb] event", e);
        }
      }
  // Meta 20 секундэд 200 авахгүй бол дахин илгээдэг
  return Response.json({ ok: true });
}
