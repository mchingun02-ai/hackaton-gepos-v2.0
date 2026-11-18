/**
 * Qwen — Alibaba Cloud Model Studio (DashScope). Зөвхөн сервер талд.
 *
 * Хакатоны шаардлага: бүх realtime inference Model Studio дээрх Qwen-ээр.
 *   DASHSCOPE_API_KEY  — Model Studio-ийн API түлхүүр (заавал)
 *   DASHSCOPE_REGION   — intl (Сингапур, анхдагч) | cn | us
 *   AI_BASE_URL        — OpenAI-тэй ижил gateway (жишээ нь TokenHub: https://api.tokenhub.mn/v1).
 *                        Өгвөл чат, embedding, ASR энэ хаягаар явна; TTS нь DashScope-ийн native API тул зөвхөн шууд холболтод.
 *   AI_MODEL           — агент (tool calling), анхдагч qwen-plus
 *   AI_FAST_MODEL      — харилцагчийн карт, хураангуй, анхдагч qwen-flash
 *   AI_VISION_MODEL    — тооллогын зураг (тавиур, бараа), анхдагч qwen3.6-plus
 *   AI_EMBED_MODEL     — мэдлэгийн сан, анхдагч text-embedding-v4
 *   AI_OMNI_MODEL      — дуудлага: дуу сонсох (ASR), анхдагч qwen3-omni-flash
 *   AI_TTS_MODEL       — дуудлага: хариуг дуугаар, анхдагч qwen-audio-3.1-tts-flash (монгол хоолой)
 */
import { writeFileSync } from "node:fs";
import path from "node:path";
import { tenantDir, type TenantContext } from "@/lib/tenant/context";
import { dimsOf } from "./billing";
import { id as newId } from "./db";

/** Хэрэглээ бүртгэх контекст (null — tenant-гүй дотоод дуудлага, бүртгэхгүй) */
type Cx = TenantContext | null;

const HOSTS: Record<string, string> = {
  intl: "https://dashscope-intl.aliyuncs.com",
  cn: "https://dashscope.aliyuncs.com",
  us: "https://dashscope-us.aliyuncs.com",
};

export const qcfg = () => {
  const host = (process.env.DASHSCOPE_BASE_URL || HOSTS[process.env.DASHSCOPE_REGION || "intl"] || HOSTS.intl).replace(/\/$/, "");
  return {
    host,
    url: (process.env.AI_BASE_URL || `${host}/compatible-mode/v1`).replace(/\/$/, ""),
    gateway: !!process.env.AI_BASE_URL,
    key: process.env.DASHSCOPE_API_KEY || "",
    model: process.env.AI_MODEL || "qwen-plus",
    fast: process.env.AI_FAST_MODEL || "qwen-flash",
    /** Тооллого: тавиурын зураг, барааны зураг (image_url data URL) */
    vision: process.env.AI_VISION_MODEL || "qwen3.6-plus",
    /** "none" — embedding ашиглахгүй (мэдлэгийн сан түлхүүр үгээр хайна) */
    embed: process.env.AI_EMBED_MODEL || "text-embedding-v4",
    omni: process.env.AI_OMNI_MODEL || "qwen3-omni-flash",
    tts: process.env.AI_TTS_MODEL || "qwen-audio-3.1-tts-flash",
    voice: process.env.AI_TTS_VOICE || "qwen-audio-3.1-tts-flash-ayalguu_mn",
    /** Omni-оор унших үеийн хоолой */
    omniVoice: process.env.AI_OMNI_VOICE || "Tina",
  };
};
export const aiReady = () => !!qcfg().key;

export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
  ) {
    super(message);
  }
}

export type ToolCall = { id: string; type: "function"; function: { name: string; arguments: string } };
export type ChatMsg =
  | { role: "system" | "user"; content: string | unknown[] }
  | { role: "assistant"; content: string | null; tool_calls?: ToolCall[] }
  | { role: "tool"; tool_call_id: string; content: string };
export type ToolDef = { type: "function"; function: { name: string; description: string; parameters: unknown } };

async function call<T>(path: string, body: unknown, timeoutMs = 90_000, base = qcfg().url): Promise<T> {
  const c = qcfg();
  if (!c.key) throw new AiError("Model Studio (DASHSCOPE_API_KEY) тохируулаагүй байна", 503);
  const r = await fetch(`${base}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await r.text();
  if (!r.ok) {
    let msg = text.slice(0, 300);
    try {
      const j = JSON.parse(text);
      msg = j.error?.message || j.message || msg;
    } catch {
      /* текст */
    }
    throw new AiError(`Qwen ${r.status}: ${msg}`, r.status === 429 ? 429 : 502);
  }
  return JSON.parse(text) as T;
}

function track(ctx: Cx, kind: string, model: string, usage?: { prompt_tokens?: number; completion_tokens?: number; input_tokens?: number; output_tokens?: number }) {
  if (!ctx) return;
  try {
    const d = dimsOf(ctx, kind);
    ctx.db.run(
      `INSERT INTO usage (merchant, kind, credits, model, tokens_in, tokens_out, at, channel, feature) VALUES (:tenant, ?, 0, ?, ?, ?, ?, ?, ?)`,
      kind,
      model,
      usage?.prompt_tokens ?? usage?.input_tokens ?? 0,
      usage?.completion_tokens ?? usage?.output_tokens ?? 0,
      Date.now(),
      d.channel,
      d.feature,
    );
  } catch {
    /* хэрэглээний бичилт алдаа — ажлыг зогсоохгүй */
  }
}

type ChatResp = { choices: { message: { content: string | null; tool_calls?: ToolCall[] }; finish_reason: string }[]; usage?: { prompt_tokens: number; completion_tokens: number }; model: string };

/** Tool calling-тэй нэг алхам */
export async function chat(
  ctx: Cx,
  messages: ChatMsg[],
  opts: { tools?: ToolDef[]; model?: string; temperature?: number; json?: boolean; kind?: string; maxTokens?: number } = {},
) {
  const model = opts.model || qcfg().model;
  const body: Record<string, unknown> = { model, messages, temperature: opts.temperature ?? 0.3, enable_thinking: false };
  if (opts.tools?.length) {
    body.tools = opts.tools;
    body.parallel_tool_calls = true;
  }
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.maxTokens) body.max_tokens = opts.maxTokens;
  const r = await call<ChatResp>("/chat/completions", body);
  track(ctx, opts.kind || "chat", model, r.usage);
  return r.choices[0]?.message ?? { content: "" };
}

/** Текстийг вектор болгоно (мэдлэгийн сан). Нэг дор 10 хүртэл. */
export async function embed(ctx: Cx, texts: string[]): Promise<Float32Array[]> {
  const out: Float32Array[] = [];
  const model = qcfg().embed;
  for (let i = 0; i < texts.length; i += 10) {
    const part = texts.slice(i, i + 10);
    const r = await call<{ data: { embedding: number[]; index: number }[]; usage?: { prompt_tokens: number } }>("/embeddings", {
      model,
      input: part,
      dimensions: 1024,
      encoding_format: "float",
    });
    track(ctx, "embed", model, r.usage);
    for (const d of r.data.sort((a, b) => a.index - b.index)) out.push(Float32Array.from(d.embedding));
  }
  return out;
}

/* ───────── дуу ───────── */

/**
 * Дууг текст болгоно (omni загвар, стрим заавал). wav base64 өгнө.
 * Монгол яриаг кирилл бичгээр буулгана.
 */
export async function transcribe(ctx: Cx, wavBase64: string): Promise<string> {
  const c = qcfg();
  if (!c.key) throw new AiError("Model Studio (DASHSCOPE_API_KEY) тохируулаагүй байна", 503);
  const r = await fetch(`${c.url}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: c.omni,
      stream: true,
      stream_options: { include_usage: true },
      modalities: ["text"],
      messages: [
        {
          role: "system",
          content:
            "You are a speech-to-text engine. Output ONLY the exact words spoken in the audio, in the spoken language. Mongolian must be written in Mongolian Cyrillic. No translation, no comments. If there is no speech, output nothing.",
        },
        { role: "user", content: [{ type: "input_audio", input_audio: { data: `data:audio/wav;base64,${wavBase64}`, format: "wav" } }] },
      ],
    }),
  });
  if (!r.ok || !r.body) throw new AiError(`Qwen omni ${r.status}: ${(await r.text()).slice(0, 200)}`);
  let text = "";
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
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
      const d = line.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const j = JSON.parse(d);
        text += j.choices?.[0]?.delta?.content ?? "";
        if (j.usage) usage = j.usage;
      } catch {
        /* хэсэг */
      }
    }
  }
  track(ctx, "asr", c.omni, usage);
  return text.trim();
}

/**
 * Текстийг дуу болгоно — Qwen-Audio-TTS (qwen-audio-3.1-tts-flash, монгол хоолой «Аялгуу»:
 * qwen-audio-3.1-tts-flash-ayalguu_mn). DashScope-ийн native endpoint:
 *   POST {host}/api/v1/services/audio/tts/SpeechSynthesizer
 * Gateway (AI_BASE_URL) ашиглаж байвал ижил замыг gateway-ийн хост дээр дуудна; өөр зам бол AI_TTS_URL.
 * Хариуны output.audio.url (24 цаг) → татаж data/ai-audio-д хадгална (линк хугацаа дуусахгүй).
 * AI_TTS_MODEL=omni — Qwen Omni-оор уншуулна; none — дуугүй.
 */
export async function speak(ctx: TenantContext, text: string): Promise<{ url: string } | null> {
  const c = qcfg();
  if (c.tts === "none") return null;
  if (c.tts === "omni") return omniSpeak(ctx, text);
  const base = process.env.AI_BASE_URL ? new URL(process.env.AI_BASE_URL).origin : c.host;
  const url = process.env.AI_TTS_URL || `${base}/api/v1/services/audio/tts/SpeechSynthesizer`;
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(45_000),
    body: JSON.stringify({ model: c.tts, input: { text: text.slice(0, 600), voice: c.voice, format: "wav", sample_rate: 24000 } }),
  });
  const body = await r.text();
  if (!r.ok) throw new AiError(`Qwen TTS ${r.status}: ${body.slice(0, 200)}`);
  const j = JSON.parse(body) as { output?: { audio?: { url?: string; data?: string } }; usage?: { input_tokens?: number; output_tokens?: number } };
  track(ctx, "tts", c.tts, j.usage);
  let buf: Buffer | null = null;
  if (j.output?.audio?.data) buf = Buffer.from(j.output.audio.data, "base64");
  else if (j.output?.audio?.url) {
    const a = await fetch(j.output.audio.url, { signal: AbortSignal.timeout(30_000) });
    if (a.ok) buf = Buffer.from(await a.arrayBuffer());
  }
  if (!buf?.length) return null;
  const fid = newId("au");
  writeFileSync(path.join(tenantDir(ctx, "audio"), `${fid}.wav`), buf);
  return { url: `/api/agent/public/audio/${fid}` };
}

/* ───────── Omni-оор дуугаар унших (24kHz PCM → WAV файл) ───────── */

/** Дуут хариу: data/tenants/<tenantId>/audio/<id>.wav (зочин зөвхөн өөрийн tenant-ынхыг татна) */
export const audioFile = (ctx: TenantContext, fid: string) => path.join(tenantDir(ctx, "audio"), `${fid}.wav`);

function wav(pcm: Buffer, rate = 24_000) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVE", 8);
  h.write("fmt ", 12);
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

async function omniSpeak(ctx: TenantContext, text: string): Promise<{ url: string } | null> {
  const c = qcfg();
  const r = await fetch(`${c.url}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.key}`, "Content-Type": "application/json" },
    signal: AbortSignal.timeout(60_000),
    body: JSON.stringify({
      model: c.omni,
      stream: true,
      stream_options: { include_usage: true },
      modalities: ["text", "audio"],
      audio: { voice: c.omniVoice, format: "wav" },
      messages: [
        { role: "system", content: "You are a voice. Read the user's text aloud EXACTLY as written, in its language (Mongolian), naturally and warmly. Do not add, translate or answer anything." },
        { role: "user", content: text.slice(0, 600) },
      ],
    }),
  });
  if (!r.ok || !r.body) throw new AiError(`Qwen omni (дуу) ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const chunks: Buffer[] = [];
  let usage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
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
      const d = line.slice(5).trim();
      if (d === "[DONE]") continue;
      try {
        const j = JSON.parse(d);
        const a = j.choices?.[0]?.delta?.audio?.data;
        if (a) chunks.push(Buffer.from(a, "base64"));
        if (j.usage) usage = j.usage;
      } catch {
        /* хэсэг */
      }
    }
  }
  track(ctx, "tts", c.omni, usage);
  if (!chunks.length) return null;
  const fid = newId("au");
  writeFileSync(audioFile(ctx, fid), wav(Buffer.concat(chunks)));
  return { url: `/api/agent/public/audio/${fid}` };
}
