/**
 * AI ажилтан — гол давталт.
 *
 *   customerTurn — харилцагч (FB, вэб чат, дуудлага) бичсэн/хэлсэн → мэдлэгийн сан + хэрэгслээр хариулна,
 *                  харилцагчийн картыг шинэчилнэ, гомдлыг тасалбар болгоно, захиалга үүсгэнэ.
 *   directorTurn — захирал энгийн үгээр тушаал өгнө → AI ПОС, CRM, урамшуулал, тайлан дээр бодит үйлдэл хийнэ.
 *                  Эрсдэлтэй үйлдэл (цуцлах, буцаах, олон хүнд мессеж) захирлын батламж хүлээнэ.
 *
 * Бүх inference — Alibaba Cloud Model Studio дээрх Qwen (qwen.ts).
 */
import { allowedTools, ASSISTANTS, needsConfirm, type AssistantId } from "@/lib/assistants/registry";
import { route, type Route } from "@/lib/assistants/router";
import { logError } from "@/lib/log";
import { money } from "@/lib/sp/logic";
import type { TenantContext } from "@/lib/tenant/context";
import { COST, PayError, refund, reserve, settle, type Reservation } from "./billing";
import {
  addMessage,
  contactFor,
  conversationFor,
  getAction,
  getContact,
  getConversation,
  logAction,
  messagesOf,
  setActionStatus,
  setConvStatus,
  updateContact,
  type Channel,
  type Message,
} from "./crm";
import { search } from "./kb";
import { chat, type ChatMsg, type ToolCall } from "./qwen";
import { getSettings } from "./settings";
import { runTool, toolByName, toolDefs, toolsFor, TOOLS, type Scope, type ToolCtx } from "./tools";

export type Step = { tool: string; title: string; args: Record<string, unknown>; ok: boolean; summary: string; status: "done" | "pending" | "error"; action_id: string };
/** Хариу бүрт аль туслах ажилласан (UI чип) */
export type AssistantTag = { id: AssistantId; name: string; via: Route["via"] };
export type TurnResult = {
  reply: string | null;
  steps: Step[];
  convId: string;
  status: "ok" | "human" | "no_credits" | "disabled";
  assistant?: AssistantTag;
  /** энэ ээлжид яриа ажилтанд шилжсэн (FB: «Ажилтан удахгүй хариулна» мөр нэмнэ) */
  handoff?: boolean;
};

const MAX_STEPS = 6;
const AI_ACTOR = { id: "ai", name: "AI ажилтан" };
const AI_DIRECTOR = { id: "ai-director", name: "AI ажилтан (захирлын тушаал)" };

function today() {
  return new Date().toLocaleString("mn-MN", { timeZone: "Asia/Ulaanbaatar", dateStyle: "full", timeStyle: "short" });
}

async function customerSystem(ctx: TenantContext, channel: Channel, contactLine: string, kb: string) {
  const st = getSettings(ctx);
  const voice = channel === "voice";
  const biz = st.businessName || (await ctx.pos.storeInfo()).name;
  return [
    `Чи бол «${biz}»-ийн харилцагчийн үйлчилгээний AI ажилтан «${st.agentName}». Одоо: ${today()}.`,
    st.businessAbout ? `Байгууллагын тухай: ${st.businessAbout}` : "",
    st.businessName
      ? "Байгууллагын бүтээгдэхүүн, төхөөрөмж, үнэ, зээл/лизинг, холбоо барих, хаяг, тусламжийн асуулт бүрт ЭХЛЭЭД search_knowledge-г (өөр өөр түлхүүр үгээр 1–2 удаа) ЗААВАЛ дуудаж, олдсон мэдээллээр хариул. «Мэдээлэл алга» гэхээсээ өмнө заавал хайсан байх ёстой. Санд «тодорхойгүй/баталгаагүй/хуучин» гэж тэмдэглэсэн мэдээллийг тэр тэмдэглэлтэй нь хэл. Өөрийгөө өөр байгууллагын суваг гэж бүү хэл."
      : "",
    `Суваг: ${channel === "fb" ? "Facebook Messenger" : channel === "voice" ? "утасны дуудлага (ярьж байна)" : "вэб чат"}. Ажлын цаг: ${st.hours || "тодорхойгүй (асуувал ажилтан холбогдоно гэж хэл)"}.`,
    "ДҮРЭМ:",
    "- Зөвхөн монгол хэлээр, эелдэг, товч, ойлгомжтой хариул.",
    "- Үнэ, үлдэгдэл, хүргэлт, урамшууллыг ЗААВАЛ хэрэгслээр (list_products, get_store_info) шалгаж хариул. Хэзээ ч таамаглаж, зохиож болохгүй.",
    "- Журам, нөхцөл, буцаалт, баталгааны асуултад мэдлэгийн сангийн мэдээллээр хариул. Санд байхгүй бол «тодорхой мэдээлэл алга, ажилтан холбогдоно» гээд create_ticket (question) дууд.",
    "- ГОМДОЛ = муудсан/чанаргүй бараа, буруу бараа, хүргэлт удсан, ажилтны харилцаа, мөнгө буруу авсан г.м сэтгэл дундуур байдал. Гомдол сонсмогц ЗААВАЛ тэр дороо create_ticket (kind=complaint)-ыг дуудаж бүртгэ, уучлал гуйж, тасалбарын дугаарыг хэл. Журмын дагуу юу хийж болохыг (солих, буцаах нөхцөл) хамт тайлбарла.",
    "- Хэллэг: энгийн, байгалийн ярианы монгол хэл. Орчуулгын амт гаргахгүй, богино өгүүлбэрээр.",
    "- Харилцагч нэр, утас, хаягаа хэлбэл save_contact_info-гоор хадгал.",
    "- Хүргэлтийн захиалга: бараа, тоо, нэр, утас, дүүрэг, хаягийг тодруул → create_delivery_order(confirmed=false)-оор тооцоо ав → тооцоог (бараа бүр, хүргэлт, нийт) хэлж батлуул → харилцагч зөвшөөрвөл ижил мэдээллээр confirmed=true. Тооцоонд «unavailable» байвал яг тэр шалтгааныг хэл.",
    "- Зураг, холбоос, утасны дугаар, вэб хаяг ХЭЗЭЭ Ч бүү зохио. Хэрэгслийн үр дүнд байхгүй баримт хэлэхгүй.",
    "- Буцаалт, мөнгө шилжүүлэх, маргаантай асуудал, эсвэл харилцагч хүнтэй ярих хүсвэл handoff_to_human.",
    "- Дотоод мэдээлэл (өртөг, бусад харилцагч, борлуулалт) хэзээ ч бүү хэл.",
    voice
      ? "- ДУУДЛАГА: 1–3 богино өгүүлбэр. Markdown, жагсаалт, эможи, холбоос бүү хэрэглэ. Тоог үгээр уншихад амар бич."
      : "- Чат: товч, хэрэгтэй үед жагсаалт ашиглаж болно. Markdown гарчиг бүү хэрэглэ.",
    st.instructions ? `ЗАХИРЛЫН НЭМЭЛТ ЗААВАР:\n${st.instructions}` : "",
    contactLine ? `ХАРИЛЦАГЧИЙН КАРТ: ${contactLine}` : "",
    kb ? `МЭДЛЭГИЙН САНГААС (асуултад хамааралтай байж магадгүй):\n${kb}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function directorSystem(ctx: TenantContext, assistant: AssistantId = "chief") {
  const st = getSettings(ctx);
  const store = (await ctx.pos.storeInfo()).name;
  const a = ASSISTANTS[assistant];
  return [
    assistant !== "chief" ? `ТУСЛАХ: «${a.name}» — ${a.purpose}.\n${a.role.map((r) => `- ${r}`).join("\n")}\n- Энэ үүргээс гадуурх хүсэлт бол хийхгүй, «Захирлын туслах»-аар (туслах сонголтгүйгээр) дахин тушаахыг санал болго.` : "",
    `Чи бол «${store}»-ийн захиралд ажилладаг AI ажилтан. Захирлын тушаалыг ПОС, CRM, урамшуулал, мэдлэгийн сан, харилцагчийн сувгууд дээр хэрэгслээр БОДИТООР гүйцэтгэнэ. Одоо: ${today()}.`,
    "ДҮРЭМ:",
    "- Тушаалыг шууд гүйцэтгэ. Шаардлагатай мэдээллийг эхлээд унших хэрэгслээр (list_products, sales_report, list_tickets…) өөрөө ол — захирлаас дахин бүү асуу, зөвхөн үнэхээр тодорхойгүй үед л нэг тодруулах асуулт асуу.",
    "- Олон алхамтай тушаалыг (жишээ нь «гомдол гаргасан хүмүүст купон илгээ») дарааллаар нь бүгдийг хий.",
    "- Хэрэгслийн үр дүнд байгаа тоо, нэрийг л хэл. Юу хийснээ товч дүгнэ: юу өөрчлөгдсөн, хэдэн хүнд хүрсэн, дараа нь юу хийх.",
    "- Батламж хүлээж буй (pending) үйлдэл байвал «Батлах товчийг дарна уу» гэж хэл, хийгдсэн гэж бүү хэл.",
    "- Тайланг товч хүснэгт эсвэл жагсаалтаар, мөнгийг ₮-өөр.",
    "- Монгол хэлээр, ажил хэрэгч.",
    st.instructions ? `ДЭЛГҮҮРИЙН ДҮРЭМ:\n${st.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Өмнөх ярианаас загварт явуулах түүх (сүүлийн 16 мөр) */
function historyOf(msgs: Message[]): ChatMsg[] {
  return msgs
    .filter((m) => m.role === "user" || m.role === "assistant" || m.role === "staff")
    .slice(-16)
    .map((m) => (m.role === "user" ? { role: "user" as const, content: m.text } : { role: "assistant" as const, content: m.role === "staff" ? `[Ажилтан] ${m.text}` : m.text }));
}

async function loop(ctx: ToolCtx, scope: Scope, system: string, history: ChatMsg[], userText: string, assistant: AssistantId) {
  // туслахын дэд олонлог — загварт зөвхөн эдгээрийг санал болгоно (runTool мөн шалгана)
  const tools = toolsFor(scope, ctx.pos.capabilities).filter((t) => !ctx.allow || ctx.allow.has(t.name));
  const defs = toolDefs(tools);
  const confirmRisky = scope === "director" && getSettings(ctx).confirmRisky;
  const msgs: ChatMsg[] = [{ role: "system", content: system }, ...history, { role: "user", content: userText }];
  const steps: Step[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    const m = await chat(ctx, msgs, { tools: defs, kind: scope === "director" ? "command" : "chat" });
    const calls = (m.tool_calls ?? []) as ToolCall[];
    if (!calls.length) return { reply: (m.content ?? "").trim(), steps };
    msgs.push({ role: "assistant", content: m.content ?? "", tool_calls: calls });
    for (const c of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(c.function.arguments || "{}");
      } catch {
        /* буруу JSON — хоосон */
      }
      const t = toolByName(c.function.name);
      let content: string;
      const allowed = !ctx.allow || ctx.allow.has(c.function.name);
      if (t && allowed && scope === "director" && ((t.risk === "confirm" && confirmRisky) || needsConfirm(assistant, c.function.name, args))) {
        const aid = logAction(ctx, { conv_id: ctx.convId ?? null, tool: c.function.name, args, result: null, status: "pending", actor: ctx.actor.name, summary: `${t.title} — батламж хүлээж байна` });
        steps.push({ tool: c.function.name, title: t.title, args, ok: true, summary: "Захирлын батламж хүлээж байна", status: "pending", action_id: aid });
        content = JSON.stringify({ ok: true, pending: true, action_id: aid, summary: "Захирал «Батлах» товч дарсны дараа гүйцэтгэгдэнэ. Одоогоор ХИЙГДЭЭГҮЙ." });
      } else {
        const r = await runTool(ctx, c.function.name, args);
        const aid = logAction(ctx, { conv_id: ctx.convId ?? null, tool: c.function.name, args, result: r.data ?? null, status: r.ok ? "done" : "error", actor: ctx.actor.name, summary: r.summary });
        steps.push({ tool: c.function.name, title: t?.title ?? c.function.name, args, ok: r.ok, summary: r.summary, status: r.ok ? "done" : "error", action_id: aid });
        content = JSON.stringify(r).slice(0, 8000);
      }
      msgs.push({ role: "tool", tool_call_id: c.id, content });
    }
  }
  // алхам дууссан — эцсийн дүгнэлтийг хэрэгсэлгүйгээр гаргуулна
  const m = await chat(ctx, [...msgs, { role: "user", content: "Одоо хийсэн зүйлээ товч дүгнэж хариул." }], { kind: scope === "director" ? "command" : "chat" });
  return { reply: (m.content ?? "").trim(), steps };
}

/** Харилцагчид явах хариунаас зохиосон зураг, холбоосыг хасна */
function clean(t: string) {
  return t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\((https?:\/\/[^)]*)\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/^\s*\*[^*\n]*(зураг|QR код)[^*\n]*\*\s*$/gim, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ═════════════════════════ харилцагч ═════════════════════════ */

/**
 * Харилцагчийн нэг ээлж. Кредитийг ЭХЛЭЭД нөөцөлнө (§6) → амжилттай бол settle, алдаа/AI хариулахгүй бол refund.
 * `reserved` — дуудагч (дуудлага) урьдчилж нөөцөлсөн бол.
 */
export async function customerTurn(
  ctx: TenantContext,
  o: { channel: Exclude<Channel, "director" | "mcp">; extId: string; text: string; name?: string | null; seconds?: number; reserved?: Reservation },
): Promise<TurnResult> {
  let res = o.reserved;
  try {
    const st = getSettings(ctx);
    const contact = contactFor(ctx, o.channel, o.extId, o.name);
    const conv = conversationFor(ctx, o.channel, o.extId, contact.id, o.name ?? undefined);
    addMessage(ctx, conv.id, "user", o.text, o.seconds ? { seconds: o.seconds } : undefined);
    if (!st.channels[o.channel]) return { reply: null, steps: [], convId: conv.id, status: "disabled" };
    if (conv.status !== "ai") return { reply: null, steps: [], convId: conv.id, status: "human" };

    if (!res) {
      const cost = o.channel === "voice" ? voiceCost(o.seconds) : COST.chat;
      try {
        res = reserve(ctx, o.channel === "voice" ? "voice" : "chat", cost, conv.id);
      } catch (e) {
        if (!(e instanceof PayError)) throw e;
        setConvStatus(ctx, conv.id, "human");
        addMessage(ctx, conv.id, "system", "AI ажилтны кредит дууссан тул яриаг ажилтанд шилжүүлэв.");
        return { reply: null, steps: [], convId: conv.id, status: "no_credits" };
      }
    }

    const c = getContact(ctx, contact.id);
    const contactLine = c ? [c.name && `нэр ${c.name}`, c.phone && `утас ${c.phone}`, c.address && `хаяг ${c.address}`, c.summary].filter(Boolean).join("; ") : "";
    const hits = await search(ctx, o.text, st.businessName ? 5 : 3, 0.3, { audience: ["customer"] }).catch(() => []);
    const kb = hits.map((h) => `[${h.label ?? h.doc}] ${h.text}`).join("\n---\n");
    const past = messagesOf(ctx, conv.id, 40).slice(0, -1);
    const history = historyOf(past);
    // харилцагчийн сувагт нэг нэгдсэн туслах (service ∪ sales-ийн customer хэсэг) §10
    const allow = allowedTools("service", TOOLS.map((t) => t.name), "customer");
    const tctx: ToolCtx = { ...ctx, actor: AI_ACTOR, scope: "customer", convId: conv.id, contactId: contact.id, allow };
    const out = await loop(tctx, "customer", await customerSystem(ctx, o.channel, contactLine, kb), history, o.text, "service");
    const reply = clean(out.reply) || "Уучлаарай, түр алдаа гарлаа. Ажилтан удахгүй холбогдоно.";
    settle(ctx, res, conv.id);
    tagUsage(ctx, res, "service");
    const noInfo = isNoInfo(reply, out.steps);
    addMessage(ctx, conv.id, "assistant", reply, { ...(out.steps.length ? { steps: out.steps } : {}), assistant: SERVICE_TAG, ...(noInfo ? { noInfo: true } : {}) });
    void refreshProfile(ctx, conv.id, contact.id).catch((e) => logError("agent.profile", e, { tenant: ctx.tenantId }));
    let handoff = false;
    const before = getConversation(ctx, conv.id);
    // AI 2 удаа дараалан «мэдээлэл алга» гэсэн бол ажилтанд шилжүүлнэ (§9.2)
    const prevAi = [...past].reverse().find((m) => m.role === "assistant");
    if (noInfo && prevAi?.meta?.noInfo && before?.status === "ai") {
      setConvStatus(ctx, conv.id, "human");
      addMessage(ctx, conv.id, "system", "AI 2 удаа дараалан хариулт олсонгүй — яриаг ажилтанд шилжүүлэв.");
      handoff = true;
    }
    const now = getConversation(ctx, conv.id);
    if (now?.status === "human") handoff = true;
    return { reply, steps: out.steps, convId: conv.id, status: now?.status === "human" ? "human" : "ok", assistant: SERVICE_TAG, handoff };
  } finally {
    // settle хийгдээгүй (алдаа, AI хариулаагүй) бол кредит буцна
    if (res && !res.done) refund(ctx, res);
  }
}

const SERVICE_TAG: AssistantTag = { id: "service", name: ASSISTANTS.service.name, via: "default" };

/** «Мэдээлэл алга» төрлийн хариу эсэх — KB хайлт хоосон буцсан, асуултын тасалбар үүсгэсэн, эсвэл хариу өөрөө тэгж хэлсэн */
function isNoInfo(reply: string, steps: Step[]) {
  const kbEmpty = steps.some((s) => s.tool === "search_knowledge") && !steps.some((s) => s.tool === "search_knowledge" && s.ok && !/алга/.test(s.summary));
  const question = steps.some((s) => s.tool === "create_ticket" && s.args.kind === "question");
  return kbEmpty || question || /мэдээлэл (алга|байхгүй)|тодорхой мэдээлэл алга|мэдэхгүй байна/i.test(reply);
}

/** Хэрэглээний мөрт туслахыг тэмдэглэнэ (§7 usage.assistant) — billing.reserve-д параметр байхгүй тул settle-ийн дараа */
function tagUsage(ctx: TenantContext, res: Reservation, assistant: AssistantId) {
  try {
    ctx.db.run(`UPDATE usage SET assistant = ? WHERE id = ? AND merchant = :tenant`, assistant, res.id);
  } catch {
    /* хэрэглээний тэмдэглэгээ ажлыг зогсоохгүй */
  }
}

/** Дуудлагын кредит: минут тутам COST.voiceMinute (хамгийн багадаа 1) */
export const voiceCost = (seconds?: number) => Math.max(1, Math.ceil(((seconds ?? 20) / 60) * COST.voiceMinute));

/** Ярианаас харилцагчийн картыг (сонирхол, сэтгэл ханамж, хураангуй) шинэчилнэ — хурдан загвар. */
async function refreshProfile(ctx: TenantContext, convId: string, contactId: string) {
  const msgs = messagesOf(ctx, convId, 14).filter((m) => m.role === "user" || m.role === "assistant");
  if (msgs.length < 2) return;
  const c = getContact(ctx, contactId);
  const transcript = msgs.map((m) => `${m.role === "user" ? "Харилцагч" : "AI"}: ${m.text}`).join("\n");
  const m = await chat(
    ctx,
    [
      {
        role: "system",
        content:
          'Харилцагчийн ярианаас CRM картын мэдээлэл гарга. ЗӨВХӨН харилцагчийн өөрөө хэлсэн баримт. JSON: {"name":string|null,"phone":string|null (8 орон),"address":string|null,"interests":string[] (сонирхсон бараа/үйлчилгээ, богино),"sentiment":"positive"|"neutral"|"negative","summary":string (1 өгүүлбэр, монголоор: хэн, юу хүссэн, юу болсон),"tags":string[] (жишээ: "байнгын", "гомдолтой", "хүргэлт", "шинэ")}',
      },
      { role: "user", content: `Одоогийн карт: ${JSON.stringify({ name: c?.name, phone: c?.phone, summary: c?.summary })}\n\nЯриа:\n${transcript}` },
    ],
    { model: undefined, json: true, kind: "profile", temperature: 0, maxTokens: 400 },
  );
  const j = JSON.parse(m.content || "{}") as { name?: string; phone?: string; address?: string; interests?: string[]; sentiment?: string; summary?: string; tags?: string[] };
  updateContact(ctx, contactId, {
    name: j.name || undefined,
    phone: j.phone && /^\d{8}$/.test(j.phone.replace(/\D/g, "")) ? j.phone : undefined,
    address: j.address || undefined,
    interests: Array.isArray(j.interests) ? j.interests : undefined,
    sentiment: ["positive", "neutral", "negative"].includes(j.sentiment ?? "") ? j.sentiment : undefined,
    summary: j.summary || undefined,
    tags: Array.isArray(j.tags) ? j.tags : undefined,
  });
}

/* ═════════════════════════ захирал ═════════════════════════ */

/**
 * Захирлын тушаал: туслахыг сонгоно (гараар `pick` → түлхүүр үг → qwen-flash → chief), тухайн туслахын хэрэгслийн
 * дэд олонлог + prompt-оор нэг давталт. Tenant (ctx) туслахаас үл хамааран ижил.
 */
export async function directorTurn(ctx: TenantContext, text: string, who = "Захирал", pick?: unknown): Promise<TurnResult> {
  const conv = conversationFor(ctx, "director", "owner", null, "Захирлын тушаал");
  let res: Reservation;
  try {
    res = reserve(ctx, "command", COST.command, conv.id);
  } catch (e) {
    if (e instanceof PayError) throw new PayError("AI ажилтны кредит дууссан байна. «Багц» хэсгээс QPay-ээр цэнэглэнэ үү.");
    throw e;
  }
  try {
    addMessage(ctx, conv.id, "user", text, { by: who });
    const history = historyOf(messagesOf(ctx, conv.id, 30).slice(0, -1)).slice(-10);
    const r = await route(ctx, text, pick);
    const def = ASSISTANTS[r.id];
    const allow = allowedTools(r.id, TOOLS.map((t) => t.name));
    const actor = r.id === "chief" ? AI_DIRECTOR : { id: AI_DIRECTOR.id, name: `AI ажилтан (захирлын тушаал · ${def.name})` };
    const tctx: ToolCtx = { ...ctx, actor, scope: "director", convId: conv.id, allow };
    const out = await loop(tctx, "director", await directorSystem(ctx, r.id), history, text, r.id);
    settle(ctx, res, conv.id);
    tagUsage(ctx, res, r.id);
    const reply = out.reply || "Гүйцэтгэлээ.";
    const tag: AssistantTag = { id: r.id, name: def.name, via: r.via };
    addMessage(ctx, conv.id, "assistant", reply, { ...(out.steps.length ? { steps: out.steps } : {}), assistant: tag });
    return { reply, steps: out.steps, convId: conv.id, status: "ok", assistant: tag };
  } finally {
    if (!res.done) refund(ctx, res);
  }
}

/** Батламж хүлээж буй үйлдлийг батлах/татгалзах */
export async function decideAction(ctx: TenantContext, aid: string, approve: boolean, who = "Захирал") {
  const a = getAction(ctx, aid);
  if (!a) throw new PayError("Үйлдэл олдсонгүй", 404);
  if (a.status !== "pending") return a;
  const t = toolByName(a.tool);
  if (!approve) {
    setActionStatus(ctx, aid, "rejected", undefined, `${t?.title ?? a.tool} — татгалзав`);
    if (a.conv_id) addMessage(ctx, a.conv_id, "system", `✕ ${who} татгалзав: ${t?.title ?? a.tool}`);
    return getAction(ctx, aid)!;
  }
  const r = await runTool({ ...ctx, actor: { id: "ai-director", name: `AI ажилтан (${who} баталсан)` }, scope: "director", convId: a.conv_id }, a.tool, a.args);
  setActionStatus(ctx, aid, r.ok ? "done" : "error", r.data ?? null, r.summary);
  if (a.conv_id) addMessage(ctx, a.conv_id, "system", `${r.ok ? "✓" : "✕"} ${t?.title ?? a.tool}: ${r.summary}`);
  return getAction(ctx, aid)!;
}

/** Ажилтан харилцагчид гараар хариулах (AI-аас авсан яриа) */
export async function staffReply(ctx: TenantContext, convId: string, text: string, staff: string) {
  const conv = getConversation(ctx, convId);
  if (!conv) throw new PayError("Яриа олдсонгүй", 404);
  if (conv.channel === "fb") {
    const { pageOf, sendText } = await import("@/lib/fb/server");
    const page = pageOf(ctx.tenantId);
    if (!page) throw new PayError("Facebook Page холбогдоогүй", 409);
    await sendText(page, String(conv.ext_id), text, staff, "human");
  }
  // ажилтан бичсэн бол AI тэр яриаг орхино (дахин «AI-д өгөх» хүртэл)
  if (conv.status === "ai") setConvStatus(ctx, convId, "human");
  return addMessage(ctx, convId, "staff", text, { by: staff });
}

export const fmtMoney = money;
