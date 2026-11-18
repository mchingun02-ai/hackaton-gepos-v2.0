/**
 * Зургаар бараа бүртгэх (docs/ARCHITECTURE.md §5.3 Prompt B): зураг → ноорог → ажилтан засаж батална →
 * `ctx.pos.upsertProduct` (нөөц 0, addedBy "mobile") → ПОС-д SSE-ээр шууд гарна.
 * Баркод шалгах цифрээр баталгаажна; БҮНА-г ЗӨВХӨН лавлах сангаас (загвараар таалгахгүй).
 */
import { lookup } from "@/lib/catalog/server";
import { refund, reserve, settle } from "@/lib/agent/billing";
import { emit } from "@/lib/agent/db";
import { qcfg } from "@/lib/agent/qwen";
import { norm, type CProduct, type Unit } from "@/lib/pos/canonical";
import type { TenantContext } from "@/lib/tenant/context";
import { decS, encS } from "@/lib/tenant/crypto";
import { fail, rate } from "@/lib/tenant/http";
import { checkDigitOk, terms } from "./match";
import { checkImage, newPhotoId, removePhotoFile, writePhoto } from "./photos";
import { DRAFT_SYSTEM, draftUser, parseDraft, type DraftFields } from "./prompts";
import { addProductLine, saveProfile, sessionRow, whoOf } from "./sessions";
import { COST_DRAFT, visionCall } from "./vision";

type Ctx = TenantContext;
const EMPTY: DraftFields & { barcodeRejected: boolean } = {
  name: "",
  name_original: null,
  brand: null,
  size_value: null,
  size_unit: null,
  unit: "pcs",
  barcode: null,
  category: null,
  price_tag: null,
  expiry: null,
  pack_size: null,
  confidence: { name: 0, barcode: 0, category: 0 },
  barcodeRejected: false,
};
const fieldsRef = (id: string) => `inv_drafts|fields|${id}`;

export type DraftView = DraftFields & {
  barcodeRejected: boolean;
  catalog: { name: string; buna: string | null; bunaName: string | null } | null;
  existing: { id: string; name: string } | null;
  priceSuggestion: { value: number; source: "tag" | "similar" } | null;
};

async function categoriesOf(ctx: Ctx, list?: CProduct[]) {
  const ps = list ?? (await ctx.pos.listProducts());
  return [...new Set(ps.map((p) => p.category ?? "").filter(Boolean))];
}

/** Ижил ангилал, ижил хэмжээтэй барааны медиан үнэ (tenant-ын каталогоос, «санал») */
function similarPrice(list: CProduct[], f: DraftFields): number | null {
  if (!f.category) return null;
  const size = f.size_value && f.size_unit ? terms(`${f.size_value}${f.size_unit === "ml" ? "мл" : f.size_unit === "l" ? "л" : f.size_unit === "g" ? "г" : f.size_unit === "kg" ? "кг" : ""}`)[0] : null;
  const same = list.filter((p) => norm(p.category ?? "") === norm(f.category!) && p.price > 0 && (!size || terms(p.name).includes(size)));
  if (!same.length) return null;
  const v = same.map((p) => p.price).sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2);
}

function enrich(f: DraftFields & { barcodeRejected: boolean }, list: CProduct[]): DraftView {
  const hit = f.barcode ? lookup(f.barcode) : null;
  const ex = f.barcode ? list.find((p) => p.barcodes.includes(f.barcode!)) : undefined;
  const sim = f.price_tag ? null : similarPrice(list, f);
  return {
    ...f,
    catalog: hit && hit.found ? { name: hit.name, buna: hit.buna, bunaName: hit.bunaName ?? null } : null,
    existing: ex ? { id: ex.id, name: ex.name } : null,
    priceSuggestion: f.price_tag ? { value: f.price_tag, source: "tag" } : sim ? { value: sim, source: "similar" } : null,
  };
}

export async function createDraft(ctx: Ctx, images: Buffer[]) {
  if (!images.length) fail(400, "Барааны зураг илгээнэ үү");
  rate(`invphoto:${ctx.tenantId}`, 20);
  const kinds = images.slice(0, 2).map((b) => ({ buf: b, ...checkImage(b) }));
  const list = await ctx.pos.listProducts();
  const cats = await categoriesOf(ctx, list);
  const res = reserve(ctx, "inv_draft", COST_DRAFT);
  const photoId = newPhotoId();
  const w = whoOf(ctx);
  try {
    writePhoto(ctx, photoId, kinds[0].buf);
    ctx.db.run(
      `INSERT INTO inv_photos (id, merchant, session_id, kind, path, w, h, status, model, by, at) VALUES (?, :tenant, NULL, 'product', ?, ?, ?, 'processing', ?, ?, ?)`,
      photoId,
      `${photoId}.bin`,
      kinds[0].w,
      kinds[0].h,
      qcfg().vision,
      JSON.stringify({ id: w.id, name: w.name }),
      Date.now(),
    );
  } catch (e) {
    refund(ctx, res);
    removePhotoFile(ctx, photoId);
    throw e;
  }
  let f: DraftFields & { barcodeRejected: boolean };
  let failed = false;
  try {
    f = await visionCall(
      ctx,
      "inv_draft",
      DRAFT_SYSTEM,
      kinds.map((k) => ({ mime: k.mime, buf: k.buf })),
      draftUser(cats),
      (raw) => parseDraft(raw, cats),
    );
  } catch {
    // бүтэлгүйтвэл кредит буцааж, хоосон ноорог үүсгэнэ — ажилтан гараар бөглөнө
    refund(ctx, res);
    failed = true;
    f = { ...EMPTY, confidence: { ...EMPTY.confidence } };
  }
  if (!failed) settle(ctx, res, photoId);
  ctx.db.run(`UPDATE inv_photos SET status = ?, error = ? WHERE id = ? AND merchant = :tenant`, failed ? "failed" : "done", failed ? "parse" : null, photoId);
  const id = `dr${newPhotoId().slice(2)}`;
  const view = enrich(f, list);
  ctx.db.run(`INSERT INTO inv_drafts (id, merchant, photo_id, fields, status, by, at) VALUES (?, :tenant, ?, ?, 'draft', ?, ?)`, id, photoId, encS(ctx, JSON.stringify(f), fieldsRef(id)), JSON.stringify({ id: w.id, name: w.name }), Date.now());
  const message = failed ? "Зургаас уншиж чадсангүй. Кредит буцаагдлаа — талбаруудыг гараар бөглөнө үү." : f.barcodeRejected ? "Баркод буруу уншигдсан — баркодоо уншуулна уу." : null;
  return { draft: { id, photoId, fields: view }, failed, message, categories: cats };
}

type DraftRow = { id: string; photo_id: string; fields: string; status: string; product_id: string | null };
function draftRow(ctx: Ctx, id: string): DraftRow {
  return ctx.db.one<DraftRow>(`SELECT id, photo_id, fields, status, product_id FROM inv_drafts WHERE id = ? AND merchant = :tenant`, String(id).slice(0, 64)) ?? fail(404, "Ноорог олдсонгүй");
}

export async function getDraft(ctx: Ctx, id: string) {
  const d = draftRow(ctx, id);
  const list = await ctx.pos.listProducts();
  const f = JSON.parse(decS(ctx, d.fields, fieldsRef(d.id))) as DraftFields & { barcodeRejected: boolean };
  return { id: d.id, status: d.status, productId: d.product_id, photoId: d.photo_id, fields: enrich(f, list), categories: await categoriesOf(ctx, list) };
}

export type ConfirmInput = { name?: unknown; price?: unknown; barcode?: unknown; category?: unknown; unit?: unknown; packSize?: unknown; sessionId?: unknown };

export async function confirmDraft(ctx: Ctx, id: string, b: ConfirmInput) {
  const d = draftRow(ctx, id);
  if (d.status !== "draft") fail(409, "Ноорог аль хэдийн шийдвэрлэгдсэн");
  const name = String(b.name ?? "").trim().replace(/\s+/g, " ").slice(0, 120);
  if (name.length < 2) fail(400, "Барааны нэр оруулна уу");
  const price = Number(b.price);
  if (!Number.isFinite(price) || price < 0 || price > 100_000_000) fail(400, "Үнэ буруу");
  const barcode = String(b.barcode ?? "").replace(/\s/g, "");
  if (barcode && !checkDigitOk(barcode)) fail(400, "Баркодын шалгах орон таарахгүй байна — дахин уншуулна уу");
  const unit: Unit = (["pcs", "kg", "l", "pack"] as const).includes(b.unit as Unit) ? (b.unit as Unit) : "pcs";
  const list = await ctx.pos.listProducts();
  if (barcode) {
    const ex = list.find((p) => p.barcodes.includes(barcode));
    if (ex) fail(409, `Энэ баркодтой бараа бүртгэлтэй: ${ex.name}`, "exists");
  }
  const cats = await categoriesOf(ctx, list);
  const catIn = String(b.category ?? "").trim();
  const category = cats.find((c) => norm(c) === norm(catIn)) ?? cats[0];
  // БҮНА — зөвхөн лавлах сангаас (баркодоор)
  const hit = barcode ? lookup(barcode) : null;
  const taxCode = hit && hit.found && hit.buna ? hit.buna : undefined;

  // Нэг удаа: ноорогийг эхлээд «хадгалж байна» болгоно
  if (!Number(ctx.db.run(`UPDATE inv_drafts SET status = 'saving' WHERE id = ? AND merchant = :tenant AND status = 'draft'`, d.id).changes)) fail(409, "Ноорог аль хэдийн шийдвэрлэгдсэн");
  const w = whoOf(ctx);
  let p: CProduct;
  try {
    p = await ctx.pos.upsertProduct({ id: w.id, name: w.name }, { name, price: Math.round(price), barcodes: barcode ? [barcode] : [], category, unit, stock: 0, taxCode, addedBy: "mobile" });
  } catch (e) {
    ctx.db.run(`UPDATE inv_drafts SET status = 'draft' WHERE id = ? AND merchant = :tenant AND status = 'saving'`, d.id);
    throw e;
  }
  ctx.db.run(`UPDATE inv_drafts SET status = 'confirmed', product_id = ? WHERE id = ? AND merchant = :tenant`, p.id, d.id);
  const pack = Number(b.packSize);
  if (Number.isFinite(pack) && pack >= 1) saveProfile(ctx, p.id, { packSize: pack });
  // зургийг хадгалахгүй (зөвхөн ноорогт хэрэгтэй байсан)
  removePhotoFile(ctx, d.photo_id);
  ctx.db.run(`UPDATE inv_photos SET path = '', status = 'purged' WHERE id = ? AND merchant = :tenant`, d.photo_id);
  let line = false;
  if (typeof b.sessionId === "string" && b.sessionId) {
    const s = sessionRow(ctx, b.sessionId);
    if (s.status === "counting") line = await addProductLine(ctx, s.id, p);
  }
  emit(ctx.tenantId, { type: "ai", data: { kind: "inventory" } });
  return { product: { id: p.id, name: p.name, price: p.price, barcode: p.barcodes[0] ?? null, category: p.category, taxCode: p.taxCode ?? null }, addedToSession: line };
}

export function deleteDraft(ctx: Ctx, id: string) {
  const d = draftRow(ctx, id);
  if (d.status !== "draft") fail(409, "Ноорог аль хэдийн шийдвэрлэгдсэн");
  ctx.db.run(`UPDATE inv_drafts SET status = 'deleted', fields = '' WHERE id = ? AND merchant = :tenant AND status = 'draft'`, d.id);
  removePhotoFile(ctx, d.photo_id);
  ctx.db.run(`UPDATE inv_photos SET path = '', status = 'purged' WHERE id = ? AND merchant = :tenant`, d.photo_id);
  return { ok: true };
}
