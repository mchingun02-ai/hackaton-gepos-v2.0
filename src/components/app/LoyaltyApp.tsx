"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import {
  type AuthConfig,
  type CustomerProfile,
  type HistoryEntry,
  type Membership,
  type Program,
  type Promo,
  type PromoTeaser,
  CustomerApiError,
  OFFLINE,
  customerApi,
  readCache,
  readToken,
  saveCache,
  saveToken,
} from "@/lib/customer-api";
import { Wordmark, IconLogout, IconQr } from "@/components/icons";
import { Field, PrimaryButton, btnGhost } from "@/components/ui";
import { Panel, SectionHead } from "@/components/app/AppUi";
import { MembershipCard } from "@/components/app/MembershipCard";
import { BottomNav, type Tab } from "@/components/app/CustomerApp";
import { PromoStrip, PromoTab } from "@/components/app/LoyaltyPromos";
import { GeregeQrCard, RedemptionPrompt, useGeregeQr, usePendingRedemption } from "@/components/app/GeregeQr";
import { BellButton, NotificationsPanel, ReceiptsSection, StoresTab, useNotifications } from "@/components/app/AppExtras";
import { CardDetail, CardStack, Sheet } from "@/components/app/WalletStack";
import { CardsRow, GeregePayCard, TopupSheet, WalletActivity, WalletPayPrompt, usePendingWalletPayment, useWallet } from "@/components/app/GeregeWallet";

const EASE = [0.2, 0.8, 0.2, 1] as const;

/**
 * Gerege хэрэглэгчийн апп — СЕРВЕРИЙН гишүүнчлэл (байгууллага бүрийн карт, оноо, зэрэглэл, түүх).
 * Demo хувилбартай ижил header, доод цэс. Нэвтрэлт: утас + SMS код эсвэл Gerege eID.
 * Сүлжээ тасарвал сүүлд уншсан утгыг «хуучирсан» гэж тэмдэглэнэ — шинэ мэт харуулахгүй.
 * Apple / Google Wallet холбогдоогүй — товч, «нэмэгдлээ» мэдэгдэл харуулахгүй.
 * Урамшуулал: элссэн дэлгүүрүүдийн онооны урамшуулал (серверээс; купонгүй — касс дээр QR-аар автоматаар).
 */

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export default function LoyaltyApp() {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // eID-ээс буцаж ирэхэд #gp_login=<нэг удаагийн код> → session
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const code = hash.get("gp_login");
    const failed = hash.get("gp_login_error");
    if (code || failed) window.history.replaceState(null, "", window.location.pathname);
    const start = async () => {
      if (code) {
        try {
          const res = await customerApi.exchange(code);
          saveToken(res.token);
        } catch (e) {
          setLoginError(e instanceof CustomerApiError ? e.message : "eID нэвтрэлт амжилтгүй.");
        }
      } else if (failed) setLoginError("eID нэвтрэлт амжилтгүй. Дахин оролдоно уу.");
      setToken(readToken());
      setReady(true);
    };
    void start();
  }, []);

  if (!ready) return <main className="min-h-dvh bg-stage" />;
  if (!token) {
    return (
      <Login
        error={loginError}
        onLogin={(t) => {
          saveToken(t);
          setToken(t);
          setLoginError(null);
        }}
      />
    );
  }
  return (
    <Signed
      token={token}
      onLogout={() => {
        customerApi.logout(token).catch(() => {});
        saveToken(null);
        setToken(null);
      }}
      onExpired={() => {
        saveToken(null);
        setToken(null);
        setLoginError("Нэвтрэлтийн хугацаа дууссан. Дахин нэвтэрнэ үү.");
      }}
    />
  );
}

/* ───────────────────────── Нэвтрэх ───────────────────────── */

function Login({ onLogin, error }: { onLogin: (token: string) => void; error: string | null }) {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(error);
  const [devCode, setDevCode] = useState<string | null>(null);

  useEffect(() => {
    customerApi.config().then(setConfig).catch(() => setNote("Сервертэй холбогдож чадсангүй."));
  }, []);

  const ask = async () => {
    setBusy(true);
    setNote(null);
    try {
      const r = await customerApi.requestOtp(phone);
      setDevCode(r.devCode ?? null);
      setStep("code");
    } catch (e) {
      setNote(e instanceof CustomerApiError ? e.message : "Код илгээж чадсангүй.");
    } finally {
      setBusy(false);
    }
  };
  const verify = async () => {
    setBusy(true);
    setNote(null);
    try {
      onLogin((await customerApi.verifyOtp(phone, code)).token);
    } catch (e) {
      setNote(e instanceof CustomerApiError ? e.message : "Нэвтэрч чадсангүй.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-dvh bg-stage">
      <div className="mx-auto w-full max-w-[440px] px-4 pb-10 pt-5">
        <Wordmark />
        <section className="mt-8">
          <p className="meta">Gerege гишүүнчлэл</p>
          <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
            Нэвтрэх<span className="text-accent">.</span>
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">Дэлгүүр бүрийн гишүүний карт, оноо нэг дор. Оноо тухайн дэлгүүрт л хуримтлагдана.</p>
        </section>

        <div className="mt-6 space-y-3 rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
          {config && !config.sms && !config.eid && <p className="text-[13px] text-mute">Нэвтрэх үйлчилгээ одоогоор тохируулагдаагүй байна.</p>}
          {config?.sms &&
            (step === "phone" ? (
              <>
                <Field label="Утасны дугаар" value={phone} onChange={(v) => setPhone(v.slice(0, 8))} placeholder="99112233" numeric />
                <PrimaryButton onClick={ask} disabled={busy || phone.length !== 8} arrow={false}>
                  {busy ? "Илгээж байна…" : "Код авах"}
                </PrimaryButton>
              </>
            ) : (
              <>
                <p className="text-[13px] text-ink-2">{phone} дугаарт 6 оронтой код илгээлээ.</p>
                {devCode && (
                  <p className="rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">
                    Туршилтын орчин — SMS илгээгдээгүй. Код: <span className="tnum">{devCode}</span>
                  </p>
                )}
                <Field label="Код" value={code} onChange={(v) => setCode(v.slice(0, 6))} placeholder="000000" numeric />
                <PrimaryButton onClick={verify} disabled={busy || code.length !== 6} arrow={false}>
                  {busy ? "Шалгаж байна…" : "Нэвтрэх"}
                </PrimaryButton>
                <button type="button" className="text-[12.5px] font-semibold text-mute hover:text-ink" onClick={() => { setStep("phone"); setCode(""); setDevCode(null); }}>
                  Өөр дугаар
                </button>
              </>
            ))}
          {config?.eid && (
            <a href={customerApi.eidStartUrl() ?? "#"} className={`${btnGhost} w-full justify-center`}>
              Gerege eID-ээр нэвтрэх
            </a>
          )}
          {note && (
            <p role="alert" className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
              {note}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}

/* ───────────────────────── Нэвтэрсэн ───────────────────────── */

type Status = { fresh: boolean; asOf: string | null; error: string | null };

function Signed({ token, onLogout, onExpired }: { token: string; onLogout: () => void; onExpired: () => void }) {
  const [tab, setTab] = useState<Tab>("home");
  const [me, setMe] = useState<CustomerProfile | null>(null);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [promos, setPromos] = useState<Promo[]>([]);
  const [others, setOthers] = useState<PromoTeaser[]>([]);
  const [history, setHistory] = useState<Record<string, HistoryEntry[]>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>({ fresh: false, asOf: null, error: null });
  const [showQr, setShowQr] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  // Хэтэвчинд дарсан карт — дэлгэрэнгүй нээлттэй
  const [openCard, setOpenCard] = useState<Membership | null>(null);
  const closeCard = useCallback(() => setOpenCard(null), []);

  const handle = useCallback(
    (e: unknown) => {
      if (e instanceof CustomerApiError && e.status === 401) onExpired();
      return e instanceof CustomerApiError ? e : new CustomerApiError(OFFLINE, "Алдаа гарлаа.");
    },
    [onExpired],
  );

  const load = useCallback(async () => {
    try {
      const [m, p, profile, pr] = await Promise.all([
        customerApi.memberships(token),
        customerApi.programs(token),
        customerApi.me(token),
        // Урамшуулал ачаалагдахгүй бол карт, оноог хаахгүй
        customerApi.promos(token).catch((e) => {
          if (e instanceof CustomerApiError && e.status === 401) throw e;
          return null;
        }),
      ]);
      const hist: Record<string, HistoryEntry[]> = {};
      await Promise.all(m.memberships.map(async (x) => (hist[x.id] = (await customerApi.history(token, x.id)).history)));
      setMemberships(m.memberships);
      setPrograms(p.programs);
      setMe(profile.customer);
      setHistory(hist);
      if (pr) {
        setPromos(pr.promos);
        setOthers(pr.others);
      }
      setStatus({ fresh: true, asOf: m.asOf, error: null });
      saveCache({ memberships: m.memberships, history: hist, asOf: m.asOf, me: profile.customer, promos: pr?.promos ?? readCache()?.promos });
    } catch (e) {
      const err = handle(e);
      if (err.status === 401) return;
      // Сүлжээгүй/алдаа — сүүлд амжилттай уншсан хуулбар (хуучирсан гэж тэмдэглэнэ)
      const cache = readCache();
      if (cache) {
        setMemberships(cache.memberships);
        setHistory(cache.history);
        if (cache.me) setMe(cache.me);
        if (cache.promos) setPromos(cache.promos);
      }
      setStatus({ fresh: false, asOf: cache?.asOf ?? null, error: err.status === OFFLINE ? "Сүлжээгүй байна." : err.message });
    }
  }, [token, handle]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    const again = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", again);
    window.addEventListener("online", again);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("online", again);
    };
  }, [load]);

  const current = memberships.find((m) => m.id === selected) ?? memberships[0] ?? null;
  const holder = me?.displayName ?? me?.phone ?? "Гишүүн";

  /* Нэг Gerege QR: нүүр эсвэл QR цонх харагдаж байх үед л шинэчилж, касс илгээсэн зарцуулах хүсэлтийг асууна */
  const qrActive = Boolean(me?.qrConsent) && (tab === "home" || showQr);
  const gq = useGeregeQr(token, qrActive, onExpired);
  const { pending, done } = usePendingRedemption(token, qrActive);
  // Gerege хэтэвч (₮): үлдэгдэл, гүйлгээ; касс хэтэвчээр төлөх хүсэлт илгээвэл QR харагдаж байх үед асууна
  const wallet = useWallet(token, tab === "wallet" || showQr, onExpired);
  const walletPay = usePendingWalletPayment(token, qrActive);
  const [showCards, setShowCards] = useState(false);
  const [showTopup, setShowTopup] = useState(false);
  const closeCards = useCallback(() => setShowCards(false), []);
  const giveConsent = async () => {
    try {
      await customerApi.qrConsent(token);
      setMe((m) => (m ? { ...m, qrConsent: true } : m));
    } catch (e) {
      setStatus((s) => ({ ...s, error: handle(e).message }));
    }
  };
  // Мэдэгдэл (30 сек тутам) ба push тохиргоо
  const notif = useNotifications(token, true);
  const [showNotif, setShowNotif] = useState(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  useEffect(() => {
    customerApi.config().then(setConfig).catch(() => {});
  }, []);
  // Сүлжээгүй / QR авч чадаагүй үед картын статик QR-ыг нөөц болгон харуулна (зөвхөн оноо цуглуулна)
  const fallbackQr = Boolean(gq.error) || !me?.qrConsent;

  const join = async (merchantId: string) => {
    setBusy(merchantId);
    try {
      const r = await customerApi.join(token, merchantId);
      setSelected(r.membership.id);
      await load();
    } catch (e) {
      setStatus((s) => ({ ...s, error: handle(e).message }));
    } finally {
      setBusy(null);
    }
  };
  const rotate = async (id: string) => {
    if (!window.confirm("QR-ыг шинэчлэх үү? Хуучин QR (зураг, хэвлэсэн) шууд хүчингүй болно.")) return;
    setBusy(id);
    try {
      await customerApi.rotate(token, id);
      await load();
    } catch (e) {
      setStatus((s) => ({ ...s, error: handle(e).message }));
    } finally {
      setBusy(null);
    }
  };

  const card = (m: Membership, qrSize = 72, showQr = false) => (
    <MembershipCard
      title={m.card?.title ?? m.merchantName}
      merchant={m.merchantName}
      description={m.card?.description}
      bgColor={m.card?.bgColor ?? "#4002FF"}
      textColor={m.card?.textColor ?? "#FFFFFF"}
      logoSrc={customerApi.logoSrc(m.card?.logoUrl ?? null)}
      holder={holder}
      tierName={m.tierName}
      points={m.points}
      qr={m.qr}
      stale={!status.fresh}
      qrSize={qrSize}
      showQr={showQr}
      animated
    />
  );

  const staleBanner = !status.fresh && (status.asOf || status.error) && (
    <p role="status" className="mt-4 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">
      {status.error ?? "Шинэчилж чадсангүй."} {status.asOf ? `${hhmm(status.asOf)}-ийн мэдээлэл — оноо өөрчлөгдсөн байж болно.` : "Мэдээлэл алга."}{" "}
      <button type="button" className="underline" onClick={() => void load()}>
        Дахин оролдох
      </button>
    </p>
  );

  const historyList = (m: Membership, limit?: number) => {
    const rows = (history[m.id] ?? []).slice(0, limit);
    if (!rows.length) return <p className="rounded-xl bg-paper px-4 py-3 text-[13px] text-mute ring-1 ring-inset ring-hair">Онооны хөдөлгөөн алга.</p>;
    return (
      <ul className="divide-y divide-hair rounded-[18px] bg-paper ring-1 ring-inset ring-hair">
        {rows.map((h, i) => (
          <motion.li key={h.id} className="flex items-center gap-3 px-4 py-3" initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: Math.min(i, 8) * 0.035, duration: 0.3, ease: EASE }}>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold text-ink">
                {h.kind === "earn" ? "Худалдан авалт" : h.kind === "reverse" ? "Буцаалт" : h.kind === "redeem" ? "Оноо зарцуулсан" : h.kind === "redeem_reverse" ? "Зарцуулалт буцсан" : "Залруулга"}
                {h.saleNo && <span className="tnum font-normal text-mute"> · {h.refundNo ?? h.saleNo}</span>}
              </span>
              <span className="block text-[11.5px] text-mute">
                {hhmm(h.at)}
                {h.kind === "earn" && h.amount !== null && ` · ${moneyPlain(h.amount)}₮`}
                {h.note && ` · ${h.note}`}
              </span>
            </span>
            <span className={`tnum text-[14px] font-bold ${h.points > 0 ? "text-ok" : "text-danger"}`}>
              {h.points > 0 ? "+" : ""}
              {moneyPlain(h.points)}
            </span>
          </motion.li>
        ))}
      </ul>
    );
  };


  return (
    <MotionConfig reducedMotion="user">
      <main className="min-h-dvh bg-stage">
        <div className="mx-auto w-full max-w-[440px] px-4 pb-[calc(96px+env(safe-area-inset-bottom))] pt-4">
          <header className="flex items-center gap-1">
            <Wordmark />
            <span className="ml-auto" />
            <BellButton
              unread={notif.unread}
              onClick={() => {
                setShowNotif(true);
                void notif.load();
              }}
            />
            <button type="button" onClick={() => setShowQr(true)} disabled={!me?.qrConsent && !current} aria-label="Миний QR" className="press grid size-10 place-items-center rounded-xl text-ink hover:bg-paper disabled:opacity-40">
              <IconQr />
            </button>
          </header>
          {staleBanner}

          <AnimatePresence mode="wait" initial={false}>
          <motion.div key={tab} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22, ease: EASE }}>
          {tab === "home" && (
            <>
              <section className="mt-6">
                <p className="meta">Gerege гишүүнчлэл</p>
                <h1 className="mt-1.5 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
                  Сайн байна уу<span className="text-accent">.</span>
                </h1>
              </section>
              <section className="mt-5">
                <GeregeQrCard qr={gq.qr} left={gq.left} ttl={gq.ttl} error={gq.error} consent={Boolean(me?.qrConsent)} onConsent={() => void giveConsent()} onExpand={() => setShowQr(true)} />
              </section>
              {memberships.length > 1 && (
                <div className="no-bar -mx-4 mt-4 flex gap-2 overflow-x-auto px-4">
                  {memberships.map((m) => (
                    <button key={m.id} type="button" className="chip" aria-pressed={current?.id === m.id} onClick={() => setSelected(m.id)}>
                      {m.merchantName}
                    </button>
                  ))}
                </div>
              )}
              {current ? (
                <>
                  <section className="mt-4">
                    <AnimatePresence mode="popLayout" initial={false}>
                      <motion.div key={current.id} initial={{ opacity: 0, y: 18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ duration: 0.4, ease: EASE }}>
                        {card(current, 72, fallbackQr)}
                      </motion.div>
                    </AnimatePresence>
                  </section>
                  <PromoStrip promos={promos.filter((p) => p.merchantId === current.merchantId).concat(promos.filter((p) => p.merchantId !== current.merchantId))} onAll={() => setTab("deals")} />
                  <SectionHead title="Сүүлийн хөдөлгөөн" action={<button type="button" className="text-[12.5px] font-semibold text-mute" onClick={() => setTab("wallet")}>Бүгд</button>} />
                  {historyList(current, 5)}
                </>
              ) : (
                <div className="mt-4 rounded-[18px] bg-paper px-4 py-4 text-[13.5px] leading-relaxed text-ink-2 ring-1 ring-inset ring-hair">
                  Gerege POS-той дэлгүүрийн касс дээр дээрх QR-аа уншуулахад тухайн дэлгүүрийн гишүүн автоматаар болж, карт энд гарна.{" "}
                  <button type="button" className="font-semibold text-ink underline" onClick={() => setTab("stores")}>
                    Дэлгүүрүүд
                  </button>
                </div>
              )}
            </>
          )}

          {tab === "deals" && <PromoTab promos={promos} others={others} busy={busy} onJoin={(id) => void join(id)} />}

          {tab === "stores" && <StoresTab session={token} programs={programs} busy={busy} onJoin={(id) => void join(id)} />}

          {tab === "wallet" && (
            <section className="mt-6">
              <h1 className="text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">Хэтэвч<span className="text-accent">.</span></h1>
              <div className="mt-5">
                <GeregePayCard
                  balance={wallet.state?.wallet.balance ?? 0}
                  loading={!wallet.state}
                  holder={holder}
                  onTopup={() => setShowTopup(true)}
                  onPay={() => setShowQr(true)}
                />
                {wallet.error && !wallet.state && (
                  <p role="status" className="mt-2 rounded-xl bg-warn-soft px-3.5 py-2.5 text-[12.5px] font-semibold text-warn">
                    {wallet.error}{" "}
                    <button type="button" className="underline" onClick={() => void wallet.load()}>
                      Дахин оролдох
                    </button>
                  </p>
                )}
              </div>
              <div className="mt-4">
                <CardsRow memberships={memberships} logoOf={(m) => customerApi.logoSrc(m.card?.logoUrl ?? null)} onOpen={() => setShowCards(true)} />
              </div>
              <SectionHead title="Гүйлгээ" />
              <WalletActivity ledger={wallet.state?.ledger ?? []} />
              <ReceiptsSection session={token} active={tab === "wallet"} />
            </section>
          )}

          {tab === "me" && (
            <section className="mt-6 space-y-3">
              <h1 className="text-[26px] font-extrabold tracking-[-0.04em] text-ink">Миний<span className="text-accent">.</span></h1>
              <div className="rounded-[18px] bg-paper px-4 py-4 ring-1 ring-inset ring-hair">
                <p className="text-[15px] font-bold text-ink">{holder}</p>
                <p className="text-[12.5px] text-mute">{me?.authMethod === "eid" ? "Gerege eID-ээр баталгаажсан" : "Утсаар баталгаажсан"}</p>
              </div>
              <SectionHead title="Гишүүнчлэл" />
              <ul className="space-y-2">
                {memberships.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 rounded-[18px] bg-paper px-4 py-3 ring-1 ring-inset ring-hair">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-bold text-ink">{m.merchantName}</span>
                      <span className="block text-[12px] text-mute">{m.tierName} · {moneyPlain(m.points)} оноо</span>
                    </span>
                    <button type="button" className={btnGhost} disabled={busy === m.id} onClick={() => void rotate(m.id)}>
                      QR шинэчлэх
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={onLogout} className={`${btnGhost} w-full justify-center`}>
                <IconLogout />
                Гарах
              </button>
            </section>
          )}
          </motion.div>
          </AnimatePresence>
        </div>

        <BottomNav tab={tab} onTab={setTab} />

        {/* Хэтэвч → «Миний картууд»: гишүүний картууд Apple Wallet шиг давхарласан */}
        <AnimatePresence>
          {showCards && (
            <Sheet title="Миний картууд" back="Хэтэвч" onClose={closeCards}>
              {memberships.length === 0 ? (
                <div className="rounded-[22px] bg-paper p-5 text-center ring-1 ring-inset ring-hair">
                  <p className="text-[16px] font-bold text-ink">Карт хараахан алга</p>
                  <p className="mx-auto mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-mute">
                    Gerege POS-той дэлгүүрийн касс дээр Gerege QR-аа уншуулахад тухайн дэлгүүрийн карт энд автоматаар нэмэгдэж, оноо, баримт хадгалагдана.
                  </p>
                  <div className="mt-4 flex justify-center gap-2">
                    <button type="button" className={btnGhost} onClick={() => { closeCards(); setTab("home"); }}>
                      Gerege QR
                    </button>
                    <button type="button" className={btnGhost} onClick={() => { closeCards(); setTab("stores"); }}>
                      Дэлгүүрүүд
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <CardStack
                    items={memberships}
                    open={openCard?.id ?? null}
                    onOpen={(id) => {
                      setSelected(id);
                      setOpenCard(memberships.find((m) => m.id === id) ?? null);
                    }}
                    render={(m) => card(m)}
                  />
                  <p className="mt-3 px-1 text-[12px] leading-relaxed text-mute">Оноо тухайн дэлгүүрт л хуримтлагдана. Картаа дарж дэлгэрэнгүй, түүхийг харна.</p>
                </>
              )}
            </Sheet>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {openCard && (
            <CardDetail
              key={openCard.id}
              m={memberships.find((m) => m.id === openCard.id) ?? openCard}
              card={card(memberships.find((m) => m.id === openCard.id) ?? openCard)}
              history={historyList(openCard)}
              onClose={closeCard}
              onQr={() => setShowQr(true)}
              onStores={() => {
                closeCard();
                setTab("stores");
              }}
            />
          )}
        </AnimatePresence>

        {showQr && (
          <Panel
            title="Gerege QR"
            onClose={() => {
              setShowQr(false);
              void wallet.load();
            }}
          >
            {me?.qrConsent ? (
              <GeregeQrCard qr={gq.qr} left={gq.left} ttl={gq.ttl} error={gq.error} consent onConsent={() => void giveConsent()} size={220} />
            ) : (
              <GeregeQrCard qr={null} left={0} ttl={120} error={null} consent={false} onConsent={() => void giveConsent()} />
            )}
            <p className="mt-3 text-[12.5px] leading-relaxed text-mute">
              Нэг удаагийн QR — зураг авч хуулах, бусдад өгөх боломжгүй. Хэтэвчээр төлөх, оноо зарцуулахад касс хүсэлт илгээж, та энд зөвшөөрнө.
            </p>
            {fallbackQr && current && (
              <div className="mt-4">
                <p className="mb-2 text-[12px] font-semibold text-warn">Сүлжээгүй үед: {current.merchantName}-ийн картын QR (зөвхөн оноо цуглуулна)</p>
                {card(current, 96, true)}
              </div>
            )}
          </Panel>
        )}

        {showNotif && (
          <NotificationsPanel
            session={token}
            config={config}
            items={notif.items}
            onClose={() => {
              setShowNotif(false);
              void notif.markSeen();
            }}
          />
        )}

        {showTopup && wallet.state && <TopupSheet session={token} wallet={wallet.state} onClose={() => setShowTopup(false)} onDone={() => void wallet.load()} />}

        {walletPay.pending && (
          <WalletPayPrompt
            session={token}
            pending={walletPay.pending}
            balance={wallet.state?.wallet.balance ?? null}
            onDone={(id, approved) => {
              walletPay.done(id);
              if (approved) {
                // Касс борлуулалтаа дуусгасны дараа үлдэгдэл, гүйлгээ, оноо шинэчлэгдэнэ (касс удааширч болно — 2 минут хүртэл)
                for (const ms of [2500, 8000, 20000, 45000, 90000]) setTimeout(() => void Promise.all([wallet.load(), load()]), ms);
              }
            }}
          />
        )}

        {pending && (
          <RedemptionPrompt
            session={token}
            pending={pending}
            onDone={(id, approved) => {
              done(id);
              if (approved) {
                setTimeout(() => void load(), 2500);
                setTimeout(() => void load(), 8000);
              }
            }}
          />
        )}
      </main>
    </MotionConfig>
  );
}

