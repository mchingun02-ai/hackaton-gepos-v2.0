import { api, bad, rate } from "@/lib/agent/api";
import { transcribe } from "@/lib/agent/qwen";
import { requireTenant } from "@/lib/tenant/auth";

export const maxDuration = 60;

/** Захирлын дуут тушаал → текст (Qwen Omni). multipart { audio: WAV } */
export const POST = api(async (req: Request) => {
  const ctx = requireTenant(req, "agent:director");
  rate(`asr:${ctx.tenantId}`, 20);
  const form = await req.formData();
  const a = form.get("audio");
  if (!a || typeof a === "string") bad("Дуу ирсэнгүй");
  const f = a as File;
  if (f.size > 8 * 1024 * 1024) bad("Дуу хэт урт");
  return Response.json({ text: await transcribe(ctx, Buffer.from(await f.arrayBuffer()).toString("base64")) });
});
