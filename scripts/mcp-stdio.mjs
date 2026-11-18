#!/usr/bin/env node
/**
 * stdio ↔ HTTP гүүр: зөвхөн stdio дэмждэг MCP клиентэд (stdio дэмждэг MCP клиент) зориулав.
 *   GEREGE_AI_URL=https://…/api/mcp GEREGE_AI_KEY=gai_… node scripts/mcp-stdio.mjs
 * Мөр бүр нэг JSON-RPC мессеж (MCP stdio transport).
 */
import readline from "node:readline";

const url = process.env.GEREGE_AI_URL || "http://localhost:3100/api/mcp";
const key = process.env.GEREGE_AI_KEY || "";
if (!key) {
  process.stderr.write("GEREGE_AI_KEY тохируулна уу (AI ажилтан → Тохиргоо → MCP түлхүүр)\n");
  process.exit(1);
}
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  if (!line.trim()) return;
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }
  try {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Authorization: `Bearer ${key}` }, body: JSON.stringify(msg) });
    if (r.status === 202) return;
    const t = await r.text();
    if (t) process.stdout.write(t.replace(/\n/g, " ") + "\n");
  } catch (e) {
    if (msg.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, error: { code: -32000, message: String(e) } }) + "\n");
  }
});
