"use client";

/* GePOS (пос апп) — дэлгэцүүдийн хуваалцах контекст, бүтэц. */

import { createContext, useContext, type ReactNode } from "react";
import type { Actor } from "@/lib/sp/store";
import type { CartInput } from "@/lib/sp/logic";
import type { Module, Plan, Role, SaleLine, Staff } from "@/lib/sp/types";
import { PLAN_MODULES } from "@/lib/sp/logic";
import { Notice, Spinner, cx } from "@/components/sp/ui";


export type PayJob = { kind: "sale" } | { kind: "order"; orderId: string };

export type Route =
  | { s: "home" }
  | { s: "sell" }
  | { s: "cart" }
  | { s: "split" }
  | { s: "pay"; job: PayJob }
  | { s: "history" }
  | { s: "sale"; id: string }
  | { s: "refund"; id: string }
  | { s: "orders" }
  | { s: "order"; id: string }
  | { s: "handover"; id: string }
  | { s: "stop" }
  | { s: "products" }
  | { s: "product"; id?: string; barcode?: string };

export type SaleDraft = {
  mode: "cart" | "amount";
  cart: CartInput;
  amount: number;
  split: SaleLine[] | null;
  customerId: string | null;
  redeem: boolean;
};

export const EMPTY_DRAFT: SaleDraft = { mode: "cart", cart: [], amount: 0, split: null, customerId: null, redeem: false };

export type Pos = {
  staff: Staff;
  role: Role;
  actor: Actor;
  logout: () => void;
  go: (r: Route) => void;
  back: () => void;
  /** Одоогийн дэлгэцийг сольж нээнэ */
  replace: (r: Route) => void;
  /** Стекийг цэвэрлээд шинэ дэлгэц (home + r) */
  reset: (r?: Route) => void;
  draft: SaleDraft;
  setDraft: (fn: (d: SaleDraft) => SaleDraft) => void;
  addItem: (productId: string, n?: number) => void;
  setQty: (productId: string, qty: number) => void;
  clearSale: () => void;
  /** Саяхан ирсэн захиалгууд — sp-flash */
  fresh: Set<string>;
};

export const PosCtx = createContext<Pos | null>(null);
export const usePos = () => {
  const p = useContext(PosCtx);
  if (!p) throw new Error("PosCtx");
  return p;
};

/** Нэг дэлгэц: дээр NavBar, дунд гүйлгэдэг агуулга, доор эрхий хуруунд ойр гол товч */
export function Screen({ nav, children, bottom, className }: { nav?: ReactNode; children: ReactNode; bottom?: ReactNode; className?: string }) {
  return (
    <div className="flex h-full flex-col bg-stage">
      {nav}
      <div className={cx("sp-scroll min-h-0 flex-1", className)}>{children}</div>
      {bottom && <div className="sp-material shrink-0 border-t border-[var(--sp-sep)] px-4 pb-4 pt-3">{bottom}</div>}
    </div>
  );
}

/** BR09-7: сүлжээ тасарсан үед тод мэдэгдэл */
export function OfflineBanner({ what = "Гүйлгээ хадгалагдаагүй" }: { what?: string }) {
  return (
    <div className="px-4 pt-3" role="alert">
      <Notice tone="warn" icon="wifiOff">
        <div className="text-[15px] font-semibold">Сүлжээ тасарсан — {what.toLowerCase()}</div>
        <div className="mt-0.5 font-normal">Сагс хадгалагдсан. Холболт сэргэмэгц төлбөр авна.</div>
        <div className="mt-1.5 flex items-center gap-1.5 text-[13px] font-normal">
          <Spinner size={14} /> Дахин холбогдож байна…
        </div>
      </Notice>
    </div>
  );
}

/** Мөнгөн мөр (нийлбэрийн хэсэгт) */
export function Line({ label, value, strong, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; tone?: "ok" | "accent" | "mute" }) {
  return (
    <div className={cx("flex items-baseline justify-between gap-3 py-1", strong ? "text-[17px] font-bold text-ink" : "text-[15px] text-ink-2")}>
      <span className="min-w-0">{label}</span>
      <span className={cx("shrink-0 tnum", tone === "ok" && "text-ok", tone === "accent" && "text-accent", tone === "mute" && "text-mute")}>{value}</span>
    </div>
  );
}

export const card = "rounded-[var(--sp-r-group)] bg-paper";

/**
 * Пос дээрх цэсний эрх. BRD 7.3: пос-ын «Sales» нь биет борлуулалт ба
 * хүргэлт хоёулаа — борлуулах эрхтэй бүх ажилтанд хүргэлт харагдана.
 * Багцын түгжээ хэвээр (7.4). Цуцлах/буцаах/зогсоох нь BR09-2-оор менежер.
 */
export function posAccess(module: Module, plan: Plan, role: Role): "ok" | "locked" | "hidden" {
  const has = (m: Module) => role.modules.includes(m);
  const visible = module === "delivery" ? has("sales") || has("delivery") : module === "products" ? has("sales") || has("products") : has(module);
  if (!visible) return "hidden";
  return PLAN_MODULES[plan].includes(module) ? "ok" : "locked";
}
