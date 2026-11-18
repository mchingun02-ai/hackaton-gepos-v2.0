"use client";

/*
 * AI туслах — хоёр загвар:
 *   Qwen — Gerege-ийн AI gateway, тохиргоогүй шууд ажиллана (src/lib/ai/qwen.ts, models.ts):
 *     загвар сонгоно (хурдан / ухаалаг / зураг-видео / OCR / дуу / код), зураг, видео, дуу, PDF, CSV хавсаргана,
 *     дуугаар хариулна (omni), «Видео» горимд Wan-аар текст/зургаас видео хийнэ (src/lib/ai/video.ts);
 *   Gemini — мерчант Gmail-ээрээ нэвтэрч, өөрийн Google Cloud project-ийн Gemini-тай чатлана.
 * Бизнесийн товч мэдээллийг (борлуулалт, нөөц, харилцагч) асуулт бүрт дагуулж явуулна.
 * Токен зөвхөн серверт (src/lib/ai/server.ts).
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Notice, Segmented, Spinner, toast, useConfirm } from "@/components/sp/ui";
import {
  type Aspect,
  CHAT_MODELS,
  DEFAULT_CHAT,
  DEFAULT_VIDEO,
  fitVideo,
  MODE_LABEL,
  modeOf,
  type Res,
  resOf,
  VIDEO_MODELS,
  videoCost,
  videoModel,
  type VideoOpts,
  VOICES,
  wantsVideo,
} from "@/lib/ai/models";
import { customerStats, lowStock, money, salesTotals, staffName, startOfDay } from "@/lib/sp/logic";
import type { SpState } from "@/lib/sp/types";
import { useFbApi } from "./Chat";
import { Card, Dialog, Page, usePortal } from "./kit";

type Provider = "qwen" | "gemini";
type AiFile = { id: string; name: string; mime: string; size: number; kind: "image" | "doc" | "video" | "audio" };
type Task = { id: string; model: string; mode: string; res: string; duration: number; status: "queued" | "running" | "done" | "failed"; progress?: string; error?: string; at: number };
type Meta = { model?: string; task?: Task };
type Status = { demo: boolean; model: string; qwen?: { ready: boolean; model: string }; account: { email: string; project?: string; demo: boolean; connectedAt: number } | null };
/** local — илгээж байх үеийн файл (blob URL-аар харуулна) */
type Msg = { id: string; role: "user" | "model"; text: string; staff?: string; at: number; files?: AiFile[]; meta?: Meta; local?: { name: string; url?: string; kind: AiFile["kind"] }[] };
const PROVIDER_KEY = "sp-ai-provider";
type Project = { id: string; name: string };

/** Gemini-д дагуулах бизнесийн товч мэдээлэл (хувийн мэдээлэл — утас, нэргүй) */
function businessContext(s: SpState) {
  const now = new Date();
  const day = 86_400_000;
  const today = salesTotals(s, startOfDay(now), now);
  const week = salesTotals(s, new Date(now.getTime() - 7 * day), now);
  const month = salesTotals(s, new Date(now.getTime() - 30 * day), now);
  const qty = new Map<string, { qty: number; sum: number }>();
  for (const sale of month.list)
    if (!sale.refund)
      for (const l of sale.lines) {
        const x = qty.get(l.name) ?? { qty: 0, sum: 0 };
        x.qty += l.qty;
        x.sum += l.free ? 0 : l.qty * l.price;
        qty.set(l.name, x);
      }
  const top = [...qty.entries()].sort((a, b) => b[1].sum - a[1].sum).slice(0, 10);
  const low = lowStock(s);
  const cust = customerStats(s);
  const active = s.campaigns.filter((c) => c.active).map((c) => c.name);
  const cat = new Map(s.categories.map((c) => [c.id, c.name]));
  return [
    `Бизнес: ${s.merchant.name} (${s.merchant.kind === "org" ? "байгууллага" : "хувь хүн"})`,
    `Өнөөдөр: ${today.count} борлуулалт, ${money(today.total)}, дундаж чек ${money(today.avg)}`,
    `Сүүлийн 7 хоног: ${week.count} борлуулалт, ${money(week.total)}`,
    `Сүүлийн 30 хоног: ${month.count} борлуулалт, ${money(month.total)}, буцаалт ${month.refunds}`,
    `Сүүлийн 30 хоногийн шилдэг бараа: ${top.map(([n, v]) => `${n} — ${v.qty} ш, ${money(v.sum)}`).join("; ") || "мэдээлэлгүй"}`,
    `Нөөц бага (${low.length}): ${low.map((p) => `${p.name} (${p.stock} үлдсэн, доод ${p.minStock})`).join("; ") || "байхгүй"}`,
    `Барааны тоо: ${s.products.filter((p) => p.active).length}. Ангилал: ${[...cat.values()].join(", ")}`,
    `Бараа, үнэ: ${s.products
      .filter((p) => p.active)
      .slice(0, 60)
      .map((p) => `${p.name} ${money(p.price)}${p.cost ? ` (өртөг ${money(p.cost)})` : ""}, үлдэгдэл ${p.stock}`)
      .join("; ")}`,
    `Харилцагч: бүртгэлтэй ${s.customers.filter((c) => !c.erased).length}, худалдан авалт хийсэн ${cust.size}`,
    `Идэвхтэй урамшуулал: ${active.join(", ") || "байхгүй"}`,
    `Хүргэлт: ${s.delivery.enabled ? "идэвхтэй" : "унтраалттай"}, нийт захиалга ${s.orders.length}`,
  ].join("\n");
}

const SUGGEST = ["Өнөөдрийн борлуулалт ямар байна?", "Аль барааг нөхөж захиалах вэ?", "Энэ 7 хоногийн урамшууллын Facebook пост бичээд өг", "Харилцагчдад илгээх SMS санаа (70 тэмдэгт)"];

/** localStorage-д хадгалагддаг сонголт */
function useSaved<T>(key: string, init: T) {
  const [v, setV] = useState<T>(() => {
    try {
      const x = window.localStorage.getItem(key);
      return x ? (JSON.parse(x) as T) : init;
    } catch {
      return init;
    }
  });
  const set = (x: T) => {
    setV(x);
    window.localStorage.setItem(key, JSON.stringify(x));
  };
  return [v, set] as const;
}

/** Дурын аудиог (m4a, webm, ogg, бичлэг…) 16kHz mono WAV болгоно — omni WAV/MP3 л авна */
async function toWav(blob: Blob, name: string): Promise<File> {
  const ctx = new AudioContext();
  const decoded = await ctx.decodeAudioData(await blob.arrayBuffer()).finally(() => void ctx.close());
  const rate = 16_000;
  const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
  const src = off.createBufferSource();
  src.buffer = decoded;
  src.connect(off.destination);
  src.start();
  const pcm = (await off.startRendering()).getChannelData(0);
  const buf = new ArrayBuffer(44 + pcm.length * 2);
  const v = new DataView(buf);
  const w = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  v.setUint32(4, 36 + pcm.length * 2, true);
  w(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  w(36, "data");
  v.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) {
    const x = Math.max(-1, Math.min(1, pcm[i]));
    v.setInt16(44 + i * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
  }
  return new File([buf], `${name.replace(/\.[^.]+$/, "")}.wav`, { type: "audio/wav" });
}

const usd = (n: number) => `≈ $${n < 1 ? n.toFixed(2) : n.toFixed(1)}`;

export default function Assistant() {
  const api = useFbApi();
  const { s, canManage } = usePortal();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [aiErr, setAiErr] = useState<string | null>(() => new URLSearchParams(window.location.search).get("aierror"));
  const [pick, setPick] = useState(false);
  // Gmail зөвшөөрсний дараа Gemini-г автоматаар тохируулна
  const [setup, setSetup] = useState<"idle" | "busy" | "failed">("idle");
  const [setupErr, setSetupErr] = useState<string | null>(null);
  const { confirm, node } = useConfirm();
  const [provider, setProviderState] = useState<Provider>(() => {
    // Google-ээс буцаж ирсэн бол Gemini-г харуулна
    const q = new URLSearchParams(window.location.search);
    return q.get("aiok") || q.get("aierror") || window.localStorage.getItem(PROVIDER_KEY) === "gemini" ? "gemini" : "qwen";
  });
  const setProvider = (p: Provider) => {
    setProviderState(p);
    window.localStorage.setItem(PROVIDER_KEY, p);
  };

  const load = useCallback(
    () =>
      api<Status>("/api/ai/status")
        .then((x) => {
          setSt(x);
          setErr(null);
        })
        .catch((e: Error) => setErr(e.message)),
    [api],
  );
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get("aiok")) toast("Google хаяг холбогдлоо", "ok");
    if (q.get("aiok") || q.get("aierror")) window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    load();
  }, [load]);

  const connect = () => {
    setAiErr(null);
    // API маршрут руу бүтэн шилжилт (Google руу redirect хийнэ)
    window.location.assign(new URL("/api/ai/connect", window.location.href));
  };
  const disconnect = () =>
    confirm({
      title: "Google хаягийг салгах уу?",
      message: "AI туслахын эрх Google-ээс цуцлагдаж, чатын түүх устна.",
      ok: "Салгах",
      destructive: true,
      run: () =>
        api("/api/ai/status", { method: "DELETE" })
          .then(() => {
            toast("Google хаяг салгагдлаа", "ok");
            load();
          })
          .catch((e: Error) => toast(e.message, "danger")),
    });

  const acc = st?.account;
  const needSetup = provider === "gemini" && !!acc && !acc.project;
  // Нэг удаа л ажиллана (setup төлөв өөрчлөгдөхөд effect дахин ажиллаж хариуг үл тоохгүй байх)
  const running = useRef(false);
  const runSetup = useCallback(() => {
    if (running.current) return;
    running.current = true;
    setSetup("busy");
    api<{ project: string }>("/api/ai/projects", { method: "POST", body: JSON.stringify({ auto: true }) })
      // Шинэ төлөв (project-той) ирсний дараа л «idle» болгоно — эс бөгөөс дахин ажиллана
      .then(() => load())
      .then(() => setSetup("idle"))
      .catch((e: Error) => {
        setSetupErr(e.message);
        setSetup("failed");
      })
      .finally(() => {
        running.current = false;
      });
  }, [api, load]);
  useEffect(() => {
    if (needSetup && setup === "idle") queueMicrotask(runSetup);
  }, [needSetup, setup, runSetup]);

  return (
    <Page
      title="AI туслах"
      sub={
        provider === "qwen"
          ? "Qwen · чат, зураг, видео, дуу · видео хийнэ"
          : acc
            ? `${acc.email}${acc.project ? ` · ${acc.project}` : ""} · Gemini`
            : "Gemini-тай бизнесийнхээ талаар ярилцах"
      }
      actions={
        <>
          <Segmented<Provider>
            options={[
              { id: "qwen", label: "Qwen" },
              { id: "gemini", label: "Gemini" },
            ]}
            value={provider}
            onChange={setProvider}
            className="w-[168px]"
          />
          {provider === "gemini" && acc && canManage && (
          <>
            {acc.project && (
              <Btn size="md" variant="gray" icon="gear" onClick={() => setPick(true)}>
                <span className="hidden sm:inline">Project</span>
              </Btn>
            )}
            <Btn size="md" variant="gray" icon="link" onClick={disconnect}>
              <span className="hidden sm:inline">Салгах</span>
            </Btn>
          </>
          )}
        </>
      }
    >
      {err ? (
        <Notice tone="danger">{err}</Notice>
      ) : !st ? (
        <div className="grid h-[50dvh] place-items-center text-mute">
          <Spinner size={24} />
        </div>
      ) : provider === "qwen" ? (
        st.qwen?.ready ? (
          <Conversation key="qwen" provider="qwen" context={() => businessContext(s)} />
        ) : (
          <div className="mx-auto max-w-[520px] pt-6">
            <Notice tone="warn" icon="warn">
              Qwen тохируулаагүй байна. Gerege-ийн админд хэлнэ үү.
            </Notice>
          </div>
        )
      ) : acc?.project ? (
        <>
          {acc.demo && (
            <div className="mb-4">
              <Notice tone="accent" icon="info">
                Туршилтын горим — жинхэнэ Gemini холбогдоогүй, жишээ хариу өгнө.
              </Notice>
            </div>
          )}
          <Conversation key="gemini" provider="gemini" context={() => businessContext(s)} />
        </>
      ) : acc ? (
        setup === "failed" ? (
          <div className="mx-auto max-w-[520px] space-y-4 pt-6">
            <Notice tone="danger" icon="warn">
              {setupErr}
            </Notice>
            <div className="flex flex-wrap gap-2">
              <Btn size="md" icon="undo" onClick={() => setSetup("idle")}>
                Дахин оролдох
              </Btn>
              <Btn size="md" variant="gray" onClick={() => setPick(true)}>
                Project гараар сонгох
              </Btn>
            </div>
          </div>
        ) : (
          <div className="grid h-[40dvh] place-items-center text-center text-mute">
            <div>
              <Spinner size={24} />
              <p className="mt-3 text-[14px]">Gemini-г тохируулж байна… (1 минут хүртэл)</p>
            </div>
          </div>
        )
      ) : (
        <>
          {aiErr && (
            <div className="mx-auto mb-2 max-w-[560px] pt-6">
              <Notice tone="danger" icon="warn">
                {aiErr}
              </Notice>
            </div>
          )}
          <ConnectCard demo={st.demo} canManage={canManage} onConnect={connect} />
        </>
      )}
      {acc && provider === "gemini" && (
        <ProjectDialog
          open={pick}
          current={acc.project}
          onClose={() => (acc.project ? setPick(false) : disconnect())}
          onDone={() => {
            setPick(false);
            load();
          }}
        />
      )}
      {node}
    </Page>
  );
}

/* ───────── холбоогүй үед ───────── */

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function ConnectCard({ demo, canManage, onConnect }: { demo: boolean; canManage: boolean; onConnect: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] pt-6">
      <Card>
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <span className="grid size-16 place-items-center rounded-[20px] bg-accent-soft text-accent">
            <Icon name="sparkle" size={32} />
          </span>
          <h2 className="mt-4 text-[20px] font-bold tracking-[-0.01em] text-ink">Gmail-ээрээ AI туслахаа асаана уу</h2>
          <p className="mt-2 max-w-[420px] text-[15px] leading-snug text-mute">Google-ийн Gemini таны борлуулалт, нөөц, харилцагчийн мэдээлэл дээр тулгуурлаж зөвлөгөө өгч, пост, SMS бичиж өгнө.</p>
          <ol className="mt-5 w-full max-w-[400px] space-y-2.5 text-left text-[14.5px] text-ink-2">
            {["Доорх товчийг дарж Gmail-ээрээ нэвтэрнэ", "Зөвшөөрөх цонхонд бүх эрхийг чагтлаад «Continue» дарна", "Порталд буцаж ирэхэд Gemini автоматаар тохирч, шууд чатлана"].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--sp-fill)] text-[13px] font-semibold text-ink tnum">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          {canManage ? (
            <button type="button" onClick={onConnect} className="sp-tap mt-6 flex h-12 items-center gap-3 rounded-[12px] border border-[#dadce0] bg-white px-6 text-[16px] font-medium text-[#1f1f1f]">
              <GoogleLogo size={20} /> Google-ээр холбох
            </button>
          ) : (
            <p className="mt-6 text-[14px] text-mute">AI туслах холбох эрх зөвхөн мерчант эсвэл менежерт байна.</p>
          )}
          <p className="mt-4 max-w-[420px] text-[12.5px] leading-snug text-mute">
            Gemini-ийн хэрэглээ таны Google Cloud project дээр бодогдоно (үнэгүй хязгаартай). Бид таны Gmail захидлыг уншихгүй.
            {demo && " Одоо туршилтын горимд — жинхэнэ Google руу шилжихгүй."}
          </p>
        </div>
      </Card>
    </div>
  );
}

/* ───────── project сонгох ───────── */

function ProjectDialog({ open, current, onClose, onDone }: { open: boolean; current?: string; onClose: () => void; onDone: () => void }) {
  const api = useFbApi();
  const [list, setList] = useState<Project[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(current ?? null);
  const [busy, setBusy] = useState<"use" | "create" | null>(null);

  useEffect(() => {
    if (!open) return;
    api<{ projects: Project[] }>("/api/ai/projects")
      .then((r) => {
        setList(r.projects);
        setErr(null);
        // AI Studio-ийн «Default Gemini Project» (gen-lang-client-…) байвал түүнийг санал болгоно — Gemini аль хэдийн тохирсон
        setSel((x) => x ?? r.projects.find((p) => p.id.startsWith("gen-lang-client-"))?.id ?? (r.projects.length === 1 ? r.projects[0].id : null));
      })
      .catch((e: Error) => setErr(e.message));
  }, [api, open]);

  const go = (body: object, kind: "use" | "create") => {
    setBusy(kind);
    api<{ project: string }>("/api/ai/projects", { method: "POST", body: JSON.stringify(body) })
      .then((r) => {
        toast(`Gemini асаалаа · ${r.project}`, "ok");
        onDone();
      })
      .catch((e: Error) => toast(e.message, "danger"))
      .finally(() => setBusy(null));
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Google Cloud project"
      width={480}
      footer={
        <>
          <Btn size="md" variant="gray" icon="plus" loading={busy === "create"} disabled={!!busy} onClick={() => go({ create: true }, "create")}>
            Шинээр үүсгэх
          </Btn>
          <Btn size="md" loading={busy === "use"} disabled={!sel || !!busy} onClick={() => go({ projectId: sel }, "use")}>
            Ашиглах
          </Btn>
        </>
      }
    >
      <p className="mb-3 text-[14px] leading-snug text-mute">Gemini аль project дээр ажиллах вэ? Бид тэнд Gemini API-г автоматаар асаана. Мэдэхгүй бол «Шинээр үүсгэх» дарна уу.</p>
      {busy && (
        <div className="mb-3">
          <Notice tone="gray" icon="clock">
            Google дээр тохируулж байна… 1 минут хүртэл үргэлжилж магадгүй.
          </Notice>
        </div>
      )}
      {err ? (
        <Notice tone="danger">{err}</Notice>
      ) : !list ? (
        <div className="grid h-32 place-items-center text-mute">
          <Spinner />
        </div>
      ) : !list.length ? (
        <Notice tone="accent" icon="info">
          Таны Google хаягт project алга. «Шинээр үүсгэх» дарвал «Gerege AI туслах» нэртэй project үүснэ.
        </Notice>
      ) : (
        <div className="sp-scroll max-h-[320px] overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]" role="radiogroup" aria-label="Project">
          {list.map((p) => (
            <button key={p.id} type="button" role="radio" aria-checked={sel === p.id} onClick={() => setSel(p.id)} className="sp-row flex min-h-[56px] w-full items-center gap-3 px-4 py-2 text-left">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                <span className="block truncate text-[12.5px] text-mute">{p.id}</span>
              </span>
              <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", sel === p.id ? "border-accent bg-accent text-white" : "border-[var(--sp-sep)]")}>
                {sel === p.id && <Icon name="check" size={14} stroke={3} />}
              </span>
            </button>
          ))}
        </div>
      )}
    </Dialog>
  );
}

/* ───────── «бодож байна» ───────── */

const THINK = ["Таны асуултыг уншиж байна", "Борлуулалт, нөөцийг харж байна", "Хариугаа бодож байна", "Хариу бичиж байна"];

/** Gemini-ийн эхний үг ирэх хүртэл: эргэдэг цагираг доторх од + гялалзах текст + үе шат солигдоно */
function Thinking() {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((x) => Math.min(x + 1, THINK.length - 1)), 2200);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="flex items-center gap-3 py-0.5" role="status" aria-live="polite">
      <span className="relative grid size-9 shrink-0 place-items-center">
        <span className="sp-ai-ring absolute inset-0 rounded-full" />
        <span className="absolute inset-[2px] rounded-full bg-paper" />
        <span className="sp-ai-star relative text-accent">
          <Icon name="sparkle" size={18} stroke={2} />
        </span>
      </span>
      <span className="min-w-0">
        <span className="sp-ai-shimmer block text-[14.5px] font-semibold">AI туслах бодож байна</span>
        <span key={i} className="sp-ai-in mt-0.5 flex items-center gap-1.5 text-[12.5px] text-mute">
          {THINK[i]}
          <span className="inline-flex gap-[3px]" aria-hidden="true">
            {[0, 1, 2].map((d) => (
              <span key={d} className="sp-ai-dot size-[4px] rounded-full bg-accent" style={{ animationDelay: `${d * 0.15}s` }} />
            ))}
          </span>
        </span>
      </span>
    </span>
  );
}

/** Видео хийж байх үеийн карт */
function VideoProgress({ task }: { task: Task }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const sec = Math.max(0, Math.round((now - task.at) / 1000));
  const pct = Number.parseInt(task.progress ?? "", 10);
  return (
    <span className="flex items-center gap-3 py-0.5" role="status" aria-live="polite">
      <span className="relative grid size-9 shrink-0 place-items-center">
        <span className="sp-ai-ring absolute inset-0 rounded-full" />
        <span className="absolute inset-[2px] rounded-full bg-paper" />
        <span className="sp-ai-star relative text-accent">
          <Icon name="video" size={18} stroke={2} />
        </span>
      </span>
      <span className="min-w-0">
        <span className="sp-ai-shimmer block text-[14.5px] font-semibold">Видео хийж байна{Number.isFinite(pct) ? ` · ${pct}%` : "…"}</span>
        <span className="mt-0.5 block text-[12.5px] text-mute tnum">
          {task.model} · {task.res} · {task.duration} сек · {Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")} (ихэвчлэн 1–5 мин)
        </span>
      </span>
    </span>
  );
}

/* ───────── чат ───────── */

const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm,.mp4,.mov,.webm,audio/*,.mp3,.wav,.m4a,.ogg,.aac,application/pdf,.pdf,.csv,.tsv,.txt,.md,.json,.xml,text/*";
const ACCEPT_VIDEO = "image/jpeg,image/png,image/webp";
const MAX_FILES = 5;
const MAX_FILE = 10 * 1024 * 1024;
const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const isImage = (f: File) => /^image\/(jpeg|png|webp|gif)$/.test(f.type);
const isVideo = (f: File) => /^video\/(mp4|quicktime|webm)$/.test(f.type) || /\.(mp4|mov|webm)$/i.test(f.name);
const isAudio = (f: File) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|aac)$/i.test(f.name);
const kindOf = (f: File): AiFile["kind"] => (isImage(f) ? "image" : isVideo(f) ? "video" : isAudio(f) ? "audio" : "doc");
const okType = (f: File) => isImage(f) || isVideo(f) || isAudio(f) || f.type === "application/pdf" || f.type.startsWith("text/") || f.type === "application/json" || /\.(pdf|csv|tsv|txt|md|json|xml|log)$/i.test(f.name);
const sel = "h-9 max-w-full rounded-[10px] bg-[var(--sp-fill)] px-2.5 text-[13px] font-medium text-ink outline-none focus:shadow-[inset_0_0_0_1.5px_var(--sp-accent)]";

type Pending = { key: string; file: File; url?: string; kind: AiFile["kind"] };

/** AI-ийн **тод** тэмдэглэгээг тод бичиг болгоно (бусад markdown-ийг хэвээр) */
const rich = (t: string) => t.split(/\*\*([^*\n]+?)\*\*/g).map((x, i) => (i % 2 ? <strong key={i}>{x}</strong> : x));

function Conversation({ provider, context }: { provider: Provider; context: () => string }) {
  const api = useFbApi();
  const { actor, staff } = usePortal();
  const [msgs, setMsgs] = useState<Msg[] | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const me = staff ? staffName(staff) : actor.name;
  const { confirm, node } = useConfirm();
  const files = provider === "qwen";
  const label = provider === "qwen" ? "Qwen" : "Gemini";
  const q = provider === "qwen" ? "?p=qwen" : "";
  // Qwen-ийн сонголтууд
  const [mode, setMode] = useState<"chat" | "video">("chat");
  const [chatModel, setChatModel] = useSaved("sp-ai-model", DEFAULT_CHAT);
  const [voice, setVoice] = useSaved("sp-ai-voice", "");
  const [vsaved, setVopt] = useSaved<VideoOpts>("sp-ai-video", { model: DEFAULT_VIDEO.t2v, res: "720P", aspect: "9:16", duration: 5, audio: false });
  const vimages = pending.filter((p) => p.kind === "image").length;
  const vmode = modeOf(vimages);
  const vmodels = VIDEO_MODELS.filter((x) => x.modes.includes(vmode));
  const vopt = fitVideo({ ...vsaved, model: vmodels.some((x) => x.id === vsaved.model) ? vsaved.model : DEFAULT_VIDEO[vmode] });
  const vm = videoModel(vopt.model)!;
  const [rec, setRec] = useState<MediaRecorder | null>(null);

  useEffect(() => {
    api<{ messages: Msg[] }>(`/api/ai/chat${q}`)
      .then((r) => setMsgs(r.messages))
      .catch((e: Error) => toast(e.message, "danger"));
    return () => abort.current?.abort();
  }, [api, q]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs]);

  const add = async (list: FileList | File[] | null) => {
    if (!files || !list) return;
    const next: Pending[] = [];
    for (let f of Array.from(list)) {
      if (!okType(f)) {
        toast(`«${f.name}» — зураг, видео, дуу, PDF, CSV, текст файл л хавсаргана`, "danger");
        continue;
      }
      if (mode === "video" && !/^image\/(jpeg|png|webp)$/.test(f.type)) {
        toast("Видео горимд зөвхөн зураг (JPG, PNG, WEBP) хавсаргана — 1 зураг: хөдөлгөнө, 2 зураг: эхний ба сүүлийн кадр", "danger");
        continue;
      }
      // m4a, ogg, webm-ийг WAV болгоно
      if (isAudio(f) && !/\.(wav|mp3)$/i.test(f.name) && !/^audio\/(wav|x-wav|mpeg|mp3)$/.test(f.type)) {
        try {
          f = await toWav(f, f.name);
        } catch {
          toast(`«${f.name}» дууг уншиж чадсангүй`, "danger");
          continue;
        }
      }
      if (f.size > MAX_FILE) {
        toast(isVideo(f) ? `«${f.name}» 10 MB-аас том — богино (≤30 сек), 720p бичлэг хавсаргана уу` : `«${f.name}» 10 MB-аас том байна`, "danger");
        continue;
      }
      const kind = kindOf(f);
      next.push({ key: `${f.name}-${f.size}-${f.lastModified}-${Math.random()}`, file: f, kind, url: kind === "image" || kind === "video" ? URL.createObjectURL(f) : undefined });
    }
    setPending((x) => {
      const all = [...x, ...next];
      if (all.length > MAX_FILES) toast(`Нэг дор ${MAX_FILES} хүртэл файл`, "danger");
      for (const d of all.slice(MAX_FILES)) if (d.url) URL.revokeObjectURL(d.url);
      return all.slice(0, MAX_FILES);
    });
  };
  const remove = (key: string) =>
    setPending((x) => {
      const d = x.find((y) => y.key === key);
      if (d?.url) URL.revokeObjectURL(d.url);
      return x.filter((y) => y.key !== key);
    });

  /** Микрофоноор бичнэ — дахин дарахад зогсоож, WAV болгон хавсаргана */
  const record = async () => {
    if (rec) {
      rec.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const r = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => chunks.push(e.data);
      r.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRec(null);
        try {
          await add([await toWav(new Blob(chunks, { type: r.mimeType }), `дуу-${new Date().toTimeString().slice(0, 5).replace(":", "")}`)]);
        } catch {
          toast("Бичлэгийг уншиж чадсангүй", "danger");
        }
      };
      r.start();
      setRec(r);
    } catch {
      toast("Микрофон ашиглах зөвшөөрөл өгнө үү", "danger");
    }
  };

  const reload = useCallback(() => api<{ messages: Msg[] }>(`/api/ai/chat${q}`).then((r) => setMsgs(r.messages)), [api, q]);

  /** Wan-аар видео хийлгэнэ (0 зураг — текстээс, 1 — зургаас, 2 — эхний/сүүлийн кадраас) */
  const sendVideo = async (body: string, att: Pending[]) => {
    const imgs = att.filter((p) => p.kind === "image" && /^image\/(jpeg|png|webp)$/.test(p.file.type));
    if (imgs.length !== att.length || imgs.length > 2) {
      toast("Видео хийхэд 2 хүртэл зураг (JPG, PNG, WEBP) хавсаргана", "danger");
      return;
    }
    const o = fitVideo({ ...vopt, model: videoModel(vopt.model)?.modes.includes(modeOf(imgs.length)) ? vopt.model : DEFAULT_VIDEO[modeOf(imgs.length)] });
    setBusy(true);
    setText("");
    setPending([]);
    const now = Date.now();
    const local = imgs.map((p) => ({ name: p.file.name, url: p.url, kind: "image" as const }));
    setMsgs((x) => [
      ...(x ?? []),
      { id: `u${now}`, role: "user", text: body, staff: me, at: now, local: local.length ? local : undefined },
      { id: `v${now}`, role: "model", text: "", at: now, meta: { model: o.model, task: { id: "", model: o.model, mode: modeOf(imgs.length), res: o.res, duration: o.duration, status: "queued", at: now } } },
    ]);
    try {
      const fd = new FormData();
      fd.set("text", body);
      fd.set("staff", me);
      fd.set("model", o.model);
      fd.set("res", o.res);
      fd.set("aspect", o.aspect);
      fd.set("duration", String(o.duration));
      fd.set("audio", o.audio ? "1" : "");
      for (const p of imgs) fd.append("files", p.file, p.file.name);
      const r = await fetch("/api/ai/video", { method: "POST", body: fd });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        toast(e.error || `Алдаа (${r.status})`, "danger");
      }
    } catch (e) {
      toast((e as Error).message, "danger");
    } finally {
      await reload().catch(() => {});
      setBusy(false);
    }
  };

  // Хийгдэж буй видеог 5 сек тутам шалгана
  useEffect(() => {
    const live = msgs?.filter((x) => x.meta?.task && (x.meta.task.status === "queued" || x.meta.task.status === "running") && !x.id.startsWith("v")) ?? [];
    if (!live.length) return;
    const t = setTimeout(() => {
      for (const x of live)
        api<{ message: Msg }>(`/api/ai/video?id=${encodeURIComponent(x.id)}`)
          .then((r) => setMsgs((all) => all?.map((y) => (y.id === x.id ? r.message : y)) ?? all))
          .catch(() => {});
    }, 5000);
    return () => clearTimeout(t);
  }, [msgs, api]);

  const send = async (preset?: string) => {
    const body = (preset ?? text).trim();
    const att = preset ? [] : pending;
    if ((!body && !att.length) || busy) return;
    if (files && (mode === "video" || (wantsVideo(body, att.some((p) => p.kind === "image")) && att.every((p) => p.kind === "image") && att.length <= 2))) {
      if (mode !== "video") toast(`Видео хийж байна · ${usd(videoCost(fitVideo({ ...vopt, model: DEFAULT_VIDEO[modeOf(att.length)] })))}`, "ok");
      return sendVideo(body, att);
    }
    setBusy(true);
    setText("");
    setPending([]);
    const now = Date.now();
    const reply: Msg = { id: `r${now}`, role: "model", text: "", at: now };
    const local = att.map((p) => ({ name: p.file.name, url: p.url, kind: p.kind }));
    setMsgs((x) => [...(x ?? []), { id: `u${now}`, role: "user", text: body, staff: me, at: now, local: local.length ? local : undefined }, reply]);
    abort.current = new AbortController();
    try {
      let init: RequestInit;
      if (files) {
        const fd = new FormData();
        fd.set("text", body);
        fd.set("context", context());
        fd.set("staff", me);
        fd.set("model", chatModel);
        fd.set("voice", voice);
        for (const p of att) fd.append("files", p.file, p.file.name);
        init = { method: "POST", body: fd };
      } else init = { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: body, context: context(), staff: me }) };
      const r = await fetch(`/api/ai/chat${q}`, { ...init, signal: abort.current.signal });
      if (!r.ok || !r.body) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `Алдаа (${r.status})`);
      }
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const t = acc;
        setMsgs((x) => x?.map((y) => (y.id === reply.id ? { ...y, text: t } : y)) ?? x);
      }
      // Серверийн хадгалсан хувилбар (файл, дуут хариу, загварын нэр)-ыг авна
      if (files) await reload().catch(() => {});
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        toast((e as Error).message, "danger");
        setMsgs((x) => x?.filter((y) => !(y.id === reply.id && !y.text)) ?? x);
      }
    } finally {
      setBusy(false);
    }
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      void send();
    }
  };
  const clear = () =>
    confirm({
      title: "Чатын түүхийг устгах уу?",
      message: files ? "Хавсаргасан файлууд ч устна." : undefined,
      ok: "Устгах",
      destructive: true,
      run: () =>
        api(`/api/ai/chat${q}`, { method: "DELETE" })
          .then(() => setMsgs([]))
          .catch((e: Error) => toast(e.message, "danger")),
    });

  const fileUrl = (f: AiFile) => `/api/ai/files/${f.id}`;
  const canSend = !!text.trim() || !!pending.length;

  return (
    <div
      className={cx(
        "relative flex h-[calc(100dvh-200px)] min-h-[440px] flex-col overflow-hidden rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)] md:h-[calc(100dvh-170px)]",
        drag && "shadow-[0_0_0_2px_var(--sp-accent)]",
      )}
      onDragOver={(e) => {
        if (!files || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        if (!files) return;
        e.preventDefault();
        setDrag(false);
        void add(e.dataTransfer.files);
      }}
    >
      {drag && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center bg-[color-mix(in_srgb,var(--sp-paper)_85%,transparent)]">
          <div className="flex flex-col items-center gap-2 text-accent">
            <Icon name="paperclip" size={32} />
            <span className="text-[15px] font-semibold">Файлаа энд тавина уу</span>
          </div>
        </div>
      )}
      <div className="sp-scroll min-h-0 flex-1 space-y-3 bg-stage px-4 py-5">
        {!msgs ? (
          <div className="grid h-full place-items-center text-mute">
            <Spinner />
          </div>
        ) : !msgs.length ? (
          <div className="mx-auto flex h-full max-w-[520px] flex-col items-center justify-center text-center">
            <span className="grid size-12 place-items-center rounded-full bg-accent-soft text-accent">
              <Icon name="sparkle" size={24} />
            </span>
            <div className="mt-3 text-[17px] font-semibold text-ink">Юу асуух вэ?</div>
            <p className="mt-1 text-[14px] text-mute">
              Таны борлуулалт, нөөц, харилцагчийн мэдээллийг AI харж хариулна.
              {files && " Зураг, видео, дуу, PDF, CSV хавсаргаж болно. «Видео» горимд текст эсвэл зургаас видео хийнэ."}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGEST.map((x) => (
                <button key={x} type="button" onClick={() => void send(x)} className="sp-tap rounded-full bg-paper px-3.5 py-2 text-[13.5px] text-ink-2 shadow-[0_0_0_0.5px_var(--sp-sep)] hover:text-ink">
                  {x}
                </button>
              ))}
            </div>
          </div>
        ) : (
          msgs.map((x) => {
            const shown = x.files?.map((f) => ({ key: f.id, name: f.name, kind: f.kind, url: fileUrl(f), size: f.size as number | undefined })) ?? x.local?.map((f, i) => ({ key: `${i}`, name: f.name, kind: f.kind, url: f.url, size: undefined }));
            const task = x.meta?.task;
            const making = !!task && (task.status === "queued" || task.status === "running");
            return (
              <div key={x.id} className={cx("flex flex-col", x.role === "user" ? "items-end" : "items-start")}>
                {!!shown?.length && (
                  <div className={cx("mb-1 flex max-w-[min(85%,640px)] flex-wrap items-start gap-1.5", x.role === "user" && "justify-end")}>
                    {shown.map((f) =>
                      f.kind === "video" && f.url ? (
                        <div key={f.key} className="w-fit max-w-full overflow-hidden rounded-[14px] bg-black shadow-[0_0_0_0.5px_var(--sp-sep)]">
                          <video src={f.url} controls playsInline preload="metadata" className="block max-h-[360px] w-auto max-w-[min(100%,420px)]" />
                          {x.files && (
                            <a href={`${f.url}&dl=1`} className="flex items-center gap-1.5 bg-paper px-3 py-2 text-[13px] font-medium text-accent">
                              <Icon name="download" size={16} /> Татах (MP4{f.size !== undefined ? `, ${kb(f.size)}` : ""})
                            </a>
                          )}
                        </div>
                      ) : f.kind === "audio" && f.url ? (
                        <audio key={f.key} src={f.url} controls preload="metadata" className="h-10 max-w-[300px]" />
                      ) : f.kind === "image" && f.url ? (
                        <a key={f.key} href={f.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-[14px] shadow-[0_0_0_0.5px_var(--sp-sep)]">
                          {/* eslint-disable-next-line @next/next/no-img-element -- хэрэглэгчийн хавсралт, оновчлол хэрэггүй */}
                          <img src={f.url} alt={f.name} className="h-32 max-w-[220px] bg-paper object-cover" />
                        </a>
                      ) : (
                        <a
                          key={f.key}
                          href={x.files ? f.url : undefined}
                          className="flex max-w-[260px] items-center gap-2 rounded-[14px] bg-paper px-3 py-2 text-[13px] text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]"
                        >
                          <Icon name="file" size={18} className="shrink-0 text-accent" />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{f.name}</span>
                            {f.size !== undefined && <span className="block text-[11.5px] text-mute">{kb(f.size)}</span>}
                          </span>
                        </a>
                      ),
                    )}
                  </div>
                )}
                {(x.text || x.role === "model") && !(x.files?.some((f) => f.kind === "video") && task?.status === "done") && (
                  <div
                    className={cx(
                      "max-w-[min(85%,640px)] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2.5 text-[14.5px] leading-relaxed",
                      x.role === "user" ? "rounded-br-[6px] bg-accent text-white" : "rounded-bl-[6px] bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]",
                    )}
                  >
                    {making ? (
                      <VideoProgress task={task!} />
                    ) : x.text ? (
                      <>
                        {x.role === "model" ? rich(x.text) : x.text}
                        {busy && x.id === msgs[msgs.length - 1]?.id && <span className="sp-ai-caret ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] rounded-full bg-accent" aria-hidden="true" />}
                      </>
                    ) : (
                      <Thinking />
                    )}
                  </div>
                )}
                <div className="mt-0.5 px-1 text-[11px] text-mute">
                  {x.role === "user" ? x.staff : x.meta?.model ? `${label} · ${x.meta.model}` : label}
                  {task?.status === "done" && ` · ${task.res} · ${task.duration} сек`}
                  {x.role === "model" && x.text && !busy && !task && (
                    <button type="button" className="ml-2 text-accent" onClick={() => navigator.clipboard.writeText(x.text).then(() => toast("Хуулагдлаа", "ok"))}>
                      Хуулах
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={end} />
      </div>
      <div className="border-t border-[var(--sp-sep)] p-3">
        {!!pending.length && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pending.map((p) => (
              <div key={p.key} className="relative flex h-14 items-center gap-2 rounded-[12px] bg-[var(--sp-fill)] pr-8 pl-1.5 text-[13px] text-ink">
                {p.kind === "image" && p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- blob URL
                  <img src={p.url} alt="" className="size-11 rounded-[9px] object-cover" />
                ) : p.kind === "video" && p.url ? (
                  <video src={p.url} muted playsInline className="size-11 rounded-[9px] bg-black object-cover" />
                ) : (
                  <span className="grid size-11 place-items-center rounded-[9px] bg-paper text-accent">
                    <Icon name={p.kind === "audio" ? "mic" : "file"} size={20} />
                  </span>
                )}
                <span className="min-w-0 max-w-[160px]">
                  <span className="block truncate font-medium">{p.file.name}</span>
                  <span className="block text-[11.5px] text-mute">{kb(p.file.size)}</span>
                </span>
                <button type="button" onClick={() => remove(p.key)} aria-label={`${p.file.name} хасах`} className="sp-tap absolute top-1 right-1 grid size-6 place-items-center rounded-full text-mute hover:text-ink">
                  <Icon name="close" size={14} stroke={2.4} />
                </button>
              </div>
            ))}
          </div>
        )}
        {files && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Segmented<"chat" | "video">
              options={[
                { id: "chat", label: "Чат" },
                { id: "video", label: "Видео" },
              ]}
              value={mode}
              onChange={(v) => {
                setMode(v);
                if (v === "video" && pending.some((p) => !/^image\/(jpeg|png|webp)$/.test(p.file.type))) {
                  setPending((x) => x.filter((p) => /^image\/(jpeg|png|webp)$/.test(p.file.type)));
                  toast("Видео горимд зөвхөн зураг үлдлээ", "ok");
                }
              }}
              className="w-[150px]"
            />
            {mode === "chat" ? (
              <>
                <select className={sel} value={chatModel} onChange={(e) => setChatModel(e.target.value)} aria-label="Загвар" title={CHAT_MODELS.find((x) => x.id === chatModel)?.hint}>
                  {CHAT_MODELS.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label} — {x.id}
                    </option>
                  ))}
                </select>
                <select className={sel} value={voice} onChange={(e) => setVoice(e.target.value)} aria-label="Дуугаар хариулах" title="Дуугаар хариулах (qwen3.5-omni)">
                  {VOICES.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.id ? `🔊 ${x.label}` : "🔇 Дуугүй хариу"}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <span className="rounded-full bg-accent-soft px-2.5 py-1 text-[12.5px] font-semibold text-accent">{MODE_LABEL[vmode]}</span>
                <select className={sel} value={vopt.model} onChange={(e) => setVopt({ ...vopt, model: e.target.value })} aria-label="Видеоны загвар">
                  {vmodels.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.label}
                      {x.note ? ` · ${x.note}` : ""} — {x.id}
                    </option>
                  ))}
                </select>
                <select className={sel} value={vopt.res} onChange={(e) => setVopt({ ...vopt, res: e.target.value as Res })} aria-label="Нягтрал">
                  {resOf(vm).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
                {vmode === "t2v" && (
                  <select className={sel} value={vopt.aspect} onChange={(e) => setVopt({ ...vopt, aspect: e.target.value as Aspect })} aria-label="Хэмжээ">
                    <option value="9:16">9:16 · Reels, TikTok</option>
                    <option value="16:9">16:9 · хэвтээ</option>
                    <option value="1:1">1:1 · дөрвөлжин</option>
                  </select>
                )}
                <select className={sel} value={vopt.duration} onChange={(e) => setVopt({ ...vopt, duration: Number(e.target.value) })} aria-label="Хугацаа">
                  {vm.durations.map((d) => (
                    <option key={d} value={d}>
                      {d} сек
                    </option>
                  ))}
                </select>
                {vm.audio && (
                  <label className="flex h-9 items-center gap-1.5 rounded-[10px] bg-[var(--sp-fill)] px-2.5 text-[13px] font-medium text-ink">
                    <input type="checkbox" checked={vopt.audio} onChange={(e) => setVopt({ ...vopt, audio: e.target.checked })} className="accent-[var(--sp-accent)]" />
                    Дуутай
                  </label>
                )}
                <span className="text-[12.5px] text-mute tnum" title="Gerege-ийн AI gateway-ийн үнэ (USD)">
                  {usd(videoCost(vopt))}
                </span>
              </>
            )}
          </div>
        )}
        <div className="flex items-end gap-2">
          {!!msgs?.length && (
            <button type="button" onClick={clear} aria-label="Түүх устгах" title="Түүх устгах" className="sp-tap grid size-11 shrink-0 place-items-center rounded-full text-mute hover:text-ink">
              <Icon name="trash" size={19} />
            </button>
          )}
          {files && (
            <>
              <input
                ref={picker}
                type="file"
                multiple
                accept={mode === "video" ? ACCEPT_VIDEO : ACCEPT}
                className="hidden"
                onChange={(e) => {
                  void add(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => picker.current?.click()}
                disabled={busy || pending.length >= (mode === "video" ? 2 : MAX_FILES)}
                aria-label="Файл хавсаргах"
                title={mode === "video" ? "Зураг хавсаргах: 1 — хөдөлгөнө, 2 — эхний ба сүүлийн кадр" : "Зураг, видео, дуу, PDF, CSV хавсаргах (10 MB хүртэл)"}
                className="sp-tap grid size-11 shrink-0 place-items-center rounded-full text-mute hover:text-ink disabled:opacity-40"
              >
                <Icon name="paperclip" size={20} />
              </button>
              {mode === "chat" && (
                <button
                  type="button"
                  onClick={() => void record()}
                  disabled={busy}
                  aria-label={rec ? "Бичлэг зогсоох" : "Дуу бичих"}
                  title={rec ? "Зогсоох — бичлэг хавсарна" : "Дуугаар асуух (микрофон)"}
                  className={cx("sp-tap grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-40", rec ? "animate-pulse bg-[#ff3b30] text-white" : "text-mute hover:text-ink")}
                >
                  <Icon name={rec ? "stopSquare" : "mic"} size={20} />
                </button>
              )}
            </>
          )}
          <textarea
            className="sp-field max-h-40 min-h-[44px] flex-1 resize-none"
            rows={1}
            maxLength={4000}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKey}
            onPaste={(e) => {
              if (files && e.clipboardData.files.length) {
                e.preventDefault();
                void add(e.clipboardData.files);
              }
            }}
            placeholder={mode === "video" && files ? (vimages ? "Хэрхэн хөдлөхийг бичнэ үү (заавал биш)…" : "Ямар видео хийх вэ? Жишээ: «Шинэ кофе ширээн дээр, уур савсаж байна»") : "AI-аас асуух…"}
            title={files ? "Enter — илгээх, Shift+Enter — шинэ мөр. Файлыг энд чирж эсвэл буулгаж (Ctrl+V) болно." : "Enter — илгээх, Shift+Enter — шинэ мөр"}
            aria-label="Асуулт"
          />
          {busy ? (
            <button type="button" onClick={() => abort.current?.abort()} aria-label="Зогсоох" className="sp-tap grid size-11 shrink-0 place-items-center rounded-full bg-[var(--sp-fill)] text-ink">
              <Icon name="stopSquare" size={18} stroke={2.4} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void send()}
              disabled={!canSend}
              aria-label={mode === "video" && files ? "Видео хийх" : "Илгээх"}
              title={mode === "video" && files ? `Видео хийх · ${usd(videoCost(vopt))}` : undefined}
              className="sp-tap grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
            >
              <Icon name={mode === "video" && files ? "video" : "send"} size={20} />
            </button>
          )}
        </div>
      </div>
      {node}
    </div>
  );
}
