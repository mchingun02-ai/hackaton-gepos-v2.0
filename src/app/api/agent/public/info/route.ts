import { api, bad } from "@/lib/agent/api";
import { getSettings } from "@/lib/agent/settings";
import { ttsProvider } from "@/lib/agent/qwen";
import { currentTenant, legacyMerchantParam, widgetContext } from "@/lib/tenant/auth";
import { tenantBrand } from "@/lib/tenant/brand";

/** Харилцагчийн чат/дуудлагын хуудсанд дэлгүүрийн нэр, мэндчилгээ — ?w=gwt_… (widget) эсвэл зочны токен */
export const GET = api(async (req: Request) => {
  legacyMerchantParam(req);
  const w = new URL(req.url).searchParams.get("w");
  const ctx = w ? widgetContext(w) : currentTenant(req);
  if (!ctx || (!w && ctx.principal.kind !== "visitor")) return bad("Холбоос буруу", 401);
  const info = await ctx.pos.storeInfo();
  const st = getSettings(ctx);
  const brand = tenantBrand(ctx.tenantId);
  return Response.json({ store: st.businessName || info.name, desc: info.description ?? "", color: brand?.color || info.color || "", brand, agent: st.agentName, greeting: st.greeting, hours: st.hours, channels: st.channels, tts: ttsProvider() });
});
