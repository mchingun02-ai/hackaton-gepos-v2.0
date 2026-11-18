"use client";

/*
 * Тооллого — ажилтны утасны PWA (/count). Дэлгэцүүд (docs/ARCHITECTURE.md §5.6):
 *  1 Холбох (QR/PIN) · 2 Нүүр · 3 Тоолох · 4 Зургийн үр дүн · 5 Илгээх · 6 Хянах (менежер) · 7 Шинэ бараа
 * Андройдын «буцах» товчинд history-оор хариулна. Илгээгээгүй тоо localStorage-д хадгалагдаж, сүлжээ сэргэхэд явна.
 */
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "@/components/sp/ui";
import { AUTH_LOST, flushQueue, QUEUE_EVENT, queued } from "./api";
import { Connect, StaffPin } from "./Auth";
import { Counting } from "./Counting";
import { Home } from "./Home";
import { NewProduct } from "./NewProduct";
import { PhotoResult, type PhotoView } from "./PhotoResult";
import { Review } from "./Review";
import { Submit } from "./Submit";
import type { Me } from "./types";

export type View =
  | { k: "home" }
  | { k: "count"; sid: string; open?: string; scan?: boolean }
  | { k: "photo"; sid: string; shot: PhotoView }
  | { k: "submit"; sid: string }
  | { k: "review"; sid: string }
  | { k: "new"; sid?: string; barcode?: string }
  | { k: "who" };

export type Nav = { go: (v: View) => void; back: () => void; replace: (v: View) => void };

const Loading = () => <div className="grid min-h-dvh place-items-center text-[15px] text-mute">Ачаалж байна…</div>;

export default function CountApp() {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [pair, setPair] = useState<string | null>(null);
  const [stack, setStack] = useState<View[]>([{ k: "home" }]);
  const [pending, setPending] = useState(0);
  const view = stack[stack.length - 1];

  const load = useCallback(async () => {
    try {
      const j = (await fetch("/api/auth/me", { cache: "no-store" }).then((r) => r.json())) as Me | { authenticated: false };
      setMe(j.authenticated ? j : null);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get("pair");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL-ээс нэг удаа (гадаад систем)
    if (p && /^[A-Za-z0-9]{8}$/.test(p)) setPair(p.toUpperCase());
    void load();
    const lost = () => setMe(null);
    window.addEventListener(AUTH_LOST, lost);
    return () => window.removeEventListener(AUTH_LOST, lost);
  }, [load]);

  // Офлайн дараалал: эхлэхэд, сүлжээ сэргэхэд, 15 сек тутам
  useEffect(() => {
    const upd = () => setPending(queued().length);
    const flush = async () => {
      if (!navigator.onLine || !queued().length) return upd();
      const r = await flushQueue();
      if (r.sent) toast(`${r.sent} тоо илгээгдлээ`, "ink");
      for (const f of r.failed) toast(f, "danger");
      upd();
    };
    upd();
    void flush();
    window.addEventListener("online", flush);
    window.addEventListener(QUEUE_EVENT, upd);
    const t = window.setInterval(flush, 15_000);
    return () => {
      window.removeEventListener("online", flush);
      window.removeEventListener(QUEUE_EVENT, upd);
      window.clearInterval(t);
    };
  }, []);

  // Андройдын буцах товч
  useEffect(() => {
    const h = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
    window.addEventListener("popstate", h);
    return () => window.removeEventListener("popstate", h);
  }, []);
  const nav: Nav = {
    go: (v) => {
      window.history.pushState({ c: Date.now() }, "");
      setStack((s) => [...s, v]);
      window.scrollTo(0, 0);
    },
    back: () => {
      if (stack.length > 1) window.history.back();
    },
    replace: (v) => setStack((s) => [...s.slice(0, -1), v]),
  };
  const home = () => {
    const n = stack.length - 1;
    if (n > 0) window.history.go(-n);
    setStack([{ k: "home" }]);
  };

  if (me === undefined) return <Loading />;
  if (!me) return <Connect pairCode={pair} onDone={() => void load()} />;
  if (me.user.role === "device") return <StaffPin storeName={me.tenant.name} onDone={() => void load()} />;
  if (view.k === "who")
    return (
      <StaffPin
        storeName={me.tenant.name}
        canSkip
        onSkip={nav.back}
        onDone={async () => {
          await load();
          home();
        }}
      />
    );

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    setMe(null);
    setStack([{ k: "home" }]);
  };

  return (
    <div className="min-h-dvh bg-stage text-ink">
      {view.k === "home" && <Home me={me} nav={nav} pending={pending} onLogout={logout} />}
      {view.k === "count" && <Counting key={view.sid} sid={view.sid} openProduct={view.open} scanOnOpen={view.scan} me={me} nav={nav} pending={pending} />}
      {/* key: зураг бүрт шинэ төлөв (дараагийн тавиур өмнөхийн мөр, байршлыг өвлөхгүй) */}
      {view.k === "photo" && <PhotoResult key={`${view.shot.url}|${view.shot.resp.photo?.id ?? "similar"}`} sid={view.sid} shot={view.shot} nav={nav} />}
      {view.k === "submit" && <Submit sid={view.sid} nav={nav} onDone={home} pending={pending} />}
      {view.k === "review" && <Review sid={view.sid} me={me} nav={nav} onDone={home} />}
      {view.k === "new" && <NewProduct sid={view.sid} barcode={view.barcode} nav={nav} />}
      <Toaster bottom={110} />
    </div>
  );
}
