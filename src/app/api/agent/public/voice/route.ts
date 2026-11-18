import { customerTurn, voiceCost } from "@/lib/agent/agent";
import { api, bad, ipOf, rate } from "@/lib/agent/api";
import { PayError, refund, reserve } from "@/lib/agent/billing";
import { speak, transcribe } from "@/lib/agent/qwen";
import { legacyMerchantParam, requireVisitor } from "@/lib/tenant/auth";

export const maxDuration = 120;

/**
 * Дуудлагын нэг ээлж: multipart { audio (WAV 16kHz mono), seconds } + Authorization: Bearer gvs_… (voice)
 *   0. Кредитийг урьдчилж нөөцөлнө (алдаа/яриагүй бол буцаана)
 *   1. Qwen Omni — яриаг текст болгоно
 *   2. AI ажилтан — мэдлэгийн сан, хэрэгслээр хариулна (захиалга, гомдол бүртгэнэ)
 *   3. Qwen TTS — хариуг дуу болгоно
 */
export const POST = api(async (req: Request) => {
  const form = await req.formData();
  legacyMerchantParam(req, { m: form.get("m") ?? undefined });
  const ctx = requireVisitor(req, "voice");
  rate(`voice:${ipOf(req)}`, 30);
  const audio = form.get("audio");
  if (!audio || typeof audio === "string") bad("Дуу ирсэнгүй");
  const f = audio as File;
  if (f.size > 8 * 1024 * 1024) bad("Дуу хэт урт");
  const seconds = Math.min(120, Math.max(1, Number(form.get("seconds")) || 5));
  let res;
  try {
    res = reserve(ctx, "voice", voiceCost(seconds));
  } catch (e) {
    if (e instanceof PayError) return Response.json({ heard: "", reply: null, audio: null, status: "no_credits" });
    throw e;
  }
  try {
    const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
    const t0 = Date.now();
    const text = await transcribe(ctx, b64);
    const t1 = Date.now();
    if (!text || text.length < 2) return Response.json({ heard: "", reply: null, audio: null, timing: { asr: t1 - t0 } });
    const r = await customerTurn(ctx, { channel: "voice", extId: ctx.principal.sid, text, seconds, reserved: res });
    const t2 = Date.now();
    const tts = r.reply ? await speak(ctx, r.reply).catch((e) => (console.warn("[ai] tts", e instanceof Error ? e.message : e), null)) : null;
    return Response.json({
      heard: text,
      reply: r.reply,
      status: r.status,
      audio: tts?.url ?? null,
      steps: r.steps.map((x) => ({ title: x.title, summary: x.summary, ok: x.ok })),
      timing: { asr: t1 - t0, agent: t2 - t1, tts: Date.now() - t2 },
    });
  } finally {
    // customerTurn settle/refund хийнэ; түүнд хүрээгүй (яриагүй, алдаа) бол энд буцаана
    if (!res.done) refund(ctx, res);
  }
});
