"use client";

/**
 * 4-р дэлгэц «Зургийн үр дүн»: зураг дээр хүрээ, бараа бүр карт — нэр, нүүр (±), гүн, нийт; «Бүгдийг батлах».
 * AI зөвхөн нүүрэн талыг тоолно (D7) — гүнийг ажилтан оруулж, тоо бүрийг хүн батална.
 */
import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, toast } from "@/components/sp/ui";
import { ApiError, call, sendCount } from "./api";
import type { Nav } from "./CountApp";
import { prepareShot } from "./image";
import type { Detection, PhotoResp, SessionFull } from "./types";
import { BottomBar, CamIcon, CameraInput, ErrorNote, InfoNote, TopBar } from "./ui";

export type PhotoView = { url: string; w: number; h: number; resp: PhotoResp };
type Row = { include: boolean; productId: string; facings: number; depth: number; rows: number; edited: boolean };

const COLORS = ["#0046E2", "#1FAE7A", "#E5484D", "#F5A524", "#4F7EF5", "#002F96", "#8791A8"];

export function PhotoResult({ sid, shot, nav }: { sid: string; shot: PhotoView; nav: Nav }) {
  const [data, setData] = useState<SessionFull | null>(null);
  const r = shot.resp.result;
  const dets = useMemo(() => r?.detections ?? [], [r]);
  const [rows, setRows] = useState<Row[]>(() =>
    dets.map((d) => ({ include: !!d.productId && d.facings > 0, productId: d.productId ?? "", facings: d.facings, depth: d.depth ?? 1, rows: d.rows || 1, edited: false })),
  );
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    call<SessionFull>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}`)
      .then(setData)
      .catch((e) => setErr(e instanceof Error ? e.message : "Алдаа"));
  }, [sid]);

  const upd = (i: number, p: Partial<Row>) => setRows((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const lines = data?.lines ?? [];
  const nameOf = (id: string) => lines.find((l) => l.productId === id)?.name ?? dets.find((d) => d.productId === id)?.name ?? "";
  const chosen = rows.filter((x) => x.include && x.productId);

  async function retake(f: File) {
    setUploading(true);
    try {
      const s = await prepareShot(f);
      const fd = new FormData();
      fd.append("image", s.blob, "shelf.jpg");
      const resp = await call<PhotoResp>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/photos`, { method: "POST", body: fd });
      nav.replace({ k: "photo", sid, shot: { url: s.url, w: s.w, h: s.h, resp } });
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан. Баркод эсвэл гараар тоолно уу." : e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setUploading(false);
    }
  }

  async function confirmAll() {
    setBusy(true);
    setErr(null);
    let ok = 0;
    let queued = 0;
    const errs: string[] = [];
    // давхардсан барааг нэгтгэнэ (нэг зурагт нэг бараа 2 хүрээгээр гарч болно)
    for (const [i, x] of rows.entries()) {
      if (!x.include || !x.productId) continue;
      const d = dets[i];
      try {
        const res = await sendCount(
          sid,
          {
            clientId: `${shot.resp.photo.id}-${i}`,
            productId: x.productId,
            method: "facings",
            inputs: { f: x.facings, d: x.depth, r: x.rows },
            source: "photo",
            photoId: shot.resp.photo.id,
            ...(x.edited || x.productId !== d.productId ? {} : { confidence: d.confidence }),
            place: "Тавиур",
            confirmLarge: true,
          },
          nameOf(x.productId),
        );
        if (res.queued) queued++;
        else ok++;
      } catch (e) {
        errs.push(`${nameOf(x.productId)}: ${e instanceof Error ? e.message : "алдаа"}`);
      }
    }
    setBusy(false);
    if (errs.length) setErr(errs.join("\n"));
    if (ok || queued) toast(`${ok} бараа хадгалагдлаа${queued ? `, ${queued} дараалалд` : ""}`, "ok");
    if (!errs.length) nav.back();
  }

  const failed = shot.resp.photo.status === "failed" || !r;
  return (
    <div className="pb-[130px]">
      <TopBar title="Зургийн үр дүн" sub={failed ? "Уншиж чадсангүй" : `${dets.length} төрлийн бараа илэрлээ`} onBack={nav.back} />
      <div className="space-y-4 px-4 pt-3">
        <div className="relative overflow-hidden rounded-[18px] bg-black" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- локал blob URL */}
          <img src={shot.url} alt="Тавиурын зураг" className="absolute inset-0 size-full object-contain" />
          {dets.map((d, i) =>
            d.bbox ? (
              <a
                key={i}
                href={`#det-${i}`}
                aria-label={`${i + 1}: ${d.name ?? d.label}`}
                className="absolute rounded-[6px] border-[2.5px]"
                style={{
                  left: `${d.bbox[0] * 100}%`,
                  top: `${d.bbox[1] * 100}%`,
                  width: `${d.bbox[2] * 100}%`,
                  height: `${d.bbox[3] * 100}%`,
                  borderColor: COLORS[i % COLORS.length],
                  opacity: rows[i]?.include ? 1 : 0.45,
                }}
              >
                <span className="absolute -left-[2px] -top-[2px] grid h-6 min-w-6 place-items-center rounded-br-[8px] rounded-tl-[5px] px-1 text-[13px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
                  {i + 1}
                </span>
              </a>
            ) : null,
          )}
        </div>

        {failed ? (
          <>
            <ErrorNote>{shot.resp.message ?? "Зураг уншиж чадсангүй. Кредит буцаагдлаа."}</ErrorNote>
            <Btn size="xl" block onClick={nav.back}>
              Баркод, гараар үргэлжлүүлэх
            </Btn>
          </>
        ) : (
          <>
            {r!.retake && <InfoNote tone="warn">{r!.retake}</InfoNote>}
            {r!.quality.partial_shelf && !r!.retake && <InfoNote tone="warn">Тавиур бүтэн орсонгүй — үлдсэн хэсгийг тусад нь авна уу.</InfoNote>}
            {dets.length === 0 && <InfoNote>Бараа илэрсэнгүй. Тавиурт ойртож, гэрэлтэй газар дахин авна уу.</InfoNote>}
            <InfoNote>AI зөвхөн урд эгнээг (нүүр) тоолсон. Ард хэдэн эгнээ байгааг «Гүн»-д оруулаад батална уу.</InfoNote>
            <ul className="space-y-3">
              {dets.map((d, i) => (
                <DetCard key={i} i={i} d={d} row={rows[i]} lines={lines} onChange={(p) => upd(i, p)} />
              ))}
            </ul>
            {r!.gaps.length > 0 && (
              <div className="rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]">
                <div className="text-[15px] font-semibold text-ink">Тавиурын хоосон зай</div>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14.5px] text-mute">
                  {r!.gaps.map((g, i) => (
                    <li key={i}>
                      {g.near_label || "Тодорхойгүй байрлал"}
                      {g.price_tag_text ? ` · шошго: ${g.price_tag_text}` : ""}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>

      {!failed && (
        <BottomBar>
          {r!.retake ? (
            <div className="grid grid-cols-[1fr_auto] gap-2">
              <label htmlFor="retake-cam" className={cx("sp-tap flex h-[60px] cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-accent text-[17px] font-semibold text-white", uploading && "pointer-events-none opacity-60")}>
                <CamIcon /> Дахин авах
              </label>
              <Btn size="xl" variant="gray" loading={busy} disabled={!chosen.length} onClick={() => void confirmAll()}>
                Батлах
              </Btn>
            </div>
          ) : (
            <Btn size="xl" block loading={busy} disabled={!chosen.length} onClick={() => void confirmAll()}>
              Бүгдийг батлах ({chosen.length})
            </Btn>
          )}
          <CameraInput id="retake-cam" onFile={(f) => void retake(f)} />
        </BottomBar>
      )}
      {uploading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-8" role="status">
          <div className="w-full max-w-[320px] rounded-[22px] bg-paper p-6 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
            <div className="mt-4 text-[17px] font-semibold text-ink">AI тавиурыг тоолж байна…</div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetCard({ i, d, row, lines, onChange }: { i: number; d: Detection; row: Row; lines: SessionFull["lines"]; onChange: (p: Partial<Row>) => void }) {
  const total = row.facings * row.depth * row.rows;
  const low = d.confidence < 0.6;
  const opts = [...d.suggestions.map((s) => ({ id: s.id, name: s.name })), ...lines.filter((l) => !d.suggestions.some((s) => s.id === l.productId)).map((l) => ({ id: l.productId, name: l.name }))];
  const step = (k: "facings" | "depth" | "rows", delta: number, min: number) => onChange({ [k]: Math.max(min, row[k] + delta), edited: true, include: true } as Partial<Row>);
  return (
    <li id={`det-${i}`} className={cx("scroll-mt-24 rounded-[18px] bg-paper p-4 shadow-[0_0_0_0.5px_var(--sp-sep)]", !row.include && "opacity-70")}>
      <div className="flex items-start gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
          {i + 1}
        </span>
        <div className="min-w-0 flex-1">
          <select
            aria-label="Бараа"
            value={row.productId}
            onChange={(e) => onChange({ productId: e.target.value, include: !!e.target.value })}
            className="sp-field h-[52px] w-full text-[16px] font-semibold"
          >
            <option value="">— Бараа сонгох —</option>
            {opts.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="mt-1 truncate text-[13px] text-mute">
            Зурагт: {d.label}
            {d.priceTag ? ` · шошго ${d.priceTag.toLocaleString("en-US")}₮` : ""}
          </div>
          {!d.productId && <div className="mt-1 text-[13.5px] font-semibold text-warn">Таниагүй — бараагаа сонгоно уу</div>}
          {low && <div className="mt-1 text-[13.5px] font-semibold text-warn">Шалгах — AI итгэл бага, нүдээр тоолно уу</div>}
        </div>
        <label className="flex shrink-0 items-center gap-1.5 pt-3 text-[13px] text-mute">
          <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} className="size-6 accent-[var(--accent)]" aria-label="Тоололд оруулах" />
        </label>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <Stepper label="Нүүр (AI)" value={row.facings} onMinus={() => step("facings", -1, 0)} onPlus={() => step("facings", 1, 0)} />
        <Stepper label="Гүн" value={row.depth} onMinus={() => step("depth", -1, 1)} onPlus={() => step("depth", 1, 1)} />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <button type="button" onClick={() => onChange({ rows: row.rows >= 5 ? 1 : row.rows + 1, edited: true })} className="sp-tap h-[40px] rounded-full bg-[var(--sp-fill)] px-3 text-[13.5px] font-semibold text-ink">
          Давхар: {row.rows}
        </button>
        <div className="text-[15px] text-mute">
          Нийт <span className="text-[22px] font-bold text-ink tnum">{total}</span>
        </div>
      </div>
    </li>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div>
      <div className="mb-1 text-[13px] font-medium text-mute">{label}</div>
      <div className="flex h-[52px] items-stretch overflow-hidden rounded-[14px] bg-[var(--sp-fill)]">
        <button type="button" aria-label={`${label} хасах`} onClick={onMinus} className="sp-tap grid w-[52px] place-items-center text-ink">
          <Icon name="minus" size={22} />
        </button>
        <div className="grid flex-1 place-items-center text-[22px] font-bold text-ink tnum">{value}</div>
        <button type="button" aria-label={`${label} нэмэх`} onClick={onPlus} className="sp-tap grid w-[52px] place-items-center text-ink">
          <Icon name="plus" size={22} />
        </button>
      </div>
    </div>
  );
}
