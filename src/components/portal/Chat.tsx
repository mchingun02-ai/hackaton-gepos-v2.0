"use client";

/*
 * Facebook чат — мерчант Facebook Page-ээ нэг товчоор холбож, Messenger-ээр бичсэн харилцагчидтайгаа
 * порталаас чатлана. Токен зөвхөн серверт (src/lib/fb/server.ts), браузер руу гарахгүй.
 *
 * Хариу илгээх хугацаа (Meta): харилцагчийн сүүлийн мессежээс 24 цаг — чөлөөтэй; 7 хоног хүртэл —
 * ажилтны хариу (HUMAN_AGENT); түүнээс хойш харилцагч дахин бичих хүртэл илгээхгүй.
 */

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "@/components/sp/icons";
import { Avatar, Btn, cx, Empty, Notice, SearchField, Spinner, toast, useConfirm } from "@/components/sp/ui";
import { staffName } from "@/lib/sp/logic";
import { useSp } from "@/lib/sp/store";
import { Card, Dialog, Page, Tabs, usePortal } from "./kit";

type Win = { state: "open" | "human" | "closed"; until?: number };
type Thread = { psid: string; name: string; pic?: string; lastAt: number; lastText: string; unread: number; status: "open" | "done"; window: Win };
type Msg = { mid: string; dir: "in" | "out"; text: string; attachments?: { type: string; url?: string; title?: string }[]; staff?: string; tag?: string; status: string; error?: string; at: number };
type Status = {
  demo: boolean;
  page: { id: string; name: string; pic?: string; demo: boolean; subscribed: boolean; connectedBy?: string; connectedAt: number } | null;
  counts: { unread: number; open: number };
};
type PickPage = { id: string; name: string; pic?: string; category?: string; canMessage: boolean };
type St = "open" | "unread" | "done" | "all";

const FB_BLUE = "#1877F2";

/** Порталын fetch — мерчантыг серверийн session cookie (gp_s) таньна (AI ажилтан /ai-д нэвтэрсэн байх) */
export function useFbApi() {
  // usePortal биш — sidebar (контекстээс гадна) ч ашиглана
  const s = useSp();
  const m = encodeURIComponent(s.merchant.regNo);
  return useCallback(
    async <T,>(path: string, init?: RequestInit): Promise<T> => {
      // "/api/..." бол шууд, бусад нь Facebook-ийн API
      const r = await fetch(path.startsWith("/api/") ? path : `/api/fb${path}`, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || `Алдаа (${r.status})`);
      return data as T;
    },
    // мерчант солигдоход (m) хуудаснууд дахин татна
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [m],
  );
}

/** Sidebar-ийн badge — уншаагүй чатын тоо (30 сек тутам) */
export function useChatUnread(enabled: boolean) {
  const api = useFbApi();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    // Серверийн session-гүй үед (AI ажилтанд нэвтрээгүй) 401 алдаа гаргахгүйн тулд эхлээд шалгана
    const tick = () =>
      fetch("/api/auth/me", { cache: "no-store" })
        .then((r) => r.json() as Promise<{ authenticated?: boolean }>)
        .then((me) => (me.authenticated ? api<Status>("/status").then((st) => live && setN(st.counts.unread)) : undefined))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 30_000);
    window.addEventListener("sp-fb-changed", tick);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener("sp-fb-changed", tick);
    };
  }, [api, enabled]);
  return n;
}
const changed = () => window.dispatchEvent(new Event("sp-fb-changed"));

/** «Сарангэрэл Б.» → «СБ» */
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 1))
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

const hhmm = (ms: number) => new Date(ms).toLocaleTimeString("mn-MN", { hour: "2-digit", minute: "2-digit", hour12: false });
const when = (ms: number) => {
  const d = new Date(ms);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return hhmm(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
const left = (until?: number) => {
  if (!until) return "";
  const h = Math.max(0, Math.round((until - Date.now()) / 3_600_000));
  return h >= 24 ? `${Math.round(h / 24)} хоног` : `${h} цаг`;
};

export default function Chat() {
  const api = useFbApi();
  const { canManage } = usePortal();
  const [st, setSt] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Facebook-ээс буцаж ирсэн алдаа — toast шиг алга болохгүй, дахин холбох хүртэл харагдана
  const [fbErr, setFbErr] = useState<string | null>(() => new URLSearchParams(window.location.search).get("fberror"));
  const [pick, setPick] = useState<string | null>(() => new URLSearchParams(window.location.search).get("fbpick"));
  const { confirm, node } = useConfirm();

  const load = useCallback(() => {
    api<Status>("/status")
      .then((x) => {
        setSt(x);
        setErr(null);
      })
      .catch((e: Error) => setErr(e.message));
  }, [api]);

  // Facebook-ээс буцаж ирэхэд: ?fbpick=… (Page сонгох) эсвэл ?fberror=…
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const k = q.get("fbpick");
    const e = q.get("fberror");
    const ok = q.get("fbok");
    if (ok) {
      toast(`«${ok}» холбогдлоо`, "ok");
      changed();
    }
    if (k || e || ok) window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    load();
  }, [load]);

  const connect = () => {
    // API маршрут руу бүтэн шилжилт (Facebook руу redirect хийнэ) — router.push биш
    window.location.assign(new URL("/api/fb/connect", window.location.href));
  };

  const disconnect = () =>
    confirm({
      title: "Facebook Page-ийг салгах уу?",
      message: "Порталаас чат харагдахаа болиод, хадгалсан токен ба чатын түүх устна. Facebook дээрх мессеж хэвээр үлдэнэ.",
      ok: "Салгах",
      destructive: true,
      run: () =>
        api("/status", { method: "DELETE" })
          .then(() => {
            toast("Page салгагдлаа", "ok");
            changed();
            load();
          })
          .catch((e: Error) => toast(e.message, "danger")),
    });

  const page = st?.page;
  return (
    <Page
      title="Facebook чат"
      sub={page ? `${page.name} · Messenger` : "Facebook Page-ийн Messenger-ээр харилцагчтайгаа чатлах"}
      actions={
        page && canManage ? (
          <Btn size="md" variant="gray" icon="link" onClick={disconnect}>
            Салгах
          </Btn>
        ) : undefined
      }
    >
      {err ? (
        <Notice tone="danger">{err}</Notice>
      ) : !st ? (
        <div className="grid h-[50dvh] place-items-center text-mute">
          <Spinner size={24} />
        </div>
      ) : page ? (
        <>
          {page.demo && (
            <div className="mb-4">
              <Notice tone="accent" icon="info">
                Туршилтын горим — жишээ чат. Хариу бичвэл харилцагч автоматаар хариулна.
              </Notice>
            </div>
          )}
          <Inbox />
        </>
      ) : (
        <>
          {fbErr && (
            <div className="mx-auto mb-2 max-w-[560px] pt-6">
              <Notice tone="danger" icon="warn">
                {fbErr}
              </Notice>
            </div>
          )}
          <ConnectCard demo={st.demo} canManage={canManage} onConnect={() => {
              setFbErr(null);
              connect();
            }}
          />
        </>
      )}
      <PickDialog
        key={pick ?? "none"}
        k={pick}
        onClose={() => setPick(null)}
        onDone={() => {
          setPick(null);
          changed();
          load();
        }}
      />
      {node}
    </Page>
  );
}

/* ───────── холбоогүй үед ───────── */

function ConnectCard({ demo, canManage, onConnect }: { demo: boolean; canManage: boolean; onConnect: () => void }) {
  return (
    <div className="mx-auto max-w-[560px] pt-6">
      <Card>
        <div className="flex flex-col items-center px-2 py-6 text-center">
          <span className="grid size-16 place-items-center rounded-[20px] text-white" style={{ background: FB_BLUE }}>
            <FbLogo size={34} />
          </span>
          <h2 className="mt-4 text-[20px] font-bold tracking-[-0.01em] text-ink">Facebook Page-ээ холбоно уу</h2>
          <p className="mt-2 max-w-[420px] text-[15px] leading-snug text-mute">Харилцагч таны Page руу Messenger-ээр бичихэд энд ирнэ. Та болон ажилтнууд порталаас шууд хариулна.</p>
          <ol className="mt-5 w-full max-w-[400px] space-y-2.5 text-left text-[14.5px] text-ink-2">
            {["Доорх товчийг дарж Facebook-ээр нэвтэрнэ", "Холбох Page-ээ сонгож зөвшөөрнө", "Порталд буцаж ирээд Page-ээ баталгаажуулна"].map((t, i) => (
              <li key={t} className="flex gap-3">
                <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--sp-fill)] text-[13px] font-semibold text-ink tnum">{i + 1}</span>
                {t}
              </li>
            ))}
          </ol>
          {canManage ? (
            <button
              type="button"
              onClick={onConnect}
              className="sp-tap mt-6 flex h-12 items-center gap-2.5 rounded-[12px] px-6 text-[16px] font-semibold text-white"
              style={{ background: FB_BLUE }}
            >
              <FbLogo size={20} /> Facebook-ээр холбох
            </button>
          ) : (
            <p className="mt-6 text-[14px] text-mute">Page холбох эрх зөвхөн мерчант эсвэл менежерт байна.</p>
          )}
          <p className="mt-4 max-w-[420px] text-[12.5px] leading-snug text-mute">
            Бид зөвхөн Page-ийн мессеж унших, хариулах эрх авна. Таны хувийн Facebook-т нийтлэл хийхгүй, нууц үгийг хадгалахгүй.
            {demo && " Одоо туршилтын горимд — жинхэнэ Facebook руу шилжихгүй."}
          </p>
        </div>
      </Card>
    </div>
  );
}

function FbLogo({ size = 20 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" fill="currentColor">
      <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.8-4.7 4.54-4.7 1.31 0 2.68.24 2.68.24v2.97h-1.5c-1.5 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.62 23.1 24 18.1 24 12.07z" />
    </svg>
  );
}

/* ───────── Page сонгох ───────── */

function PickDialog({ k, onClose, onDone }: { k: string | null; onClose: () => void; onDone: () => void }) {
  const api = useFbApi();
  const { actor } = usePortal();
  const [pages, setPages] = useState<PickPage[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!k) return;
    api<{ pages: PickPage[] }>(`/pages?k=${encodeURIComponent(k)}`)
      .then((r) => {
        setPages(r.pages);
        const ok = r.pages.filter((p) => p.canMessage);
        setSel(ok.length === 1 ? ok[0].id : null);
      })
      .catch((e: Error) => setErr(e.message));
  }, [api, k]);

  const save = () => {
    if (!k || !sel) return;
    setBusy(true);
    api("/pages", { method: "POST", body: JSON.stringify({ k, pageId: sel, by: actor.name }) })
      .then(() => {
        toast("Facebook Page холбогдлоо", "ok");
        onDone();
      })
      .catch((e: Error) => toast(e.message, "danger"))
      .finally(() => setBusy(false));
  };

  return (
    <Dialog
      open={!!k}
      onClose={onClose}
      title="Page сонгох"
      width={460}
      footer={
        <Btn size="md" disabled={!sel} loading={busy} onClick={save}>
          Холбох
        </Btn>
      }
    >
      {err ? (
        <Notice tone="danger">{err}</Notice>
      ) : !pages ? (
        <div className="grid h-40 place-items-center text-mute">
          <Spinner />
        </div>
      ) : (
        <>
          <p className="mb-3 text-[14px] text-mute">Аль Page-ийн Messenger-ийг порталд холбох вэ? Нэг мерчантад нэг Page.</p>
          <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]" role="radiogroup" aria-label="Page">
            {pages.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={sel === p.id}
                disabled={!p.canMessage}
                onClick={() => setSel(p.id)}
                className={cx("sp-row flex min-h-[60px] w-full items-center gap-3 px-4 py-2 text-left", !p.canMessage && "opacity-50")}
              >
                {p.pic ? <img src={p.pic} alt="" className="size-10 shrink-0 rounded-full object-cover" /> : <Avatar text={initials(p.name)} size={40} tone="gray" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-medium text-ink">{p.name}</span>
                  <span className="block truncate text-[12.5px] text-mute">{p.canMessage ? p.category || "Facebook Page" : "Мессеж бичих эрх алга"}</span>
                </span>
                <span className={cx("grid size-6 shrink-0 place-items-center rounded-full border-2", sel === p.id ? "border-accent bg-accent text-white" : "border-[var(--sp-sep)]")}>
                  {sel === p.id && <Icon name="check" size={14} stroke={3} />}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </Dialog>
  );
}

/* ───────── inbox ───────── */

const STATES: { id: St; label: string }[] = [
  { id: "open", label: "Нээлттэй" },
  { id: "unread", label: "Уншаагүй" },
  { id: "done", label: "Шийдсэн" },
  { id: "all", label: "Бүгд" },
];

function Inbox() {
  const api = useFbApi();
  const [state, setState] = useState<St>("open");
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    api<{ threads: Thread[] }>(`/threads?state=${state}&q=${encodeURIComponent(q)}`)
      .then((r) => setThreads(r.threads))
      .catch(() => {});
  }, [api, state, q]);
  useEffect(() => {
    load();
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="grid h-[calc(100dvh-200px)] min-h-[440px] md:h-[calc(100dvh-170px)] overflow-hidden rounded-[18px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)] md:grid-cols-[340px_1fr]">
      <div className={cx("flex min-h-0 flex-col border-r border-[var(--sp-sep)]", open && "hidden md:flex")}>
        <div className="space-y-2.5 border-b border-[var(--sp-sep)] p-3">
          <SearchField value={q} onChange={setQ} placeholder="Нэр, мессеж хайх" />
          <Tabs value={state} onChange={setState} options={STATES} />
        </div>
        <div className="sp-scroll min-h-0 flex-1">
          {!threads ? (
            <div className="grid h-40 place-items-center text-mute">
              <Spinner />
            </div>
          ) : !threads.length ? (
            <div className="p-6">
              <Empty icon="chat" title={state === "done" ? "Шийдсэн чат алга" : "Чат алга"} body={state === "open" ? "Харилцагч Page руу бичихэд энд гарна." : undefined} />
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.psid}
                type="button"
                onClick={() => setOpen(t.psid)}
                aria-current={open === t.psid ? "true" : undefined}
                className={cx("sp-row flex w-full items-center gap-3 border-b border-[var(--sp-sep)] px-3 py-2.5 text-left", open === t.psid && "bg-accent-soft")}
              >
                {t.pic ? <img src={t.pic} alt="" className="size-11 shrink-0 rounded-full object-cover" /> : <Avatar text={initials(t.name)} size={44} tone="gray" />}
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className={cx("min-w-0 flex-1 truncate text-[15px] text-ink", t.unread ? "font-semibold" : "font-medium")}>{t.name}</span>
                    <span className="shrink-0 text-[12px] text-mute tnum">{when(t.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className={cx("min-w-0 flex-1 truncate text-[13.5px]", t.unread ? "text-ink-2" : "text-mute")}>{t.lastText || "—"}</span>
                    {t.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white tnum">{t.unread}</span>}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </div>
      <div className={cx("min-h-0", !open && "hidden md:block")}>
        {open ? (
          <Conversation key={open} psid={open} onBack={() => setOpen(null)} onChange={load} />
        ) : (
          <div className="grid h-full place-items-center p-6">
            <Empty icon="chat" title="Чат сонгоно уу" body="Зүүн талаас харилцагчийг сонгож хариулна." />
          </div>
        )}
      </div>
    </div>
  );
}

function Conversation({ psid, onBack, onChange }: { psid: string; onBack: () => void; onChange: () => void }) {
  const api = useFbApi();
  const { actor, staff } = usePortal();
  const [data, setData] = useState<{ thread: Thread; messages: Msg[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const me = staff ? staffName(staff) : actor.name;

  const load = useCallback(() => {
    api<{ thread: Thread; messages: Msg[] }>(`/threads/${encodeURIComponent(psid)}`)
      .then((r) => {
        setData(r);
        setErr(null);
        if (r.thread.unread > 0)
          api(`/threads/${encodeURIComponent(psid)}/read`, { method: "POST" })
            .then(() => {
              onChange();
              changed();
            })
            .catch(() => {});
      })
      .catch((e: Error) => setErr(e.message));
  }, [api, psid, onChange]);
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => {
    const n = data?.messages.length ?? 0;
    if (n !== count.current) end.current?.scrollIntoView({ block: "end", behavior: count.current ? "smooth" : "auto" });
    count.current = n;
  }, [data]);

  const send = () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    api<Msg>(`/threads/${encodeURIComponent(psid)}/send`, { method: "POST", body: JSON.stringify({ text: body, staff: me }) })
      .then((m) => {
        setText("");
        setData((d) => (d ? { ...d, messages: [...d.messages, m] } : d));
        onChange();
      })
      .catch((e: Error) => toast(e.message, "danger"))
      .finally(() => setBusy(false));
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    }
  };
  const toggleDone = () => {
    if (!data) return;
    const status = data.thread.status === "done" ? "open" : "done";
    api<Thread>(`/threads/${encodeURIComponent(psid)}`, { method: "PATCH", body: JSON.stringify({ status }) })
      .then((t) => {
        setData((d) => (d ? { ...d, thread: t } : d));
        toast(status === "done" ? "Шийдсэн гэж тэмдэглэлээ" : "Дахин нээлээ", "ok");
        onChange();
      })
      .catch((e: Error) => toast(e.message, "danger"));
  };

  if (err) return <div className="p-5"><Notice tone="danger">{err}</Notice></div>;
  if (!data)
    return (
      <div className="grid h-full place-items-center text-mute">
        <Spinner />
      </div>
    );
  const t = data.thread;
  const w = t.window;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex min-h-[60px] items-center gap-3 border-b border-[var(--sp-sep)] px-3">
        <button type="button" onClick={onBack} aria-label="Буцах" className="sp-tap grid size-10 place-items-center rounded-full text-accent md:hidden">
          <Icon name="back" size={22} />
        </button>
        {t.pic ? <img src={t.pic} alt="" className="size-9 rounded-full object-cover" /> : <Avatar text={initials(t.name)} size={36} tone="gray" />}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-ink">{t.name}</div>
          <div className="truncate text-[12px] text-mute">
            {w.state === "open" ? `Хариулах хугацаа: ${left(w.until)}` : w.state === "human" ? `Зөвхөн ажилтны хариу · ${left(w.until)} үлдсэн` : "Хариулах хугацаа дууссан"}
          </div>
        </div>
        <Btn size="sm" variant={t.status === "done" ? "gray" : "tinted"} icon={t.status === "done" ? "undo" : "check"} onClick={toggleDone} aria-label={t.status === "done" ? "Дахин нээх" : "Шийдсэн гэж тэмдэглэх"}>
          <span className="hidden sm:inline">{t.status === "done" ? "Дахин нээх" : "Шийдсэн"}</span>
        </Btn>
      </div>

      <div className="sp-scroll min-h-0 flex-1 space-y-1.5 bg-stage px-4 py-4">
        {data.messages.map((m, i) => {
          const prev = data.messages[i - 1];
          const gap = !prev || m.at - prev.at > 15 * 60_000;
          return (
            <div key={m.mid}>
              {gap && <div className="py-2 text-center text-[11.5px] text-mute tnum">{new Date(m.at).toLocaleString("mn-MN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false })}</div>}
              <Bubble m={m} />
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="border-t border-[var(--sp-sep)] p-3">
        {w.state === "closed" ? (
          <Notice tone="gray" icon="clock">
            Харилцагчийн сүүлийн мессежээс 7 хоног өнгөрсөн тул Facebook хариу илгээхийг зөвшөөрөхгүй. Харилцагч дахин бичихэд нээгдэнэ.
          </Notice>
        ) : (
          <>
            {w.state === "human" && (
              <p className="mb-2 text-[12.5px] text-mute">24 цаг өнгөрсөн тул зөвхөн та өөрөө бичсэн хариу явна (Facebook-ийн дүрэм). Сурталчилгаа илгээж болохгүй.</p>
            )}
            <div className="flex items-end gap-2">
              <textarea
                className="sp-field max-h-40 min-h-[44px] flex-1 resize-none"
                rows={1}
                maxLength={2000}
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={onKey}
                placeholder="Хариу бичих…"
                title="Enter — илгээх, Shift+Enter — шинэ мөр"
                aria-label="Хариу"
              />
              <button
                type="button"
                onClick={send}
                disabled={!text.trim() || busy}
                aria-label="Илгээх"
                className="sp-tap grid size-11 shrink-0 place-items-center rounded-full bg-accent text-white disabled:opacity-40"
              >
                {busy ? <Spinner /> : <Icon name="send" size={20} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_LABEL: Record<string, string> = { sent: "Илгээсэн", delivered: "Хүргэгдсэн", read: "Уншсан", failed: "Илгээгдээгүй" };

function Bubble({ m }: { m: Msg }) {
  const out = m.dir === "out";
  return (
    <div className={cx("flex flex-col", out ? "items-end" : "items-start")}>
      <div
        className={cx(
          "max-w-[min(78%,520px)] whitespace-pre-wrap break-words rounded-[18px] px-3.5 py-2 text-[14.5px] leading-snug",
          out ? "rounded-br-[6px] bg-accent text-white" : "rounded-bl-[6px] bg-paper text-ink shadow-[0_0_0_0.5px_var(--sp-sep)]",
          m.status === "failed" && "opacity-60",
        )}
      >
        {m.attachments?.map((a, i) =>
          a.type === "image" || a.type === "sticker" ? (
            a.url ? <img key={i} src={a.url} alt={a.title || "Зураг"} className="mb-1 max-h-60 rounded-[12px]" /> : null
          ) : (
            <div key={i} className="text-[13px] opacity-80">
              [{a.title || a.type}]
            </div>
          ),
        )}
        {m.text}
      </div>
      <div className="mt-0.5 px-1 text-[11px] text-mute tnum">
        {hhmm(m.at)}
        {out && m.staff && ` · ${m.staff}`}
        {out && ` · ${STATUS_LABEL[m.status] ?? m.status}`}
        {m.tag === "HUMAN_AGENT" && " · ажилтны хариу"}
        {m.error && <span className="text-danger"> · {m.error}</span>}
      </div>
    </div>
  );
}
