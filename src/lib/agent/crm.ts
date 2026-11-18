/**
 * Харилцагчийн карт, яриа, хүсэлт/гомдол, AI-ийн үйлдлийн бүртгэл.
 * Шифрлэлт (§4B.3, tenant DEK): messages.{text,meta}, conversations.{title,last_text}, contacts.{summary,address} —
 * бичихэд sealT, уншихад openT (шифрлээгүй хуучин мөр хэвээр уншигдана; ensureCrmSealed нэг удаа шифрлэнэ).
 */
import type { TenantContext } from "@/lib/tenant/context";
import { emit, id, json } from "./db";
import { isSealedText, openT, ref, sealT } from "./sealed";

type Cx = TenantContext;

export type Channel = "fb" | "web" | "voice" | "director" | "mcp";
export type ConvStatus = "ai" | "human" | "closed";

export type Contact = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  customer_id: string | null;
  channels: Record<string, string>;
  summary: string | null;
  interests: string[];
  tags: string[];
  sentiment: string | null;
  last_at: number;
  created_at: number;
};

const contactRow = (ctx: Cx, r: Record<string, unknown>): Contact => ({
  ...(r as unknown as Contact),
  summary: openT(ctx, r.summary, ref("contacts", "summary", String(r.id)), true),
  address: openT(ctx, r.address, ref("contacts", "address", String(r.id)), true),
  channels: json(r.channels, {}),
  interests: json(r.interests, []),
  tags: json(r.tags, []),
});

export const getContact = (ctx: Cx, cid: string) => {
  const r = ctx.db.one(`SELECT * FROM contacts WHERE id = ? AND merchant = :tenant`, cid);
  return r ? contactRow(ctx, r) : null;
};

export function listContacts(ctx: Cx, q = "", limit = 200) {
  ensureCrmSealed(ctx);
  // хураангуй шифрлэгдсэн тул текст хайлтыг тайлсны дараа санах ойд (§4B.3)
  const qq = q.trim().toLocaleLowerCase("mn");
  const rows = ctx.db.all(`SELECT * FROM contacts WHERE merchant = :tenant ORDER BY last_at DESC LIMIT ?`, qq ? 2000 : limit).map((r) => contactRow(ctx, r));
  if (!qq) return rows;
  return rows.filter((c) => [c.name, c.phone, c.summary].some((x) => x && x.toLocaleLowerCase("mn").includes(qq))).slice(0, limit);
}

/** Сувгийн танигчаар (FB psid, вэб session) карт олох/үүсгэх */
export function contactFor(ctx: Cx, channel: Channel, ext: string, name?: string | null) {
  const r = ctx.db.one(`SELECT * FROM contacts WHERE merchant = :tenant AND json_extract(channels, '$.' || ?) = ?`, channel, ext);
  if (r) return contactRow(ctx, r);
  const cid = id("ct");
  const now = Date.now();
  ctx.db.run(
    `INSERT INTO contacts (id, merchant, name, channels, last_at, created_at) VALUES (?, :tenant, ?, ?, ?, ?)`,
    cid,
    name ?? null,
    JSON.stringify({ [channel]: ext }),
    now,
    now,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "contacts" } });
  return getContact(ctx, cid)!;
}

export type ContactPatch = Partial<Pick<Contact, "name" | "phone" | "email" | "address" | "summary" | "sentiment" | "customer_id">> & {
  interests?: string[];
  tags?: string[];
};

/** Шинэ мэдээллийг нэгтгэнэ. Утас давхцвал хоёр картыг нийлүүлнэ. */
export function updateContact(ctx: Cx, cid: string, p: ContactPatch) {
  let c = getContact(ctx, cid);
  if (!c) return null;
  const phone = p.phone ? p.phone.replace(/\D/g, "").slice(-8) : null;
  if (phone && phone.length === 8 && phone !== c.phone) {
    const dup = ctx.db.one(`SELECT * FROM contacts WHERE merchant = :tenant AND phone = ? AND id != ?`, phone, cid);
    if (dup) {
      // хуучин карт руу сувгуудыг шилжүүлж нэгтгэнэ — нэг хүн, нэг карт
      const d = contactRow(ctx, dup);
      ctx.db.run(`UPDATE conversations SET contact_id = ? WHERE merchant = :tenant AND contact_id = ?`, d.id, cid);
      ctx.db.run(`UPDATE tickets SET contact_id = ? WHERE merchant = :tenant AND contact_id = ?`, d.id, cid);
      ctx.db.run(`UPDATE contacts SET channels = ? WHERE merchant = :tenant AND id = ?`, JSON.stringify({ ...d.channels, ...c.channels }), d.id);
      ctx.db.run(`DELETE FROM contacts WHERE merchant = :tenant AND id = ?`, cid);
      c = getContact(ctx, d.id)!;
    }
  }
  const merged = {
    name: p.name?.trim() || c.name,
    phone: phone && phone.length === 8 ? phone : c.phone,
    email: p.email?.trim() || c.email,
    address: p.address?.trim() || c.address,
    summary: p.summary?.trim() || c.summary,
    sentiment: p.sentiment || c.sentiment,
    customer_id: p.customer_id || c.customer_id,
    interests: [...new Set([...(c.interests ?? []), ...(p.interests ?? [])].map((x) => x.trim()).filter(Boolean))].slice(-15),
    tags: [...new Set([...(c.tags ?? []), ...(p.tags ?? [])].map((x) => x.trim()).filter(Boolean))].slice(-15),
  };
  ctx.db.run(
    `UPDATE contacts SET name = ?, phone = ?, email = ?, address = ?, summary = ?, sentiment = ?, customer_id = ?, interests = ?, tags = ?, last_at = ? WHERE merchant = :tenant AND id = ?`,
    merged.name,
    merged.phone,
    merged.email,
    sealT(ctx, merged.address, ref("contacts", "address", c.id)),
    sealT(ctx, merged.summary, ref("contacts", "summary", c.id)),
    merged.sentiment,
    merged.customer_id,
    JSON.stringify(merged.interests),
    JSON.stringify(merged.tags),
    Date.now(),
    c.id,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "contacts" } });
  return getContact(ctx, c.id);
}

/* ───────── яриа ───────── */

export type Conversation = {
  id: string;
  channel: Channel;
  ext_id: string | null;
  contact_id: string | null;
  status: ConvStatus;
  title: string | null;
  last_text: string | null;
  last_at: number;
  created_at: number;
};

const convView = <T extends Conversation>(ctx: Cx, r: T): T => ({
  ...r,
  title: openT(ctx, r.title, ref("conversations", "title", r.id), true),
  last_text: openT(ctx, r.last_text, ref("conversations", "last_text", r.id), true),
});

export function conversationFor(ctx: Cx, channel: Channel, ext: string, contactId: string | null, title?: string) {
  const r = ctx.db.one<Conversation>(`SELECT * FROM conversations WHERE merchant = :tenant AND channel = ? AND ext_id = ?`, channel, ext);
  if (r) return convView(ctx, r);
  const cid = id("cv");
  const now = Date.now();
  ctx.db.run(
    `INSERT INTO conversations (id, merchant, channel, ext_id, contact_id, status, title, last_at, created_at) VALUES (?, :tenant, ?, ?, ?, 'ai', ?, ?, ?)`,
    cid,
    channel,
    ext,
    contactId,
    sealT(ctx, title ?? null, ref("conversations", "title", cid)),
    now,
    now,
  );
  return getConversation(ctx, cid)!;
}

export const getConversation = (ctx: Cx, cid: string) => {
  const r = ctx.db.one<Conversation>(`SELECT * FROM conversations WHERE id = ? AND merchant = :tenant`, cid);
  return r ? convView(ctx, r) : undefined;
};

/** Сувгийн танигчаар яриа (үүсгэхгүй) */
export const findConversation = (ctx: Cx, channel: Channel, ext: string) => {
  const r = ctx.db.one<Conversation>(`SELECT * FROM conversations WHERE merchant = :tenant AND channel = ? AND ext_id = ?`, channel, ext);
  return r ? convView(ctx, r) : undefined;
};

export function listConversations(ctx: Cx, channel?: string, limit = 100) {
  ensureCrmSealed(ctx);
  return ctx.db.all<Conversation & { contact_name: string | null; contact_phone: string | null }>(
    `SELECT v.*, c.name contact_name, c.phone contact_phone FROM conversations v LEFT JOIN contacts c ON c.id = v.contact_id AND c.merchant = :tenant
     WHERE v.merchant = :tenant AND (? = '' OR v.channel = ?) AND v.channel != 'director' ORDER BY v.last_at DESC LIMIT ?`,
    channel ?? "",
    channel ?? "",
    limit,
  ).map((r) => convView(ctx, r));
}

export function setConvStatus(ctx: Cx, cid: string, status: ConvStatus) {
  ctx.db.run(`UPDATE conversations SET status = ? WHERE id = ? AND merchant = :tenant`, status, cid);
  emit(ctx.tenantId, { type: "ai", data: { kind: "conv", id: cid } });
}

export type Message = { id: string; conv_id: string; role: "user" | "assistant" | "staff" | "system"; text: string; meta: Record<string, unknown> | null; at: number };

export function addMessage(ctx: Cx, convId: string, role: Message["role"], text: string, meta?: Record<string, unknown>) {
  if (!getConversation(ctx, convId)) throw new Error("Яриа олдсонгүй");
  const mid = id("m");
  const at = Date.now();
  ctx.db.run(
    `INSERT INTO messages (id, merchant, conv_id, role, text, meta, at) VALUES (?, :tenant, ?, ?, ?, ?, ?)`,
    mid,
    convId,
    role,
    sealT(ctx, text, ref("messages", "text", mid)),
    meta ? sealT(ctx, JSON.stringify(meta), ref("messages", "meta", mid)) : null,
    at,
  );
  ctx.db.run(`UPDATE conversations SET last_text = ?, last_at = ? WHERE id = ? AND merchant = :tenant`, sealT(ctx, text.slice(0, 200), ref("conversations", "last_text", convId)), at, convId);
  emit(ctx.tenantId, { type: "ai", data: { kind: "message", conv: convId } });
  return { id: mid, conv_id: convId, role, text, meta: meta ?? null, at } as Message;
}

export function messagesOf(ctx: Cx, convId: string, limit = 200) {
  ensureCrmSealed(ctx);
  return ctx.db
    .all<Record<string, unknown>>(`SELECT * FROM (SELECT * FROM messages WHERE merchant = :tenant AND conv_id = ? ORDER BY at DESC LIMIT ?) ORDER BY at`, convId, limit)
    .map((m) => {
      const mid = String(m.id);
      return { ...m, text: openT(ctx, m.text, ref("messages", "text", mid)), meta: json(openT(ctx, m.meta, ref("messages", "meta", mid), true), null) } as Message;
    });
}

/* ───────── хуучин (шифрлээгүй) мөрийг шифрлэх — tenant бүрт процесс тутамд нэг удаа ───────── */

const gc = globalThis as unknown as { __crmSealed?: Set<string> };
export function ensureCrmSealed(ctx: Cx) {
  const done = (gc.__crmSealed ??= new Set());
  if (done.has(ctx.tenantId)) return;
  migrateCrm(ctx);
  done.add(ctx.tenantId);
}

/** Буцаах: шифрлэсэн мөрийн тоо */
export function migrateCrm(ctx: Cx) {
  let n = 0;
  const seal = (table: string, col: string, idv: string, v: unknown) => (v == null || isSealedText(v) ? (v as string | null) : sealT(ctx, String(v), ref(table, col, idv)));
  for (const m of ctx.db.all<{ id: string; text: string; meta: string | null }>(
    `SELECT id, text, meta FROM messages WHERE merchant = :tenant AND (text NOT LIKE 'e1.%' OR (meta IS NOT NULL AND meta NOT LIKE 'e1.%'))`,
  )) {
    ctx.db.run(`UPDATE messages SET text = ?, meta = ? WHERE id = ? AND merchant = :tenant`, seal("messages", "text", m.id, m.text), seal("messages", "meta", m.id, m.meta), m.id);
    n++;
  }
  for (const c of ctx.db.all<{ id: string; title: string | null; last_text: string | null }>(
    `SELECT id, title, last_text FROM conversations WHERE merchant = :tenant AND ((title IS NOT NULL AND title NOT LIKE 'e1.%') OR (last_text IS NOT NULL AND last_text NOT LIKE 'e1.%'))`,
  )) {
    ctx.db.run(`UPDATE conversations SET title = ?, last_text = ? WHERE id = ? AND merchant = :tenant`, seal("conversations", "title", c.id, c.title), seal("conversations", "last_text", c.id, c.last_text), c.id);
    n++;
  }
  for (const c of ctx.db.all<{ id: string; summary: string | null; address: string | null }>(
    `SELECT id, summary, address FROM contacts WHERE merchant = :tenant AND ((summary IS NOT NULL AND summary NOT LIKE 'e1.%') OR (address IS NOT NULL AND address NOT LIKE 'e1.%'))`,
  )) {
    ctx.db.run(`UPDATE contacts SET summary = ?, address = ? WHERE id = ? AND merchant = :tenant`, seal("contacts", "summary", c.id, c.summary), seal("contacts", "address", c.id, c.address), c.id);
    n++;
  }
  const plain = (c: string) => `(${c} IS NOT NULL AND ${c} NOT LIKE 'e1.%')`;
  for (const t of ctx.db.all<{ id: string; title: string; body: string | null; resolution: string | null }>(
    `SELECT id, title, body, resolution FROM tickets WHERE merchant = :tenant AND (${plain("title")} OR ${plain("body")} OR ${plain("resolution")})`,
  )) {
    ctx.db.run(
      `UPDATE tickets SET title = ?, body = ?, resolution = ? WHERE id = ? AND merchant = :tenant`,
      seal("tickets", "title", t.id, t.title),
      seal("tickets", "body", t.id, t.body),
      seal("tickets", "resolution", t.id, t.resolution),
      t.id,
    );
    n++;
  }
  n += sealPlainActions(ctx);
  return n;
}

/**
 * actions-д шууд (crm-ээс гадуур, ж: тооллого батлах) бичигдсэн ил мөрийг шифрлэнэ — жагсаахаас өмнө үргэлж (хямд: зөвхөн ил мөр).
 * Буцаах: шифрлэсэн мөрийн тоо
 */
export function sealPlainActions(ctx: Cx) {
  let n = 0;
  const seal = (col: string, idv: string, v: unknown) => (v == null || isSealedText(v) ? (v as string | null) : sealT(ctx, String(v), ref("actions", col, idv)));
  const plain = (c: string) => `(${c} IS NOT NULL AND ${c} NOT LIKE 'e1.%')`;
  for (const a of ctx.db.all<{ id: string; args: string; result: string | null; summary: string | null }>(
    `SELECT id, args, result, summary FROM actions WHERE merchant = :tenant AND (${plain("args")} OR ${plain("result")} OR ${plain("summary")})`,
  )) {
    ctx.db.run(
      `UPDATE actions SET args = ?, result = ?, summary = ? WHERE id = ? AND merchant = :tenant`,
      seal("args", a.id, a.args),
      seal("result", a.id, a.result),
      seal("summary", a.id, a.summary),
      a.id,
    );
    n++;
  }
  return n;
}

/* ───────── хүсэлт, гомдол ───────── */

export type TicketKind = "complaint" | "request" | "question" | "order";
export type Ticket = {
  id: string;
  no: number;
  kind: TicketKind;
  title: string;
  body: string | null;
  status: "open" | "in_progress" | "resolved";
  priority: "low" | "normal" | "high";
  contact_id: string | null;
  conv_id: string | null;
  assignee: string | null;
  resolution: string | null;
  created_at: number;
  updated_at: number;
};
export const TICKET_KIND: Record<TicketKind, string> = { complaint: "Гомдол", request: "Хүсэлт", question: "Асуулт", order: "Захиалга" };
export const TICKET_STATUS = { open: "Шинэ", in_progress: "Шийдвэрлэж байна", resolved: "Шийдсэн" } as const;

/** §4B.3 — tickets.{title,body,resolution} шифрлэгдсэн; уншихад ил болгоно */
export function openTicket<T extends { id: string; title?: string; body?: string | null; resolution?: string | null }>(ctx: Cx, r: T): T {
  return {
    ...r,
    title: openT(ctx, r.title, ref("tickets", "title", r.id)),
    body: openT(ctx, r.body, ref("tickets", "body", r.id), true),
    resolution: openT(ctx, r.resolution, ref("tickets", "resolution", r.id), true),
  };
}
const ticketById = (ctx: Cx, tid: string) => {
  const r = ctx.db.one<Ticket>(`SELECT * FROM tickets WHERE id = ? AND merchant = :tenant`, tid);
  return r ? openTicket(ctx, r) : undefined;
};

export function createTicket(ctx: Cx, t: { kind: TicketKind; title: string; body?: string; priority?: Ticket["priority"]; contactId?: string | null; convId?: string | null }) {
  const no = Number(ctx.db.one<{ n: number }>(`SELECT COALESCE(MAX(no), 1000) n FROM tickets WHERE merchant = :tenant`)?.n ?? 1000) + 1;
  const tid = id("tk");
  const now = Date.now();
  ctx.db.run(
    `INSERT INTO tickets (id, merchant, no, kind, title, body, priority, contact_id, conv_id, created_at, updated_at) VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    tid,
    no,
    t.kind,
    sealT(ctx, t.title.slice(0, 200), ref("tickets", "title", tid)),
    sealT(ctx, t.body?.slice(0, 4000) ?? null, ref("tickets", "body", tid)),
    t.priority ?? (t.kind === "complaint" ? "high" : "normal"),
    t.contactId ?? null,
    t.convId ?? null,
    now,
    now,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "tickets" } });
  return ticketById(ctx, tid)!;
}

export function listTickets(ctx: Cx, status = "", limit = 200) {
  ensureCrmSealed(ctx);
  return ctx.db
    .all<Ticket & { contact_name: string | null; contact_phone: string | null; contact_id: string | null }>(
    `SELECT t.*, c.name contact_name, c.phone contact_phone FROM tickets t LEFT JOIN contacts c ON c.id = t.contact_id AND c.merchant = :tenant
     WHERE t.merchant = :tenant AND (? = '' OR t.status = ?) ORDER BY CASE t.status WHEN 'resolved' THEN 1 ELSE 0 END, t.created_at DESC LIMIT ?`,
    status,
    status,
    limit,
  )
    .map((r) => {
      const t = openTicket(ctx, r);
      return r.contact_id ? { ...t, contact_name: openT(ctx, r.contact_name, ref("contacts", "name", r.contact_id), true), contact_phone: openT(ctx, r.contact_phone, ref("contacts", "phone", r.contact_id), true) } : t;
    });
}

export function updateTicket(ctx: Cx, key: string | number, p: { status?: Ticket["status"]; resolution?: string; assignee?: string; priority?: Ticket["priority"] }) {
  const row =
    typeof key === "number" || /^\d+$/.test(String(key))
      ? ctx.db.one<Ticket>(`SELECT * FROM tickets WHERE merchant = :tenant AND no = ?`, Number(key))
      : ctx.db.one<Ticket>(`SELECT * FROM tickets WHERE merchant = :tenant AND id = ?`, String(key));
  if (!row) return null;
  const t = openTicket(ctx, row);
  ctx.db.run(
    `UPDATE tickets SET status = ?, resolution = ?, assignee = ?, priority = ?, updated_at = ? WHERE id = ? AND merchant = :tenant`,
    p.status ?? t.status,
    sealT(ctx, p.resolution ?? t.resolution, ref("tickets", "resolution", t.id)),
    p.assignee ?? t.assignee,
    p.priority ?? t.priority,
    Date.now(),
    t.id,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "tickets" } });
  return ticketById(ctx, t.id)!;
}

/* ───────── AI-ийн үйлдлийн бүртгэл ───────── */

export type ActionRow = { id: string; conv_id: string | null; tool: string; args: Record<string, unknown>; result: unknown; status: "done" | "pending" | "rejected" | "error"; actor: string; summary: string | null; at: number };

export function logAction(ctx: Cx, a: Omit<ActionRow, "id" | "at">) {
  const aid = id("ac");
  ctx.db.run(
    `INSERT INTO actions (id, merchant, conv_id, tool, args, result, status, actor, summary, at) VALUES (?, :tenant, ?, ?, ?, ?, ?, ?, ?, ?)`,
    aid,
    a.conv_id,
    a.tool,
    sealT(ctx, JSON.stringify(a.args ?? {}), ref("actions", "args", aid)),
    a.result === undefined ? null : sealT(ctx, JSON.stringify(a.result), ref("actions", "result", aid)),
    a.status,
    a.actor,
    sealT(ctx, a.summary, ref("actions", "summary", aid)),
    Date.now(),
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "action", id: aid, status: a.status } });
  return aid;
}

export function setActionStatus(ctx: Cx, aid: string, status: ActionRow["status"], result?: unknown, summary?: string) {
  ctx.db.run(
    `UPDATE actions SET status = ?, result = COALESCE(?, result), summary = COALESCE(?, summary) WHERE id = ? AND merchant = :tenant`,
    status,
    result === undefined ? null : sealT(ctx, JSON.stringify(result), ref("actions", "result", aid)),
    summary == null ? null : sealT(ctx, summary, ref("actions", "summary", aid)),
    aid,
  );
  emit(ctx.tenantId, { type: "ai", data: { kind: "action", id: aid, status } });
}

/** §4B.3 — actions.{args,result,summary} шифрлэгдсэн; уншихад ил болгоно */
export function openAction(ctx: Cx, r: Record<string, unknown>): ActionRow {
  const aid = String(r.id);
  return {
    ...r,
    args: json(openT(ctx, r.args, ref("actions", "args", aid)), {}),
    result: json(openT(ctx, r.result, ref("actions", "result", aid), true), null),
    summary: openT(ctx, r.summary, ref("actions", "summary", aid), true),
  } as unknown as ActionRow;
}
/** Зөвхөн summary-г тайлна (stats) */
export const openActionSummary = (ctx: Cx, id: string, summary: unknown) => openT(ctx, summary, ref("actions", "summary", id), true);

export const getAction = (ctx: Cx, aid: string) => {
  sealPlainActions(ctx);
  const r = ctx.db.one(`SELECT * FROM actions WHERE id = ? AND merchant = :tenant`, aid);
  return r ? openAction(ctx, r) : null;
};

export const listActions = (ctx: Cx, limit = 100, convId?: string) =>
  (ensureCrmSealed(ctx), sealPlainActions(ctx), ctx.db).all(`SELECT * FROM actions WHERE merchant = :tenant AND (? = '' OR conv_id = ?) ORDER BY at DESC LIMIT ?`, convId ?? "", convId ?? "", limit).map(
    (r) => openAction(ctx, r),
  );
