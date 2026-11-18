import { api } from "@/lib/agent/api";
import { readSp, writeSp } from "@/lib/sp/server";
import type { SpState } from "@/lib/sp/types";
import { requireTenant } from "@/lib/tenant/auth";

/** Store Plus-ын серверийн төлөв (AI ажилтан, MCP үүнийг өөрчилнө) — session cookie, scope pos:state */
export const GET = api(async (req: Request) => {
  const cur = readSp(requireTenant(req, "pos:state"));
  if (!cur) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json(cur);
});

/** { base, state } — base нь клиентийн мэдэх сүүлийн rev. Зөрвөл 409 + серверийн төлөв. */
export const PUT = api(async (req: Request) => {
  const ctx = requireTenant(req, "pos:state");
  const raw = await req.text();
  if (raw.length > 15_000_000) return Response.json({ error: "Хэт том" }, { status: 413 });
  let b: { base?: number; state?: SpState };
  try {
    b = JSON.parse(raw);
  } catch {
    return Response.json({ error: "JSON буруу" }, { status: 400 });
  }
  if (!b.state || typeof b.state !== "object" || !b.state.merchant) return Response.json({ error: "Төлөв буруу" }, { status: 400 });
  // Төлөв нь зөвхөн нэвтэрсэн мерчантынх байж болно
  if (String(b.state.merchant.regNo).toUpperCase() !== ctx.tenantId) return Response.json({ error: "Мерчант таарахгүй" }, { status: 400 });
  const rev = writeSp(ctx, Number(b.base) || 0, b.state);
  if (rev === null) return Response.json(readSp(ctx), { status: 409 });
  return Response.json({ rev });
});
