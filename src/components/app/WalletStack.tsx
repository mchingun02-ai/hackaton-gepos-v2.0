"use client";

import { type ReactNode, useEffect } from "react";
import { motion } from "motion/react";
import { moneyPlain } from "@/lib/demo";
import type { Membership } from "@/lib/customer-api";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const SPRING = { type: "spring", stiffness: 380, damping: 36, mass: 0.9 } as const;

/* Хөтчүүд mn-MN locale-ийг бүрэн дэмждэггүй (англиар гарна) — гараар: 2026.10.20 */
const ymd = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
};

/** Давхарласан картын харагдах зурвас (лого · нэр · оноо) */
const PEEK = 60;

/**
 * Apple Wallet маягийн давхарласан хэтэвч: карт бүрийн зөвхөн дээд зурвас харагдана,
 * сүүлийнх нь бүтнээрээ. Дарахад тухайн картын дэлгэрэнгүй доороос гулсаж нээгдэнэ.
 * margin-top-ын хувь нь өргөнөөс тооцогддог тул −63.05% = картын өндөр (1 / 1.586).
 */
export function CardStack({
  items,
  open,
  onOpen,
  render,
}: {
  items: Membership[];
  open: string | null;
  onOpen: (id: string) => void;
  render: (m: Membership) => ReactNode;
}) {
  return (
    <ul className="relative" aria-label="Миний картууд">
      {items.map((m, i) => (
        <li key={m.id} className="relative" style={{ marginTop: i === 0 ? 0 : `calc(${PEEK}px - 63.05%)`, zIndex: i }}>
          {open === m.id ? (
            <div className="aspect-[1.586/1] w-full" aria-hidden="true" />
          ) : (
            <motion.button
              type="button"
              onClick={() => onOpen(m.id)}
              aria-label={`${m.card?.title ?? m.merchantName} · ${moneyPlain(m.points)} оноо`}
              className="block w-full rounded-[18px] text-left outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              whileHover={{ y: -6 }}
              whileTap={{ scale: 0.985 }}
              transition={{ ...SPRING, opacity: { duration: 0.3, delay: i * 0.04 } }}
            >
              {render(m)}
            </motion.button>
          )}
        </li>
      ))}
    </ul>
  );
}

/** Бүтэн дэлгэцийн хуудас (Apple маяг) — «‹ Хэтэвч» буцах, том гарчиг */
export function Sheet({ title, back, onClose, children }: { title: string; back: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-center bg-stage"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.26, ease: EASE }}
    >
      <div className="flex h-full w-full max-w-[440px] flex-col">
        <header className="flex h-12 shrink-0 items-center px-2">
          <button type="button" onClick={onClose} aria-label="Буцах" className="press flex items-center gap-0.5 rounded-full px-2 py-1 text-[16px] font-medium text-accent">
            <svg viewBox="0 0 20 20" className="size-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12.5 4.5 7 10l5.5 5.5" />
            </svg>
            {back}
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
          <h1 className="mb-4 mt-1 text-[30px] font-extrabold leading-[0.98] tracking-[-0.045em] text-ink">
            {title}
            <span className="text-accent">.</span>
          </h1>
          {children}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Картын дэлгэрэнгүй — Apple Wallet-ийн картын нүүр: карт дээд талд, доор нь
 * «Gerege QR» үйлдэл, бүлэглэсэн мэдээлэл (inset grouped), тайлбар, онооны түүх.
 */
export function CardDetail({
  m,
  card,
  history,
  onClose,
  onQr,
  onStores,
}: {
  m: Membership;
  card: ReactNode;
  history: ReactNode;
  onClose: () => void;
  onQr: () => void;
  onStores: () => void;
}) {
  // Esc — хаах
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);

  const rows: [string, ReactNode][] = [
    ["Оноо", <span key="p" className="tnum">{moneyPlain(m.points)}</span>],
    ["Зэрэглэл", m.tierName],
    ["Дэлгүүр", m.merchantName],
    ["Элссэн", <span key="j" className="tnum">{ymd(m.joinedAt)}</span>],
  ];

  return (
    <motion.div
      className="fixed inset-0 z-40 flex justify-center bg-stage/90 backdrop-blur-2xl"
      role="dialog"
      aria-modal="true"
      aria-label={m.card?.title ?? m.merchantName}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="flex h-full w-full max-w-[440px] flex-col">
        <header className="flex h-12 shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-semibold text-mute">{m.merchantName}</span>
          <button type="button" onClick={onClose} aria-label="Буцах" className="press rounded-full px-1 text-[16px] font-semibold text-accent">
            Дуусгах
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-[calc(24px+env(safe-area-inset-bottom))]">
          <motion.div initial={{ opacity: 0, y: 40, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={SPRING} className="rounded-[18px]">
            {card}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.35, ease: EASE }}>
            <button
              type="button"
              onClick={onQr}
              className="press mt-5 flex h-[52px] w-full items-center justify-center gap-2 rounded-[14px] bg-ink text-[15px] font-semibold text-paper"
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2" />
              </svg>
              Касс дээр Gerege QR уншуулах
            </button>

            <ul className="mt-4 divide-y divide-hair overflow-hidden rounded-[14px] bg-paper ring-1 ring-inset ring-hair">
              {rows.map(([k, v]) => (
                <li key={k} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
                  <span className="text-mute">{k}</span>
                  <span className="truncate font-medium text-ink">{v}</span>
                </li>
              ))}
              <li>
                <button type="button" onClick={onStores} className="flex w-full items-center justify-between px-4 py-3 text-left text-[15px] text-accent">
                  Дэлгүүрийн байршил, цагийн хуваарь
                  <svg viewBox="0 0 20 20" className="size-4 text-mute" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="m7.5 4.5 5.5 5.5-5.5 5.5" />
                  </svg>
                </button>
              </li>
            </ul>

            {m.card?.description && <p className="mt-3 px-1 text-[13px] leading-relaxed text-mute">{m.card.description}</p>}
            <p className="mt-1.5 px-1 text-[12px] leading-relaxed text-mute">Оноо зөвхөн {m.merchantName}-д хуримтлагдаж, зарцуулагдана.</p>

            <h2 className="mb-2 mt-6 px-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-mute">Онооны түүх</h2>
            {history}
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}
