"use client";

/*
 * Бараа бүртгэх үеийн ангилал, татварын хэсэг — Пос апп, утасны апп,
 * Merchant portal гурав ижил ашиглана.
 *
 *  - Баркод бол зөвхөн дугаар. Нэр, ангиллыг серверийн сангаас хайна:
 *    и-Баримтын ББНС-ын хуулбар → GePOS-ын нийтлэг сан (/api/catalog/barcode).
 *  - Олдохгүй бол хэрэглэгч ангиллын зураг сонгоно → БҮНА код.
 *  - Нэрийг татварт ашиглахгүй. Татварыг tax.ts тооцно, хэрэглэгч сонгохгүй.
 */

import { useEffect, useRef, useState } from "react";
import type { Product, TaxProfile } from "@/lib/sp/types";
import { isExciseBuna, splitTax, taxText, tileOf, tilesFor, type Tile } from "@/lib/sp/tax";
import { money } from "@/lib/sp/logic";
import { cx, Spinner, Switch } from "./ui";
import { Icon } from "./icons";

export type Found = { found: true; code: string; source: "ebarimt" | "gepos"; name: string; buna: string | null; bunaName?: string; excise: boolean };
export type LookupState = { st: "idle" } | { st: "loading"; code: string } | { st: "miss"; code: string } | { st: "error"; code: string } | ({ st: "found" } & Found);

/** Баркод өөрчлөгдөхөд сангаас хайна (8–14 орон) */
export function useCatalogLookup(barcode: string, onFound?: (f: Found) => void): LookupState {
  const code = barcode.replace(/\D/g, "");
  const [res, setRes] = useState<LookupState>({ st: "idle" });
  const cb = useRef(onFound);
  useEffect(() => {
    cb.current = onFound;
  });
  const ok = code.length >= 8 && code.length <= 14;
  useEffect(() => {
    if (!ok) return;
    let live = true;
    const t = setTimeout(async () => {
      setRes({ st: "loading", code });
      try {
        const r = await fetch(`/api/catalog/barcode?code=${code}`);
        const j = await r.json();
        if (!live) return;
        setRes(j.found ? { st: "found", ...(j as Found) } : { st: "miss", code });
        if (j.found) cb.current?.(j as Found);
      } catch {
        if (live) setRes({ st: "error", code });
      }
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [code, ok]);
  return ok ? res : { st: "idle" };
}

/** Санд олдоогүй баркодын нэр, ангиллыг GePOS-ын санд нэмнэ (үнэ, мерчант илгээхгүй) */
export function shareToCatalog(barcode: string, name: string, buna?: string) {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8 || !buna || !name.trim()) return;
  fetch("/api/catalog/barcode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, name: name.trim(), buna }) }).catch(() => {});
}

/** Баркод хайлтын үр дүнгийн мөр */
export function LookupBadge({ res }: { res: LookupState }) {
  if (res.st === "idle") return null;
  if (res.st === "loading")
    return (
      <div className="flex items-center gap-2 text-[13px] text-mute">
        <Spinner size={14} /> Сангаас хайж байна…
      </div>
    );
  if (res.st === "found")
    return (
      <div className="flex items-start gap-2 rounded-[12px] bg-ok-soft px-3 py-2 text-[13px] leading-snug text-ok">
        <Icon name="check" size={16} stroke={2.4} className="mt-px shrink-0" />
        <span>
          <b>{res.source === "ebarimt" ? "и-Баримтын санд олдлоо" : "GePOS-ын санд олдлоо"}</b>
          <span className="block text-ink-2">Нэр, ангилал автоматаар бөглөгдлөө. Засаж болно.</span>
        </span>
      </div>
    );
  if (res.st === "miss")
    return (
      <div className="flex items-start gap-2 rounded-[12px] bg-[var(--sp-fill)] px-3 py-2 text-[13px] leading-snug text-ink-2">
        <Icon name="info" size={16} className="mt-px shrink-0" />
        <span>
          <b>Санд олдсонгүй.</b> Нэрээ бичээд, доороос ангиллаа сонгоно уу.
        </span>
      </div>
    );
  return <div className="text-[13px] text-danger">Сантай холбогдож чадсангүй. Ангиллаа гараар сонгоно уу.</div>;
}

/** Ангиллын зураг → БҮНА код */
export function TilePicker({ profile, value, onChange, compact }: { profile: TaxProfile; value?: string; onChange: (buna: string) => void; compact?: boolean }) {
  const tiles = tilesFor(profile);
  const cur = tileOf(value, profile);
  const [open, setOpen] = useState(false);
  // сонгосон ангилал эхний 8-д байхгүй бол бүгдийг харуулна
  const hidden = !!cur && tiles.findIndex((t) => t.id === cur.id) >= 8;
  const shown = compact && !open && !hidden ? tiles.slice(0, 8) : tiles;
  return (
    <div>
      <div className={cx("grid gap-1.5", compact ? "grid-cols-4" : "grid-cols-4 sm:grid-cols-5")}>
        {shown.map((t: Tile) => {
          const on = cur?.id === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onChange(t.buna)}
              className={cx(
                "sp-tap flex min-h-[64px] flex-col items-center justify-center gap-0.5 rounded-[12px] px-1 py-1.5 text-center text-[11.5px] leading-tight",
                on ? "bg-accent-soft font-semibold text-accent shadow-[inset_0_0_0_2px_var(--accent)]" : "bg-[var(--sp-fill)] text-ink-2",
              )}
            >
              <span className="text-[22px] leading-none">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
        {compact && !open && !hidden && tiles.length > 8 && (
          <button type="button" onClick={() => setOpen(true)} className="sp-tap flex min-h-[64px] flex-col items-center justify-center rounded-[12px] bg-[var(--sp-fill)] text-[11.5px] text-ink-2">
            <span className="text-[20px] leading-none">⋯</span>Бүгд ({tiles.length})
          </button>
        )}
      </div>
      {cur?.alt && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {cur.alt.map((a) => (
            <button
              key={a.buna}
              type="button"
              onClick={() => onChange(a.buna)}
              className={cx("sp-tap h-8 rounded-full px-3 text-[13px]", value === a.buna ? "bg-accent text-white" : "bg-[var(--sp-fill)] text-ink-2")}
            >
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/** «НӨАТ 10% · НХАТ 2%» + дүн. Зөвхөн уншина. */
export function TaxLine({ profile, product, price }: { profile: TaxProfile; product: Pick<Product, "bunaCode" | "ownProduction">; price: number }) {
  const t = splitTax(price, profile, product);
  const excise = isExciseBuna(product.bunaCode);
  return (
    <div className="rounded-[12px] bg-[var(--sp-fill)] px-3 py-2.5 text-[13px] leading-snug">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold text-ink">{taxText(profile, product)}</span>
        {price > 0 && (
          <span className="tnum text-ink-2">
            {t.vat ? `НӨАТ ${money(Math.round(t.vat))}` : ""}
            {t.city ? ` · НХАТ ${money(Math.round(t.city))}` : ""}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-[12px] text-mute">
        Татварыг систем тооцно — таны тохиргоо ба ангиллаас.
        {excise && t.city > 0 && " Архи, тамхи тул НХАТ ногдоно. Зарахдаа тэмдгийн QR уншуулна."}
      </div>
    </div>
  );
}

/** Зөвхөн үйлдвэрлэгч мерчантад */
export function OwnProduction({ profile, value, onChange }: { profile: TaxProfile; value: boolean; onChange: (v: boolean) => void }) {
  if (!profile.producer.length || !profile.vatPayer) return null;
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-[var(--sp-fill)] px-3 py-2.5">
      <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">
        Өөрийн үйлдвэрлэл
        <span className="block text-[12px] text-mute">Дотоодын түүхий эдээр өөрөө хийсэн бол НӨАТ-аас чөлөөлөгдөнө (13.1.15–17)</span>
      </span>
      <Switch checked={value} onChange={onChange} label="Өөрийн үйлдвэрлэл" />
    </div>
  );
}

/** Ангиллын нэр — жагсаалтад */
export function bunaLabel(code: string | undefined, profile: TaxProfile) {
  const t = tileOf(code, profile);
  if (!t) return code ? `БҮНА ${code}` : "Ангилалгүй";
  const a = t.alt?.find((x) => x.buna === code);
  return `${t.icon} ${a ? a.label : t.label}`;
}

/** Сангаас ангилал олдсон үед: зураг сонгуулахгүй, нэг мөрөөр харуулна */
export function FoundCategory({ name, code, onChange }: { name?: string; code: string; onChange: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-[var(--sp-fill)] px-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-ink">{name ?? code}</span>
        <span className="block text-[12px] text-mute">и-Баримтын ангилал · {code}</span>
      </span>
      <button type="button" onClick={onChange} className="sp-tap h-9 shrink-0 rounded-full px-3 text-[14px] font-semibold text-accent">
        Солих
      </button>
    </div>
  );
}
