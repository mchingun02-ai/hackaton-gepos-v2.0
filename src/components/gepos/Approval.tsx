"use client";

/*
 * BR09-2: буцаалт, хүргэлт цуцлах, хүргэлт зогсоох — менежер/админ эрх.
 * Эрхтэй ажилтан бол энгийн баталгаажуулалт; эрхгүй бол менежерийн PIN.
 */

import { createContext, useContext, useState, type ReactNode } from "react";
import { actorOf, staffLogin, useSp, type Actor } from "@/lib/sp/store";
import { initials, staffName } from "@/lib/sp/logic";
import type { Staff } from "@/lib/sp/types";
import { Avatar, NumPad, Notice, PinDots, Row, Sheet, useConfirm, useKeypad } from "@/components/sp/ui";
import { usePos } from "./ctx";

type Opts = {
  title: string;
  message?: ReactNode;
  ok: string;
  action: string;
  /** Эрхтэй эсэхийг өөрөөр тогтоох (жишээ нь бараа = «products» модуль) */
  allowed?: boolean;
  /** Эрхтэй бол баталгаажуулахгүй шууд ажиллуулна */
  quiet?: boolean;
};
type Guard = (o: Opts, run: (actor: Actor) => void) => void;

const GuardCtx = createContext<Guard | null>(null);
export const useGuard = () => {
  const g = useContext(GuardCtx);
  if (!g) throw new Error("GuardCtx");
  return g;
};

export function ApprovalProvider({ children }: { children: ReactNode }) {
  const pos = usePos();
  const s = useSp();
  const { confirm, node } = useConfirm();
  const [req, setReq] = useState<{ o: Opts; run: (a: Actor) => void } | null>(null);
  const [who, setWho] = useState<Staff | null>(null);
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);

  const guard: Guard = (o, run) => {
    if (o.allowed ?? pos.role.manage) {
      if (o.quiet) return run(pos.actor);
      confirm({ title: o.title, message: o.message, ok: o.ok, destructive: true, run: () => run(pos.actor) });
      return;
    }
    setWho(null);
    setPin("");
    setReq({ o, run });
  };

  const managers = s.staff.filter((x) => x.active && s.roles.find((r) => r.id === x.roleId)?.manage);
  const close = () => setReq(null);

  const key = (k: string) => {
    if (!who || !req) return;
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (!/^\d$/.test(k) || pin.length >= 4) return;
    const next = pin + k;
    setPin(next);
    setErr(false);
    if (next.length === 4) {
      try {
        const m = staffLogin(who.id, next);
        const run = req.run;
        setReq(null);
        run(actorOf(m));
      } catch {
        setErr(true);
        setTimeout(() => setPin(""), 380);
      }
    }
  };
  useKeypad(key, !!req && !!who);

  return (
    <GuardCtx.Provider value={guard}>
      {children}
      {node}
      <Sheet open={!!req} onClose={close} title="Менежерийн зөвшөөрөл">
        <div className="space-y-3 px-4 pb-5 pt-2">
          <Notice tone="gray" icon="lock">
            {req?.o.action} хийхэд менежер эсвэл админы PIN хэрэгтэй. {staffName(pos.staff)}-ийн эрх: {pos.role.name}.
          </Notice>
          {!who ? (
            <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
              {managers.map((m) => (
                <Row
                  key={m.id}
                  title={staffName(m)}
                  sub={s.roles.find((r) => r.id === m.roleId)?.name}
                  trailing={<Avatar text={initials(m.first, m.last)} size={36} tone="accent" />}
                  chevron
                  onClick={() => setWho(m)}
                />
              ))}
            </div>
          ) : (
            <>
              <button type="button" onClick={() => setWho(null)} className="sp-row flex w-full items-center gap-3 rounded-[var(--sp-r-group)] bg-paper px-4 py-3 text-left">
                <Avatar text={initials(who.first, who.last)} size={38} tone="accent" />
                <span className="flex-1">
                  <span className="block text-[16px] font-semibold text-ink">{staffName(who)}</span>
                  <span className="text-[13px] text-mute">PIN кодоо оруулна уу · солих</span>
                </span>
              </button>
              <div className="py-4">
                <PinDots length={4} filled={pin.length} error={err} />
                <p className="mt-2 h-5 text-center text-[13px] text-danger">{err ? "PIN буруу байна" : ""}</p>
              </div>
              <NumPad onKey={key} />
            </>
          )}
        </div>
      </Sheet>
    </GuardCtx.Provider>
  );
}
