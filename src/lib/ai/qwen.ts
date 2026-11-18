/**
 * AI туслах — Qwen (Gerege-ийн gateway, OpenAI-тэй ижил /v1/chat/completions). Зөвхөн сервер талд.
 * Мерчант Google холбох шаардлагагүй — Gerege-ийн түлхүүрээр шууд ажиллана.
 *
 * Хавсралт:
 *   зураг (JPG, PNG, WEBP, GIF) — загварт зургаар нь (image_url, base64) явна;
 *   PDF — текстийг нь гаргаж (unpdf) явуулна. Скан хийсэн, текстгүй PDF-ийг уншиж чадахгүй;
 *   текст, CSV, JSON, Markdown — агуулгаар нь явна;
 *   видео (MP4, MOV, WEBM) — qwen3-vl-plus уншина (base64);
 *   аудио (WAV, MP3; бусад форматыг хөтөч WAV болгож илгээнэ) — omni загвар сонсоно.
 * Загвар: хэрэглэгч сонгоно (models.ts), хавсралтаас хамаарч автоматаар солигдоно (pickModel).
 * Дуугаар хариулах: omni загвар текст + 24kHz PCM аудио урсгана → WAV файл болгож хариунд хавсаргана.
 * Файл data/ai-files/-д хадгалагдаж, дараагийн асуултад ч (сүүлийн хэдэн асуулт) дахин дагалдана.
 *
 * Тохиргоо (.env.local): QWEN_API_URL, QWEN_API_KEY, QWEN_MODEL (default qwen3-vl-plus).
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fail, HttpError } from "@/lib/fb/server";
import { CHAT_MODELS, DEFAULT_CHAT, isOmni, OMNI, seesImages, VIDEO_READER, voiceOk } from "./models";
import { type AiFile, history, SYSTEM } from "./server";

export const qcfg = () => ({
  url: (process.env.QWEN_API_URL || "https://ali.gerege.mn/v1").replace(/\/$/, ""),
  key: process.env.QWEN_API_KEY || "",
  model: process.env.QWEN_MODEL || "qwen3-vl-plus",
});
export const qwenReady = () => !!qcfg().key;

/* ───────── файл ───────── */

export const MAX_FILES = 5;
export const MAX_FILE = 10 * 1024 * 1024;
const MAX_TOTAL = 20 * 1024 * 1024;
const DOC_CHARS = 40_000; // нэг баримтаас загварт явуулах текстийн дээд хэмжээ

const IMAGE = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const VIDEO = new Set(["video/mp4", "video/quicktime", "video/webm"]);
const AUDIO = new Set(["audio/wav", "audio/x-wav", "audio/wave", "audio/mpeg", "audio/mp3"]);
const TEXT_EXT = /\.(txt|csv|tsv|json|md|xml|log)$/i;

const dir = () => {
  const d = path.join(process.env.SP_DATA_DIR || path.join(process.cwd(), "data"), "ai-files");
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
};
const fileIdOk = (id: string) => /^f[a-z0-9]{6,40}$/.test(id);
export const filePath = (id: string) => (fileIdOk(id) ? path.join(dir(), id) : fail(404, "Файл олдсонгүй"));

/** Хэрэглэгчийн илгээсэн файлуудыг шалгаж хадгална. PDF/текстийн текстийг <id>.txt-д гаргана. */
export async function saveFiles(list: File[]): Promise<AiFile[]> {
  if (list.length > MAX_FILES) fail(400, `Нэг дор ${MAX_FILES} хүртэл файл хавсаргана`);
  if (list.reduce((a, f) => a + f.size, 0) > MAX_TOTAL) fail(400, "Файлуудын нийт хэмжээ 20 MB-аас хэтэрсэн");
  const out: AiFile[] = [];
  for (const f of list) {
    const name = (f.name || "файл").slice(0, 120);
    if (f.size > MAX_FILE) fail(400, `«${name}» 10 MB-аас том байна`);
    const mime = f.type || "";
    const buf = Buffer.from(await f.arrayBuffer());
    const id = `f${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
    let kind: AiFile["kind"];
    let text: string | null = null;
    if (IMAGE.has(mime)) kind = "image";
    else if (VIDEO.has(mime) || /\.(mp4|mov|webm)$/i.test(name)) kind = "video";
    else if (AUDIO.has(mime) || /\.(wav|mp3)$/i.test(name)) kind = "audio";
    else if (mime === "application/pdf" || /\.pdf$/i.test(name)) {
      kind = "doc";
      text = await pdfText(buf, name);
    } else if (mime.startsWith("text/") || mime === "application/json" || TEXT_EXT.test(name)) {
      kind = "doc";
      text = buf.toString("utf8");
    } else kind = fail(400, `«${name}» төрлийн файлыг уншиж чадахгүй. Зураг, видео, дуу, PDF, CSV, текст файл хавсаргана уу.`);
    writeFileSync(filePath(id), buf, { mode: 0o600 });
    if (text !== null) writeFileSync(`${filePath(id)}.txt`, text, { mode: 0o600 });
    out.push({ id, name, mime: mime || (kind === "doc" ? "text/plain" : kind === "video" ? "video/mp4" : kind === "audio" ? (/\.mp3$/i.test(name) ? "audio/mpeg" : "audio/wav") : "application/octet-stream"), size: f.size, kind });
  }
  return out;
}

async function pdfText(buf: Buffer, name: string) {
  const { extractText, getDocumentProxy } = await import("unpdf");
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text, totalPages } = await extractText(pdf, { mergePages: false });
    const body = text.map((t, i) => `--- ${i + 1}-р хуудас ---\n${t.trim()}`).join("\n\n");
    if (!text.join("").trim()) fail(400, `«${name}» текстгүй (скан хийсэн) PDF байна. Хуудсуудыг зураг болгож хавсаргана уу.`);
    return `(${totalPages} хуудас)\n${body}`;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    return fail(400, `«${name}» PDF-ийг нээж чадсангүй (нууц үгтэй эсвэл гэмтсэн байж магадгүй)`);
  }
}

/* ───────── чат ───────── */

/** Файлыг дискэнд хадгална (AI-ийн үүсгэсэн видео, дуу) */
export function storeFile(buf: Buffer, name: string, mime: string, kind: AiFile["kind"]): AiFile {
  const id = `f${Date.now().toString(36)}${randomBytes(5).toString("hex")}`;
  writeFileSync(filePath(id), buf, { mode: 0o600 });
  return { id, name, mime, size: buf.length, kind };
}

type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "input_audio"; input_audio: { data: string; format: string } };
type ChatMsg = { role: "system" | "user" | "assistant"; content: string | Part[] };

/** Сүүлийн хэдэн асуултын хавсралтыг дахин дагуулна (дараагийн асуултад «тэр зураг дээр…» гэж асууж болно) */
const FILE_TURNS = 3;

/** model-ийн чадвараас хамаарч хавсралтыг загварт явуулна; чадахгүй төрлийг нэрээр нь л дурдана */
function partsOf(text: string, files: AiFile[] | undefined, withFiles: boolean, model: string): string | Part[] {
  if (!files?.length) return text;
  if (!withFiles) return `${text}\n\n[Хавсралт: ${files.map((f) => f.name).join(", ")}]`;
  const parts: Part[] = [];
  const docs: string[] = [];
  const b64 = (f: AiFile) => readFileSync(filePath(f.id)).toString("base64");
  for (const f of files) {
    try {
      if (f.kind === "image") {
        if (seesImages(model)) parts.push({ type: "image_url", image_url: { url: `data:${f.mime};base64,${b64(f)}` } });
        else docs.push(`[Зураг: ${f.name}]`);
      } else if (f.kind === "video") {
        if (model === VIDEO_READER || isOmni(model)) parts.push({ type: "video_url", video_url: { url: `data:${f.mime === "video/quicktime" ? "video/mp4" : f.mime};base64,${b64(f)}` } });
        else docs.push(`[Видео: ${f.name}]`);
      } else if (f.kind === "audio") {
        if (isOmni(model)) parts.push({ type: "input_audio", input_audio: { data: `data:;base64,${b64(f)}`, format: f.mime === "audio/mpeg" ? "mp3" : "wav" } });
        else docs.push(`[Дуу: ${f.name}]`);
      } else {
        const t = readFileSync(`${filePath(f.id)}.txt`, "utf8");
        docs.push(`<file name="${f.name}">\n${t.length > DOC_CHARS ? `${t.slice(0, DOC_CHARS)}\n…(үлдсэн хэсгийг таслав)` : t}\n</file>`);
      }
    } catch {
      docs.push(`[«${f.name}» файл устсан байна]`);
    }
  }
  parts.push({ type: "text", text: [docs.join("\n\n"), text || "Хавсаргасан файлыг тайлбарлаад өг."].filter(Boolean).join("\n\n") });
  return parts;
}

export class QwenError extends Error {
  constructor(
    message: string,
    public status = 0,
    public code = "",
  ) {
    super(message);
  }
}

/** Gateway-ийн алдааг мерчантад ойлгомжтой болгоно */
export function qError(e: unknown) {
  if (e instanceof Error && (e.name === "TimeoutError" || /aborted due to timeout/i.test(e.message))) return "Qwen хэт удаан хариулж байна. Дахин асууна уу.";
  if (!(e instanceof QwenError)) return e instanceof Error ? e.message : "Qwen-д холбогдож чадсангүй";
  if (e.code === "model_not_found" || /No available channel/i.test(e.message)) return "Gerege-ийн AI gateway дээр энэ загвар идэвхжээгүй байна. Өөр загвар сонгох эсвэл Gerege-ийн админд хэлнэ үү.";
  if (e.status === 401 || e.status === 403) return "Qwen-ийн түлхүүр хүчингүй байна. Gerege-ийн админд хэлнэ үү.";
  if (e.status === 429) return "Qwen-д хэт олон хүсэлт ирлээ. Түр хүлээгээд дахин асууна уу.";
  if (e.status >= 500) return "Qwen одоогоор ачаалал ихтэй байна. Түр хүлээгээд дахин асууна уу.";
  return `Qwen: ${e.message}`;
}

/**
 * Аль загвар хариулахыг шийднэ: хэрэглэгчийн сонголт → хавсралтын төрөл → дуут хариу.
 *   дуу хавсаргасан эсвэл дуугаар хариулах → omni;
 *   видео → qwen3-vl-plus (omni сонгосон бол omni);
 *   зураг → зураг уншдаг загвар биш бол qwen3-vl-plus.
 */
export function pickModel(chosen: string | undefined, files: AiFile[], voice: string) {
  let m = CHAT_MODELS.some((x) => x.id === chosen) ? chosen! : DEFAULT_CHAT;
  const has = (k: AiFile["kind"]) => files.some((f) => f.kind === k);
  if (voiceOk(voice) || has("audio")) return isOmni(m) ? m : OMNI;
  if (has("video") && m !== VIDEO_READER && !isOmni(m)) m = VIDEO_READER;
  if (has("image") && !seesImages(m)) m = VIDEO_READER;
  return m;
}

/** 24kHz, 16-bit, mono PCM → WAV */
export function wav(pcm: Buffer, rate = 24_000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

export type QwenOpts = { model?: string; voice?: string };
/** Урсгалын дараа: аль загвар хариулсан, дуут хариу (PCM) */
export type QwenResult = { model: string; audio: Buffer[] };

export async function* qwenStream(merchant: string, contextText: string, signal: AbortSignal, opts: QwenOpts = {}, result?: QwenResult): AsyncGenerator<string> {
  const c = qcfg();
  if (!c.key) fail(503, "Qwen тохируулаагүй байна (QWEN_API_KEY)");
  // Видео хийх ажлын системийн мессежийг («Видео бэлэн боллоо») загварт өгөхгүй — эс бөгөөс дуурайж худал хариулдаг
  const turns = history(merchant, "qwen")
    .filter((t) => !t.meta?.task)
    .slice(-30);
  const userIdx = turns.map((t, i) => (t.role === "user" && t.files?.length ? i : -1)).filter((i) => i >= 0);
  const recent = new Set(userIdx.slice(-FILE_TURNS));
  const voice = voiceOk(opts.voice ?? "") ? opts.voice! : "";
  const model = pickModel(opts.model, [...recent].flatMap((i) => turns[i].files ?? []), voice);
  if (result) result.model = model;
  const messages: ChatMsg[] = [
    {
      role: "system",
      content: `${SYSTEM}\n- Хэрэглэгч зураг, видео, дуу, PDF, хүснэгт хавсаргаж болно — агуулгыг нь уншиж/сонсож, бизнесийн мэдээлэлтэй нь холбож хариул.\n- Чи өөрөө видео хийж чадахгүй. «Видео бэлэн боллоо», «видео хийлээ» гэж ХЭЗЭЭ Ч бүү бич. Видео хүсвэл чатын доорх «Видео» горимыг сонгоод (зураг хавсаргавал тэр зургийг хөдөлгөнө) илгээхийг зөвлө.${voice ? "\n- Хариуг дуугаар уншина — богино, ярианы хэлээр хариул, жагсаалт, тэмдэгт бүү хэрэглэ." : ""}\n\nБизнесийн мэдээлэл (өнөөдрийн байдлаар):\n${contextText.slice(0, 12_000)}`,
    },
    ...turns.map((t, i): ChatMsg => (t.role === "user" ? { role: "user", content: partsOf(t.text, t.files, recent.has(i), model) } : { role: "assistant", content: t.text })),
  ];
  const body: Record<string, unknown> = { model, messages, stream: true, max_tokens: 4096 };
  if (!/ocr/.test(model)) body.temperature = 0.6;
  if (isOmni(model)) {
    body.stream_options = { include_usage: true };
    if (voice) {
      body.modalities = ["text", "audio"];
      body.audio = { voice, format: "wav" };
    } else body.modalities = ["text"];
  }
  const r = await fetch(`${c.url}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` },
    body: JSON.stringify(body),
    // «Хамгийн ухаалаг» загвар удаан бодно
    signal: AbortSignal.any([signal, AbortSignal.timeout(/max/.test(model) ? 240_000 : 120_000)]),
  });
  if (!r.ok || !r.body) {
    const e = (await r.json().catch(() => ({}))) as { error?: { message?: string; code?: string } };
    throw new QwenError(e.error?.message || `Qwen ${r.status}`, r.status, e.error?.code || "");
  }
  const reader = r.body.getReader();
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
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      let j: { choices?: { delta?: { content?: string; audio?: { data?: string } } }[]; error?: { message?: string; code?: string } };
      try {
        j = JSON.parse(data);
      } catch {
        continue; // бүтэн бус мөр
      }
      if (j.error) throw new QwenError(j.error.message || "Qwen алдаа", 0, j.error.code || "");
      const d = j.choices?.[0]?.delta;
      if (d?.audio?.data && result) result.audio.push(Buffer.from(d.audio.data, "base64"));
      const t = d?.content;
      if (t) yield t;
    }
  }
}
