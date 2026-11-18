"use client";

/* Нэвтрэх — ажилтнаа сонгоод 4 оронтой PIN (4 дэх оронд автоматаар). */

import { useState } from "react";
import { staffByPin, staffLogin, useSp } from "@/lib/sp/store";
import { initials, staffName } from "@/lib/sp/logic";
import type { Staff } from "@/lib/sp/types";
import { Avatar, Btn, Empty, NumPad, PinDots, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";

const LAST = "gepos-last-staff";

export function Login({ onLogin }: { onLogin: (st: Staff) => void }) {
  const s = useSp();
  const staff = s.staff.filter((x) => x.active);
  const [sel, setSel] = useState<string | null>(() => {
    try {
      const id = localStorage.getItem(LAST);
      return staff.some((x) => x.id === id) ? id : null;
    } catch {
      return null;
    }
  });
  const [pin, setPin] = useState("");
  const [err, setErr] = useState(false);
  const cur = staff.find((x) => x.id === sel) ?? null;
  const SHORT: Record<string, string> = { admin: "Админ", manager: "Менежер", cashier: "Касс", accountant: "Нягтлан", courier: "Хүргэгч" };
  const roleName = (st: Staff) => SHORT[st.roleId] ?? s.roles.find((r) => r.id === st.roleId)?.name ?? "";

  const submit = (code: string) => {
    try {
      // Ажилтан сонгоогүй бол PIN-ээр нь таньна
      const st = cur ? staffLogin(cur.id, code) : staffByPin(code);
      if (!st) throw new Error();
      try {
        localStorage.setItem(LAST, st.id);
      } catch {
        /* хувийн цонх */
      }
      onLogin(st);
    } catch {
      setErr(true);
      setTimeout(() => {
        setPin("");
        setErr(false);
      }, 420);
    }
  };

  const key = (k: string) => {
    if (k === "forgot") return toast("PIN-ээ менежер эсвэл админаар сэргээлгэнэ үү");
    if (k === "back") return setPin((p) => p.slice(0, -1));
    if (!/^\d$/.test(k) || pin.length >= 4 || err) return;
    const next = pin + k;
    setPin(next);
    if (next.length === 4) setTimeout(() => submit(next), 90);
  };
  useKeypad(key);

  if (!staff.length) return <Empty icon="people" title="Ажилтан бүртгэлгүй" body="Merchant portal → Ажилтан хэсгээс ажилтан нэмнэ үү." />;

  return (
    <div className="flex h-full flex-col bg-stage px-4 pb-4 pt-6">
      <div className="text-center">
        <div className="text-[15px] font-bold tracking-[-0.02em] text-ink">
          Gerege <span className="text-accent">POS</span>
        </div>
        <div className="mt-1 flex items-center justify-center gap-1.5 text-[13px] text-mute">
          <Icon name="building" size={14} /> {s.delivery.page.name} · Касс 1
        </div>
      </div>

      <h1 className="mt-6 text-center text-[22px] font-bold tracking-[-0.02em] text-ink">Хэн ажиллах вэ?</h1>
      <div className="sp-scroll -mx-4 mt-3 flex justify-center gap-0.5 overflow-x-auto px-3 pb-1">
        {staff.map((st) => {
          const on = st.id === sel;
          return (
            <button
              key={st.id}
              type="button"
              onClick={() => {
                setSel(st.id);
                setPin("");
              }}
              aria-pressed={on}
              className={cx("sp-tap flex w-[64px] shrink-0 flex-col items-center gap-1 rounded-[16px] px-1 py-2", on && "bg-paper shadow-[inset_0_0_0_2px_var(--accent)]")}
            >
              <Avatar text={initials(st.first, st.last)} size={46} tone={on ? "accent" : "gray"} />
              <span className="w-full truncate text-[13px] font-semibold text-ink">{st.first}</span>
              <span className="w-full truncate text-[11px] text-mute">{roleName(st)}</span>
            </button>
          );
        })}
      </div>

      <p className="mt-5 text-center text-[15px] text-ink-2">{cur ? `${staffName(cur)}, PIN кодоо оруулна уу` : "Нэрээ сонгох эсвэл PIN кодоо оруулна уу"}</p>
      <div className="mt-4">
        <PinDots length={4} filled={pin.length} error={err} />
      </div>
      <p className="mt-2 h-5 text-center text-[13px] font-medium text-danger">{err ? "PIN буруу байна" : ""}</p>

      <div className="mt-auto">
        <NumPad onKey={key} left={{ label: "Мартсан", key: "forgot" }} />
        <p className="mt-3 text-center text-[12px] leading-snug text-mute">4 дэх оронг оруулмагц нэвтэрнэ. Эрхэд тань ногдсон цэс л харагдана.</p>
      </div>
    </div>
  );
}

export function NoAccess({ staff, onLogout }: { staff: Staff; onLogout: () => void }) {
  return (
    <div className="flex h-full flex-col justify-center bg-stage px-4">
      <Empty
        icon="lock"
        title={`${staff.first}, танд кассын эрх алга`}
        body="Таны эрх зөвхөн тайлан харах. Тайланг Merchant portal эсвэл мерчантын аппаас үзнэ."
        action={
          <Btn variant="gray" icon="logout" onClick={onLogout}>
            Гарах
          </Btn>
        }
      />
    </div>
  );
}
