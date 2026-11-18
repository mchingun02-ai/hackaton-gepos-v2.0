"use client";

/* Нэвтрэх — зөвхөн eID authorization (BR01-3, BR01-6, BR02-6) */

import { useCallback } from "react";
import { EidLogin } from "@/components/sp/EidLogin";
import type { EidAccount } from "@/lib/sp/eid";
import type { Session } from "./core";

export function Login({ onLogin }: { onLogin: (s: Session) => void }) {
  const enter = useCallback(
    (acc: EidAccount) => onLogin(acc.kind === "owner" ? { kind: "owner" } : { kind: "staff", staffId: acc.staffId }),
    [onLogin],
  );
  return (
    <div className="sp-scroll h-full">
      <div className="flex min-h-full flex-col px-6 pb-8 pt-12">
        <div className="mb-8 flex items-center gap-2.5">
          <span className="grid size-10 place-items-center rounded-[12px] bg-ink text-[19px] font-extrabold text-paper">G</span>
          <span className="leading-none">
            <span className="block text-[17px] font-bold tracking-[-0.02em] text-ink">Gerege POS</span>
            <span className="block text-[12px] font-medium text-mute">Захиалга, харилцагч, тайлан — утаснаасаа</span>
          </span>
        </div>
        <EidLogin client="merchant" variant="mobile" onEnter={enter} />
        <p className="mt-auto pt-8 text-center text-[12px] leading-snug text-mute">Эзэмшигч болон ажилтан бүр өөрийн eID-ээр нэвтэрнэ; эрхэд тань тохирох цэс л нээгдэнэ.</p>
      </div>
    </div>
  );
}
