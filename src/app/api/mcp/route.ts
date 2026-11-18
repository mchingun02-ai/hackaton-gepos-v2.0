import { api } from "@/lib/agent/api";
import { handleRpc, MCP_PROTOCOL } from "@/lib/agent/mcp";
import { rate } from "@/lib/tenant/http";
import { currentTenant } from "@/lib/tenant/auth";

export const maxDuration = 120;

const rpcErr = (status: number, message: string) =>
  Response.json({ jsonrpc: "2.0", id: null, error: { code: -32001, message } }, { status, headers: status === 401 ? { "WWW-Authenticate": "Bearer" } : undefined });

/**
 * MCP Streamable HTTP endpoint (JSON хариу). Authorization: Bearer gai_… (scope "mcp").
 * Нэг мессеж эсвэл batch массив хүлээн авна.
 */
export const POST = api(async (req: Request) => {
  if (!(req.headers.get("authorization") || "").startsWith("Bearer gai_")) return rpcErr(401, "Unauthorized: Bearer API түлхүүр шаардлагатай");
  let ctx;
  try {
    ctx = currentTenant(req);
  } catch {
    return rpcErr(401, "Unauthorized: API түлхүүр хүчингүй");
  }
  if (!ctx) return rpcErr(401, "Unauthorized");
  if (!ctx.scopes.has("mcp")) return rpcErr(403, "Forbidden: түлхүүрт «mcp» эрх алга");
  rate(`mcp:${ctx.principal.kind === "api_key" ? ctx.principal.prefix : ctx.tenantId}`, 120);
  const body = await req.json().catch(() => null);
  const headers = { "MCP-Protocol-Version": MCP_PROTOCOL };
  if (Array.isArray(body)) {
    const out = (await Promise.all(body.map((x) => handleRpc(ctx, x)))).filter(Boolean);
    return out.length ? Response.json(out, { headers }) : new Response(null, { status: 202, headers });
  }
  const r = await handleRpc(ctx, body);
  return r ? Response.json(r, { headers }) : new Response(null, { status: 202, headers });
});

/** Сервер → клиент урсгал ашиглахгүй */
export const GET = async () => new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
export const DELETE = async () => new Response(null, { status: 405 });
