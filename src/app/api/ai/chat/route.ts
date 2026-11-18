import { legacyGuard } from "@/lib/ai/legacy";
import { unlinkSync } from "node:fs";
import { qError, filePath, type QwenResult, qwenStream, saveFiles, storeFile, wav } from "@/lib/ai/qwen";
import { accountOr409, addMessage, type AiFile, clearHistory, geminiStream, gError, history, type Provider } from "@/lib/ai/server";
import { fail, handle, merchantOf } from "@/lib/fb/server";

const providerOf = (req: Request): Provider => (new URL(req.url).searchParams.get("p") === "qwen" ? "qwen" : "gemini");

export const GET = handle(async (req: Request) => (legacyGuard(), Response.json({ messages: history(merchantOf(req), providerOf(req)) })));

/** Түүх устгах — Qwen-ийн хавсралт файлуудыг дискнээс ч устгана */
export const DELETE = handle(async (req: Request) => {
  legacyGuard();
  const merchant = merchantOf(req);
  const p = providerOf(req);
  for (const m of history(merchant, p))
    for (const f of m.files ?? [])
      for (const x of [filePath(f.id), `${filePath(f.id)}.txt`])
        try {
          unlinkSync(x);
        } catch {}
  clearHistory(merchant, p);
  return Response.json({ ok: true });
});

/**
 * Gemini: JSON { text, context, staff }
 * Qwen (?p=qwen): multipart — text, context, staff, model, voice, files[] (зураг, видео, дуу, PDF, CSV, текст)
 *   voice өгвөл omni загвар дуугаар хариулж, WAV файл хариунд хавсарна
 * Хариуг текст урсгалаар (text/plain stream) буцаана
 */
export const POST = handle(async (req: Request) => {
  legacyGuard();
  const merchant = merchantOf(req);
  const provider = providerOf(req);
  let b: { text?: string; context?: string; staff?: string; model?: string; voice?: string };
  let files: AiFile[] = [];
  let acc: ReturnType<typeof accountOr409> | null = null;
  if (provider === "qwen") {
    const form = await req.formData().catch(() => fail(400, "Хүсэлт буруу байна"));
    b = { text: String(form.get("text") ?? ""), context: String(form.get("context") ?? ""), staff: String(form.get("staff") ?? ""), model: String(form.get("model") ?? ""), voice: String(form.get("voice") ?? "") };
    const list = form.getAll("files").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);
    if (list.length) files = await saveFiles(list);
  } else {
    acc = accountOr409(merchant);
    if (!acc.project) fail(409, "Google Cloud project сонгоогүй байна");
    b = (await req.json().catch(() => ({}))) as typeof b;
  }
  const text = String(b.text || "").trim();
  if (!text && !files.length) fail(400, "Асуулт хоосон байна");
  if (text.length > 4000) fail(400, "Асуулт 4000 тэмдэгтээс хэтэрсэн");
  addMessage(merchant, "user", text, String(b.staff || "").slice(0, 80) || undefined, provider, files);

  const enc = new TextEncoder();
  const ctrl = new AbortController();
  req.signal.addEventListener("abort", () => ctrl.abort());
  const ctx = String(b.context || "");
  const stream = new ReadableStream<Uint8Array>({
    async start(c) {
      let out = "";
      const res: QwenResult = { model: "", audio: [] };
      try {
        const gen = provider === "qwen" ? qwenStream(merchant, ctx, ctrl.signal, { model: b.model, voice: b.voice }, res) : geminiStream(acc!, ctx, ctrl.signal);
        for await (const t of gen) {
          out += t;
          c.enqueue(enc.encode(t));
        }
        if (!out.trim()) out = "(Хариу хоосон ирлээ. Асуултаа өөрөөр бичээд үзнэ үү.)";
        const voice = res.audio.length ? [storeFile(wav(Buffer.concat(res.audio)), "хариу.wav", "audio/wav", "audio")] : [];
        addMessage(merchant, "model", out, undefined, provider, voice, res.model ? { model: res.model } : undefined);
      } catch (e) {
        const msg = `\n\n⚠️ ${provider === "qwen" ? qError(e) : gError(e)}`;
        c.enqueue(enc.encode(msg));
        if (out) addMessage(merchant, "model", out, undefined, provider, [], res.model ? { model: res.model } : undefined);
        console.warn(`[ai] ${provider} chat`, e);
      } finally {
        c.close();
      }
    },
    cancel() {
      ctrl.abort();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
});
