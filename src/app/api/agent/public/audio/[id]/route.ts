import { readFileSync } from "node:fs";
import { audioFile } from "@/lib/agent/qwen";
import { safeFileId } from "@/lib/tenant/context";
import { currentTenant } from "@/lib/tenant/auth";
import { HttpError } from "@/lib/tenant/http";

/** AI-ийн дуут хариу (WAV) — зочны токеноор (?token=gvs_…), зөвхөн тухайн tenant-ын хавтаснаас */
export async function GET(req: Request, rc: RouteContext<"/api/agent/public/audio/[id]">) {
  const { id } = await rc.params;
  let ctx;
  try {
    ctx = currentTenant(req);
  } catch (e) {
    return new Response("unauthorized", { status: e instanceof HttpError ? e.status : 401 });
  }
  if (!ctx || ctx.principal.kind !== "visitor") return new Response("unauthorized", { status: 401 });
  if (!safeFileId(id)) return new Response("not found", { status: 404 });
  try {
    const b = readFileSync(audioFile(ctx, id));
    return new Response(new Uint8Array(b), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=3600" } });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
