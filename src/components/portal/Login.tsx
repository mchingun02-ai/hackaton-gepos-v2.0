"use client";

/*
 * Нэвтрэх / бүртгүүлэх (7.1 №1–2, BR01).
 * Нэвтрэлт зөвхөн eID — eID апп дээр тоо тулгаж зөвшөөрнө (QR эсвэл регистрээр).
 * eID-д холбогдсон бүртгэл: эзэмшигч → бүх эрх, ажилтан → эрхийн цэс (BR02-6),
 * олон бол сонгоно (BR01-6). Бүртгэл мөн eID-ээр (BR01-1, 5, 7).
 */

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Wordmark } from "@/components/icons";
import { QrCode } from "@/components/QrCode";
import { EidLogin } from "@/components/sp/EidLogin";
import { Icon } from "@/components/sp/icons";
import { Btn, cx, Notice, Segmented, Spinner, toast, useTheme } from "@/components/sp/ui";
import { eidCancel, eidRequest, useEidReq, type EidAccount } from "@/lib/sp/eid";
import { mutate, registerMerchant } from "@/lib/sp/store";
import { dateTime } from "./kit";
import type { Session } from "./PortalApp";

/** BR01-0: баннерыг маркетинг солино (интерфэйсгүй) — зураг өгвөл зураг харагдана */
export const BANNER: { src: string | null; title: string; body: string } = {
  src: null,
  title: "Касс, хүргэлт, урамшуулал — нэг дор.",
  body: "Store Plus-аар бараа, захиалга, оноо, тайлангаа хаанаас ч удирдана.",
};

const CONSENT_VERSION = "v1.0 (2026-10)";

export default function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const { theme, toggle } = useTheme();
  const enter = useCallback((acc: EidAccount) => onLogin(acc.kind === "owner" ? { kind: "owner" } : { kind: "staff", id: acc.staffId }), [onLogin]);
  return (
    <div className="flex min-h-[100dvh] bg-stage">
      <div className="relative hidden flex-1 p-6 lg:block">
        <Banner />
      </div>
      <div className="flex w-full flex-col lg:w-[560px] lg:shrink-0">
        <div className="flex items-center justify-between px-6 pt-6 sm:px-10">
          <Wordmark size={17} />
          <button type="button" onClick={toggle} aria-label="Сэдэв солих" className="sp-tap grid size-10 place-items-center rounded-full text-mute hover:bg-[var(--sp-fill)]">
            <Icon name={theme === "dark" ? "sun" : "moon"} size={19} />
          </button>
        </div>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[400px]">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={mode} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18 }}>
                {mode === "login" ? (
                  <>
                    <p className="mb-5 text-[13px] font-semibold uppercase tracking-[0.06em] text-mute">Merchant portal</p>
                    <EidLogin client="portal" variant="web" onEnter={enter} onSignup={() => setMode("signup")} />
                  </>
                ) : (
                  <Signup onLogin={onLogin} onBack={() => setMode("login")} />
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
        <div className="flex items-center justify-between px-6 pb-6 text-[12px] text-mute sm:px-10">
          <span>Gerege POS × SUNMI</span>
          <a href="/shop" className="hover:text-ink">
            Захиалгын хуудас
          </a>
        </div>
      </div>
    </div>
  );
}

function Banner() {
  if (BANNER.src)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={BANNER.src} alt={BANNER.title} className="size-full rounded-[28px] object-cover" />;
  return (
    <div className="flex size-full flex-col justify-end overflow-hidden rounded-[28px] bg-ink p-12 text-paper [:root[data-theme=dark]_&]:bg-paper [:root[data-theme=dark]_&]:text-ink [:root[data-theme=dark]_&]:shadow-[0_0_0_0.5px_var(--sp-sep)]">
      <span className="mb-auto inline-flex w-fit items-center gap-2 rounded-full bg-[color-mix(in_oklab,currentColor_12%,transparent)] px-3 py-1.5 text-[12px] font-medium">
        <span className="size-2 rounded-full bg-accent" /> GePOS v2.0 · Store Plus
      </span>
      <h2 className="max-w-[560px] text-[44px] font-bold leading-[1.05] tracking-[-0.04em]">{BANNER.title}</h2>
      <p className="mt-4 max-w-[460px] text-[17px] leading-snug opacity-70">{BANNER.body}</p>
    </div>
  );
}

const Head = ({ title, sub }: { title: string; sub?: ReactNode }) => (
  <div className="mb-6">
    <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink">{title}</h1>
    {sub && <p className="mt-1.5 text-[15px] leading-snug text-mute">{sub}</p>}
  </div>
);

const BackLink = ({ onClick, children }: { onClick: () => void; children: ReactNode }) => (
  <button type="button" onClick={onClick} className="sp-tap mt-3 min-h-[44px] text-[14px] font-semibold text-accent">
    ← {children}
  </button>
);

/* ───────── бүртгүүлэх (BR01-1, 5, 7) ───────── */

/** Туршилтын KYC — eID-ээс татсан мэт. Нэр, РД нь баталгаажуулсан хүнийх. */
function personKyc(name: string, regNo: string): Record<string, string> {
  const [last = "", first = ""] = name.split(" ");
  return {
    Нэр: first || name,
    Овог: last,
    Хүйс: "Эрэгтэй",
    "Иргэний бүртгэлийн дугаар": "03091257",
    "Регистрийн дугаар": regNo,
    "Аймаг/Нийслэл": "Улаанбаатар",
    "Сум/Дүүрэг": "Баянзүрх",
    "Баг/Хороо": "13-р хороо",
    Гудамж: "Энхтайваны өргөн чөлөө",
    Хороолол: "13-р хороолол",
    Хотхон: "—",
    Байр: "45",
    "Хаалганы дугаар": "38",
    "Хаяг (хорооны тодорхойлолт)": "БЗД, 13-р хороо, 45-р байр, 38 тоот",
    "Утасны дугаар": "99887766",
    "Цахим шуудан": "owner@gmail.com",
  };
}
function orgKyc(name: string, regNo: string): Record<string, string> {
  return {
    "Байгууллагын нэр": "Ану Трейд ХХК",
    "Байгууллагын РД": "5123456",
    "Байгуулагдсан огноо": "2021-03-18",
    "Үйл ажиллагааны чиглэл": "Хүнсний жижиглэн худалдаа",
    Хаяг: "Улаанбаатар, Баянзүрх, 13-р хороо, 45-р байр",
    "Эрх бүхий этгээд": `${name} — Гүйцэтгэх захирал`,
    "Эрх бүхий этгээдийн РД": regNo,
  };
}

function Signup({ onLogin, onBack }: { onLogin: (s: Session) => void; onBack: () => void }) {
  const [kind, setKind] = useState<"person" | "org">("org");
  const [agree, setAgree] = useState(false);
  const [step, setStep] = useState<"type" | "eid" | "down" | "kyc">("type");
  const [reqId, setReqId] = useState<string | null>(null);
  const [consentAt, setConsentAt] = useState<string | null>(null);
  const req = useEidReq(reqId);
  const who = req?.status === "approved" ? (req.by ?? null) : null;

  useEffect(() => {
    if (step === "eid" && who) setStep("kyc");
  }, [step, who]);

  const startEid = () => {
    setConsentAt(new Date().toISOString());
    setReqId(eidRequest("portal", "", "qr").id);
    setStep("eid");
  };
  const stop = () => {
    if (reqId) eidCancel(reqId);
    setReqId(null);
  };

  if (step === "type")
    return (
      <>
        <Head title="Бүртгүүлэх" sub="Зөвхөн eID-ээр бүртгүүлнэ. Мэдээлэл тань баталгаат эх сурвалжаас автоматаар орно." />
        <Segmented
          size="lg"
          value={kind}
          onChange={setKind}
          options={[
            { id: "person", label: "Хувь хүн" },
            { id: "org", label: "Байгууллага" },
          ]}
        />
        <div className="mt-5 rounded-[16px] bg-paper p-4 text-[13.5px] leading-relaxed text-ink-2 shadow-[0_0_0_0.5px_var(--sp-sep)]">
          <p className="font-semibold text-ink">Хувийн мэдээлэл боловсруулах зөвшөөрөл</p>
          <p className="mt-1.5">
            Gerege POS нь таны {kind === "org" ? "байгууллагын" : ""} eID-ээс{" "}
            {kind === "org" ? "нэр, РД, байгуулагдсан огноо, чиглэл, хаяг, эрх бүхий этгээдийн" : "нэр, овог, хүйс, регистр, иргэний бүртгэлийн дугаар, хаяг, утас, имэйлийн"} мэдээллийг зөвхөн мерчантын
            бүртгэл, гэрээ, татварын баримтын зорилгоор хадгалж боловсруулна. Гуравдагч этгээдэд дамжуулахгүй. Premium багцын Wallet pass-д харилцагчийн нэр, оноо Apple/Google-ийн сервер рүү дамжина. Хүний
            хувийн мэдээлэл хамгаалах тухай хуулийн дагуу.
          </p>
          <p className="mt-1.5 text-[12px] text-mute">Хувилбар {CONSENT_VERSION}</p>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-[14px] text-ink">
          <input type="checkbox" className="mt-0.5 size-5 accent-[var(--accent)]" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          Зөвшөөрлийн текстийг уншиж, зөвшөөрч байна
        </label>
        <Btn className="mt-6" size="lg" block icon="id" disabled={!agree} onClick={startEid}>
          eID-ээр баталгаажуулах
        </Btn>
        <BackLink onClick={onBack}>Нэвтрэх рүү буцах</BackLink>
      </>
    );

  if (step === "down")
    return (
      <div className="text-center">
        <span className="mx-auto grid size-16 place-items-center rounded-full bg-danger-soft text-danger">
          <Icon name="wifiOff" size={28} />
        </span>
        <h1 className="mt-5 text-[24px] font-bold tracking-[-0.03em] text-ink">eID үйлчилгээ түр ажиллахгүй байна</h1>
        <p className="mx-auto mt-2 max-w-[340px] text-[15px] leading-snug text-mute">Дараа дахин оролдоно уу. Бүртгэл хагас үүсээгүй — ямар ч мэдээлэл хадгалагдаагүй.</p>
        <Btn className="mt-6" size="md" variant="gray" onClick={startEid}>
          Дахин оролдох
        </Btn>
        <div>
          <BackLink onClick={() => setStep("type")}>Буцах</BackLink>
        </div>
      </div>
    );

  if (step === "eid") {
    const url = typeof window !== "undefined" && req ? `${window.location.origin}/eid?req=${req.id}` : "/eid";
    return (
      <>
        <Head title="eID-ээр баталгаажуулах" sub={`eID аппаараа уншуулж, ${kind === "org" ? "байгууллагын" : "хувийн"} мэдээллээ татахыг зөвшөөрнө үү.`} />
        <div className="flex flex-col items-center gap-4 rounded-[18px] bg-paper p-5">
          <div className="rounded-[14px] bg-white p-3">{req ? <QrCode value={url} size={188} /> : <div className="grid size-[188px] place-items-center"><Spinner /></div>}</div>
          {req?.status === "denied" ? (
            <Notice tone="danger">eID апп дээр татгалзсан байна.</Notice>
          ) : (
            <p className="text-center text-[14px] leading-snug text-ink-2">
              Тулгах тоо: <b className="text-ink tnum">{req?.code ?? "··"}</b>
              <span className="mt-2 flex items-center justify-center gap-2 text-mute">
                <Spinner size={16} /> Зөвшөөрөхийг хүлээж байна
              </span>
            </p>
          )}
          <p className="text-center text-[12px] text-mute">
            Туршилт:{" "}
            <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-accent">
              eID аппыг нээх
            </a>
            {" · "}
            <button
              type="button"
              className="font-semibold text-accent"
              onClick={() => {
                stop();
                setStep("down");
              }}
            >
              eID ажиллахгүй үед
            </button>
          </p>
        </div>
        <BackLink
          onClick={() => {
            stop();
            setStep("type");
          }}
        >
          Буцах
        </BackLink>
      </>
    );
  }

  // kyc
  if (!who) return null;
  const kyc = kind === "org" ? orgKyc(who.name, who.regNo) : personKyc(who.name, who.regNo);
  const create = () => {
    const name = kind === "org" ? kyc["Байгууллагын нэр"] : `${kyc["Овог"]} ${kyc["Нэр"]}`;
    const regNo = kind === "org" ? kyc["Байгууллагын РД"] : kyc["Регистрийн дугаар"];
    // Бүртгэл нэг удаа бүтнээр хадгалагдана — хагас бүртгэл үлдэхгүй (BR01-7)
    registerMerchant(
      kind,
      { ...kyc, _consentAt: consentAt ? dateTime(consentAt) : "", _consentVersion: CONSENT_VERSION },
      name,
      regNo,
      "",
      "",
      kind === "person" ? { phone: kyc["Утасны дугаар"], email: kyc["Цахим шуудан"] } : { phone: "", email: "" },
    );
    mutate((s) => ({ ...s, merchant: { ...s.merchant, ownerRegNo: who.regNo } }));
    toast("Бүртгэл амжилттай үүслээ", "ok");
    onLogin({ kind: "owner" });
  };
  return (
    <>
      <Head title="Мэдээллээ шалгана уу" sub="eID-ээс татсан мэдээлэл — засах боломжгүй. Буруу бол eID-ээ шинэчилнэ." />
      <dl className="sp-scroll max-h-[46dvh] overflow-y-auto rounded-[16px] bg-paper shadow-[0_0_0_0.5px_var(--sp-sep)] [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
        {Object.entries(kyc).map(([k, v]) => (
          <div key={k} className="flex min-h-[42px] items-center justify-between gap-4 px-4 py-2 text-[14px]">
            <dt className="shrink-0 text-mute">{k}</dt>
            <dd className="flex min-w-0 items-center gap-1.5 text-right text-ink">
              {v}
              <Icon name="lock" size={12} className="shrink-0 text-mute" />
            </dd>
          </div>
        ))}
      </dl>
      <p className={cx("mt-2 px-1 text-[12px] text-mute")}>
        Баталгаажуулсан: {who.name} · {who.regNo} · зөвшөөрсөн {consentAt ? dateTime(consentAt) : ""} · {CONSENT_VERSION}
      </p>
      <Btn className="mt-5" size="lg" block onClick={create}>
        Бүртгэл үүсгэх
      </Btn>
      <BackLink
        onClick={() => {
          stop();
          setStep("type");
        }}
      >
        Буцах
      </BackLink>
    </>
  );
}
