#!/usr/bin/env node
/**
 * Sandbox түнш «Dayansoft-demo» + 2 СИНТЕТИК мерчант (LIVE горим, жишээ connector руу) — бодит өгөгдөл байхгүй.
 *   1) Сервер: ALLOW_PRIVATE_CONNECTOR=yes (127.0.0.1 connector-т) — ж: ALLOW_PRIVATE_CONNECTOR=yes npm run dev
 *   2) node scripts/seed-partner.mjs --base http://127.0.0.1:3100 --connector http://127.0.0.1:3200
 *   3) node examples/partner-connector/server.mjs --secret-file data/partner-connector.secret
 * Partner түлхүүр (gpk_…) зөвхөн DB-д sha256 — энд НЭГ удаа хэвлэгдэнэ. SP_DATA_DIR серверийнхтэй ижил байх ёстой.
 */
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { ROOT, src } from "../tests/helpers/ts.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
export const DEMO_MERCHANTS = [
  { extMerchantId: "ds-1001", name: "Сансар хүнсний дэлгүүр (demo)" },
  { extMerchantId: "ds-1002", name: "Зайсан мини маркет (demo)" },
];

/** Түнш + түлхүүрийг DB-д шууд (admin үйлдэл — API байхгүй) */
export async function ensurePartner({ slug = "dayansoft-demo", name = "Dayansoft-demo", brand = { name: "Dayansoft", color: "#5B21B6" }, frameOrigins = ["http://localhost:3300"] } = {}) {
  const { db } = await src("lib/agent/db");
  const d = db();
  let p = d.prepare(`SELECT id FROM partners WHERE slug = ?`).get(slug);
  if (!p) {
    const id = `pt${randomBytes(6).toString("hex")}`;
    d.prepare(`INSERT INTO partners (id, slug, name, status, sandbox, brand, frame_origins, created_at, mode) VALUES (?, ?, ?, 'active', 1, ?, ?, ?, 'live')`).run(id, slug, name, JSON.stringify(brand), JSON.stringify(frameOrigins), Date.now());
    p = { id };
  }
  const key = `gpk_sandbox_${randomBytes(20).toString("base64url")}`;
  d.prepare(`INSERT INTO partner_keys (hash, partner_id, label, prefix, created_at) VALUES (?, ?, 'seed', ?, ?)`).run(sha(key), p.id, key.slice(0, 14), Date.now());
  return { partnerId: p.id, key };
}

async function call(base, key, method, p, body) {
  const r = await fetch(`${base}/api/v1${p}`, { method, headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${method} ${p} → ${r.status} ${JSON.stringify(j)}`);
  return j;
}

export async function seedPartner({ base, connector, slug, name, brand, frameOrigins, merchants = DEMO_MERCHANTS, secretFile } = {}) {
  const { partnerId, key } = await ensurePartner({ slug, name, brand, frameOrigins });
  const con = await call(base, key, "PUT", "/partner/connector", { url: connector, mode: "live" });
  if (secretFile) {
    mkdirSync(path.dirname(secretFile), { recursive: true });
    writeFileSync(secretFile, con.secret, { mode: 0o600 });
  }
  const tenants = [];
  for (const m of merchants) tenants.push({ ...m, ...(await call(base, key, "POST", "/partner/tenants", m)) });
  return { partnerId, key, connectorSecret: con.secret, tenants };
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const arg = (n, d) => {
    const i = process.argv.indexOf(`--${n}`);
    return i > 0 ? process.argv[i + 1] : d;
  };
  const base = arg("base", "http://127.0.0.1:3100");
  const secretFile = arg("secret-file", path.join(process.env.SP_DATA_DIR || path.join(ROOT, "data"), "partner-connector.secret"));
  const r = await seedPartner({ base, connector: arg("connector", "http://127.0.0.1:3200"), secretFile });
  const embed = await call(base, r.key, "POST", `/partner/tenants/${r.tenants[0].tenantId}/embed-token`, { user: { id: "u-demo-1", name: "Б. Сараа (demo)", role: "owner" }, view: "onboarding" });
  console.log(`Түнш: Dayansoft-demo (${r.partnerId}, sandbox, live)`);
  console.log(`Partner key (НЭГ удаа харагдана): ${r.key}`);
  console.log(`Connector secret → ${secretFile}`);
  for (const t of r.tenants) console.log(`  ${t.extMerchantId} → ${t.tenantId} (${t.status}, ${t.posKind})`);
  console.log(`Onboarding (5 мин): ${embed.url}`);
  console.log(`Дараа: node examples/partner-connector/server.mjs --secret-file ${secretFile}`);
}
