/**
 * MCP (Model Context Protocol) сервер — Streamable HTTP, JSON-RPC 2.0.
 * Гаднын AI клиент (Cursor, Qwen-Agent, Alibaba Model Studio-ийн MCP г.м)
 * мерчантын API түлхүүрээр холбогдож AI ажилтны бүх хэрэгслийг (бараа, захиалга, тайлан,
 * урамшуулал, CRM, мэдлэгийн сан) ашиглана.
 *
 * Endpoint: POST /api/mcp   Authorization: Bearer gai_…
 */
import { logAction } from "./crm";
import type { TenantContext } from "@/lib/tenant/context";
import { runTool, toolsFor } from "./tools";

export const MCP_PROTOCOL = "2025-06-18";
const SERVER_INFO = { name: "gerege-ai-employee", title: "Gerege AI ажилтан", version: "1.0.0" };

type Rpc = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: Record<string, unknown> };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0" as const, id: id ?? null, result });
const err = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0" as const, id: id ?? null, error: { code, message } });

export async function handleRpc(ctx: TenantContext, msg: Rpc) {
  const tools = toolsFor("mcp", ctx.pos.capabilities);
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return err(null, -32600, "Invalid Request");
  const isNote = msg.id === undefined;
  switch (msg.method) {
    case "initialize": {
      const v = String(msg.params?.protocolVersion ?? MCP_PROTOCOL);
      return ok(msg.id, {
        protocolVersion: ["2025-06-18", "2025-03-26", "2024-11-05"].includes(v) ? v : MCP_PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Gerege POS мерчантын AI ажилтан. Бараа, үнэ, үлдэгдэл, борлуулалтын тайлан, хүргэлтийн захиалга, урамшуулал, харилцагч (CRM), хүсэлт/гомдол, мэдлэгийн санг удирдах хэрэгслүүд. Хариу монгол хэлээр.",
      });
    }
    case "ping":
      return ok(msg.id, {});
    case "tools/list":
      return ok(msg.id, {
        tools: tools.map((t) => ({
          name: t.name,
          title: t.title,
          description: t.description,
          inputSchema: t.parameters,
          annotations: { title: t.title, readOnlyHint: t.risk === "read", destructiveHint: t.risk === "confirm", openWorldHint: t.name === "message_customers" },
        })),
      });
    case "tools/call": {
      const name = String(msg.params?.name ?? "");
      const args = (msg.params?.arguments ?? {}) as Record<string, unknown>;
      if (!tools.some((t) => t.name === name)) return err(msg.id, -32602, `Unknown tool: ${name}`);
      const r = await runTool({ ...ctx, actor: { id: "mcp", name: "MCP клиент" }, scope: "mcp" }, name, args);
      logAction(ctx, { conv_id: null, tool: name, args, result: r.data ?? null, status: r.ok ? "done" : "error", actor: "MCP клиент", summary: r.summary });
      return ok(msg.id, {
        content: [{ type: "text", text: JSON.stringify({ summary: r.summary, data: r.data ?? null }, null, 1) }],
        structuredContent: { ok: r.ok, summary: r.summary, data: r.data ?? null },
        isError: !r.ok,
      });
    }
    default:
      if (isNote) return null; // notifications/initialized г.м — хариу шаардахгүй
      return err(msg.id, -32601, `Method not found: ${msg.method}`);
  }
}
