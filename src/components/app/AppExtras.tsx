"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import {
  type AppNotification,
  type AuthConfig,
  type Program,
  type ReceiptDetail,
  type ReceiptHead,
  type StoreBranch,
  CustomerApiError,
  customerApi,
} from "@/lib/customer-api";
import { IconBell } from "@/components/icons";
import { Panel, SectionHead } from "@/components/app/AppUi";
import { ProgramMark } from "@/components/app/LoyaltyPromos";
import { Chip, btnGhost } from "@/components/ui";

/**
 * Хэрэглэгчийн апп — мэдэгдэл (жагсаалт + Web Push), цахим баримт, дэлгүүрийн байршил/цагийн хуваарь.
 * Өгөгдөл бүгд серверээс; бусдын баримт, хөдөлгөөн харагдахгүй (сервер хэрэглэгчээр шүүнэ).
 */

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");
const when = (iso: string) => {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "дөнгөж сая";
  if (mins < 60) return `${mins} мин өмнө`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} цагийн өмнө`;
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fullDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const METHOD: Record<string, string> = { cash: "Бэлэн", card: "Карт", qpay: "QPay" };

/* ═════════ Мэдэгдэл ═════════ */

/** VAPID нийтийн түлхүүр → Uint8Array (pushManager.subscribe) */
const keyBytes = (b64: string) => {
  const s = (b64 + "=".repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(s);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};
const pushSupported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

export function useNotifications(session: string, active: boolean) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [unread, setUnread] = useState(0);
  // «Уншсан» болгосны дараа өмнө эхэлсэн хүсэлтийн хуучин тоо дахин тавигдахгүй
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const r = await customerApi.notifications(session);
      if (mine !== seq.current) return;
      setItems(r.notifications);
      setUnread(r.unread);
    } catch {
      /* сүлжээ — дараагийн удаа */
    }
  }, [session]);
  useEffect(() => {
    if (!active) return;
    const first = setTimeout(() => void load(), 0);
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [active, load]);
  const markSeen = useCallback(async () => {
    seq.current++;
    setUnread(0);
    setItems((xs) => xs.map((x) => ({ ...x, unread: false })));
    await customerApi.notificationsSeen(session).catch(() => {});
  }, [session]);
  return { items, unread, load, markSeen };
}

export function BellButton({ unread, onClick }: { unread: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label="Мэдэгдэл" className="press relative grid size-10 place-items-center rounded-xl text-ink hover:bg-paper">
      <IconBell />
      {unread > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="tnum absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold leading-4 text-[color:var(--accent-ink)]"
        >
          {unread > 9 ? "9+" : unread}
        </motion.span>
      )}
    </button>
  );
}

function PushToggle({ session, config }: { session: string; config: AuthConfig | null }) {
  const [state, setState] = useState<"unknown" | "on" | "off" | "denied" | "unsupported">("unknown");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async () => {
      if (!pushSupported() || !config?.push) return setState("unsupported");
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    };
    void check();
  }, [config]);

  const enable = async () => {
    if (!config?.publicKey) return;
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "denied" : "off");
      const reg = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(config.publicKey) }));
      await customerApi.pushSubscribe(session, sub.toJSON());
      setState("on");
    } catch (e) {
      setError(e instanceof CustomerApiError ? e.message : "Мэдэгдэл асааж чадсангүй.");
    } finally {
      setBusy(false);
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await customerApi.pushUnsubscribe(session, sub.endpoint).catch(() => {});
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "unsupported" || state === "unknown") return null;
  return (
    <div className="mb-3 rounded-[16px] bg-stage px-4 py-3">
      {state === "denied" ? (
        <p className="text-[12.5px] text-mute">Энэ хөтөч дээр мэдэгдэл хаагдсан байна — хөтчийн тохиргооноос зөвшөөрнө.</p>
      ) : (
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink-2">
            {state === "on" ? "Утсанд мэдэгдэл ирнэ: оноо, зарцуулалт, буцаалт." : "Утсанд мэдэгдэл авах: оноо нэмэгдэх, зарцуулах, буцаалт."}
          </p>
          <button type="button" className={btnGhost} disabled={busy} onClick={() => void (state === "on" ? disable() : enable())}>
            {busy ? "…" : state === "on" ? "Унтраах" : "Асаах"}
          </button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[12px] font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function NotificationsPanel({ session, config, items, onClose }: { session: string; config: AuthConfig | null; items: AppNotification[]; onClose: () => void }) {
  return (
    <Panel title="Мэдэгдэл" onClose={onClose}>
      <PushToggle session={session} config={config} />
      {items.length === 0 ? (
        <p className="rounded-[16px] bg-stage px-4 py-4 text-[13px] text-mute">Мэдэгдэл алга. Касс дээр Gerege QR-аа уншуулахад энд гарна.</p>
      ) : (
        <ul className="space-y-1.5">
          {items.map((n, i) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 10) * 0.03, duration: 0.3, ease: EASE }}
              className={`flex gap-3 rounded-[16px] px-3.5 py-3 ${n.unread ? "bg-accent-soft" : "bg-stage"}`}
            >
              <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.unread ? "bg-accent" : "bg-transparent"}`} />
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-bold leading-snug text-ink">{n.title}</span>
                <span className="block text-[12px] leading-snug text-ink-2">{n.body}</span>
                <span className="mt-0.5 block text-[11px] text-mute">{when(n.at)}</span>
              </span>
            </motion.li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ═════════ Цахим баримт ═════════ */

const STATUS: Record<ReceiptHead["status"], { label: string; cls: string }> = {
  paid: { label: "Төлсөн", cls: "bg-ok-soft text-ok" },
  partial_refund: { label: "Хэсэгчлэн буцаасан", cls: "bg-warn-soft text-warn" },
  refunded: { label: "Буцаасан", cls: "bg-stage text-mute" },
};

export function ReceiptsSection({ session, active }: { session: string; active: boolean }) {
  const [rows, setRows] = useState<ReceiptHead[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!active) return;
    customerApi
      .receipts(session)
      .then((r) => {
        setRows(r.receipts);
        setNext(r.next);
        setError(null);
      })
      .catch((e) => setError(e instanceof CustomerApiError ? e.message : "Баримт ачаалж чадсангүй."));
  }, [session, active]);
  const more = async () => {
    if (!next) return;
    const r = await customerApi.receipts(session, next).catch(() => null);
    if (r) {
      setRows((xs) => [...(xs ?? []), ...r.receipts]);
      setNext(r.next);
    }
  };

  return (
    <>
      <SectionHead title="Цахим баримт" />
      {error && <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">{error}</p>}
      {rows && rows.length === 0 && <p className="rounded-[18px] bg-paper px-4 py-4 text-[13px] text-mute ring-1 ring-inset ring-hair">Баримт алга — Gerege QR-аар худалдан авалт хийхэд энд хадгалагдана.</p>}
      {rows && rows.length > 0 && (
        <ul className="divide-y divide-hair rounded-[18px] bg-paper ring-1 ring-inset ring-hair">
          {rows.map((r) => (
            <li key={r.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setOpen(r.id)}>
                <ProgramMark color={r.bgColor ?? "#4002FF"} src={customerApi.logoSrc(r.logoUrl)} size="size-8" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-bold text-ink">{r.merchantName}</span>
                  <span className="block truncate text-[11.5px] text-mute">
                    {when(r.at)} · {r.no}
                  </span>
                </span>
                <span className="text-right">
                  <span className="tnum block text-[14px] font-bold text-ink">{moneyPlain(r.total)}₮</span>
                  {r.status !== "paid" ? (
                    <span className={`mt-0.5 inline-block rounded-full px-1.5 text-[10.5px] font-bold ${STATUS[r.status].cls}`}>{STATUS[r.status].label}</span>
                  ) : r.points > 0 ? (
                    <span className="tnum block text-[11px] font-semibold text-ok">+{moneyPlain(r.points)} оноо</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {next && (
        <button type="button" className={`${btnGhost} mt-2 w-full justify-center`} onClick={() => void more()}>
          Цааш
        </button>
      )}
      {open && <ReceiptPanel session={session} id={open} onClose={() => setOpen(null)} />}
    </>
  );
}

function ReceiptPanel({ session, id, onClose }: { session: string; id: string; onClose: () => void }) {
  const [r, setR] = useState<ReceiptDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    customerApi
      .receipt(session, id)
      .then((x) => setR(x.receipt))
      .catch((e) => setError(e instanceof CustomerApiError ? e.message : "Баримт ачаалж чадсангүй."));
  }, [session, id]);
  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between ${strong ? "text-[15px] font-extrabold text-ink" : "text-[12.5px] text-ink-2"}`}>
      <span>{label}</span>
      <span className="tnum">{value}</span>
    </div>
  );
  return (
    <Panel title="Цахим баримт" onClose={onClose}>
      {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">{error}</p>}
      {r && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, ease: EASE }} className="rounded-[18px] bg-white p-4 text-ink shadow-[0_18px_40px_-28px_rgb(0_0_0/0.5)] ring-1 ring-inset ring-hair">
          <div className="flex items-center gap-3 border-b border-dashed border-line pb-3">
            <ProgramMark color={r.bgColor ?? "#4002FF"} src={customerApi.logoSrc(r.logoUrl)} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[15px] font-extrabold">{r.merchantName}</p>
              <p className="truncate text-[11.5px] text-mute">
                {r.branchName ? `${r.branchName} · ` : ""}{fullDate(r.at)}
              </p>
            </div>
          </div>
          <ul className="space-y-1.5 border-b border-dashed border-line py-3">
            {r.lines.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 text-[12.5px]">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{l.name}</span>
                  <span className="tnum block text-[11px] text-mute">
                    {l.qty} {l.unit ?? ""} × {moneyPlain(l.unitPrice)}₮
                  </span>
                </span>
                <span className="tnum shrink-0 font-semibold">{moneyPlain(l.total)}₮</span>
              </li>
            ))}
          </ul>
          <div className="space-y-1 py-3">
            {row("Дүн", `${moneyPlain(r.subtotal)}₮`)}
            {r.discount > 0 && row("Хөнгөлөлт", `−${moneyPlain(r.discount)}₮`)}
            {r.redeemValue > 0 && row(`Оноогоор (${moneyPlain(r.redeemedPoints)})`, `−${moneyPlain(r.redeemValue)}₮`)}
            {row("Төлсөн", `${moneyPlain(r.total)}₮`, true)}
            {row("Үүнээс НӨАТ", `${moneyPlain(r.vat)}₮`)}
            {row("Төлбөр", METHOD[r.method] ?? r.method)}
            {r.points > 0 && row("Цуглуулсан оноо", `+${moneyPlain(r.points)}`)}
          </div>
          {r.refunds.length > 0 && (
            <div className="space-y-1 border-t border-dashed border-line pt-3">
              {r.refunds.map((x) => row(`Буцаалт ${x.no}`, `−${moneyPlain(x.total)}₮`))}
            </div>
          )}
          <div className="mt-3 rounded-xl bg-stage px-3 py-2.5 text-center">
            <p className="tnum text-[13px] font-bold tracking-[0.08em]">{r.no}</p>
            <p className="mt-0.5 text-[11px] text-mute">{r.ebarimt === "missing_tax_code" ? "И-баримт: татварын код дутуу — дэлгүүр нөхнө" : "И-баримт (ebarimt) хараахан холбогдоогүй"}</p>
          </div>
        </motion.div>
      )}
    </Panel>
  );
}

/* ═════════ Дэлгүүр: байршил, цагийн хуваарь ═════════ */

const DAY_MN: Record<string, string> = { mon: "Да", tue: "Мя", wed: "Лх", thu: "Пү", fri: "Ба", sat: "Бя", sun: "Ня" };
const km = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const stateText = (s: StoreBranch["state"]) =>
  !s.known ? null : s.open ? { on: true, text: s.until === "24:00" ? "Нээлттэй · 24 цаг" : `Нээлттэй · ${s.until} хүртэл` } : { on: false, text: s.opensAt ? `Хаалттай · ${s.opensAt}-д нээнэ` : "Хаалттай" };
/** Нэг өдрийн бүх мөр ижил бол «Өдөр бүр 09:00–22:00» гэж товчилно */
const hoursText = (hs: StoreBranch["hours"]) => {
  if (!hs.length) return null;
  const uniq = new Set(hs.map((h) => `${h.open}–${h.close}`));
  if (hs.length === 7 && uniq.size === 1) return `Өдөр бүр ${[...uniq][0]}`;
  return hs.map((h) => `${DAY_MN[h.day]} ${h.open}–${h.close}`).join(", ");
};

export function StoresTab({ session, programs, busy, onJoin }: { session: string; programs: Program[]; busy: string | null; onJoin: (merchantId: string) => void }) {
  const [branches, setBranches] = useState<StoreBranch[] | null>(null);
  const [me, setMe] = useState<{ lat: number; lng: number } | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "open" | "mine">("all");
  const [map, setMap] = useState<StoreBranch | null>(null);
  useEffect(() => {
    customerApi
      .stores(session)
      .then((r) => setBranches(r.branches))
      .catch(() => setBranches([]));
  }, [session]);
  const locate = () => {
    if (!("geolocation" in navigator)) return setGeoError("Байршил тодорхойлох боломжгүй.");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setMe({ lat: p.coords.latitude, lng: p.coords.longitude });
        setGeoError(null);
      },
      () => setGeoError("Байршлын зөвшөөрөл өгөөгүй."),
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  };

  const list = useMemo(() => {
    const xs = (branches ?? []).filter((b) => (filter === "open" ? b.state.known && b.state.open : filter === "mine" ? b.joined : true));
    const d = (b: StoreBranch) => (me && b.lat !== null && b.lng !== null ? km(me, { lat: b.lat, lng: b.lng }) : null);
    return xs.map((b) => ({ b, dist: d(b) })).sort((x, y) => (x.dist ?? 1e9) - (y.dist ?? 1e9));
  }, [branches, filter, me]);
  // Салбаргүй хөтөлбөр (жишээ нь онлайн) — тусад нь
  const noBranch = programs.filter((p) => !(branches ?? []).some((b) => b.merchantId === p.merchantId));

  return (
    <section className="mt-6">
      <p className="meta">Gerege POS-той</p>
      <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
        Дэлгүүрүүд<span className="text-accent">.</span>
      </h1>
      <p className="mt-2 text-[13px] text-mute">Элсэх шаардлагагүй — касс дээр Gerege QR-аа уншуулахад автоматаар гишүүн болно.</p>

      <div className="no-bar -mx-4 mt-4 flex items-center gap-2 overflow-x-auto px-4">
        <Chip on={filter === "all"} onClick={() => setFilter("all")} outlined>
          Бүгд
        </Chip>
        <Chip on={filter === "open"} onClick={() => setFilter("open")} outlined>
          Одоо нээлттэй
        </Chip>
        <Chip on={filter === "mine"} onClick={() => setFilter("mine")} outlined>
          Миний
        </Chip>
        <button type="button" className="ml-auto shrink-0 text-[12.5px] font-semibold text-ink underline" onClick={locate}>
          {me ? "Ойрхноос эрэмбэлсэн" : "Ойрхныг харах"}
        </button>
      </div>
      {geoError && <p className="mt-2 text-[12px] text-warn">{geoError}</p>}

      <ul className="mt-3 space-y-2">
        {list.map(({ b, dist }, i) => {
          const st = stateText(b.state);
          const hrs = hoursText(b.hours);
          return (
            <motion.li
              key={b.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.3, ease: EASE }}
              className="rounded-[18px] bg-paper px-4 py-3 ring-1 ring-inset ring-hair"
            >
              <div className="flex items-center gap-3">
                <ProgramMark color={b.bgColor ?? "#4002FF"} src={customerApi.logoSrc(b.logoUrl)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">
                    {b.merchantName} <span className="font-semibold text-mute">· {b.name}</span>
                  </span>
                  <span className="block truncate text-[12px] text-mute">
                    {b.address ?? "Хаяг оруулаагүй"}
                    {dist !== null && <span className="tnum"> · {dist < 1 ? `${Math.round(dist * 1000)} м` : `${dist.toFixed(1)} км`}</span>}
                  </span>
                </span>
                {b.joined ? (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold text-ok">Гишүүн</span>
                ) : (
                  <button type="button" className={btnGhost} disabled={busy === b.merchantId} onClick={() => onJoin(b.merchantId)}>
                    {busy === b.merchantId ? "…" : "Элсэх"}
                  </button>
                )}
              </div>
              {(st || hrs) && (
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
                  {st && (
                    <span className={`inline-flex items-center gap-1.5 font-semibold ${st.on ? "text-ok" : "text-danger"}`}>
                      <span className={`size-1.5 rounded-full ${st.on ? "bg-ok" : "bg-danger"}`} />
                      {st.text}
                    </span>
                  )}
                  {hrs && <span className="text-mute">{hrs}</span>}
                </p>
              )}
              {(b.lat !== null || b.phone) && (
                <div className="mt-2.5 flex gap-2">
                  {b.lat !== null && b.lng !== null && (
                    <>
                      <button type="button" className={`${btnGhost} h-9 px-3 text-[12.5px]`} onClick={() => setMap(b)}>
                        Газрын зураг
                      </button>
                      <a className={`${btnGhost} h-9 px-3 text-[12.5px]`} href={`https://www.google.com/maps/dir/?api=1&destination=${b.lat},${b.lng}`} target="_blank" rel="noopener noreferrer">
                        Чиглэл
                      </a>
                    </>
                  )}
                  {b.phone && (
                    <a className={`${btnGhost} h-9 px-3 text-[12.5px]`} href={`tel:${b.phone.replace(/[^\d+]/g, "")}`}>
                      Залгах
                    </a>
                  )}
                </div>
              )}
            </motion.li>
          );
        })}
      </ul>
      {branches && list.length === 0 && <p className="mt-3 rounded-[18px] bg-paper px-4 py-4 text-[13px] text-mute ring-1 ring-inset ring-hair">Тохирох салбар алга.</p>}

      {noBranch.length > 0 && (
        <>
          <SectionHead title="Бусад хөтөлбөр" />
          <ul className="space-y-2">
            {noBranch.map((p) => (
              <li key={p.merchantId} className="flex items-center gap-3 rounded-[18px] bg-paper px-4 py-3 ring-1 ring-inset ring-hair">
                <ProgramMark color={p.card?.bgColor ?? "#4002FF"} src={customerApi.logoSrc(p.card?.logoUrl ?? null)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold text-ink">{p.merchantName}</span>
                  <span className="block truncate text-[12px] text-mute">{p.card?.title ?? "Гишүүний карт"}</span>
                </span>
                {p.joined ? (
                  <span className="rounded-full bg-ok-soft px-2.5 py-1 text-[11px] font-bold text-ok">Гишүүн</span>
                ) : (
                  <button type="button" className={btnGhost} disabled={busy === p.merchantId} onClick={() => onJoin(p.merchantId)}>
                    {busy === p.merchantId ? "…" : "Элсэх"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {map && map.lat !== null && map.lng !== null && (
        <Panel title={`${map.merchantName} · ${map.name}`} onClose={() => setMap(null)}>
          <div className="overflow-hidden rounded-[18px] ring-1 ring-inset ring-hair">
            <iframe
              title="Газрын зураг"
              className="block h-72 w-full"
              loading="lazy"
              referrerPolicy="no-referrer"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${map.lng - 0.008}%2C${map.lat - 0.005}%2C${map.lng + 0.008}%2C${map.lat + 0.005}&layer=mapnik&marker=${map.lat}%2C${map.lng}`}
            />
          </div>
          <p className="mt-2 text-[12.5px] text-ink-2">{map.address}</p>
          <a className={`${btnGhost} mt-3 w-full justify-center`} href={`https://www.google.com/maps/dir/?api=1&destination=${map.lat},${map.lng}`} target="_blank" rel="noopener noreferrer">
            Google Maps-аар чиглэл авах
          </a>
          <p className="mt-2 text-[11px] text-mute">Газрын зураг © OpenStreetMap хувь нэмэрлэгчид</p>
        </Panel>
      )}
    </section>
  );
}
