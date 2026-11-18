"use client";

/*
 * eID-ээр нэвтрэх — веб ба мерчантын апп хоёулаа зөвхөн энэ замаар нэвтэрнэ.
 * 1) РД оруулна (вебэд QR-аар ч болно) → 2) eID апп руу хүсэлт очно,
 * дэлгэц дээрх 2 оронтой тоог аппад тулгаж зөвшөөрнө → 3) бүртгэл сонгоно.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { QrCode } from "@/components/QrCode";
import { useSp } from "@/lib/sp/store";
import { eidAccounts, eidCancel, eidName, eidRequest, normReg, useEidReq, validReg, type EidAccount, type EidClient } from "@/lib/sp/eid";
import { Btn, Notice, Segmented, Spinner, cx } from "./ui";
import { Icon } from "./icons";

export function EidLogin({
  client,
  onEnter,
  onSignup,
  variant,
}: {
  client: EidClient;
  /** Сонгосон бүртгэлээр нэвтэрнэ */
  onEnter: (acc: EidAccount, who: { regNo: string; name: string }) => void;
  onSignup?: () => void;
  /** web — QR сонголттой; mobile — eID апп нээх товчтой */
  variant: "web" | "mobile";
}) {
  const s = useSp();
  const [method, setMethod] = useState<"regno" | "qr">(variant === "web" ? "qr" : "regno");
  const [reg, setReg] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [reqId, setReqId] = useState<string | null>(null);
  const req = useEidReq(reqId);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!reqId) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [reqId]);

  // QR горимд шууд хүсэлт үүсгэнэ
  useEffect(() => {
    if (method === "qr" && !reqId) setReqId(eidRequest(client, "", "qr").id);
  }, [method, reqId, client]);

  const who = req?.status === "approved" ? req.by ?? null : null;
  const accounts = useMemo(() => (who ? eidAccounts(s, who.regNo) : []), [s, who]);

  // Ганц бүртгэлтэй бол шууд нэвтэрнэ — нэг хүсэлтэд нэг л удаа
  const enterRef = useRef(onEnter);
  useEffect(() => {
    enterRef.current = onEnter;
  });
  const entered = useRef<string | null>(null);
  useEffect(() => {
    if (who && accounts.length === 1 && req && entered.current !== req.id) {
      entered.current = req.id;
      eidCancel(req.id);
      enterRef.current(accounts[0], who);
    }
  }, [who, accounts, req]);

  const send = () => {
    const r = normReg(reg);
    if (!validReg(r)) {
      setErr("Регистрийн дугаар 2 үсэг, 8 тооноос бүрдэнэ. Жишээ: УБ85032114");
      return;
    }
    setErr(null);
    setReqId(eidRequest(client, r).id);
  };
  const reset = () => {
    if (reqId) eidCancel(reqId);
    setReqId(null);
    if (method === "qr") setTimeout(() => setReqId(eidRequest(client, "", "qr").id), 0);
  };

  const left = req ? Math.max(0, Math.ceil((req.expires - now) / 1000)) : 0;
  const expired = req?.status === "pending" && left === 0;
  const eidUrl = typeof window !== "undefined" ? `${window.location.origin}/eid?req=${req?.id ?? ""}` : "/eid";

  /* ── 3. бүртгэл сонгох / олдсонгүй ── */
  if (who) {
    if (accounts.length === 0)
      return (
        <div className="space-y-4">
          <Head title="Бүртгэл олдсонгүй" sub={`${who.name} (${who.regNo}) eID-ээр баталгаажлаа, гэхдээ Store Plus-д холбогдсон бүртгэл алга.`} />
          {onSignup && (
            <Btn block onClick={onSignup}>
              eID-ээр бүртгүүлэх
            </Btn>
          )}
          <Btn block variant="gray" onClick={() => setReqId(null)}>
            Өөр eID-ээр нэвтрэх
          </Btn>
        </div>
      );
    if (accounts.length === 1)
      return (
        <div className="flex flex-col items-center gap-3 py-10 text-mute">
          <Spinner size={26} />
          <span className="text-[15px]">Нэвтэрч байна…</span>
        </div>
      );
    return (
      <div className="space-y-4">
        <Head title="Бүртгэл сонгох" sub={`${who.name} — энэ eID-д ${accounts.length} бүртгэл холбогдсон байна.`} />
        <div className="overflow-hidden rounded-[18px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
          {accounts.map((a) => (
            <button key={a.kind === "staff" ? a.staffId : "owner"} type="button" onClick={() => { if (req) eidCancel(req.id); onEnter(a, who); }} className="sp-row flex min-h-[64px] w-full items-center gap-3 px-4 py-3 text-left">
              <span className={cx("grid size-10 shrink-0 place-items-center rounded-full", a.kind === "owner" ? "bg-ink text-paper" : "bg-[var(--sp-fill)] text-ink")}>
                <Icon name={a.kind === "owner" ? "building" : "person"} size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[16px] font-semibold text-ink">{a.title}</span>
                <span className="block text-[13px] text-mute">{a.sub}</span>
              </span>
              <Icon name="chevron" size={17} className="text-[var(--line)]" />
            </button>
          ))}
        </div>
      </div>
    );
  }

  /* ── 2. eID апп дээр зөвшөөрөхийг хүлээх ── */
  if (req && method === "regno") {
    return (
      <div className="space-y-5">
        <Head title="eID аппаа нээнэ үү" sub={`${req.regNo} руу нэвтрэх хүсэлт илгээлээ. Аппад гарсан тоонуудаас доорхыг сонгож зөвшөөрнө үү.`} />
        <Code code={req.code} />
        {req.status === "denied" ? (
          <Notice tone="danger">eID апп дээр татгалзсан байна.</Notice>
        ) : expired ? (
          <Notice tone="warn">Хүсэлтийн хугацаа дууслаа.</Notice>
        ) : (
          <Waiting left={left} />
        )}
        <div className="grid gap-2">
          {req.status === "denied" || expired ? (
            <Btn block onClick={() => setReqId(eidRequest(client, req.regNo).id)}>
              Дахин илгээх
            </Btn>
          ) : (
            variant === "mobile" && (
              <Btn block icon="id" onClick={() => window.open(eidUrl, "_blank")}>
                eID апп нээх
              </Btn>
            )
          )}
          <Btn block variant="plain" onClick={reset}>
            Болих
          </Btn>
        </div>
        <DemoHint url={eidUrl} />
      </div>
    );
  }

  /* ── 1. эхлэл ── */
  return (
    <div className="space-y-5">
      <Head title="eID-ээр нэвтрэх" sub="Нууц үг хэрэггүй. Gerege eID аппаараа баталгаажуулна." />
      {variant === "web" && (
        <Segmented
          size="lg"
          value={method}
          onChange={(m) => {
            if (reqId) eidCancel(reqId);
            setReqId(null);
            setMethod(m);
          }}
          options={[
            { id: "qr", label: "QR кодоор" },
            { id: "regno", label: "Регистрээр" },
          ]}
        />
      )}

      {method === "qr" ? (
        <div className="flex flex-col items-center gap-4 rounded-[18px] bg-paper p-5">
          <div className={cx("grid size-[212px] place-items-center rounded-[14px] bg-white p-3 transition-opacity", (expired || req?.status === "denied") && "opacity-20")}>
            {req ? <QrCode value={eidUrl} size={188} /> : <Spinner size={22} />}
          </div>
          {req?.status === "denied" ? (
            <Notice tone="danger">eID апп дээр татгалзсан байна.</Notice>
          ) : expired ? (
            <Btn variant="tinted" onClick={reset}>
              Шинэ QR авах
            </Btn>
          ) : (
            <>
              <p className="text-center text-[14px] leading-snug text-ink-2">
                eID аппаа нээгээд <b>«QR уншуулах»</b>-аар энэ кодыг уншуулна уу. Тулгах тоо: <b className="text-ink tnum">{req?.code ?? "··"}</b>
              </p>
              <Waiting left={left} />
            </>
          )}
          <DemoHint url={eidUrl} />
        </div>
      ) : (
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-mute">Регистрийн дугаар</span>
            <input
              className="sp-field uppercase"
              value={reg}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="УБ85032114"
              onChange={(e) => {
                setReg(e.target.value);
                setErr(null);
              }}
              onKeyDown={(e) => e.key === "Enter" && send()}
              aria-invalid={!!err}
              aria-describedby={err ? "eid-err" : undefined}
            />
            {err && (
              <span id="eid-err" className="mt-1.5 block text-[13px] text-danger">
                {err}
              </span>
            )}
          </label>
          <Btn block icon="id" onClick={send} disabled={!reg.trim()}>
            eID руу хүсэлт илгээх
          </Btn>
        </div>
      )}

      {onSignup && (
        <p className="text-center text-[14px] text-mute">
          Бүртгэлгүй юу?{" "}
          <button type="button" onClick={onSignup} className="sp-tap inline-flex min-h-11 items-center font-semibold text-accent">
            eID-ээр бүртгүүлэх
          </button>
        </p>
      )}
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div>
      <h1 className="text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-snug text-mute">{sub}</p>
    </div>
  );
}

function Code({ code }: { code: string }) {
  return (
    <div className="flex flex-col items-center rounded-[18px] bg-paper py-6" role="status" aria-label={`Тулгах тоо ${code}`}>
      <span className="text-[13px] font-medium text-mute">Тулгах тоо</span>
      <span className="mt-1 text-[56px] font-bold leading-none tracking-[-0.04em] text-ink tnum">{code}</span>
    </div>
  );
}

function Waiting({ left }: { left: number }) {
  return (
    <div className="flex items-center justify-center gap-2 text-[14px] text-mute" aria-live="polite">
      <Spinner size={16} />
      eID апп дээр зөвшөөрөхийг хүлээж байна · {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}
    </div>
  );
}

/** Туршилт: бодит eID апп байхгүй тул /eid хуудас түүнийг дуурайна */
function DemoHint({ url }: { url: string }) {
  return (
    <p className="text-center text-[12px] leading-snug text-mute">
      Туршилт: eID аппыг{" "}
      <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-accent underline-offset-2 hover:underline">
        шинэ цонхонд нээх
      </a>
    </p>
  );
}

export { eidName };
