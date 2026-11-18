/**
 * Захирлын тушаалыг туслахад чиглүүлэх (docs/ARCHITECTURE.md §10):
 *   (a) UI-д гараар сонгосон → шууд
 *   (b) түлхүүр үгийн дүрэм — яг нэг туслах таарвал тэр
 *   (c) таарахгүй бол qwen-flash JSON {assistant, reason} (usage.kind "route", 0 кредит, ≤150 токен)
 *   (d) олон салбар / итгэлгүй / алдаа → chief (бүх director хэрэгсэл)
 * Харилцагчийн сувагт чиглүүлэгч ажиллахгүй — нэгдсэн `service` туслах (registry CUSTOMER_TOOLS).
 */
import { chat, qcfg } from "@/lib/agent/qwen";
import type { TenantContext } from "@/lib/tenant/context";
import { ASSISTANTS, isAssistant, type AssistantId } from "./registry";

export type Route = { id: AssistantId; via: "manual" | "keyword" | "llm" | "default"; reason?: string };

const RULES: [Exclude<AssistantId, "chief" | "service">, RegExp][] = [
  ["inventory", /тооллог|үлдэгдэл|нөөц|дуусаж буй|дутагдал|зөрүү|захиалах санал|агуулах/i],
  ["marketing", /хямдрал|урамшуулал|купон|сурталчил|кампанит|сегмент|маркетинг/i],
  ["tax", /нөат|нхат|татвар|и-?баримт|ebarimt|бүна/i],
  ["finance", /борлуулалт|орлого|тайлан|ашиг|буцаалт|кредит|зарцуулалт|санхүү/i],
  ["sales", /захиалга|хүргэлт/i],
];

/** Түлхүүр үгээр: таарсан туслахуудын жагсаалт (давхардалгүй) */
export function keywordMatches(text: string): AssistantId[] {
  return RULES.filter(([, re]) => re.test(text)).map(([id]) => id);
}

export async function route(ctx: TenantContext, text: string, manual?: unknown): Promise<Route> {
  if (isAssistant(manual) && manual !== "service") return { id: manual, via: "manual" };
  const hits = keywordMatches(text);
  if (hits.length === 1) return { id: hits[0], via: "keyword" };
  if (hits.length > 1) return { id: "chief", via: "default", reason: "олон салбар" };
  try {
    const list = (Object.values(ASSISTANTS) as (typeof ASSISTANTS)[AssistantId][])
      .filter((a) => a.channels.includes("director"))
      .map((a) => `${a.id}: ${a.purpose}`)
      .join("\n");
    const m = await chat(
      ctx,
      [
        { role: "system", content: `Захирлын тушаалыг аль туслах гүйцэтгэхийг сонго. Туслахууд:\n${list}\nОлон салбарт хамаарах эсвэл тодорхойгүй бол chief. ЗӨВХӨН JSON: {"assistant":"<id>","reason":"<5 үг>"}` },
        { role: "user", content: `<data>${text.slice(0, 600)}</data>` },
      ],
      { model: qcfg().fast, json: true, kind: "route", temperature: 0, maxTokens: 150 },
    );
    const raw = String(m.content ?? "");
    const j = JSON.parse(/\{[\s\S]*\}/.exec(raw)?.[0] ?? "{}") as { assistant?: string; reason?: string };
    if (isAssistant(j.assistant) && j.assistant !== "service" && ASSISTANTS[j.assistant].channels.includes("director"))
      return { id: j.assistant, via: "llm", reason: String(j.reason ?? "").slice(0, 80) };
  } catch {
    /* чиглүүлэгч алдаа — chief */
  }
  return { id: "chief", via: "default" };
}
