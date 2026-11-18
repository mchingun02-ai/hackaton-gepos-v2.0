"use client";

/* Ачаа хүлээлгэн өгөх код (BR04-10, US16) ба хүргэлт зогсоох (BR09-1.2). */

import { useState } from "react";
import { handover, resendCode, setDeliveryStopped, useSp } from "@/lib/sp/store";
import { money } from "@/lib/sp/logic";
import { Btn, CodeBoxes, Empty, NavBar, Notice, NumPad, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { Screen, usePos } from "./ctx";
import { useGuard } from "./Approval";

const MAX = 5;

export function Handover({ id }: { id: string }) {
  const s = useSp();
  const pos = usePos();
  const [code, setCode] = useState("");
  const [err, setErr] = useState<null | "wrong" | "locked" | "unpaid">(null);
  const [ok, setOk] = useState(false);
  const o = s.orders.find((x) => x.id === id);

  const key = (k: string) => {
    if (!o || ok) return;
    if (k === "back") {
      setErr(null);
      return setCode((c) => c.slice(0, -1));
    }
    if (!/^\d$/.test(k) || code.length >= 6) return;
    const next = code + k;
    setCode(next);
    setErr(null);
    if (next.length === 6) {
      const r = handover(pos.actor, o.id, next);
      if (r === "ok") {
        setOk(true);
        toast(`#${o.no} хүргэгдлээ`, "ok");
      } else {
        setErr(r);
        setTimeout(() => setCode(""), 420);
      }
    }
  };
  useKeypad(key, !!o && !ok);

  if (!o) return null;

  if (ok)
    return (
      <Screen
        bottom={
          <Btn size="xl" block onClick={() => pos.reset({ s: "orders" })}>
            Хүргэлтийн жагсаалт
          </Btn>
        }
      >
        <div className="flex flex-col items-center px-6 pt-24 text-center">
          <span className="ok-badge">
            <svg viewBox="0 0 32 32" className="size-10" aria-hidden="true">
              <path d="M8 16.5 13.5 22 24 11" className="ok-check" fill="none" stroke="var(--accent-ink)" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <h1 className="ok-rise ok-d1 mt-6 text-[24px] font-bold text-ink">Хүргэгдлээ</h1>
          <p className="ok-rise ok-d2 mt-1 text-[15px] text-mute">
            #{o.no} · {o.name} · {money(o.total)}
          </p>
        </div>
      </Screen>
    );

  const triesLeft = Math.max(0, MAX - o.codeTries);
  const locked = err === "locked" || o.codeTries >= MAX;

  return (
    <Screen
      nav={
        <NavBar
          title="Ачаа хүлээлгэн өгөх"
          leading={
            <button type="button" onClick={pos.back} className="sp-tap h-11 rounded-full px-2 text-[17px] text-accent">
              Болих
            </button>
          }
        />
      }
    >
      <div className="flex h-full flex-col px-4 pb-4">
        <div className="pb-5 pt-6 text-center">
          <p className="text-[17px] leading-snug text-ink">Харилцагчаас SMS-ээр ирсэн 6 оронтой кодыг асууж оруулна уу.</p>
          <p className="mt-1 text-[14px] text-mute">
            #{o.no} · {o.name}
          </p>
        </div>
        <CodeBoxes length={6} value={code} error={!!err && err !== "unpaid"} />
        <div className="min-h-[86px] pt-3 text-center">
          {!o.paid || err === "unpaid" ? (
            <Notice
              tone="warn"
              action={
                <button type="button" className="shrink-0 font-semibold underline" onClick={() => pos.replace({ s: "pay", job: { kind: "order", orderId: o.id } })}>
                  Төлбөр авах
                </button>
              }
            >
              Төлбөр аваагүй байна. Эхлээд төлбөрөө хүлээн авна уу.
            </Notice>
          ) : locked ? (
            <p className="text-[14px] font-medium text-danger">5 удаа буруу оруулсан. Кодыг дахин илгээнэ үү.</p>
          ) : err === "wrong" ? (
            <p className="flex items-start justify-center gap-1.5 text-[14px] font-medium text-danger">
              <Icon name="warn" size={16} className="mt-0.5" /> Код таарахгүй байна. {triesLeft} оролдлого үлдлээ.
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              resendCode(o.id);
              setErr(null);
              toast(`Код ${o.phone.slice(0, 4)} ••${o.phone.slice(-2)} руу дахин илгээгдлээ`, "ok");
            }}
            className={cx("mt-2 h-11 px-3 text-[15px] font-semibold text-accent")}
          >
            Кодыг SMS-ээр дахин илгээх
          </button>
        </div>
        <NumPad onKey={key} className="mt-auto" />
      </div>
    </Screen>
  );
}

export function StopDelivery() {
  const s = useSp();
  const pos = usePos();
  const guard = useGuard();
  const list = s.products.filter((p) => p.active && p.delivery);
  const [sel, setSel] = useState<Set<string>>(() => new Set(list.filter((p) => p.deliveryStopped).map((p) => p.id)));
  const toStop = list.filter((p) => sel.has(p.id) && !p.deliveryStopped).map((p) => p.id);
  const toResume = list.filter((p) => !sel.has(p.id) && p.deliveryStopped).map((p) => p.id);
  const changed = toStop.length + toResume.length;
  const toggle = (id: string) =>
    setSel((x) => {
      const n = new Set(x);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const save = () =>
    guard({ title: "Хүргэлтийн төлөв хадгалах уу?", message: `${toStop.length} бараа зогсож, ${toResume.length} бараа сэргэнэ.`, ok: "Хадгалах", action: "Хүргэлт зогсоох" }, (actor) => {
      if (toStop.length) setDeliveryStopped(actor, toStop, true);
      if (toResume.length) setDeliveryStopped(actor, toResume, false);
      toast("Хадгалагдлаа", "ok");
      pos.back();
    });

  return (
    <Screen
      nav={
        <NavBar
          title="Хүргэлт зогсоох"
          leading={
            <button type="button" onClick={pos.back} className="sp-tap h-11 rounded-full px-2 text-[17px] text-accent">
              Болих
            </button>
          }
        />
      }
      bottom={
        <>
          <Btn size="xl" block disabled={!changed} onClick={save}>
            {changed ? `Хадгалах · ${sel.size} бараа зогссон` : "Бараа сонгоно уу"}
          </Btn>
          {!pos.role.manage && <p className="pt-2 text-center text-[12px] text-mute">Менежер эсвэл админы PIN шаардлагатай</p>}
        </>
      }
    >
      <div className="px-4 pt-3">
        <Notice tone="gray" icon="info">
          Сонгосон бараа дэлгүүрт зарагдсаар байна, харин захиалгын хуудсанд харагдахгүй.
        </Notice>
      </div>
      {list.length === 0 ? (
        <Empty icon="box" title="Хүргэлттэй бараа алга" />
      ) : (
        <div className="px-4 pb-6 pt-3">
          <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
            {[...list]
              .sort((a, b) => a.stock - b.stock)
              .map((p) => {
                const on = sel.has(p.id);
                return (
                  <button key={p.id} type="button" role="checkbox" aria-checked={on} onClick={() => toggle(p.id)} className="sp-row flex min-h-[60px] w-full items-center gap-3 px-4 py-2.5 text-left">
                    <span className={cx("grid size-7 shrink-0 place-items-center rounded-full transition-colors", on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]")}>
                      {on && <Icon name="check" size={16} stroke={2.6} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] text-ink">{p.name}</span>
                      <span className={cx("text-[13px]", p.stock <= p.minStock ? "font-medium text-warn" : "text-mute")}>Үлдэгдэл {p.stock}</span>
                    </span>
                    {p.deliveryStopped && (on ? <span className="text-[12px] font-semibold text-warn">Зогссон</span> : <span className="text-[12px] font-semibold text-ok">Сэргэнэ</span>)}
                  </button>
                );
              })}
          </div>
        </div>
      )}
    </Screen>
  );
}
