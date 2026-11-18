"use client";

/**
 * 7-р дэлгэц «Шинэ бараа»: савлагааны зураг → AI ноорог → ажилтан засаж батална → ПОС-д шууд гарна (нөөц 0).
 * Баркод шалгах цифрээр шалгагдана; БҮНА-г зөвхөн лавлах сангаас (AI таахгүй).
 */
import { useState } from "react";
import { CameraScanner } from "@/components/CameraScanner";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, toast } from "@/components/sp/ui";
import { checkDigitOk } from "@/lib/inventory/match";
import { ApiError, call } from "./api";
import type { Nav } from "./CountApp";
import { OPEN_KEY } from "./Counting";
import { prepareShot } from "./image";
import { BottomBar, CamIcon, CameraInput, ErrorNote, InfoNote, TopBar } from "./ui";

type Fields = {
  name: string;
  unit: "pcs" | "kg" | "l" | "pack";
  barcode: string | null;
  barcodeRejected: boolean;
  category: string | null;
  pack_size: number | null;
  catalog: { name: string; buna: string | null; bunaName: string | null } | null;
  existing: { id: string; name: string } | null;
  priceSuggestion: { value: number; source: "tag" | "similar" } | null;
};
type DraftResp = { draft: { id: string; photoId: string; fields: Fields }; failed?: boolean; message: string | null; categories: string[] };

const UNITS = [
  ["pcs", "ширхэг"],
  ["pack", "багц"],
  ["kg", "кг"],
  ["l", "литр"],
] as const;

export function NewProduct({ sid, barcode, nav }: { sid?: string; barcode?: string; nav: Nav }) {
  const [shot, setShot] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftResp | null>(null);
  const [f, setF] = useState({ name: "", price: "", barcode: barcode ?? "", category: "", unit: "pcs", pack: "" });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [scan, setScan] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string) => setF((o) => ({ ...o, [k]: v }));

  async function onPhoto(file: File) {
    setUploading(true);
    setErr(null);
    try {
      const s = await prepareShot(file);
      setShot(s.url);
      const fd = new FormData();
      fd.append("image", s.blob, "product.jpg");
      const r = await call<DraftResp>("/api/v1/inventory/drafts", { method: "POST", body: fd });
      setDraft(r);
      const x = r.draft.fields;
      setF((o) => ({
        name: x.name || x.catalog?.name || o.name,
        price: x.priceSuggestion ? String(x.priceSuggestion.value) : o.price,
        barcode: o.barcode || x.barcode || "",
        category: x.category ?? r.categories[0] ?? "",
        unit: x.unit,
        pack: x.pack_size ? String(x.pack_size) : o.pack,
      }));
      if (r.message) toast(r.message, r.failed ? "danger" : "ink");
    } catch (e) {
      setErr(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан. Самбараас багц цэнэглэнэ үү." : e instanceof Error ? e.message : "Зураг илгээж чадсангүй");
    } finally {
      setUploading(false);
    }
  }

  const bc = f.barcode.trim();
  const bcBad = !!bc && !checkDigitOk(bc);
  const price = Number(f.price);
  const ready = !!draft && f.name.trim().length >= 2 && f.price !== "" && Number.isFinite(price) && price >= 0 && !bcBad;

  async function confirm() {
    if (!draft) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await call<{ product: { id: string; name: string } }>(`/api/v1/inventory/drafts/${draft.draft.id}/confirm`, {
        method: "POST",
        json: { name: f.name.trim(), price: Math.round(price), barcode: bc, category: f.category, unit: f.unit, packSize: f.pack ? Number(f.pack) : undefined, sessionId: sid },
      });
      toast(`«${r.product.name}» ПОС-д нэмэгдлээ`, "ok");
      if (sid) sessionStorage.setItem(OPEN_KEY, r.product.id);
      nav.back();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Бүртгэж чадсангүй");
    } finally {
      setBusy(false);
    }
  }
  async function cancel() {
    if (draft) await call(`/api/v1/inventory/drafts/${draft.draft.id}`, { method: "DELETE" }).catch(() => null);
    nav.back();
  }

  const x = draft?.draft.fields;
  return (
    <div className="pb-[120px]">
      <TopBar title="Шинэ бараа" sub="Савлагааны зургаас" onBack={() => void cancel()} />
      <div className="space-y-4 px-4 pt-4">
        {!draft ? (
          <div className="rounded-[22px] bg-paper p-6 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
            <div className="mx-auto grid size-16 place-items-center rounded-full bg-accent-soft text-accent">
              <CamIcon size={32} />
            </div>
            <div className="mt-4 text-[18px] font-bold text-ink">Барааны урд талын зургийг авна уу</div>
            <div className="mt-1 text-[15px] text-mute">Нэр, хэмжээ, баркод тод харагдахаар ойроос. AI савлагааны зургаас нэр, хэмжээ, баркодыг уншиж ноорог бэлдэнэ — та шалгаж батална.</div>
            {barcode && <div className="mt-3 text-[14px] text-ink tnum">Баркод: {barcode}</div>}
          </div>
        ) : (
          <>
            {shot && (
              // eslint-disable-next-line @next/next/no-img-element -- локал blob URL
              <img src={shot} alt="Барааны зураг" className="mx-auto max-h-[180px] rounded-[16px] object-contain" />
            )}
            {draft.failed && <InfoNote tone="warn">Зургаас уншиж чадсангүй — талбаруудыг гараар бөглөнө үү.</InfoNote>}
            {x?.existing && <ErrorNote>Энэ баркодтой бараа бүртгэлтэй: {x.existing.name}</ErrorNote>}
            <label className="block">
              <span className="text-[14px] font-medium text-mute">Барааны нэр</span>
              <input name="name" value={f.name} onChange={(e) => set("name")(e.target.value.slice(0, 120))} className="sp-field mt-1.5 h-[56px] w-full text-[17px] font-semibold" />
            </label>
            {x?.catalog && (
              <div className="rounded-[14px] bg-accent-soft px-3.5 py-3 text-[14px] text-accent">
                Лавлах санд: <b>{x.catalog.name}</b>
                {x.catalog.buna ? ` · БҮНА ${x.catalog.buna}` : ""}
                {x.catalog.name !== f.name && (
                  <button type="button" onClick={() => set("name")(x.catalog!.name)} className="sp-tap ml-2 font-semibold underline">
                    Энэ нэрийг авах
                  </button>
                )}
              </div>
            )}
            <label className="block">
              <span className="flex justify-between text-[14px] font-medium text-mute">
                Зарах үнэ (₮)
                {x?.priceSuggestion && <span>{x.priceSuggestion.source === "tag" ? "Үнийн шошгоноос" : "Ижил барааны дундаж — санал"}</span>}
              </span>
              <input name="price" inputMode="numeric" value={f.price} onChange={(e) => set("price")(e.target.value.replace(/\D/g, "").slice(0, 9))} placeholder="0" className="sp-field mt-1.5 h-[56px] w-full text-[20px] font-bold tnum" />
            </label>
            <label className="block">
              <span className="text-[14px] font-medium text-mute">Баркод</span>
              <div className="mt-1.5 flex gap-2">
                <input
                  name="barcode"
                  inputMode="numeric"
                  value={f.barcode}
                  onChange={(e) => set("barcode")(e.target.value.replace(/\D/g, "").slice(0, 14))}
                  placeholder="Баркодгүй бол хоосон"
                  className={cx("sp-field h-[56px] min-w-0 flex-1 text-[18px] tnum", bcBad && "!shadow-[inset_0_0_0_2px_var(--danger)]")}
                />
                <button type="button" onClick={() => setScan(true)} className="sp-tap flex h-[56px] shrink-0 items-center gap-1.5 rounded-[16px] bg-accent-soft px-3 text-[14px] font-semibold text-accent">
                  <Icon name="scan" size={20} /> Баркод уншуулах
                </button>
              </div>
              {(bcBad || x?.barcodeRejected) && <span className="mt-1 block text-[13.5px] text-danger">Баркодын шалгах орон таарахгүй — баркодоо уншуулна уу.</span>}
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-[14px] font-medium text-mute">Ангилал</span>
                <select value={f.category} onChange={(e) => set("category")(e.target.value)} className="sp-field mt-1.5 h-[56px] w-full text-[16px]">
                  {draft.categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-[14px] font-medium text-mute">Нэгж</span>
                <select value={f.unit} onChange={(e) => set("unit")(e.target.value)} className="sp-field mt-1.5 h-[56px] w-full text-[16px]">
                  {UNITS.map(([id, l]) => (
                    <option key={id} value={id}>
                      {l}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="text-[14px] font-medium text-mute">Нэг хайрцагт хэдэн ширхэг (заавал биш)</span>
              <input inputMode="numeric" value={f.pack} onChange={(e) => set("pack")(e.target.value.replace(/\D/g, "").slice(0, 5))} className="sp-field mt-1.5 h-[56px] w-full text-[18px] tnum" />
            </label>
            <p className="text-[13px] text-mute">Үлдэгдэл 0-ээр бүртгэгдэнэ — дараа нь тоолж оруулна. БҮНА зөвхөн баркодоор лавлах сангаас.</p>
          </>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>

      <BottomBar>
        {!draft ? (
          <label htmlFor="product-cam" className={cx("sp-tap flex h-[60px] cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-accent text-[18px] font-semibold text-white", uploading && "pointer-events-none opacity-60")}>
            <CamIcon /> Зураг авах
          </label>
        ) : (
          <Btn size="xl" block loading={busy} disabled={!ready || !!x?.existing} onClick={() => void confirm()}>
            Бараа бүртгэх
          </Btn>
        )}
        <CameraInput id="product-cam" onFile={(file) => void onPhoto(file)} />
      </BottomBar>

      {uploading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-8" role="status">
          <div className="w-full max-w-[320px] rounded-[22px] bg-paper p-6 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
            <div className="mt-4 text-[17px] font-semibold text-ink">AI савлагааг уншиж байна…</div>
          </div>
        </div>
      )}
      {scan && (
        <div className="fixed inset-0 z-50">
          <div className="relative h-full w-full">
            <CameraScanner
              title="Баркод уншуулах"
              okText="Уншлаа"
              missText="Шалгах орон буруу"
              onScan={(code) => {
                if (!checkDigitOk(code)) return false;
                set("barcode")(code);
                setScan(false);
                return true;
              }}
              onClose={() => setScan(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
