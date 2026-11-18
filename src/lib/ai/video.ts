/**
 * AI туслах — видео хийх (Wan, Gerege-ийн AI gateway). Зөвхөн сервер талд.
 *
 *   POST {url}/video/generations      { model, prompt, size?, image?, images?, duration, metadata: { parameters } } → { task_id }
 *   GET  {url}/video/generations/:id  → { data: { status: queued|IN_PROGRESS|SUCCESS|FAILURE, progress, result_url, fail_reason } }
 *
 * Анхаар: нягтралыг metadata.parameters.resolution-оор л дамжуулна — эс бөгөөс gateway 720P/1080P-ээр (үнэтэй) хийнэ.
 * Монгол prompt-ыг Wan сайн ойлгохгүй тул эхлээд хурдан Qwen-ээр англи болгоно.
 * Видео ~30 сек – 5 мин болно. UI 5 сек тутам /api/ai/video?id=-г шалгана.
 */
import { readFileSync } from "node:fs";
import { fail } from "@/lib/fb/server";
import { fitVideo, modeOf, SIZE, videoModel, type VideoOpts } from "./models";
import { filePath, QwenError, qcfg, storeFile } from "./qwen";
import type { AiFile, VideoTask } from "./server";

const auth = () => {
  const c = qcfg();
  if (!c.key) fail(503, "Qwen тохируулаагүй байна (QWEN_API_KEY)");
  return { url: c.url, h: { "Content-Type": "application/json", Authorization: `Bearer ${c.key}` } };
};

/** Монгол тайлбарыг Wan-д тохирох англи prompt болгоно. Алдаа гарвал эх текстийг нь явуулна. */
async function toPrompt(text: string, mode: string) {
  const { url, h } = auth();
  try {
    const r = await fetch(`${url}/chat/completions`, {
      method: "POST",
      headers: h,
      body: JSON.stringify({
        model: "qwen3.8-flash",
        max_tokens: 400,
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: `You turn a shop owner's request (usually Mongolian) into one English prompt for the Wan ${mode === "t2v" ? "text-to-video" : "image-to-video"} model. Describe subject, action, camera movement, lighting, mood in 1-3 sentences. ${mode === "t2v" ? "" : "The image(s) are already given; describe only the motion and camera. "}Keep brand names, prices and any quoted on-screen text exactly as written. Output only the prompt.`,
          },
          { role: "user", content: text },
        ],
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
    return j.choices?.[0]?.message?.content?.trim() || text;
  } catch {
    return text;
  }
}

/** Видео хийх ажлыг эхлүүлнэ. images — хэрэглэгчийн хавсаргасан зураг (0, 1 эсвэл 2) */
export async function startVideo(text: string, images: AiFile[], o: VideoOpts): Promise<VideoTask> {
  const { url, h } = auth();
  const mode = modeOf(images.length);
  const opt = fitVideo(o);
  const m = videoModel(opt.model);
  if (!m || !m.modes.includes(mode)) fail(400, `«${opt.model}» загвар «${mode}» горимыг дэмждэггүй`);
  const prompt = text ? await toPrompt(text, mode) : mode === "t2v" ? fail(400, "Ямар видео хийхийг бичнэ үү") : "Natural, smooth motion. Gentle camera movement.";
  const uri = (f: AiFile) => `data:${f.mime};base64,${readFileSync(filePath(f.id)).toString("base64")}`;
  const parameters: Record<string, unknown> = { resolution: opt.res, duration: opt.duration };
  if (opt.audio) parameters.audio = true;
  const body: Record<string, unknown> = { model: opt.model, prompt, duration: opt.duration, metadata: { parameters } };
  if (mode === "t2v") body.size = SIZE[opt.res][opt.aspect];
  else if (mode === "i2v") body.image = uri(images[0]);
  else body.images = [uri(images[0]), uri(images[1])];
  const r = await fetch(`${url}/video/generations`, { method: "POST", headers: h, body: JSON.stringify(body), signal: AbortSignal.timeout(60_000) });
  const j = (await r.json().catch(() => ({}))) as { task_id?: string; error?: { message?: string; code?: string }; message?: string };
  if (!r.ok || !j.task_id) throw new QwenError(j.error?.message || j.message || `Видео ${r.status}`, r.status, j.error?.code || "");
  return { id: j.task_id, model: opt.model, mode, res: opt.res, duration: opt.duration, status: "queued", at: Date.now() };
}

/** Ажлын төлөвийг шалгана. Бэлэн бол MP4-ийг татаж хадгалаад файлыг буцаана. */
export async function checkVideo(t: VideoTask): Promise<{ task: VideoTask; file?: AiFile }> {
  const { url, h } = auth();
  const r = await fetch(`${url}/video/generations/${encodeURIComponent(t.id)}`, { headers: h, signal: AbortSignal.timeout(30_000) });
  const j = (await r.json().catch(() => ({}))) as { data?: { status?: string; progress?: string; result_url?: string; fail_reason?: string } };
  const d = j.data;
  if (!r.ok || !d) return { task: t }; // түр алдаа — дараа дахин шалгана
  const st = String(d.status || "").toUpperCase();
  if (st === "FAILURE" || st === "FAILED") return { task: { ...t, status: "failed", error: d.fail_reason || "Видео хийж чадсангүй" } };
  if (st !== "SUCCESS") return { task: { ...t, status: st === "IN_PROGRESS" ? "running" : "queued", progress: d.progress } };
  // Бэлэн — эх холбоос 24 цагийн дараа устдаг тул өөрийн дискэнд хадгална
  let v = await fetch(`${url}/videos/${encodeURIComponent(t.id)}/content`, { headers: h, signal: AbortSignal.timeout(120_000) });
  if (!v.ok && d.result_url) v = await fetch(d.result_url, { signal: AbortSignal.timeout(120_000) });
  if (!v.ok) return { task: t };
  const buf = Buffer.from(await v.arrayBuffer());
  const file = storeFile(buf, `video-${new Date().toLocaleDateString("sv-SE")}-${t.res}-${t.duration}s.mp4`, "video/mp4", "video");
  return { task: { ...t, status: "done", progress: "100%" }, file };
}
