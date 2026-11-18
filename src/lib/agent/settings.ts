/** AI ажилтны тохиргоо — мерчант бүрээр. */
import { createHmac } from "node:crypto";
import type { TenantContext } from "@/lib/tenant/context";
import { HttpError } from "@/lib/tenant/http";
import { emit, json } from "./db";

export type AiSettings = {
  /** харилцагчид харагдах нэр */
  agentName: string;
  /** AI-ийн төлөөлөх байгууллага (хоосон бол ПОС-ын дэлгүүрийн нэр) — ж: «Гэрэгэ ПОС» */
  businessName: string;
  /** байгууллагын товч танилцуулга (юу хийдэг, хэнд үйлчилдэг) */
  businessAbout: string;
  /** яриа эхлэх мэндчилгээ */
  greeting: string;
  /** нэмэлт заавар (захирлын хэлсэн дүрэм) */
  instructions: string;
  /** ажиллах цаг — харилцагчид хэлнэ */
  hours: string;
  channels: { web: boolean; voice: boolean; fb: boolean };
  /** захирлын тушаалд эрсдэлтэй үйлдлийг (буцаалт, мессеж илгээх, цуцлах) батлуулах */
  confirmRisky: boolean;
  /**
   * Messenger: off — AI хариулахгүй; testers — зөвхөн сонгосон хүмүүст (багийн гишүүн, туршилт);
   * all — Page-ийн бүх харилцагчид. Бодит Page дээр туршихдаа «testers» ашиглана.
   */
  fbMode: "off" | "testers" | "all";
  fbTesters: { psid: string; name: string }[];
  /** m.me/<page>?ref=judge-<код> холбоосоор орж ирсэн, «Туршигчаар нэмэх үү?» гэж хүлээж буй хүмүүс (§9.4) */
  fbTesterRequests: { psid: string; name: string; at: number }[];
};

export const DEFAULT_SETTINGS: AiSettings = {
  agentName: "Номин",
  businessName: "",
  businessAbout: "",
  greeting: "Сайн байна уу! Би дэлгүүрийн AI туслах байна. Юугаар туслах вэ?",
  instructions: "",
  hours: "Өдөр бүр 08:00–22:00",
  // FB-д AI хариулах нь анхдагчаар УНТАРСАН — бодит харилцагчтай Page-д санамсаргүй хариулахгүй
  channels: { web: true, voice: true, fb: false },
  confirmRisky: true,
  fbMode: "off",
  fbTesters: [],
  fbTesterRequests: [],
};

/** Туршигч нэмэх холбоосын код — tenant бүрт тогтмол, таамаглах боломжгүй (AUTH_SECRET-ийн HMAC) */
export function judgeCode(ctx: Pick<TenantContext, "tenantId">) {
  return createHmac("sha256", process.env.AUTH_SECRET || "dev-judge").update(`judge|${ctx.tenantId}`).digest("hex").slice(0, 10);
}

export function getSettings(ctx: TenantContext): AiSettings {
  const r = ctx.db.one<{ json: string }>(`SELECT json FROM settings WHERE merchant = :tenant`);
  const s = json<Partial<AiSettings>>(r?.json, {});
  return { ...DEFAULT_SETTINGS, ...s, channels: { ...DEFAULT_SETTINGS.channels, ...(s.channels ?? {}) } };
}

export function saveSettings(ctx: TenantContext, patch: Partial<AiSettings>) {
  const cur = getSettings(ctx);
  // Хакатоны орчинд «бүх харилцагч» горимыг сервер татгалзана (бодит Page-ийн харилцагчид AI санамсаргүй хариулахгүй) §9.4
  if (patch.fbMode === "all" && cur.fbMode !== "all" && process.env.FB_ALLOW_ALL !== "yes")
    throw new HttpError(403, "«Бүх харилцагч» горим энэ орчинд хаалттай (FB_ALLOW_ALL). «Зөвхөн тестер» горимоор туршина уу.");
  const next: AiSettings = {
    ...cur,
    ...patch,
    channels: { ...cur.channels, ...(patch.channels ?? {}) },
    agentName: (patch.agentName ?? cur.agentName).slice(0, 40) || DEFAULT_SETTINGS.agentName,
    greeting: (patch.greeting ?? cur.greeting).slice(0, 300),
    instructions: (patch.instructions ?? cur.instructions).slice(0, 4000),
    hours: (patch.hours ?? cur.hours).slice(0, 120),
    businessName: (patch.businessName ?? cur.businessName).slice(0, 80),
    businessAbout: (patch.businessAbout ?? cur.businessAbout).slice(0, 1000),
    fbMode: (["off", "testers", "all"] as const).includes(patch.fbMode as "off") ? patch.fbMode! : cur.fbMode,
    fbTesters: (patch.fbTesters ?? cur.fbTesters).filter((t) => t && /^\d{5,30}$/.test(String(t.psid))).slice(0, 20).map((t) => ({ psid: String(t.psid), name: String(t.name ?? "").slice(0, 80) })),
    fbTesterRequests: (patch.fbTesterRequests ?? cur.fbTesterRequests)
      .filter((t) => t && /^\d{5,30}$/.test(String(t.psid)))
      .slice(-20)
      .map((t) => ({ psid: String(t.psid), name: String(t.name ?? "").slice(0, 80), at: Number(t.at) || Date.now() })),
  };
  // туршигч болсон хүнийг хүсэлтээс хасна
  next.fbTesterRequests = next.fbTesterRequests.filter((r) => !next.fbTesters.some((t) => t.psid === r.psid));
  // Messenger суваг асаалттай эсэхийг горимоос тооцно
  next.channels.fb = next.fbMode !== "off";
  // зөвхөн мэдэгдэх талбарууд (patch-ийн бусад түлхүүр хадгалагдахгүй)
  const keep = Object.fromEntries((Object.keys(DEFAULT_SETTINGS) as (keyof AiSettings)[]).map((k) => [k, next[k]]));
  ctx.db.run(`INSERT INTO settings (merchant, json) VALUES (:tenant, ?) ON CONFLICT(merchant) DO UPDATE SET json = excluded.json`, JSON.stringify(keep));
  emit(ctx.tenantId, { type: "ai", data: { kind: "settings" } });
  return keep as AiSettings;
}
