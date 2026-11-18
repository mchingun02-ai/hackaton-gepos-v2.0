import { takeExport } from "@/lib/tenant/erase";
import { errJson } from "@/lib/v1/http";

/** GET /api/v1/exports/{token} — нэг удаагийн (15 мин) экспорт архив (JSON) */
export async function GET(_req: Request, rc: RouteContext<"/api/v1/exports/[token]">) {
  const tok = (await rc.params).token;
  const e = /^gex_[A-Za-z0-9_-]{20,60}$/.test(tok) ? takeExport(tok) : null;
  if (!e) return errJson(404, "Холбоос хүчингүй эсвэл хугацаа дууссан");
  return new Response(e.body, {
    headers: { "Content-Type": "application/json; charset=utf-8", "Content-Disposition": `attachment; filename="gerege-export-${new Date().toISOString().slice(0, 10)}.json"`, "Cache-Control": "no-store" },
  });
}
