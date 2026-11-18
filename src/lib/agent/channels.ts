/**
 * Сувгууд — Facebook Messenger-ийн шинэ мессежид AI ажилтан хариулах (docs/ARCHITECTURE.md §9).
 *
 *   page_id → fb_pages.merchant (серверийн хүснэгт) → webhookContext. Body-ийн өөр талбараар tenant ХЭЗЭЭ Ч тодорхойлохгүй.
 *   fbMode off → зогс · testers → зөвхөн fbTesters · Page-ийн админ Meta Inbox-оос хариулсан → яриа ажилтанд.
 *   AI-ийн илгээлт бүр origin "ai" (24ц дотор л, HUMAN_AGENT tag-гүй); анхны хариунд «Би AI туслах» гэж танилцуулна.
 *   Олон мессеж дараалан ирвэл psid тутамд FB_DEBOUNCE_MS (анхдагч 4 сек) хүлээж нэг ээлж болгоно.
 */
import { aiRepliedBefore, AI_STAFF, pageOf, sendText, threadName, type Inbound } from "@/lib/fb/server";
import { logError } from "@/lib/log";
import { webhookContext } from "@/lib/tenant/auth";
import type { TenantContext } from "@/lib/tenant/context";
import { customerTurn } from "./agent";
import { addMessage, findConversation, setConvStatus } from "./crm";
import { getSettings, judgeCode, saveSettings } from "./settings";

export const HANDOFF_LINE = "Ажилтан удахгүй хариулна.";

/* ───────── дараалсан мессежийг нэгтгэх (процесс доторх Map — нэг инстанс §13) ───────── */

type Pending = { texts: string[]; timer: ReturnType<typeof setTimeout> | null; fire: () => void };
const gp = globalThis as unknown as { __fbGather?: Map<string, Pending> };
const debounceMs = () => {
  const n = Number(process.env.FB_DEBOUNCE_MS ?? 4000);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 15_000) : 4000;
};

/** Эхний мессеж нэгтгэсэн текстийг (хүлээлтийн дараа) авна; дараагийнх нь null — тэдний текст эхнийх рүү нэмэгдэнэ. */
export function gather(key: string, text: string, ms = debounceMs()): Promise<string | null> {
  if (ms <= 0) return Promise.resolve(text);
  const m = (gp.__fbGather ??= new Map());
  const cur = m.get(key);
  if (cur) {
    cur.texts.push(text);
    if (cur.timer) clearTimeout(cur.timer);
    cur.timer = setTimeout(cur.fire, ms);
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const e: Pending = {
      texts: [text],
      timer: null,
      fire: () => {
        m.delete(key);
        resolve(e.texts.join("\n"));
      },
    };
    e.timer = setTimeout(e.fire, ms);
    m.set(key, e);
  });
}

/* ───────── туршигч нэмэх (§9.4) ───────── */

/** `judge-<код>` таарвал «Туршигчаар нэмэх үү?» хүсэлт болгон хадгална (портал асууна). Буцаах: бүртгэсэн эсэх. */
export function noteTesterRequest(ctx: TenantContext, psid: string, ref: string, name: string | null) {
  if (ref.trim().toLowerCase() !== `judge-${judgeCode(ctx)}`) return false;
  const st = getSettings(ctx);
  if (st.fbTesters.some((t) => t.psid === psid) || st.fbTesterRequests.some((t) => t.psid === psid)) return false;
  saveSettings(ctx, { fbTesterRequests: [...st.fbTesterRequests, { psid, name: name || "Facebook хэрэглэгч", at: Date.now() }] });
  return true;
}

/* ───────── webhook → AI ───────── */

export async function fbInbound(m: Inbound, pageId: string) {
  // page_id → мерчант (fb_pages, серверийн хүснэгт) → баталгаажсан tenant
  const ctx = webhookContext("fb", m.merchant);
  if (!ctx) return;
  const page = pageOf(ctx.tenantId);
  if (!page || String(page.page_id) !== pageId) return;
  try {
    if (m.kind === "echo_other") {
      // Page-ийн өөр админ Meta Inbox-оос (эсвэл өөр апп) хариулсан — AI тэр яриаг орхино
      const conv = findConversation(ctx, "fb", m.psid);
      if (conv?.status === "ai") {
        setConvStatus(ctx, conv.id, "human");
        addMessage(ctx, conv.id, "system", "Page-ийн админ Meta Inbox-оос хариулсан тул AI энэ яриаг ажилтанд үлдээв.");
      }
      return;
    }
    const ref = m.ref ?? /\bjudge-[a-z0-9]{6,16}\b/i.exec(m.text ?? "")?.[0];
    if (ref) noteTesterRequest(ctx, m.psid, ref, threadName(pageId, m.psid));
    if (m.kind !== "message" || !m.text) return;

    // Анхдагчаар УНТАРСАН. «testers» горимд зөвхөн сонгосон хүмүүст (бодит харилцагчид хариулахгүй)
    const st = getSettings(ctx);
    if (st.fbMode === "off") return;
    if (st.fbMode === "testers" && !st.fbTesters.some((t) => t.psid === m.psid)) return;
    if (st.fbMode === "all" && process.env.FB_ALLOW_ALL !== "yes") return;

    const text = await gather(`${pageId}:${m.psid}`, m.text);
    if (text === null) return; // эхний мессежтэй нэгтгэгдэнэ

    const r = await customerTurn(ctx, { channel: "fb", extId: m.psid, text, name: threadName(pageId, m.psid) });
    let reply = r.reply;
    if (r.status === "no_credits") reply = `Уучлаарай, одоогоор AI туслах ажиллахгүй байна. ${HANDOFF_LINE}`;
    else if (reply && r.handoff && !/ажилтан/i.test(reply)) reply = `${reply}\n\n${HANDOFF_LINE}`;
    if (!reply) return;
    // Meta-ийн автоматжуулалтын ил тод байдал: анхны хариунд AI гэдгээ хэлнэ
    if (!aiRepliedBefore(pageId, m.psid)) reply = `(Би «${st.businessName || st.agentName}»-ийн AI туслах байна.)\n${reply}`;
    await sendText(page, m.psid, reply, AI_STAFF, "ai");
  } catch (e) {
    logError("fb.inbound", e, { tenant: ctx.tenantId });
  }
}
