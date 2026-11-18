/**
 * AI туслах — мерчант Gmail-ээрээ (Google OAuth) нэвтэрч, өөрийн Google Cloud project-ийн Gemini API-аар чатлана.
 * Зөвхөн сервер талд. Баримт: docs/AI_ASSISTANT.md
 *
 * Урсгал:
 *   1. Портал → /api/ai/connect → Google-ийн зөвшөөрлийн цонх (cloud-platform эрх, offline → refresh token)
 *   2. Google → /api/ai/callback?code → токен солих → refresh token-ийг шифрлэж хадгална
 *   3. Портал project сонгуулна (байхгүй бол шинээр үүсгэнэ) → Gemini API-г тэр project дээр асаана
 *   4. /api/ai/chat → Gemini (x-goog-user-project = мерчантын project) → хариуг урсгалаар (stream) буцаана
 *
 * Төлбөр, хязгаар мерчантын project дээр бодогдоно (Gemini-ийн үнэгүй хязгаар project бүрт).
 * Тохиргоо (.env.local): GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, (сонголттой) GEMINI_MODEL.
 * GOOGLE_CLIENT_ID байхгүй бол ДЕМО горим — Google руу хандахгүй.
 */
import { randomBytes } from "node:crypto";
import { db, fail, seal, unseal } from "@/lib/fb/server";

/** cloud-platform — project жагсаах/үүсгэх, API асаах; generative-language.retriever — Gemini API (Google-ийн OAuth заавраар) */
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/generative-language.retriever"];
const API = "generativelanguage.googleapis.com";

export const gcfg = () => ({
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  secret: process.env.GOOGLE_CLIENT_SECRET || "",
  // gemini-flash-latest 2026-11-д гацаж байсан; 3.5-flash ~4 сек-д хариулдаг
  model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
  publicUrl: (process.env.SP_PUBLIC_URL || "").replace(/\/$/, ""),
});
export const aiDemo = () => !gcfg().clientId || !gcfg().secret;
export const aiRedirectUri = (req: Request) => `${gcfg().publicUrl || new URL(req.url).origin}/api/ai/callback`;

/* ───────── хадгалалт ───────── */

let ready = false;
function adb() {
  const d = db();
  if (!ready) {
    d.exec(`
      CREATE TABLE IF NOT EXISTS ai_accounts (
        merchant TEXT PRIMARY KEY, email TEXT NOT NULL, refresh TEXT NOT NULL, project TEXT, demo INTEGER NOT NULL DEFAULT 0, connected_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS ai_messages (
        id TEXT PRIMARY KEY, merchant TEXT NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL, staff TEXT, at INTEGER NOT NULL);
      CREATE INDEX IF NOT EXISTS ai_messages_m ON ai_messages(merchant, at);
    `);
    // provider — gemini | qwen (тусдаа түүхтэй); files — хавсралтын JSON (AiFile[])
    const cols = new Set((d.prepare(`PRAGMA table_info(ai_messages)`).all() as { name: string }[]).map((c) => c.name));
    if (!cols.has("provider")) d.exec(`ALTER TABLE ai_messages ADD COLUMN provider TEXT NOT NULL DEFAULT 'gemini'`);
    if (!cols.has("files")) d.exec(`ALTER TABLE ai_messages ADD COLUMN files TEXT`);
    // meta — JSON: загвар, видео хийх ажлын төлөв (AiMeta)
    if (!cols.has("meta")) d.exec(`ALTER TABLE ai_messages ADD COLUMN meta TEXT`);
    ready = true;
  }
  return d;
}
type Row = Record<string, string | number | null>;
const one = (sql: string, ...a: (string | number | null)[]) => adb().prepare(sql).get(...a) as Row | undefined;
const all = (sql: string, ...a: (string | number | null)[]) => adb().prepare(sql).all(...a) as Row[];
const run = (sql: string, ...a: (string | number | null)[]) => adb().prepare(sql).run(...a);

export const accountOf = (merchant: string) => one(`SELECT * FROM ai_accounts WHERE merchant = ?`, merchant);
export const accountOr409 = (merchant: string) => accountOf(merchant) ?? fail(409, "Google хаяг холбогдоогүй байна");

/* ───────── Google OAuth ───────── */

export class GoogleError extends Error {
  constructor(
    message: string,
    public status = 0,
    public reason = "",
    /** SERVICE_DISABLED үед: аль project дээр ямар API асаагүй */
    public disabled?: { project: string; title: string; url?: string },
  ) {
    super(message);
  }
}

/** Google-ийн алдааг мерчантад ойлгомжтой болгоно */
export function gError(e: unknown) {
  if (e instanceof Error && (e.name === "TimeoutError" || /aborted due to timeout/i.test(e.message))) return "Gemini хэт удаан хариулж байна. Дахин асууна уу.";
  if (!(e instanceof GoogleError)) return e instanceof Error ? e.message : "Google-д холбогдож чадсангүй";
  const m = e.message;
  // Gerege-ийн OAuth project дээр шаардлагатай API асаагүй — мерчантын буруу биш
  if (e.disabled && gcfg().clientId.startsWith(`${e.disabled.project}-`))
    return `Gerege-ийн Google тохиргоо дутуу байна (${e.disabled.title} асаагүй). Gerege-ийн админд хэлнэ үү.`;
  if (e.disabled) return `«${e.disabled.project}» project дээр ${e.disabled.title} асаагүй байна. Project-оо дахин сонгоно уу эсвэл хэдэн минут хүлээгээд оролдоно уу.`;
  if (/insufficient authentication scopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(m)) return "Google-ийн эрх дутуу байна. «Салгах» дараад Google-ээр дахин холбоно уу (бүх эрхийг чагтална).";
  if (e.reason === "invalid_grant") return "Google-ийн холболт хүчингүй болсон. Дахин холбоно уу.";
  if (/Terms of Service|ToS/i.test(m)) return "Google Cloud-ийн үйлчилгээний нөхцөлийг зөвшөөрөөгүй байна. console.cloud.google.com-д нэг удаа нэвтэрч нөхцөлийг зөвшөөрөөд дахин оролдоно уу.";
  if (e.status === 503 || /UNAVAILABLE|high demand|overloaded/i.test(m + e.reason)) return "Gemini одоо ачаалал ихтэй байна. Хэдэн секундийн дараа дахин асууна уу.";
  if (e.status === 429 || /quota|RESOURCE_EXHAUSTED/i.test(m)) return "Gemini-ийн хязгаар дууссан байна. Түр хүлээгээд дахин оролдоно уу (эсвэл project-д billing нэмнэ).";
  if (e.status === 403 && /SERVICE_DISABLED|has not been used|disabled/i.test(m)) return "Энэ project дээр Gemini API асаагүй байна. Project-оо дахин сонгоно уу.";
  if (e.status === 403) return `Энэ project-д эрх хүрэхгүй байна (${m}).`;
  return `Google: ${m}`;
}

async function gfetch<T>(url: string, init: RequestInit & { token?: string; project?: string } = {}): Promise<T> {
  const { token, project, ...rest } = init;
  const r = await fetch(url, {
    ...rest,
    headers: {
      ...(rest.body && typeof rest.body === "string" ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(project ? { "x-goog-user-project": project } : {}),
      ...rest.headers,
    },
    signal: rest.signal ?? AbortSignal.timeout(30_000),
    cache: "no-store",
  });
  type Detail = { reason?: string; metadata?: { consumer?: string; serviceTitle?: string; activationUrl?: string } };
  const data = (await r.json().catch(() => ({}))) as T & { error?: { message?: string; status?: string; details?: Detail[] } | string; error_description?: string };
  if (!r.ok || data.error) {
    const err = data.error;
    if (typeof err === "string") throw new GoogleError(data.error_description || err, r.status, err);
    const dis = err?.details?.find((x) => x.reason === "SERVICE_DISABLED")?.metadata;
    throw new GoogleError(
      err?.message || `HTTP ${r.status}`,
      r.status,
      err?.status || "",
      dis ? { project: (dis.consumer || "").replace("projects/", ""), title: dis.serviceTitle || "API", url: dis.activationUrl } : undefined,
    );
  }
  return data;
}

export function authUrl(req: Request, state: string) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", gcfg().clientId);
  u.searchParams.set("redirect_uri", aiRedirectUri(req));
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", SCOPES.join(" "));
  // offline + consent — refresh token авахын тулд (дахин нэвтрэхгүйгээр ажиллана)
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent select_account");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", state);
  return u;
}

type TokenRes = { access_token: string; expires_in: number; refresh_token?: string; scope?: string };

export async function exchangeCode(req: Request, code: string) {
  const c = gcfg();
  const t = await gfetch<TokenRes>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.clientId, client_secret: c.secret, redirect_uri: aiRedirectUri(req), grant_type: "authorization_code" }),
  });
  if (!t.refresh_token) throw new Error("Google refresh token өгсөнгүй. Дахин холбоно уу.");
  if (!t.scope?.includes("cloud-platform") || !t.scope.includes("generative-language")) throw new Error("Google Cloud-ийн эрхийг зөвшөөрөөгүй байна. Холбохдоо бүх эрхийг чагтална уу.");
  const me = await gfetch<{ email?: string }>("https://openidconnect.googleapis.com/v1/userinfo", { token: t.access_token });
  return { refresh: t.refresh_token, access: t.access_token, expires: Date.now() + t.expires_in * 1000, email: me.email || "Google хаяг" };
}

/* access token-ийг санах ойд түр хадгална (1 цаг) */
const tokens = ((globalThis as unknown as { __spAiTok?: Map<string, { t: string; until: number }> }).__spAiTok ??= new Map());

export async function accessToken(acc: Row) {
  const m = String(acc.merchant);
  const hit = tokens.get(m);
  if (hit && hit.until > Date.now() + 60_000) return hit.t;
  const c = gcfg();
  const t = await gfetch<TokenRes>("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, refresh_token: unseal(String(acc.refresh)), grant_type: "refresh_token" }),
  });
  tokens.set(m, { t: t.access_token, until: Date.now() + t.expires_in * 1000 });
  return t.access_token;
}

export function saveAccount(merchant: string, email: string, refresh: string, demo: boolean, access?: { t: string; until: number }) {
  run(
    `INSERT INTO ai_accounts (merchant, email, refresh, project, demo, connected_at) VALUES (?, ?, ?, NULL, ?, ?)
     ON CONFLICT(merchant) DO UPDATE SET email = excluded.email, refresh = excluded.refresh, project = NULL, demo = excluded.demo, connected_at = excluded.connected_at`,
    merchant,
    email,
    seal(refresh),
    demo ? 1 : 0,
    Date.now(),
  );
  if (access) tokens.set(merchant, access);
  else tokens.delete(merchant);
}

export async function disconnectAi(merchant: string) {
  const acc = accountOf(merchant);
  if (!acc) return;
  if (!acc.demo)
    // Google-ээс ч эрхийг цуцална
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(unseal(String(acc.refresh)))}`, { method: "POST" }).catch(() => {});
  tokens.delete(merchant);
  run(`DELETE FROM ai_accounts WHERE merchant = ?`, merchant);
  run(`DELETE FROM ai_messages WHERE merchant = ? AND provider = 'gemini'`, merchant);
}

/* ───────── Cloud project ───────── */

export type Project = { id: string; name: string };

export async function listProjects(acc: Row): Promise<Project[]> {
  if (acc.demo) return [{ id: "gerege-ai-demo", name: "Gerege AI (демо)" }];
  const token = await accessToken(acc);
  const r = await gfetch<{ projects?: { projectId: string; name?: string }[] }>("https://cloudresourcemanager.googleapis.com/v1/projects?filter=lifecycleState%3AACTIVE&pageSize=100", { token });
  return (r.projects ?? []).map((p) => ({ id: p.projectId, name: p.name || p.projectId })).sort((a, b) => a.name.localeCompare(b.name));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Long-running operation дуусах хүртэл хүлээнэ (≤90 сек) */
async function waitOp(url: string, token: string) {
  for (let i = 0; i < 45; i++) {
    const op = await gfetch<{ done?: boolean; error?: { message?: string } }>(url, { token });
    if (op.done) {
      if (op.error) throw new GoogleError(op.error.message || "Үйлдэл амжилтгүй");
      return;
    }
    await sleep(2000);
  }
  throw new Error("Google хариу удаан байна. Хэсэг хүлээгээд дахин оролдоно уу.");
}

/** Мерчантад project байхгүй бол шинээр үүсгэнэ */
export async function createProject(acc: Row): Promise<Project> {
  if (acc.demo) return { id: "gerege-ai-demo", name: "Gerege AI (демо)" };
  const token = await accessToken(acc);
  const id = `gerege-ai-${randomBytes(3).toString("hex")}`;
  const op = await gfetch<{ name: string; done?: boolean }>("https://cloudresourcemanager.googleapis.com/v3/projects", {
    method: "POST",
    token,
    body: JSON.stringify({ projectId: id, displayName: "Gerege AI туслах" }),
  });
  if (!op.done) await waitOp(`https://cloudresourcemanager.googleapis.com/v3/${op.name}`, token);
  return { id, name: "Gerege AI туслах" };
}

/** Project дээр Gemini API-г асаагаад мерчантад хадгална */
export async function selectProject(acc: Row, projectId: string) {
  if (!/^[a-z][a-z0-9-]{4,29}$/.test(projectId)) fail(400, "Project буруу байна");
  if (!acc.demo) {
    const token = await accessToken(acc);
    const op = await gfetch<{ name?: string; done?: boolean }>(`https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${API}:enable`, { method: "POST", token, body: "{}" });
    if (op.name && !op.done) await waitOp(`https://serviceusage.googleapis.com/v1/${op.name}`, token);
  }
  run(`UPDATE ai_accounts SET project = ? WHERE merchant = ?`, projectId, acc.merchant);
}

/**
 * Gmail зөвшөөрсний дараа project-ийг мерчантаас асуулгүй автоматаар тохируулна:
 * 1) AI Studio-ийн «Default Gemini Project» (gen-lang-client-…) — Gemini аль хэдийн тохирсон;
 * 2) байхгүй бол «Gerege AI туслах» project үүсгэнэ; 3) үүсгэж чадахгүй бол байгаа эхний project.
 */
export async function autoProject(acc: Row) {
  const list = await listProjects(acc);
  const gemini = list.find((p) => p.id.startsWith("gen-lang-client-")) ?? list.find((p) => p.id.startsWith("gerege-ai-"));
  if (gemini) {
    await selectProject(acc, gemini.id);
    return gemini.id;
  }
  let id: string;
  try {
    id = (await createProject(acc)).id;
  } catch (e) {
    if (!list.length) throw e;
    console.warn("[ai] auto create failed, using existing:", e instanceof Error ? e.message : e);
    id = list[0].id;
  }
  await selectProject(acc, id);
  return id;
}

/* ───────── чат ───────── */

export type Provider = "gemini" | "qwen";
/** Хавсралт: эх файл data/ai-files/<id>, PDF/текстийн гаргасан текст <id>.txt */
export type AiFile = { id: string; name: string; mime: string; size: number; kind: "image" | "doc" | "video" | "audio" };
/** Видео хийх ажил (Wan) — gateway-ийн task */
export type VideoTask = { id: string; model: string; mode: string; res: string; duration: number; status: "queued" | "running" | "done" | "failed"; progress?: string; error?: string; at: number };
export type AiMeta = { model?: string; task?: VideoTask };

export const history = (merchant: string, provider: Provider = "gemini") =>
  all(`SELECT * FROM (SELECT * FROM ai_messages WHERE merchant = ? AND provider = ? ORDER BY at DESC LIMIT 200) ORDER BY at`, merchant, provider).map((m) => ({
    id: String(m.id),
    role: m.role as "user" | "model",
    text: String(m.text),
    staff: (m.staff as string) ?? undefined,
    files: m.files ? (JSON.parse(String(m.files)) as AiFile[]) : undefined,
    meta: m.meta ? (JSON.parse(String(m.meta)) as AiMeta) : undefined,
    at: Number(m.at),
  }));
export type AiMessage = ReturnType<typeof history>[number];

export function messageOf(merchant: string, id: string): AiMessage | undefined {
  const m = one(`SELECT * FROM ai_messages WHERE merchant = ? AND id = ?`, merchant, id);
  if (!m) return undefined;
  return {
    id: String(m.id),
    role: m.role as "user" | "model",
    text: String(m.text),
    staff: (m.staff as string) ?? undefined,
    files: m.files ? (JSON.parse(String(m.files)) as AiFile[]) : undefined,
    meta: m.meta ? (JSON.parse(String(m.meta)) as AiMeta) : undefined,
    at: Number(m.at),
  };
}
export function updateMessage(merchant: string, id: string, patch: { text?: string; files?: AiFile[]; meta?: AiMeta }) {
  const m = messageOf(merchant, id);
  if (!m) return;
  run(
    `UPDATE ai_messages SET text = ?, files = ?, meta = ? WHERE merchant = ? AND id = ?`,
    patch.text ?? m.text,
    (patch.files ?? m.files)?.length ? JSON.stringify(patch.files ?? m.files) : null,
    patch.meta ?? m.meta ? JSON.stringify(patch.meta ?? m.meta) : null,
    merchant,
    id,
  );
}
export const clearHistory = (merchant: string, provider: Provider = "gemini") => run(`DELETE FROM ai_messages WHERE merchant = ? AND provider = ?`, merchant, provider);
export function addMessage(merchant: string, role: "user" | "model", text: string, staff?: string, provider: Provider = "gemini", files?: AiFile[], meta?: AiMeta) {
  const id = `ai${Date.now().toString(36)}${randomBytes(3).toString("hex")}`;
  run(
    `INSERT INTO ai_messages (id, merchant, role, text, staff, at, provider, files, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    merchant,
    role,
    text,
    staff ?? null,
    Date.now(),
    provider,
    files?.length ? JSON.stringify(files) : null,
    meta ? JSON.stringify(meta) : null,
  );
  return id;
}

export const SYSTEM = `Чи бол Gerege POS Store Plus-ийн «AI туслах». Монголын жижиг, дунд бизнес эрхлэгчид (дэлгүүр, кафе г.м.) тусална.
Дүрэм:
- Энгийн, ойлгомжтой монгол хэлээр, товч хариул. Мэргэжлийн нэр томьёо бага хэрэглэ.
- Мерчантын бизнесийн өгөгдлийг (доор «Бизнесийн мэдээлэл») ашиглаж тоо баримттай хариул. Өгөгдөлд байхгүй тоог бүү зохио — мэдэхгүй бол шууд хэл.
- Мөнгөн дүнг 12,500₮ хэлбэрээр бич.
- Facebook пост, SMS, урамшууллын санаа, үнэ, нөөцийн зөвлөгөө өгч чадна. SMS бол 70 тэмдэгтээс хэтрүүлэхгүй байхыг хичээ.
- Хууль, татварын асуултад ерөнхий мэдээлэл өгөөд, мэргэжилтэнтэй зөвлөхийг сануул.`;

/** Gemini-ээс хариуг хэсэг хэсгээр (stream) авч, текстийг дамжуулна */
/** Ачаалал ихтэй (503/429/500) үед дахин оролдох, дараа нь өөр загвар руу шилжих дараалал */
const models = () => [gcfg().model, ...(process.env.GEMINI_FALLBACKS || "gemini-3.5-flash-lite,gemini-3-flash-preview").split(",").map((x) => x.trim())].filter((m, i, a) => m && a.indexOf(m) === i);
const busy = (status: number, reason: string) => status === 503 || status === 500 || status === 429 || /UNAVAILABLE|RESOURCE_EXHAUSTED|INTERNAL/.test(reason);

async function openStream(token: string, project: string, body: object, signal: AbortSignal) {
  let last: unknown;
  for (const model of models())
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const r = await fetch(`https://${API}/v1beta/models/${model}:streamGenerateContent?alt=sse`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-goog-user-project": project },
          body: JSON.stringify(body),
          // Хэрэглэгч зогсоох эсвэл 60 сек хэтэрвэл тасална — цонх гацахгүй
          signal: AbortSignal.any([signal, AbortSignal.timeout(60_000)]),
        });
        if (r.ok && r.body) {
          if (model !== gcfg().model || attempt) console.info(`[ai] ${model} (оролдлого ${attempt + 1})`);
          return r;
        }
        const e = (await r.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
        last = new GoogleError(e.error?.message || `Gemini ${r.status}`, r.status, e.error?.status || "");
        // Ачааллаас бусад алдаа (эрх, project) — өөр загвар туршаад ч нэмэргүй
        if (!busy(r.status, e.error?.status || "") && r.status !== 404) throw last;
        if (r.status === 404) break;
      } catch (e) {
        if (signal.aborted) throw e;
        if (e instanceof GoogleError && !busy(e.status, e.reason) && e.status !== 404) throw e;
        last = e;
      }
      if (attempt === 0) await sleep(1500);
    }
  throw last ?? new Error("Gemini хариу өгсөнгүй");
}

export async function* geminiStream(acc: Row, contextText: string, signal: AbortSignal): AsyncGenerator<string> {
  const merchant = String(acc.merchant);
  const turns = history(merchant).slice(-30);
  if (acc.demo) {
    yield* demoAnswer(turns[turns.length - 1]?.text ?? "", contextText);
    return;
  }
  const token = await accessToken(acc);
  const body = {
    systemInstruction: { parts: [{ text: `${SYSTEM}\n\nБизнесийн мэдээлэл (өнөөдрийн байдлаар):\n${contextText.slice(0, 12_000)}` }] },
    contents: turns.map((t) => ({ role: t.role, parts: [{ text: t.text }] })),
    generationConfig: { temperature: 0.6, maxOutputTokens: 2048 },
  };
  const r = await openStream(token, String(acc.project), body, signal);
  const reader = r.body!.getReader(); // openStream зөвхөн body-тэй хариуг буцаана
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (!line.startsWith("data:")) continue;
      try {
        const j = JSON.parse(line.slice(5)) as { candidates?: { content?: { parts?: { text?: string }[] } }[]; error?: { message?: string; status?: string; code?: number } };
        if (j.error) throw new GoogleError(j.error.message || "Gemini алдаа", j.error.code ?? 0, j.error.status ?? "");
        const t = j.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (t) yield t;
      } catch (e) {
        if (e instanceof GoogleError) throw e;
        /* бүтэн бус мөр */
      }
    }
  }
}

async function* demoAnswer(q: string, ctx: string): AsyncGenerator<string> {
  const pick = (re: RegExp) => ctx.split("\n").find((l) => re.test(l));
  const text = /борлуулалт|орлого|хэд|тайлан/i.test(q)
    ? `Таны өгөгдлөөс харахад:\n${[pick(/^Өнөөдөр/), pick(/^Сүүлийн 7/)].filter(Boolean).join("\n")}\n\n(Туршилтын горим — жинхэнэ Gemini холбогдоогүй.)`
    : /нөөц|нөх|дуусч|үлдэгдэл|захиал/i.test(q)
      ? `${pick(/^Нөөц бага/) ?? "Нөөц хангалттай байна."}\n\nЭдгээрийг энэ 7 хоногт нөхөж захиалахыг зөвлөе.\n\n(Туршилтын горим.)`
      : `Сайн байна уу! Би таны AI туслах. Борлуулалт, нөөц, харилцагчийн талаар асуух, эсвэл Facebook пост, SMS бичүүлж болно.\n\nТа «${q.slice(0, 60)}» гэж асуулаа. Жинхэнэ Gemini холбогдоход дэлгэрэнгүй хариулна.\n\n(Туршилтын горим.)`;
  for (const w of text.split(/(\s+)/)) {
    yield w;
    await sleep(25);
  }
}
