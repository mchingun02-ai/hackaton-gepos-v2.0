/**
 * Гарах webhook түгээгч (docs/ARCHITECTURE.md §4.3, §4A.3) — системийн ажил (tenant хоорондын outbox-ийг уншина).
 *   outbox.partner_id IS NULL → tenant-ын бүртгэсэн webhooks (events-д таарсан бүгд)
 *   outbox.partner_id = <id>  → түншийн нэг webhook (partners.webhook_url)
 * POST <url> · X-Gerege-Event · X-Gerege-Delivery · X-Gerege-Signature: sha256=hex(HMAC(secret, body))
 * Дахин оролдлого: 1м, 5м, 30м, 2ц, 12ц → дараа нь орхино. URL: https:// + нийтийн IP (SSRF шүүлт).
 */
import { createHmac } from "node:crypto";
import { log } from "@/lib/log";
import { allowPrivate, assertPublicUrl } from "@/lib/net";
import { decS, openSystem } from "./crypto";
import type { TenantId } from "./context";
import { rawAll, rawOne, rawRun } from "./raw";

export const RETRY_MS = [60_000, 5 * 60_000, 30 * 60_000, 2 * 3_600_000, 12 * 3_600_000];
export const PARTNER_EVENTS = ["stock.adjusted", "product.created", "tenant.activated", "tenant.suspended", "wallet.low", "wallet.empty"] as const;
export type PartnerEvent = (typeof PARTNER_EVENTS)[number];

type Row = { id: number; merchant: string; event: string; payload: string; tries: number; partner_id: string | null };

export const signBody = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

/** Түншийн webhook руу үйл явдал (tenant-ын partner_id-аар). data-д зөвхөн ПОС талын/тоон өгөгдөл. */
export function enqueuePartnerEvent(tenantId: TenantId | string, event: PartnerEvent, data: Record<string, unknown> = {}) {
  const t = rawOne<{ partner_id: string | null; webhook_url: string | null; ext: string | null }>(
    `SELECT t.partner_id, p.webhook_url, t.ext_merchant_id AS ext FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = ?`,
    tenantId,
  );
  if (!t?.partner_id || !t.webhook_url) return false;
  rawRun(`INSERT INTO outbox (merchant, event, payload, next_at, partner_id) VALUES (?, ?, ?, ?, ?)`, tenantId, event, JSON.stringify({ ...data, extMerchantId: t.ext }), Date.now(), t.partner_id);
  return true;
}

async function post(url: string, secret: string, event: string, delivery: string, body: string, sandbox: boolean) {
  const u = await assertPublicUrl(url, { allowPrivate: allowPrivate(sandbox) });
  const r = await fetch(u, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gerege-Event": event, "X-Gerege-Delivery": delivery, "X-Gerege-Signature": signBody(secret, body), "User-Agent": "Gerege-Webhooks/1" },
    body,
    signal: AbortSignal.timeout(5_000),
    redirect: "error",
  });
  await r.body?.cancel().catch(() => null);
  return r.status;
}

/** Хугацаа болсон үйл явдлуудыг илгээнэ. Буцаах: { sent, failed, dropped } */
export async function deliverDue(now = Date.now(), limit = 50) {
  const rows = rawAll<Row>(`SELECT id, merchant, event, payload, tries, partner_id FROM outbox WHERE done_at IS NULL AND next_at <= ? ORDER BY id LIMIT ?`, now, limit);
  let sent = 0,
    failed = 0,
    dropped = 0;
  for (const r of rows) {
    // давхар илгээхгүй: эхлээд «түгжинэ» (next_at-ийг урагшлуулна)
    if (!Number(rawRun(`UPDATE outbox SET next_at = ? WHERE id = ? AND done_at IS NULL AND next_at <= ?`, now + 120_000, r.id, now).changes)) continue;
    const at = new Date().toISOString();
    let data: unknown = {};
    try {
      data = JSON.parse(r.payload);
    } catch {
      data = {};
    }
    const targets: { url: string; secret: string; sandbox: boolean; body: string }[] = [];
    if (r.partner_id) {
      const p = rawOne<{ webhook_url: string | null; webhook_secret: string | null; sandbox: number }>(`SELECT webhook_url, webhook_secret, sandbox FROM partners WHERE id = ? AND status = 'active'`, r.partner_id);
      if (p?.webhook_url && p.webhook_secret) {
        const d = data as { extMerchantId?: string };
        targets.push({
          url: p.webhook_url,
          secret: openSystem(`partners|webhook_secret|${r.partner_id}`, p.webhook_secret),
          sandbox: !!p.sandbox,
          body: JSON.stringify({ id: String(r.id), event: r.event, tenantId: r.merchant, extMerchantId: d.extMerchantId ?? null, at, data }),
        });
      }
    } else {
      const hooks = rawAll<{ id: string; url: string; secret: string; events: string }>(`SELECT id, url, secret, events FROM webhooks WHERE merchant = ? AND active = 1`, r.merchant);
      const sb = !!rawOne<{ s: number }>(`SELECT COALESCE(p.sandbox, 0) AS s FROM tenants t LEFT JOIN partners p ON p.id = t.partner_id WHERE t.id = ?`, r.merchant)?.s || process.env.NODE_ENV !== "production";
      for (const h of hooks) {
        let ev: string[] = [];
        try {
          ev = JSON.parse(h.events);
        } catch {
          ev = [];
        }
        if (!ev.includes(r.event) && !ev.includes("*")) continue;
        let secret: string;
        try {
          secret = decS({ tenantId: r.merchant as TenantId }, h.secret, `webhooks|secret|${h.id}`);
        } catch {
          continue; // түлхүүр устсан (крипто-устгалт)
        }
        targets.push({ url: h.url, secret, sandbox: sb, body: JSON.stringify({ id: String(r.id), event: r.event, at, data }) });
      }
    }
    if (!targets.length) {
      rawRun(`UPDATE outbox SET done_at = ?, last_status = 0 WHERE id = ?`, now, r.id);
      dropped++;
      continue;
    }
    let ok = true;
    let status = 0;
    for (const t of targets) {
      try {
        status = await post(t.url, t.secret, r.event, String(r.id), t.body, t.sandbox);
        if (status < 200 || status >= 300) ok = false;
      } catch {
        ok = false;
        status = -1;
      }
    }
    const tries = r.tries + 1;
    if (ok) {
      rawRun(`UPDATE outbox SET done_at = ?, tries = ?, last_status = ? WHERE id = ?`, Date.now(), tries, status, r.id);
      sent++;
    } else if (tries > RETRY_MS.length) {
      rawRun(`UPDATE outbox SET done_at = ?, tries = ?, last_status = ? WHERE id = ?`, Date.now(), tries, status, r.id);
      dropped++;
    } else {
      rawRun(`UPDATE outbox SET next_at = ?, tries = ?, last_status = ? WHERE id = ?`, Date.now() + RETRY_MS[tries - 1], tries, status, r.id);
      failed++;
    }
    log("webhook.deliver", { tenant: r.merchant, partner: r.partner_id, event: r.event, delivery: String(r.id), attempt: tries, status: ok ? "ok" : "retry" });
  }
  return { sent, failed, dropped };
}
