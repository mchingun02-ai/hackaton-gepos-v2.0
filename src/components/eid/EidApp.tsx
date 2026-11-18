"use client";

/*
 * Gerege eID аппыг дуурайсан туршилтын хуудас (/eid).
 * Бодит eID апп дээр хэрэглэгч ирсэн нэвтрэх хүсэлтийг харж,
 * нэвтрэх дэлгэц дээрх тоог тулгаад зөвшөөрнө (number matching).
 */

import { useEffect, useMemo, useState } from "react";
import { SpGate, useSp } from "@/lib/sp/store";
import { eidName, eidPeople, eidRespond, useEidPending, type EidReq } from "@/lib/sp/eid";
import { Avatar, Btn, DeviceFrame, Empty, Group, NavBar, Notice, Row, Toaster, toast } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";

const ME = "gepos-eid-me";

export default function EidApp() {
  return (
    <SpGate>
      <DeviceFrame w={390} h={844} caption="Gerege eID · туршилтын апп">
        <Root />
        <Toaster bottom={40} />
      </DeviceFrame>
    </SpGate>
  );
}

function Root() {
  const s = useSp();
  const people = useMemo(() => eidPeople(s), [s]);
  const [me, setMe] = useState<string | null>(null);
  useEffect(() => {
    try {
      setMe(localStorage.getItem(ME));
    } catch {
      /* хувийн цонх */
    }
  }, []);
  const choose = (r: string | null) => {
    try {
      if (r) localStorage.setItem(ME, r);
      else localStorage.removeItem(ME);
    } catch {
      /* хувийн цонх */
    }
    setMe(r);
  };

  if (!me)
    return (
      <div className="flex h-full flex-col">
        <NavBar title="Gerege eID" large sub="Туршилт: энэ утсан дээрх eID-ийн эзнийг сонгоно уу." />
        <div className="sp-scroll flex-1 pb-8">
          <Group header="eID эзэмшигч">
            {people.map((p) => (
              <Row key={p.regNo} title={p.name} sub={p.regNo} chevron onClick={() => choose(p.regNo)} trailing={<Avatar text={(p.name.split(" ")[1] ?? p.name).slice(0, 1)} size={32} tone="gray" />} />
            ))}
          </Group>
        </div>
      </div>
    );
  return <Inbox me={me} name={eidName(s, me)} onSwitch={() => choose(null)} />;
}

function Inbox({ me, name, onSwitch }: { me: string; name: string; onSwitch: () => void }) {
  const pending = useEidPending();
  const qrId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("req") : null;
  // Регистрээр ирсэн минийх + QR-аар уншуулсан (холбоосоор нээсэн) хүсэлт
  const list = pending.filter((r) => (r.via === "regno" ? r.regNo === me : r.id === qrId));
  const [open, setOpen] = useState<EidReq | null>(null);
  const cur = open && list.find((x) => x.id === open.id) ? open : list[0] ?? null;

  return (
    <div className="flex h-full flex-col">
      <NavBar
        title="Gerege eID"
        large
        sub={
          <button type="button" onClick={onSwitch} className="sp-tap inline-flex min-h-8 items-center gap-1.5 text-mute">
            {name} · {me} <Icon name="down" size={14} />
          </button>
        }
      />
      <div className="sp-scroll flex-1 px-4 pb-8 pt-3">
        {cur ? <Approve key={cur.id} req={cur} me={me} name={name} onDone={() => setOpen(null)} /> : <Empty icon="id" title="Хүсэлт алга" body="Merchant portal эсвэл мерчантын апп дээр «eID-ээр нэвтрэх» дарахад хүсэлт энд шууд ирнэ." />}
      </div>
    </div>
  );
}

function Approve({ req, me, name, onDone }: { req: EidReq; me: string; name: string; onDone: () => void }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [wrong, setWrong] = useState(false);
  // Зөв тоо + 2 санамсаргүй тоо — хэрэглэгч дэлгэцтэй тулгаж сонгоно
  const opts = useMemo(() => {
    const set = new Set([req.code]);
    while (set.size < 3) set.add(String(10 + Math.floor(Math.random() * 90)));
    return [...set].sort(() => Math.random() - 0.5);
  }, [req.code]);
  const left = Math.max(0, Math.ceil((req.expires - Date.now()) / 1000));
  const app = req.client === "portal" ? "Merchant portal (веб)" : "Мерчантын апп";

  const approve = () => {
    eidRespond(req.id, true, { regNo: me, name });
    toast("Нэвтрэлтийг зөвшөөрлөө", "ok");
    onDone();
  };
  const deny = () => {
    eidRespond(req.id, false, { regNo: me, name });
    toast("Татгалзлаа");
    onDone();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-[20px] bg-paper p-5">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-[12px] bg-ink text-paper">
            <Icon name="id" size={22} />
          </span>
          <div className="min-w-0">
            <div className="text-[17px] font-semibold text-ink">Нэвтрэх хүсэлт</div>
            <div className="text-[13px] text-mute">
              Gerege POS · {app} · {req.via === "qr" ? "QR уншуулсан" : "регистрээр"}
            </div>
          </div>
        </div>
        <p className="mt-4 text-[15px] leading-snug text-ink-2">Нэвтрэх дэлгэц дээр гарсан тоог сонгоно уу. Хэрэв та өөрөө нэвтрэх гэж байгаа бол л зөвшөөрнө.</p>
        <div className="mt-4 grid grid-cols-3 gap-2">
          {opts.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                setPicked(o);
                setWrong(o !== req.code);
              }}
              className={`sp-tap h-16 rounded-[14px] text-[26px] font-bold tnum ${picked === o ? (wrong ? "bg-danger-soft text-danger" : "bg-ink text-paper") : "bg-[var(--sp-fill)] text-ink"}`}
            >
              {o}
            </button>
          ))}
        </div>
        {wrong && (
          <div className="mt-3">
            <Notice tone="danger">Тоо таарахгүй байна. Та өөрөө нэвтрэх гэж байгаа эсэхээ шалгана уу.</Notice>
          </div>
        )}
        <p className="mt-3 text-[12px] text-mute">Хүчинтэй: {Math.floor(left / 60)}:{String(left % 60).padStart(2, "0")}</p>
      </div>
      <Btn block size="xl" disabled={!picked || wrong} onClick={approve}>
        Зөвшөөрөх
      </Btn>
      <Btn block variant="dangerTinted" onClick={deny}>
        Татгалзах
      </Btn>
    </div>
  );
}
