"use client";

/**
 * Тавиурын давталт: зураг → бүх бараа урьдчилж бөглөгдсөн → «Батлах ба дараагийн тавиур» (камер шууд нээгдэнэ).
 * Бүртгэлтэй барааг сервер автоматаар холбоно (ногоон «Таарсан») — ажилтан зөвхөн эргэлзээтэйд 2–3 товчоор сонгоно.
 * Байршил (Тавиур 1, 2 …, Агуулах) бүрийн зургийн тоо ДАХИН авбал солигдоно, нэмэгдэхгүй.
 */
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Sheet, toast } from "@/components/sp/ui";
import { ApiError, call } from "./api";
import type { Nav } from "./CountApp";
import { sendShelf, shootShelf, type ShotView } from "./shoot";
import type { ConfirmResp, Detection } from "./types";
import { CamIcon, CameraInput, ErrorNote, InfoNote } from "./ui";

export type PhotoView = ShotView;
type Row = { include: boolean; productId: string; name: string; facings: number; depth: number | null; rows: number; edited: boolean };

const COLORS = ["#0046E2", "#1FAE7A", "#E5484D", "#F5A524", "#4F7EF5", "#002F96", "#8791A8"];
const placeNo = (p: string) => Number(/^Тавиур (\d+)$/.exec(p)?.[1] ?? 0);

function initRows(dets: Detection[]): Row[] {
  return dets.map((d) => ({
    include: d.status === "matched" && d.facings > 0 && !d.dupSuspect,
    productId: d.productId ?? "",
    name: d.name ?? "",
    facings: d.facings,
    depth: d.depth,
    rows: d.rows || 1,
    edited: false,
  }));
}

export function PhotoResult({ sid, shot, nav }: { sid: string; shot: PhotoView; nav: Nav }) {
  const r = shot.resp.result;
  const dets = useMemo(() => r?.detections ?? [], [r]);
  const [rows, setRows] = useState<Row[]>(() => initRows(dets));
  const [place, setPlace] = useState(shot.resp.photo?.place ?? shot.resp.similar?.place ?? "Тавиур 1");
  const [open, setOpen] = useState<number | null>(null);
  const [editPlace, setEditPlace] = useState(false);
  const [busy, setBusy] = useState<"confirm" | "upload" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [known, setKnown] = useState<string[]>(shot.resp.places ?? []);
  const pending = useRef<Promise<ConfirmResp | null> | null>(null);

  const upd = (i: number, p: Partial<Row>) => setRows((o) => o.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const needDepth = rows.some((x) => x.include && x.productId && x.depth == null);
  const chosen = rows.filter((x) => x.include && x.productId);
  const total = chosen.reduce((a, x) => a + x.facings * (x.depth ?? 0) * x.rows, 0);

  async function confirm(): Promise<ConfirmResp | null> {
    if (!shot.resp.photo || shot.resp.photo.status !== "done") return null;
    setBusy("confirm");
    setErr(null);
    try {
      const items = rows
        .map((x, i) => ({ x, d: dets[i] }))
        .filter(({ x }) => x.include && x.productId && x.depth != null)
        .map(({ x, d }) => ({ productId: x.productId, f: x.facings, d: x.depth, r: x.rows, ...(x.edited || x.productId !== d.productId ? {} : { confidence: d.confidence }) }));
      const res = await call<ConfirmResp>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/photos/${shot.resp.photo.id}/confirm`, { method: "POST", json: { place, items } });
      setKnown(res.places);
      toast(`${res.place}: ${items.length} бараа хадгалагдлаа${res.replaced ? " (өмнөхийг сольсон)" : ""}`, "ok");
      return res;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Хадгалж чадсангүй");
      return null;
    } finally {
      setBusy(null);
    }
  }

  const queue = shot.queue ?? [];
  /** Олноор сонгосон зургийн дараагийнх: батлаад шууд илгээнэ (камер нээхгүй) */
  async function nextQueued() {
    const done = await confirm();
    if (!done) return;
    setBusy("upload");
    try {
      const v = await shootShelf(sid, queue[0], { place: done.nextPlace });
      nav.replace({ k: "photo", sid, shot: { ...v, queue: queue.slice(1) } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Зураг илгээж чадсангүй", "danger");
    } finally {
      setBusy(null);
    }
  }
  /** Дараагийн тавиурын зураг: батлалт дуусахыг хүлээгээд илгээнэ */
  async function nextShot(f: File) {
    const done = await (pending.current ?? confirm());
    pending.current = null;
    if (!done) return toast("Өмнөх тавиур хадгалагдсангүй — дахин «Батлах» дарна уу", "danger");
    setBusy("upload");
    try {
      const v = await shootShelf(sid, f, { place: done.nextPlace });
      nav.replace({ k: "photo", sid, shot: v });
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан. Баркод эсвэл гараар тоолно уу." : e instanceof Error ? e.message : "Зураг илгээж чадсангүй", "danger");
      nav.back();
    } finally {
      setBusy(null);
    }
  }

  /** «Бараг ижил» → солих (ижил байршил) эсвэл шинэ тавиур */
  async function resend(target: string) {
    setBusy("upload");
    try {
      const resp = await sendShelf(sid, { blob: shot.blob, phash: shot.phash }, { place: target, force: true });
      nav.replace({ k: "photo", sid, shot: { ...shot, resp } });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(null);
    }
  }

  const overlay = busy === "upload" && (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-8" role="status" aria-live="polite">
      <div className="w-full max-w-[320px] rounded-[22px] bg-paper p-6 text-center">
        <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
        <div className="mt-4 text-[17px] font-semibold text-ink">AI тавиурыг тоолж байна…</div>
        <div className="mt-1 text-[14px] text-mute">10–30 секунд</div>
      </div>
    </div>
  );

  const image = (
    <div className="relative overflow-hidden rounded-[18px] bg-black" style={{ aspectRatio: `${shot.w} / ${shot.h}` }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- локал blob URL */}
      <img src={shot.url} alt="Тавиурын зураг" className="absolute inset-0 size-full object-contain" />
      {dets.map((d, i) =>
        d.bbox ? (
          <button
            key={i}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={`${i + 1}: ${d.name ?? d.label}`}
            className="absolute rounded-[6px] border-[2.5px]"
            style={{ left: `${d.bbox[0] * 100}%`, top: `${d.bbox[1] * 100}%`, width: `${d.bbox[2] * 100}%`, height: `${d.bbox[3] * 100}%`, borderColor: COLORS[i % COLORS.length], opacity: rows[i]?.include ? 1 : 0.4 }}
          >
            <span className="absolute -left-[2px] -top-[2px] grid h-6 min-w-6 place-items-center rounded-br-[8px] rounded-tl-[5px] px-1 text-[13px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
              {i + 1}
            </span>
          </button>
        ) : null,
      )}
    </div>
  );

  const header = (
    <header className="sp-material sticky top-0 z-30 flex min-h-[60px] items-center gap-1 border-b border-[var(--sp-sep)] px-2 pt-[env(safe-area-inset-top)]">
      <button type="button" onClick={nav.back} aria-label="Буцах" className="sp-tap grid size-[52px] shrink-0 place-items-center rounded-full text-accent">
        <Icon name="back" size={26} />
      </button>
      <div className="min-w-0 flex-1 py-2">
        <div className="truncate text-[18px] font-bold leading-tight text-ink">{place}</div>
        <div className="truncate text-[13px] text-mute">{r ? `${chosen.length} бараа · нийт ${total}` : "Тавиурын зураг"}</div>
      </div>
      {!shot.resp.similar && (
        <button type="button" onClick={() => setEditPlace(true)} className="sp-tap h-[48px] rounded-full px-4 text-[15px] font-semibold text-accent">
          Байршил
        </button>
      )}
    </header>
  );

  // ── Өмнөх зурагтай бараг ижил ──
  if (shot.resp.similar) {
    const sim = shot.resp.similar;
    return (
      <div className="pb-8">
        {header}
        <div className="space-y-4 px-4 pt-4">
          {image}
          <InfoNote tone="warn">Өмнөх зурагтай бараг ижил байна ({sim.place}). Тэр тавиурыг дахин тоолж байгаа бол «Солих» — өмнөх тоо шинээр солигдоно, нэмэгдэхгүй.</InfoNote>
          <Btn size="xl" block onClick={() => void resend(sim.place)} disabled={!!busy}>
            Солих ({sim.place})
          </Btn>
          <Btn size="lg" variant="gray" block disabled={!!busy} onClick={() => void resend(`Тавиур ${Math.max(placeNo(sim.place), placeNo(place)) + 1}`)}>
            Өөр тавиур — шинээр тоолох
          </Btn>
          <Btn size="lg" variant="plain" block onClick={nav.back}>
            Болих
          </Btn>
        </div>
        {overlay}
      </div>
    );
  }

  // ── Уншиж чадаагүй ──
  if (!r || shot.resp.photo?.status !== "done") {
    return (
      <div className="pb-8">
        {header}
        <div className="space-y-4 px-4 pt-4">
          {image}
          <ErrorNote>{shot.resp.message ?? "Зураг уншиж чадсангүй. Кредит буцаагдлаа."}</ErrorNote>
          <label htmlFor="retry-cam" className="sp-tap flex h-[60px] cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-accent text-[17px] font-semibold text-white">
            <CamIcon /> Дахин авах
          </label>
          <CameraInput id="retry-cam" onFile={(f) => void retry(f)} />
          <Btn size="lg" variant="gray" block onClick={() => nav.replace({ k: "count", sid })}>
            Баркод, гараар тоолох
          </Btn>
        </div>
        {overlay}
      </div>
    );
  }
  async function retry(f: File) {
    setBusy("upload");
    try {
      nav.replace({ k: "photo", sid, shot: await shootShelf(sid, f, { place }) });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Алдаа", "danger");
    } finally {
      setBusy(null);
    }
  }

  const setAllDepth = (n: number, onlyMissing: boolean) => setRows((o) => o.map((x) => (x.include && x.productId && (!onlyMissing || x.depth == null) ? { ...x, depth: n } : x)));

  return (
    <div className="pb-[150px]">
      {header}
      <div className="space-y-3 px-4 pt-3">
        {image}
        {r.retake && <InfoNote tone="warn">{r.retake}</InfoNote>}
        {needDepth ? (
          <DepthCard title="Ард хэдэн эгнээ вэ?" sub="Энэ тавиурын гүн тодорхойгүй бараанд. Дараагийн удаа санагдана." onPick={(n) => setAllDepth(n, true)} highlight />
        ) : (
          chosen.length > 1 && <DepthCard title="Энэ тавиурт бүгд =" onPick={(n) => setAllDepth(n, false)} compact />
        )}
        {dets.length === 0 && <InfoNote>Бараа илэрсэнгүй. Тавиурт ойртож, гэрэлтэй газар дахин авна уу.</InfoNote>}
        <ul className="space-y-2">
          {dets.map((d, i) => (
            <ItemRow key={i} i={i} d={d} row={rows[i]} open={open === i} onToggle={() => setOpen(open === i ? null : i)} onChange={(p) => upd(i, p)} onNew={() => nav.go({ k: "new", sid })} />
          ))}
        </ul>
        <button type="button" onClick={() => nav.go({ k: "count", sid, scan: true })} className="sp-tap flex h-[44px] items-center gap-1.5 px-1 text-[14px] font-semibold text-accent">
          <Icon name="scan" size={16} /> Зурагт илрээгүй бараа байна уу? Баркодоор нэмэх
        </button>
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>

      <div className="sp-material fixed inset-x-0 bottom-0 z-30 space-y-2 border-t border-[var(--sp-sep)] px-3 pb-[max(env(safe-area-inset-bottom),12px)] pt-3">
        {needDepth ? (
          <Btn size="xl" block disabled>
            Гүнээ сонгоно уу
          </Btn>
        ) : queue.length ? (
          <Btn size="xl" block loading={!!busy} onClick={() => void nextQueued()}>
            Батлах ба дараагийн ({queue.length} үлдсэн)
          </Btn>
        ) : (
          <label
            htmlFor="next-cam"
            onClick={() => {
              // камер шууд нээгдэнэ (iOS: хэрэглэгчийн товшилтод), зэрэгцээд батална
              pending.current = confirm();
            }}
            className={cx("sp-tap flex h-[60px] cursor-pointer items-center justify-center gap-2 rounded-[16px] bg-accent text-[17px] font-semibold text-white", busy && "pointer-events-none opacity-60")}
          >
            <CamIcon /> Батлах ба дараагийн тавиур
          </label>
        )}
        <CameraInput id="next-cam" onFile={(f) => void nextShot(f)} />
        <Btn
          size="lg"
          variant="gray"
          block
          disabled={needDepth || !!busy}
          onClick={async () => {
            const ok = await confirm();
            if (ok) nav.replace({ k: "submit", sid });
          }}
        >
          Дуусгах
        </Btn>
      </div>

      <Sheet open={editPlace} onClose={() => setEditPlace(false)} title="Байршил">
        <PlaceEdit
          value={place}
          known={known}
          onPick={(p) => {
            setPlace(p);
            setEditPlace(false);
          }}
        />
      </Sheet>
      {overlay}
    </div>
  );
}

function DepthCard({ title, sub, onPick, highlight, compact }: { title: string; sub?: string; onPick: (n: number) => void; highlight?: boolean; compact?: boolean }) {
  const [more, setMore] = useState(false);
  const [v, setV] = useState("6");
  return (
    <div className={cx("rounded-[18px] p-4", highlight ? "bg-warn-soft" : "bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]")}>
      <div className={cx("font-semibold", highlight ? "text-[17px] text-warn" : "text-[15px] text-ink")}>{title}</div>
      {sub && <div className="mt-0.5 text-[13.5px] text-warn">{sub}</div>}
      <div className={cx("mt-3 grid grid-cols-5 gap-2", compact && "mt-2")}>
        {[1, 2, 3, 4].map((n) => (
          <button key={n} type="button" onClick={() => onPick(n)} className="sp-tap h-[52px] rounded-[14px] bg-paper text-[20px] font-bold text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]">
            {n}
          </button>
        ))}
        <button type="button" onClick={() => setMore(true)} className="sp-tap h-[52px] rounded-[14px] bg-paper text-[18px] font-bold text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]">
          5+
        </button>
      </div>
      {more && (
        <div className="mt-2 flex gap-2">
          <input aria-label="Гүн" inputMode="numeric" value={v} onChange={(e) => setV(e.target.value.replace(/\D/g, "").slice(0, 2))} className="sp-field h-[52px] min-w-0 flex-1 text-center text-[20px] font-bold" />
          <Btn size="lg" onClick={() => Number(v) >= 1 && onPick(Number(v))}>
            Болох
          </Btn>
        </div>
      )}
    </div>
  );
}

function PlaceEdit({ value, known, onPick }: { value: string; known: string[]; onPick: (p: string) => void }) {
  const [v, setV] = useState(value);
  const opts = [...new Set([...known, value, "Агуулах"])];
  return (
    <div className="space-y-3 px-4 pb-6 pt-2">
      <div className="flex flex-wrap gap-2">
        {opts.map((p) => (
          <button key={p} type="button" onClick={() => onPick(p)} className={cx("sp-tap h-[48px] rounded-full px-4 text-[15px] font-semibold", p === value ? "bg-ink text-paper" : "bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]")}>
            {p}
          </button>
        ))}
      </div>
      <p className="text-[13.5px] text-mute">Өмнө тоолсон байршлыг сонговол тэр байршлын зургийн тоо солигдоно.</p>
      <input aria-label="Байршлын нэр" value={v} onChange={(e) => setV(e.target.value.slice(0, 40))} className="sp-field h-[52px] w-full text-[17px]" />
      <Btn size="lg" block disabled={!v.trim()} onClick={() => onPick(v.trim())}>
        Хадгалах
      </Btn>
    </div>
  );
}

function ItemRow({ i, d, row, open, onToggle, onChange, onNew }: { i: number; d: Detection; row: Row; open: boolean; onToggle: () => void; onChange: (p: Partial<Row>) => void; onNew: () => void }) {
  const qty = row.facings * (row.depth ?? 0) * row.rows;
  const step = (k: "facings" | "depth" | "rows", delta: number, min: number) => onChange({ [k]: Math.max(min, (row[k] ?? 0) + delta), edited: true } as Partial<Row>);
  const matched = !!row.productId;
  return (
    <li id={`det-${i}`} className={cx("rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]", !row.include && matched && "opacity-60")}>
      <button type="button" onClick={onToggle} className="sp-tap flex min-h-[64px] w-full items-center gap-3 px-3.5 py-2.5 text-left">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] text-[15px] font-bold text-white" style={{ background: COLORS[i % COLORS.length] }}>
          {i + 1}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[16px] font-semibold text-ink">{matched ? row.name : d.label}</span>
          <span className="block truncate text-[13px] text-mute tnum">
            {matched ? `${row.facings} нүүр × ${row.depth ?? "?"} гүн${row.rows > 1 ? ` × ${row.rows} давхар` : ""}` : `Зурагт: ${d.label}`}
            {d.depthSource === "ai" && !row.edited ? " · AI гүн" : ""}
          </span>
        </span>
        {matched ? (
          <span className="flex shrink-0 flex-col items-end gap-1">
            <span className="text-[20px] font-bold text-ink tnum">{row.depth == null ? "—" : qty}</span>
            {d.status === "matched" && row.productId === d.productId ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-ok-soft px-2 py-0.5 text-[12px] font-semibold text-ok">
                <Icon name="check" size={12} /> Таарсан
              </span>
            ) : (
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent">Сонгосон</span>
            )}
          </span>
        ) : (
          <span className={cx("shrink-0 rounded-full px-2.5 py-1 text-[12.5px] font-semibold", d.status === "ambiguous" ? "bg-warn-soft text-warn" : "bg-[var(--sp-fill)] text-mute")}>
            {d.status === "ambiguous" ? "Аль нь вэ?" : "Танихгүй"}
          </span>
        )}
      </button>

      {!matched && d.status === "ambiguous" && (
        <div className="grid gap-2 px-3.5 pb-3.5">
          {d.candidates.slice(0, 3).map((c) => (
            <button key={c.id} type="button" onClick={() => onChange({ productId: c.id, name: c.name, include: true })} className="sp-tap min-h-[52px] rounded-[14px] bg-accent-soft px-4 text-left text-[16px] font-semibold text-accent">
              {c.name}
            </button>
          ))}
          <button type="button" onClick={() => onChange({ include: false })} className="sp-tap h-[44px] text-[14.5px] font-semibold text-mute">
            Алгасах
          </button>
        </div>
      )}
      {!matched && d.status === "unknown" && (
        <div className="grid grid-cols-2 gap-2 px-3.5 pb-3.5">
          <Btn size="lg" variant="tinted" onClick={onNew}>
            Шинэ бараа
          </Btn>
          <Btn size="lg" variant="gray" onClick={() => onChange({ include: false })}>
            Алгасах
          </Btn>
        </div>
      )}

      {matched && (d.dupSuspect || d.elsewhere.length > 0 || (d.depthEst != null && d.depthSource !== "ai" && row.depth !== d.depthEst)) && (
        <div className="space-y-1.5 px-3.5 pb-3">
          {d.dupSuspect && (
            <div className="flex items-center gap-2 rounded-[12px] bg-warn-soft px-3 py-2 text-[13.5px] text-warn">
              <Icon name="warn" size={16} />
              <span className="flex-1">{d.dupSuspect.place}-д давхар тоологдсон байж магадгүй</span>
              <button type="button" onClick={() => onChange({ include: !row.include })} className="sp-tap h-9 rounded-full bg-paper px-3 font-semibold">
                {row.include ? "Хасах" : "Тоолох"}
              </button>
            </div>
          )}
          {d.elsewhere.length > 0 && <div className="text-[13px] text-mute">Бусад байршил: {d.elsewhere.map((x) => `${x.place} ${x.qty}`).join(" · ")}</div>}
          {d.depthEst != null && d.depthSource !== "ai" && row.depth !== d.depthEst && (
            <button type="button" onClick={() => onChange({ depth: d.depthEst, edited: true })} className="sp-tap h-9 rounded-full bg-accent-soft px-3 text-[13.5px] font-semibold text-accent">
              AI санал: гүн {d.depthEst}?
            </button>
          )}
        </div>
      )}

      {open && matched && (
        <div className="grid grid-cols-3 gap-2 border-t border-[var(--sp-sep)] px-3.5 py-3">
          <Stepper label="Нүүр" value={row.facings} onMinus={() => step("facings", -1, 0)} onPlus={() => step("facings", 1, 0)} />
          <Stepper label="Гүн" value={row.depth ?? 0} onMinus={() => step("depth", -1, 1)} onPlus={() => step("depth", 1, 1)} />
          <Stepper label="Давхар" value={row.rows} onMinus={() => step("rows", -1, 1)} onPlus={() => step("rows", 1, 1)} />
          <label className="col-span-3 flex min-h-[44px] items-center gap-2 text-[14.5px] text-ink">
            <input type="checkbox" checked={row.include} onChange={(e) => onChange({ include: e.target.checked })} className="size-6 accent-[var(--accent)]" />
            Тоололд оруулах
          </label>
        </div>
      )}
    </li>
  );
}

function Stepper({ label, value, onMinus, onPlus }: { label: string; value: number; onMinus: () => void; onPlus: () => void }) {
  return (
    <div>
      <div className="mb-1 text-center text-[12.5px] font-medium text-mute">{label}</div>
      <div className="flex h-[52px] items-stretch overflow-hidden rounded-[14px] bg-[var(--sp-fill)]">
        <button type="button" aria-label={`${label} хасах`} onClick={onMinus} className="sp-tap grid w-[36px] place-items-center text-ink">
          <Icon name="minus" size={18} />
        </button>
        <div className="grid flex-1 place-items-center text-[19px] font-bold text-ink tnum">{value}</div>
        <button type="button" aria-label={`${label} нэмэх`} onClick={onPlus} className="sp-tap grid w-[36px] place-items-center text-ink">
          <Icon name="plus" size={18} />
        </button>
      </div>
    </div>
  );
}
