import { legacyGuard } from "@/lib/ai/legacy";
import { type Aspect, type Res, VIDEO_MODELS } from "@/lib/ai/models";
import { qError, saveFiles } from "@/lib/ai/qwen";
import { addMessage, messageOf, updateMessage } from "@/lib/ai/server";
import { checkVideo, startVideo } from "@/lib/ai/video";
import { fail, handle, merchantOf } from "@/lib/fb/server";

/**
 * Видео хийх (Wan).
 * POST multipart — text, staff, model, res, aspect, duration, audio, files[] (0–2 зураг)
 *   → хэрэглэгчийн мессеж + «хийж байна» хариу (meta.task) үүсгэнэ
 * GET ?id=<хариуны мессеж> — ажлын төлөвийг gateway-ээс шалгаж, бэлэн бол MP4-ийг хавсаргана
 */
export const POST = handle(async (req: Request) => {
  legacyGuard();
  const merchant = merchantOf(req);
  const form = await req.formData().catch(() => fail(400, "Хүсэлт буруу байна"));
  const text = String(form.get("text") ?? "").trim();
  if (text.length > 2000) fail(400, "Тайлбар 2000 тэмдэгтээс хэтэрсэн");
  const list = form.getAll("files").filter((x): x is File => typeof x === "object" && x !== null && "arrayBuffer" in x);
  if (list.length > 2) fail(400, "Видеонд 2 хүртэл зураг (эхний ба сүүлийн кадр) хавсаргана");
  if (list.some((f) => !/^image\/(jpeg|png|webp)$/.test(f.type))) fail(400, "Видеонд зөвхөн JPG, PNG, WEBP зураг хавсаргана");
  const model = String(form.get("model") ?? "");
  if (!VIDEO_MODELS.some((m) => m.id === model)) fail(400, "Видеоны загвар буруу");
  const opts = {
    model,
    res: String(form.get("res") ?? "720P") as Res,
    aspect: (["16:9", "9:16", "1:1"].includes(String(form.get("aspect"))) ? String(form.get("aspect")) : "16:9") as Aspect,
    duration: Number(form.get("duration")) || 5,
    audio: form.get("audio") === "1",
  };
  const images = list.length ? await saveFiles(list) : [];
  const staff = String(form.get("staff") ?? "").slice(0, 80) || undefined;
  addMessage(merchant, "user", text, staff, "qwen", images, { model });
  let task;
  try {
    task = await startVideo(text, images, opts);
  } catch (e) {
    const msg = `⚠️ ${qError(e)}`;
    addMessage(merchant, "model", msg, undefined, "qwen");
    console.warn("[ai] video start", e);
    return Response.json({ error: msg }, { status: 502 });
  }
  const id = addMessage(merchant, "model", "Видео хийж байна…", undefined, "qwen", [], { model, task });
  return Response.json({ id, task });
});

/** Нэг ажлыг зэрэг хоёр удаа татахгүй */
const busy = new Set<string>();

export const GET = handle(async (req: Request) => {
  legacyGuard();
  const merchant = merchantOf(req);
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const m = messageOf(merchant, id) ?? fail(404, "Мессеж олдсонгүй");
  const t = m!.meta?.task;
  if (!t) fail(400, "Энэ мессеж видео биш");
  if (t!.status === "done" || t!.status === "failed" || busy.has(t!.id)) return Response.json({ message: m });
  busy.add(t!.id);
  try {
    const { task, file } = await checkVideo(t!);
    const text =
      task.status === "done" ? `Видео бэлэн боллоо · ${task.duration} сек · ${task.res}` : task.status === "failed" ? `⚠️ Видео хийж чадсангүй: ${task.error}` : "Видео хийж байна…";
    // 30 минутаас удвал зогсооно
    const late = task.status !== "done" && task.status !== "failed" && Date.now() - task.at > 30 * 60_000;
    const final = late ? { ...task, status: "failed" as const, error: "Хэт удаан байна" } : task;
    updateMessage(merchant, id, { text: late ? "⚠️ Видео хийх хугацаа хэтэрлээ. Дахин оролдоно уу." : text, files: file ? [file] : m!.files, meta: { ...m!.meta, task: final } });
  } finally {
    busy.delete(t!.id);
  }
  return Response.json({ message: messageOf(merchant, id) });
});
