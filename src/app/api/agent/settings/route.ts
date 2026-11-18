import { api } from "@/lib/agent/api";
import { aiReady, qcfg } from "@/lib/agent/qwen";
import { getSettings, judgeCode, saveSettings, type AiSettings } from "@/lib/agent/settings";
import { ensureKbRunner } from "@/lib/kb-auto/jobs";
import { requireTenant } from "@/lib/tenant/auth";

export const GET = api(async (req: Request) => {
  const ctx = requireTenant(req, "dashboard");
  ensureKbRunner();
  const c = qcfg();
  return Response.json({
    settings: getSettings(ctx),
    ai: { ready: aiReady(), host: c.url, model: c.model, fast: c.fast, embed: c.embed, omni: c.omni, tts: c.tts },
    // туршигч нэмэх холбоос m.me/<page>?ref=judge-<код> (§9.4); «бүх харилцагч» горим энэ орчинд нээлттэй эсэх
    fb: { judgeRef: `judge-${judgeCode(ctx)}`, allowAll: process.env.FB_ALLOW_ALL === "yes" },
  });
});
export const PUT = api(async (req: Request) => {
  const ctx = requireTenant(req, "agent:director");
  return Response.json({ settings: saveSettings(ctx, (await req.json().catch(() => ({}))) as Partial<AiSettings>) });
});
