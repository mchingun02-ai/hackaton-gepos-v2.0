"use client";

/**
 * 3-р дэлгэц «Тоолох»: доод талд 3 том товч — Зураг · Баркод · Хайх. Бараа сонгоход арга + 1–2 тоон талбар.
 * Хараагүй (blind) тооллогод ажилтан системийн үлдэгдлийг харахгүй (тоог «тааруулах»-аас сэргийлнэ).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraScanner } from "@/components/CameraScanner";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Sheet, toast, useConfirm } from "@/components/sp/ui";
import { computeQty, METHOD_LABEL, type Inputs, type Method } from "@/lib/inventory/methods";
import { ApiError, call, sendCount, uuid } from "./api";
import type { Nav } from "./CountApp";
import { prepareShot } from "./image";
import type { Line, Me, SessionFull } from "./types";
import { BottomBar, CamIcon, CameraInput, ErrorNote, fmt, InfoNote, LevelChip, LineChip, NumField, TopBar } from "./ui";

export const OPEN_KEY = "gp-count-open";
type Filter = "todo" | "done" | "all";
const isDone = (l: Line) => l.status === "counted" || l.status === "recounted" || l.status === "skipped";

export function Counting({ sid, me, nav, pending, openProduct }: { sid: string; me: Me; nav: Nav; pending: number; openProduct?: string }) {
  const [data, setData] = useState<SessionFull | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todo");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Line | null>(null);
  const [scan, setScan] = useState(false);
  const [miss, setMiss] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const search = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const j = await call<SessionFull>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}`);
      setData(j);
      setErr(null);
      return j;
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ачаалж чадсангүй");
      return null;
    }
  }, [sid]);
  useEffect(() => {
    void (async () => {
      const j = await load();
      // шинэ бараа бүртгэсний дараа шууд тоолох
      const want = openProduct ?? sessionStorage.getItem(OPEN_KEY);
      sessionStorage.removeItem(OPEN_KEY);
      const l = want && j?.lines.find((x) => x.productId === want);
      if (l) setSel(l);
    })();
  }, [load, openProduct]);

  const lines = useMemo(() => data?.lines ?? [], [data]);
  const shown = useMemo(() => {
    const t = q.trim().toLocaleLowerCase("mn");
    let ls = lines;
    if (t) ls = ls.filter((l) => l.name.toLocaleLowerCase("mn").includes(t) || (l.barcode ?? "").includes(t));
    else if (filter === "todo") ls = ls.filter((l) => !isDone(l));
    else if (filter === "done") ls = ls.filter(isDone);
    // дахин тоолох мөрүүд эхэнд
    return [...ls].sort((a, b) => Number(b.status === "recount") - Number(a.status === "recount"));
  }, [lines, q, filter]);
  const todo = lines.filter((l) => !isDone(l)).length;

  async function onPhoto(f: File) {
    if (data?.session.status !== "counting") return;
    setUploading(true);
    try {
      const shot = await prepareShot(f);
      const fd = new FormData();
      fd.append("image", shot.blob, "shelf.jpg");
      const r = await call<import("./types").PhotoResp>(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/photos`, { method: "POST", body: fd });
      nav.go({ k: "photo", sid, shot: { url: shot.url, w: shot.w, h: shot.h, resp: r } });
    } catch (e) {
      toast(e instanceof ApiError && e.status === 402 ? "AI кредит дууссан. Баркод эсвэл гараар тоолно уу." : e instanceof Error ? e.message : "Зураг илгээж чадсангүй", "danger");
    } finally {
      setUploading(false);
    }
  }

  const onScan = (code: string) => {
    const l = lines.find((x) => x.barcode === code);
    if (l) {
      setScan(false);
      setSel(l);
      return true;
    }
    setScan(false);
    setMiss(code);
    return false;
  };

  if (err && !data)
    return (
      <div>
        <TopBar title="Тооллого" onBack={nav.back} />
        <div className="p-4">
          <ErrorNote>{err}</ErrorNote>
          <Btn size="lg" block className="mt-4" onClick={() => void load()}>
            Дахин оролдох
          </Btn>
        </div>
      </div>
    );
  if (!data) return <div className="grid min-h-dvh place-items-center text-[15px] text-mute">Ачаалж байна…</div>;
  const closed = data.session.status !== "counting";

  return (
    <div className="pb-[120px]">
      <TopBar
        title={data.session.name}
        sub={`${data.progress.done}/${data.progress.total} тоолсон · ${data.progress.pct}%`}
        onBack={nav.back}
        right={
          !closed && (
            <button type="button" onClick={() => nav.go({ k: "submit", sid })} className="sp-tap h-[48px] rounded-full px-4 text-[16px] font-bold text-accent">
              Дуусгах
            </button>
          )
        }
      />
      <div className="h-1.5 bg-[var(--sp-fill)]">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${data.progress.pct}%` }} />
      </div>

      <div className="space-y-3 px-4 pt-3">
        {pending > 0 && <InfoNote tone="warn">{pending} тоо илгээгдээгүй — интернэт сэргэхэд автоматаар илгээнэ.</InfoNote>}
        {closed && <InfoNote tone="warn">{data.session.status === "review" ? "Тооллого илгээгдсэн — менежер хянаж байна." : "Тооллого хаагдсан."}</InfoNote>}
        {data.session.note && data.session.status === "counting" && <InfoNote tone="warn">Менежерийн тэмдэглэл: {data.session.note}</InfoNote>}

        <label className="flex h-[52px] items-center gap-2 rounded-[16px] bg-paper px-3.5 text-mute shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <Icon name="search" size={20} />
          <input
            ref={search}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Нэр эсвэл баркод"
            aria-label="Бараа хайх"
            className="min-w-0 flex-1 bg-transparent text-[17px] text-ink outline-none placeholder:text-mute"
          />
          {q && (
            <button type="button" aria-label="Цэвэрлэх" onClick={() => setQ("")} className="sp-tap grid size-10 place-items-center rounded-full">
              <Icon name="close" size={18} />
            </button>
          )}
        </label>

        {!q && (
          <div className="grid grid-cols-3 gap-2" role="tablist">
            {(
              [
                ["todo", `Тоолоогүй ${todo}`],
                ["done", `Тоолсон ${lines.length - todo}`],
                ["all", "Бүгд"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={filter === id}
                onClick={() => setFilter(id)}
                className={cx("sp-tap h-[44px] rounded-full text-[14px] font-semibold", filter === id ? "bg-ink text-paper" : "bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]")}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {shown.length === 0 ? (
          <div className="rounded-[20px] bg-paper p-6 text-center shadow-[0_0_0_0.5px_var(--sp-sep)]">
            {q ? (
              <>
                <div className="text-[16px] font-semibold text-ink">«{q}» олдсонгүй</div>
                <div className="mt-1 text-[14.5px] text-mute">Энэ бараа бүртгэлгүй бол шинээр бүртгэнэ үү.</div>
                <Btn size="lg" variant="tinted" block className="mt-4" onClick={() => nav.go({ k: "new", sid, barcode: /^\d{8,14}$/.test(q.trim()) ? q.trim() : undefined })}>
                  Шинэ бараа бүртгэх
                </Btn>
              </>
            ) : filter === "todo" ? (
              <>
                <div className="mx-auto grid size-12 place-items-center rounded-full bg-ok-soft text-ok">
                  <Icon name="check" size={26} />
                </div>
                <div className="mt-3 text-[17px] font-semibold text-ink">Бүх барааг тооллоо</div>
                <div className="mt-1 text-[14.5px] text-mute">«Дуусгах» дарж менежерт илгээнэ үү.</div>
              </>
            ) : (
              <div className="text-[15px] text-mute">Одоогоор тоолсон бараа алга. Зураг, баркод эсвэл хайлтаар эхлээрэй.</div>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[20px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
            {shown.map((l) => (
              <li key={l.productId}>
                <button type="button" disabled={closed} onClick={() => setSel(l)} className="sp-tap flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left disabled:opacity-100">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[16px] font-semibold text-ink">{l.name}</div>
                    <div className="truncate text-[13px] text-mute tnum">
                      {l.counted != null ? `${fmt(l.counted)} ${l.unitLabel} тоолсон` : (l.barcode ?? "баркодгүй")}
                      {data.reveal && l.system != null && l.counted != null ? ` · систем ${fmt(l.system)}` : data.reveal && l.expected != null && l.counted == null ? ` · систем ${fmt(l.expected)}` : ""}
                    </div>
                  </div>
                  {data.reveal && l.level && (l.status === "counted" || l.status === "recounted") ? <LevelChip level={l.level} /> : <LineChip status={l.status} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!closed && (
        <BottomBar>
          <div className="grid grid-cols-3 gap-2">
            <label htmlFor="shelf-cam" className={cx("sp-tap flex h-[64px] cursor-pointer flex-col items-center justify-center gap-0.5 rounded-[16px] bg-accent text-white", uploading && "pointer-events-none opacity-60")}>
              <CamIcon size={24} />
              <span className="text-[14px] font-semibold">Зураг</span>
            </label>
            <CameraInput id="shelf-cam" onFile={(f) => void onPhoto(f)} />
            <button type="button" onClick={() => setScan(true)} className="sp-tap flex h-[64px] flex-col items-center justify-center gap-0.5 rounded-[16px] bg-accent-soft text-accent">
              <Icon name="scan" size={24} />
              <span className="text-[14px] font-semibold">Баркод</span>
            </button>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                search.current?.focus();
              }}
              className="sp-tap flex h-[64px] flex-col items-center justify-center gap-0.5 rounded-[16px] bg-accent-soft text-accent"
            >
              <Icon name="search" size={24} />
              <span className="text-[14px] font-semibold">Хайх</span>
            </button>
          </div>
        </BottomBar>
      )}

      {uploading && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/45 px-8" role="status" aria-live="polite">
          <div className="w-full max-w-[320px] rounded-[22px] bg-paper p-6 text-center">
            <div className="mx-auto size-10 animate-spin rounded-full border-[3px] border-accent-soft border-t-accent" />
            <div className="mt-4 text-[17px] font-semibold text-ink">AI тавиурыг тоолж байна…</div>
            <div className="mt-1 text-[14px] text-mute">10–30 секунд болно</div>
          </div>
        </div>
      )}

      {scan && (
        <div className="fixed inset-0 z-50">
          <div className="relative h-full w-full">
            <CameraScanner title="Баркод уншуулах" okText="Олдлоо" missText="Бүртгэлгүй баркод" onScan={onScan} onClose={() => setScan(false)} />
          </div>
        </div>
      )}

      <Sheet open={!!miss} onClose={() => setMiss(null)} title="Бүртгэлгүй баркод">
        <div className="space-y-3 px-4 pb-6 pt-2">
          <p className="text-[15px] text-mute">
            <span className="font-semibold text-ink tnum">{miss}</span> баркодтой бараа энэ тооллогод алга.
          </p>
          <Btn size="xl" block onClick={() => (setMiss(null), nav.go({ k: "new", sid, barcode: miss ?? undefined }))}>
            Шинэ бараа бүртгэх
          </Btn>
          <Btn size="lg" variant="gray" block onClick={() => (setMiss(null), setScan(true))}>
            Дахин уншуулах
          </Btn>
        </div>
      </Sheet>

      {sel && (
        <CountSheet
          key={sel.productId}
          sid={sid}
          line={sel}
          data={data}
          me={me}
          onClose={() => setSel(null)}
          onSaved={async () => {
            setSel(null);
            await load();
          }}
        />
      )}
    </div>
  );
}

/* ───────── бараа тоолох sheet ───────── */

type Vals = Record<"f" | "d" | "r" | "l" | "b" | "pack" | "g" | "uw" | "tare" | "h" | "t" | "s" | "q", string>;
const s = (n: number | null | undefined, d = "") => (n == null ? d : String(n));

function CountSheet({ sid, line, data, onClose, onSaved }: { sid: string; line: Line; data: SessionFull; me: Me; onClose: () => void; onSaved: () => void }) {
  const p = line.profile;
  const [method, setMethod] = useState<Method>(p.method ?? "facings");
  const [v, setV] = useState<Vals>({ f: "", d: s(p.depth, "1"), r: "1", l: "", b: "", pack: s(p.packSize), g: "", uw: s(p.unitWeightG), tare: s(p.tareG, "0"), h: "", t: s(p.unitThicknessMm), s: "1", q: "" });
  const [place, setPlace] = useState<"Тавиур" | "Агуулах" | "">("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const { confirm, node } = useConfirm();
  const set = (k: keyof Vals) => (x: string) => setV((o) => ({ ...o, [k]: x }));
  const num = (x: string) => (x === "" ? undefined : Number(x));
  const counts = data.counts.filter((c) => c.productId === line.productId);

  const inputs: Inputs =
    method === "facings"
      ? { f: num(v.f), d: num(v.d), r: num(v.r), l: num(v.l) }
      : method === "boxes"
        ? { b: num(v.b), l: num(v.l) }
        : method === "weight"
          ? { g: num(v.g) }
          : method === "stack"
            ? { h: num(v.h), s: num(v.s) }
            : { q: num(v.q) };
  const profile = { packSize: num(v.pack) ?? null, unitWeightG: num(v.uw) ?? null, tareG: num(v.tare) ?? null, unitThicknessMm: num(v.t) ?? null };
  let preview: { qty: number; warning?: string } | null = null;
  let previewErr: string | null = null;
  try {
    preview = computeQty(method, inputs, { ...profile, depth: num(v.d) ?? null }, line.unit);
  } catch (e) {
    previewErr = e instanceof Error ? e.message : null;
  }

  async function save(override?: { inputs: Inputs; method: Method }, large = false, clientId = uuid()) {
    setBusy(true);
    setErr(null);
    const m = override?.method ?? method;
    const body = {
      clientId,
      productId: line.productId,
      method: m,
      inputs: override?.inputs ?? inputs,
      source: "manual",
      place: place || undefined,
      profile: m === "boxes" ? { packSize: profile.packSize } : m === "weight" ? { unitWeightG: profile.unitWeightG, tareG: profile.tareG } : m === "stack" ? { unitThicknessMm: profile.unitThicknessMm } : undefined,
      ...(large ? { confirmLarge: true } : {}),
    };
    try {
      const r = await sendCount(sid, body, line.name);
      if (r.queued) toast("Интернэтгүй — тоо хадгалагдсан, дараа илгээнэ", "ink");
      else toast(`${line.name}: ${fmt(r.data.count.qty)} ${line.unitLabel}${r.data.count.warning ? ` · ${r.data.count.warning}` : ""}`, r.data.count.warning ? "danger" : "ok");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.code === "confirm_large")
        confirm({ title: "Тоо зөв үү?", message: e.message, ok: "Тийм, зөв", run: () => void save(override, true, clientId) });
      else setErr(e instanceof Error ? e.message : "Хадгалж чадсангүй");
    } finally {
      setBusy(false);
    }
  }

  async function voidOne(cid: string) {
    try {
      await call(`/api/v1/inventory/sessions/${encodeURIComponent(sid)}/counts/${encodeURIComponent(cid)}`, { method: "DELETE" });
      toast("Тоо хүчингүй боллоо", "ink");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Алдаа");
    }
  }

  const methods: Method[] = ["facings", "boxes", "manual", "weight", "stack"];
  return (
    <Sheet
      open
      onClose={onClose}
      title={line.name}
      full
      footer={
        <div className="space-y-2">
          <div className="flex items-baseline justify-between px-1">
            <span className="text-[15px] text-mute">Нийт</span>
            <span className="text-[28px] font-bold text-ink tnum">
              {preview ? fmt(preview.qty, 3) : "—"} <span className="text-[17px] font-semibold text-mute">{line.unitLabel}</span>
            </span>
          </div>
          <Btn size="xl" block loading={busy} disabled={!preview} onClick={() => void save()}>
            Хадгалах
          </Btn>
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-4 pt-1">
        <div className="text-[13.5px] text-mute tnum">
          {line.barcode ?? "Баркодгүй"} · {line.unitLabel}
          {data.reveal && line.expected != null ? ` · системд ${fmt(line.expected)}` : ""}
        </div>
        {line.status === "recount" && <InfoNote tone="warn">Менежер дахин тоолохыг хүссэн. Анхааралтай тоолно уу.</InfoNote>}

        <div role="radiogroup" aria-label="Тоолох арга" className="grid grid-cols-2 gap-2">
          {methods.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={method === m}
              onClick={() => setMethod(m)}
              className={cx("sp-tap min-h-[52px] rounded-[14px] px-3 text-[15px] font-semibold", method === m ? "bg-accent text-white" : "bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]", m === "stack" && "col-span-2")}
            >
              {METHOD_LABEL[m]}
            </button>
          ))}
        </div>

        {method === "facings" && (
          <div className="space-y-3">
            <NumField name="f" label="Урд эгнээнд хэдэн ширхэг (нүүр)" value={v.f} onChange={set("f")} autoFocus />
            <NumField name="d" label="Ард хэдэн эгнээ (гүн)" hint="санагдана" value={v.d} onChange={set("d")} min={1} />
            <div className="grid grid-cols-2 gap-3">
              <NumField label="Давхар" value={v.r} onChange={set("r")} min={1} />
              <NumField label="Сул" value={v.l} onChange={set("l")} decimal />
            </div>
          </div>
        )}
        {method === "boxes" && (
          <div className="space-y-3">
            <NumField name="b" label="Хайрцаг" value={v.b} onChange={set("b")} autoFocus />
            <NumField name="pack" label="Нэг хайрцагт хэдэн ширхэг" hint="санагдана" value={v.pack} onChange={set("pack")} min={1} />
            <NumField label="Сул ширхэг" value={v.l} onChange={set("l")} decimal />
          </div>
        )}
        {method === "manual" && <NumField name="q" label={`Тоо (${line.unitLabel})`} value={v.q} onChange={set("q")} decimal autoFocus />}
        {method === "weight" && (
          <div className="space-y-3">
            <NumField name="g" label="Нийт жин (грамм)" value={v.g} onChange={set("g")} step={10} decimal autoFocus />
            {line.unit !== "kg" && line.unit !== "l" && <NumField label="Нэг ширхэгийн жин (г)" hint="санагдана" value={v.uw} onChange={set("uw")} decimal />}
            <NumField label="Савны жин (г)" value={v.tare} onChange={set("tare")} step={10} decimal />
          </div>
        )}
        {method === "stack" && (
          <div className="space-y-3">
            <NumField name="h" label="Өрөгийн өндөр (мм)" value={v.h} onChange={set("h")} step={10} decimal autoFocus />
            <NumField label="Нэг ширхэгийн зузаан (мм)" hint="санагдана" value={v.t} onChange={set("t")} decimal />
            <NumField label="Хэдэн багана" value={v.s} onChange={set("s")} min={1} />
          </div>
        )}
        {previewErr && (v.f || v.b || v.g || v.h || v.q) && <div className="text-[14px] text-warn">{previewErr}</div>}
        {preview?.warning && <InfoNote tone="warn">{preview.warning}</InfoNote>}

        <div className="flex flex-wrap gap-2">
          {(["Тавиур", "Агуулах"] as const).map((x) => (
            <button key={x} type="button" onClick={() => setPlace(place === x ? "" : x)} className={cx("sp-tap h-[44px] rounded-full px-4 text-[14.5px] font-semibold", place === x ? "bg-ink text-paper" : "bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]")}>
              {x}
            </button>
          ))}
          <button type="button" disabled={busy} onClick={() => void save({ method: "manual", inputs: { q: 0 } })} className="sp-tap h-[44px] rounded-full bg-paper px-4 text-[14.5px] font-semibold text-danger shadow-[0_0_0_0.5px_var(--sp-sep)]">
            Байхгүй (0)
          </button>
        </div>

        {counts.length > 0 && (
          <div>
            <div className="mb-1.5 text-[14px] font-semibold text-mute">Бүртгэсэн тоо (нэмэгдэнэ)</div>
            <ul className="divide-y divide-[var(--sp-sep)] overflow-hidden rounded-[16px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)]">
              {counts.map((c) => (
                <li key={c.id} className="flex min-h-[56px] items-center gap-2 px-3.5">
                  <div className="min-w-0 flex-1">
                    <div className="text-[15.5px] font-semibold text-ink tnum">
                      {fmt(c.qty)} {line.unitLabel}
                    </div>
                    <div className="truncate text-[12.5px] text-mute">
                      {c.methodLabel}
                      {c.place ? ` · ${c.place}` : ""} · {c.by}
                    </div>
                  </div>
                  <button type="button" onClick={() => void voidOne(c.id)} className="sp-tap h-[44px] rounded-full px-3 text-[14px] font-semibold text-danger">
                    Хүчингүй
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {err && <ErrorNote>{err}</ErrorNote>}
      </div>
      {node}
    </Sheet>
  );
}
