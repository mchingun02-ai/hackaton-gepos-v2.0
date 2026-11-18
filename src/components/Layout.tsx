"use client";

import { type ReactNode, useState } from "react";
import type { Staff } from "@/lib/demo";
import {
  IconBell,
  IconClose,
  IconLogout,
  IconMenu,
  NavBox,
  NavCard,
  NavCash,
  NavChart,
  NavGear,
  NavHelp,
  NavShield,
  NavTrend,
  ThemeToggle,
  Wordmark,
} from "@/components/icons";

export type Page =
  | "cashier"
  | "products"
  | "reports"
  | "debts"
  | "loyalty"
  | "owner"
  | "admin"
  | "settings";

export const NAV: { key: Page; label: string; icon: ReactNode }[] = [
  { key: "cashier", label: "Касс", icon: <NavCash /> },
  { key: "products", label: "Бараа", icon: <NavBox /> },
  { key: "reports", label: "Тайлан", icon: <NavTrend /> },
  { key: "debts", label: "Өрийн дэвтэр", icon: <NavCard /> },
  { key: "loyalty", label: "Урамшуулал", icon: <NavChart /> },
  { key: "owner", label: "Орлого, зарлага", icon: <NavChart /> },
  { key: "admin", label: "Захирлын самбар", icon: <NavTrend /> },
];

const SUPPORT: { key: Page; label: string; icon: ReactNode }[] = [
  { key: "settings", label: "Тохиргоо", icon: <NavGear /> },
];


/**
 * Бүх хуудсын хуваалцдаг бүрхүүл: дээд мөр, зүүн цэс, нарийн дэлгэцийн
 * татагдах цэс. Хуудас бүр зөвхөн өөрийн агуулгаа бичнэ.
 *
 * `aside` нь кассын захиалгын самбар шиг баруун талын тогтмол баганад
 * зориулагдсан — бусад хуудсанд хоосон.
 */
export default function Layout({
  page,
  onNavigate,
  person,
  posNo,
  phone,
  device,
  onToggleTheme,
  onLogout,
  breadcrumb,
  title,
  action,
  aside,
  children,
  /** Хуудасны агуулгыг цагаан хуудсан дотор байрлуулах эсэх */
  card = true,
  allowed,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  person: Staff;
  posNo: string;
  phone: boolean;
  device: "till" | "handheld";
  onToggleTheme: () => void;
  onLogout: () => void;
  breadcrumb: string;
  title: string;
  action?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  card?: boolean;
  /** Нэвтэрсэн ажилтны эрхээр харагдах хуудсууд (сервер өөрөө ч хамгаална) */
  allowed?: Page[];
}) {
  const [menu, setMenu] = useState(false);
  const narrow = phone || device === "handheld";

  /* Идэвхтэй цэс: саарал дэвсгэр, бэх үсэг, дүрс нь accent. Бүтэн улбар
     шар блок байхад кассын «Үргэлжлүүлэх» товчтой өрсөлддөг байв —
     цэс бол байршил, үйлдэл биш. */
  const navButton = (
    item: { key: Page; label: string; icon: ReactNode },
    onPick: () => void,
  ) => {
    const active = page === item.key;
    return (
      <button
        key={item.key}
        type="button"
        onClick={onPick}
        aria-current={active ? "page" : undefined}
        className={`press flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] ${
          active
            ? "bg-stage font-bold text-ink"
            : "font-semibold text-ink-2 hover:bg-stage/60 hover:text-ink"
        }`}
      >
        <span className={active ? "text-accent" : "text-mute"}>{item.icon}</span>
        {item.label}
      </button>
    );
  };

  const navList = (close?: () => void) => (
    <nav className="flex flex-col gap-1 px-4 py-6">
      <span className="meta mb-2 px-3">Үндсэн цэс</span>
      {NAV.filter((item) => !allowed || allowed.includes(item.key)).map((item) =>
        navButton(item, () => {
          onNavigate(item.key);
          close?.();
        }),
      )}
      <span className="my-4 h-px bg-hair" />
      <span className="meta mb-2 px-3">Дэмжлэг</span>
      {SUPPORT.map((item) =>
        navButton(item, () => {
          onNavigate(item.key);
          close?.();
        }),
      )}
      <button
        type="button"
        className="press flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold text-ink-2 hover:bg-stage/60 hover:text-ink"
      >
        <span className="text-mute">
          <NavShield />
        </span>
        Аюулгүй байдал
      </button>
      <button
        type="button"
        className="press flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold text-ink-2 hover:bg-stage/60 hover:text-ink"
      >
        <span className="text-mute">
          <NavHelp />
        </span>
        Тусламж
      </button>
      {/* Гарах — серверийн session-ийг хаана (дараагийн хүн PIN-ээ оруулна) */}
      <button
        type="button"
        onClick={onLogout}
        className="press flex h-11 items-center gap-3 rounded-xl px-3 text-[14px] font-semibold text-ink-2 hover:bg-stage/60 hover:text-ink"
      >
        <span className="text-mute">
          <IconLogout />
        </span>
        Гарах
      </button>
    </nav>
  );

  /* Дээд мөр нам гүм: лого, холболтын төлөв, ажилтан, сэдэв. Өмнө нь
     «Хайх», «Excel», «Мэдэгдэл» (accent хүрээтэй!), «…» гэсэн дөрвөн
     ажилладаггүй товч байсан — хуудас бүр өөрийн хайлт, экспорттой тул
     тэд давхардал байв. Мэдэгдлийг дүрсээр үлдээв, accent-гүй. */
  const topbar = (
    <header
      className={`flex shrink-0 items-center gap-2.5 border-b border-hair px-3 sm:px-5 ${
        narrow ? "h-[56px]" : "h-[64px]"
      }`}
    >
      {narrow && (
        <button
          type="button"
          onClick={() => setMenu(true)}
          aria-label="Цэс нээх"
          className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:text-ink"
        >
          <IconMenu />
        </button>
      )}

      <Wordmark size={narrow ? 15 : 16} />

      {narrow && (
        <span className="meta ml-1 hidden min-[360px]:inline">· {breadcrumb}</span>
      )}

      <span className="ml-auto flex items-center gap-2.5">
        {!narrow && (
          <>
            <span className="meta hidden items-center gap-1.5 lg:flex">
              <span className="inline-block size-[6px] rounded-full bg-mute" aria-hidden="true" />
              Е-баримт · Касс {posNo}
            </span>
            <button type="button" className="tt" aria-label="Мэдэгдэл">
              <IconBell />
            </button>
            <ThemeToggle onClick={onToggleTheme} />
            <span className="ml-1 hidden text-right leading-tight xl:block">
              <span className="block text-[13px] font-bold text-ink">{person.name}</span>
              <span className="block text-[11px] text-mute">{person.role}</span>
            </span>
          </>
        )}
        <span className="grid size-9 place-items-center rounded-full bg-ink text-[12px] font-bold text-paper sm:size-10">
          {person.initials}
        </span>
      </span>
    </header>
  );

  /* Гарчиг нэг мөр: зүүнд хуудасны нэр, баруунд үйлдэл. Breadcrumb нь
     мета болж гарчгийн дэргэд — зүүн цэс хаана байгааг аль хэдийн
     хэлж байхад хоёр давхар толгой зай л иддэг байв. */
  const heading = (
    <div className="flex h-10 items-center justify-between gap-4">
      <span className="flex items-baseline gap-3">
        <h1 className="text-[22px] font-bold tracking-[-0.035em] text-ink">{title}</h1>
        <span className="meta hidden sm:inline">{breadcrumb}</span>
      </span>
      {action}
    </div>
  );

  /* Нарийн дэлгэцэд breadcrumb, том гарчиг, цагаан хүрээ гурав нь зай иддэг
     бөгөөд юу ч нэмдэггүй — хаана байгаагаа цэснээсээ мэднэ. */
  const body = narrow ? (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden bg-stage">{children}</div>
  ) : (
    <div className="flex min-w-0 flex-1 flex-col bg-stage p-5">
      {heading}
      {card ? (
        <div className="mt-3 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[22px] bg-paper p-5 ring-1 ring-inset ring-hair">
          {children}
        </div>
      ) : (
        <div className="mt-3 min-h-0 flex-1 overflow-y-auto">{children}</div>
      )}
    </div>
  );

  const frame = phone
    ? "h-dvh w-full"
    : device === "till"
      ? "object h-[820px] rounded-card ring-1 ring-inset ring-hair"
      : "object mx-auto h-[820px] w-[390px] rounded-card ring-1 ring-inset ring-hair";

  return (
    <div className={`relative flex flex-col overflow-hidden bg-paper ${frame}`}>
      {topbar}

      <div className="flex min-h-0 flex-1">
        {!narrow && (
          <div className="w-[220px] shrink-0 overflow-y-auto border-r border-hair">{navList()}</div>
        )}

        {body}

        {!narrow && aside && (
          <aside className="my-5 mr-5 w-[360px] shrink-0 overflow-hidden rounded-[22px] bg-paper ring-1 ring-inset ring-hair">
            {aside}
          </aside>
        )}
      </div>

      {narrow && aside}

      {menu && (
        <div className="absolute inset-0 z-20 flex">
          <div className="flex w-[268px] flex-col bg-paper">
            <div className="flex items-center justify-between px-4 pt-4">
              <Wordmark size={15} />
              <button
                type="button"
                onClick={() => setMenu(false)}
                aria-label="Цэс хаах"
                className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:text-ink"
              >
                <IconClose />
              </button>
            </div>

            <div className="mx-4 mt-4 flex items-center gap-3 rounded-2xl bg-stage p-3">
              <span className="grid size-10 place-items-center rounded-full bg-ink text-[12px] font-bold text-paper">
                {person.initials}
              </span>
              <span className="leading-tight">
                <span className="block text-[14px] font-bold text-ink">{person.name}</span>
                <span className="block text-[12px] text-mute">{person.role}</span>
              </span>
            </div>

            <div className="mx-4 mt-3 flex items-center justify-between rounded-2xl bg-stage px-3.5 py-2.5">
              <span className="meta flex items-center gap-1.5">
                <span className="inline-block size-[6px] rounded-full bg-mute" aria-hidden="true" />
                Е-баримт · Касс {posNo}
              </span>
              <ThemeToggle onClick={onToggleTheme} />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">{navList(() => setMenu(false))}</div>

            <button
              type="button"
              onClick={onLogout}
              className="press m-4 flex h-12 items-center justify-center gap-2 rounded-xl text-[14px] font-semibold text-ink-2 ring-1 ring-inset ring-hair hover:text-ink"
            >
              <IconLogout />
              Гарах
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMenu(false)}
            aria-label="Цэс хаах"
            className="flex-1 bg-black/35"
          />
        </div>
      )}
    </div>
  );
}
