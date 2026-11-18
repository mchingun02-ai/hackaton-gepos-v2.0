/**
 * Түрээслэгчийн контекст (docs/ARCHITECTURE.md §3.3).
 * Сервер талын бүх үйлчилгээ, AI хэрэгсэл эхний параметрээрээ `ctx: TenantContext` авна.
 * `TenantId`-ийг `as` хийж үүсгэх ганц газар — tenant/auth.ts.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { PosAdapter } from "@/lib/pos/adapter";
import type { TenantDb } from "./tdb";

export type TenantId = string & { readonly __brand: "TenantId" };

export type Scope =
  | "dashboard"
  | "pos:state"
  | "agent:director"
  | "agent:customer"
  | "kb"
  | "billing"
  | "inventory:count"
  | "inventory:approve"
  | "connector:read"
  | "connector:write"
  | "mcp"
  | "usage:read";

export const ALL_SCOPES: readonly Scope[] = [
  "dashboard",
  "pos:state",
  "agent:director",
  "agent:customer",
  "kb",
  "billing",
  "inventory:count",
  "inventory:approve",
  "connector:read",
  "connector:write",
  "mcp",
  "usage:read",
];

export type Role = "owner" | "manager" | "staff" | "device";

export type Principal =
  | { kind: "session"; sessionId: string; staffId: string; name: string; role: Role }
  | { kind: "api_key"; prefix: string; label: string }
  | { kind: "visitor"; sid: string; channel: "web" | "voice" }
  | { kind: "webhook"; source: "fb" | "qpay" }
  | { kind: "system"; job: string };

export type TenantContext = Readonly<{
  tenantId: TenantId;
  principal: Principal;
  scopes: ReadonlySet<Scope>;
  requestId: string;
  /** §3.4 — `:tenant`-тай SQL л ажиллана */
  db: TenantDb;
  /** §4 — tenants.pos_kind-аар (gepos | connector) */
  pos: PosAdapter;
}>;

/**
 * Түншийн контекст (§3.3, §4A) — `requirePartner(req)` (tenant/partner.ts). `db`, `pos` талбаргүй тул tenant-ын
 * өгөгдөлд хүрэх функц дуудаж чадахгүй. `PartnerContext → TenantContext` хөрвүүлэх функц БАЙХГҮЙ.
 * `pdb` нь `:partner`-гүй SQL-ийг ажиллуулахгүй, зөвхөн partner/*.ts-д ашиглана.
 */
export type PartnerId = string & { readonly __brand: "PartnerId" };
export type PartnerScope = "partner:manage";
export type PartnerDb = TenantDb;
export type PartnerContext = Readonly<{
  partnerId: PartnerId;
  principal: Readonly<{ kind: "partner"; prefix: string }>;
  scopes: ReadonlySet<PartnerScope>;
  requestId: string;
  pdb: PartnerDb;
}>;

/** Үйлдэл хийсэн хүний нэр (аудит, лог) */
export const principalName = (p: Principal) =>
  p.kind === "session" ? p.name : p.kind === "api_key" ? `API түлхүүр ${p.prefix}…` : p.kind === "visitor" ? "Харилцагч" : p.kind === "webhook" ? p.source.toUpperCase() : p.job;

/** Түрээслэгчийн файлын хавтас: data/tenants/<tenantId>/<sub> — замыг сервер угсарна */
export function tenantDir(ctx: Pick<TenantContext, "tenantId">, sub: "audio" | "inv") {
  if (!/^[\p{L}\p{N}-]{4,40}$/u.test(ctx.tenantId)) throw new Error("tenantId буруу");
  const d = path.join(process.env.SP_DATA_DIR || path.join(process.cwd(), "data"), "tenants", ctx.tenantId, sub);
  mkdirSync(d, { recursive: true, mode: 0o700 });
  return d;
}

/** Файлын id-ийн хэлбэр (§3.3 дүрэм 5) */
export const safeFileId = (id: string) => /^[a-z0-9]{8,40}$/.test(id);
