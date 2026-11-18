/* Бүх дэлгэц хуваалцдаг дүрсүүд. Гадны сан нэмэхгүй — inline SVG нь
   хамаарал нэмэхгүй, өнгийг currentColor-оор өвлөнө. */

const s = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const IconSearch = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <circle cx="9" cy="9" r="6" {...s} />
    <path d="M13.5 13.5 17 17" {...s} />
  </svg>
);

export const IconMinus = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M5.5 10h9" {...s} strokeWidth={2} />
  </svg>
);

export const IconPlus = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M10 5.5v9M5.5 10h9" {...s} strokeWidth={2} />
  </svg>
);

export const IconTrash = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M4 6h12M8 6V4.5h4V6M6 6l.7 9.2A1.3 1.3 0 0 0 8 16.5h4a1.3 1.3 0 0 0 1.3-1.3L14 6" {...s} />
  </svg>
);

export const IconAlert = () => (
  <svg viewBox="0 0 20 20" className="size-[13px]" aria-hidden="true">
    <path d="M10 3.5 2.8 16h14.4L10 3.5Z" {...s} />
    <path d="M10 8.4v3.2" {...s} />
    <circle cx="10" cy="13.6" r=".75" fill="currentColor" stroke="none" />
  </svg>
);

export const IconBell = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <path d="M6 8a4 4 0 1 1 8 0c0 3 1 4.2 1.5 4.7H4.5C5 12.2 6 11 6 8Z" {...s} />
    <path d="M8.4 15.2a1.8 1.8 0 0 0 3.2 0" {...s} />
  </svg>
);

export const IconExport = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <path d="M10 3v8m0 0L7 8m3 3 3-3M4 14v1.5A1.5 1.5 0 0 0 5.5 17h9a1.5 1.5 0 0 0 1.5-1.5V14" {...s} />
  </svg>
);

export const IconDots = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <circle cx="5" cy="10" r="1.3" fill="currentColor" />
    <circle cx="10" cy="10" r="1.3" fill="currentColor" />
    <circle cx="15" cy="10" r="1.3" fill="currentColor" />
  </svg>
);

export const IconBack = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M16 10H4m0 0 4-4m-4 4 4 4" {...s} />
  </svg>
);

export const IconCaret = () => (
  <svg viewBox="0 0 20 20" className="size-[13px]" aria-hidden="true">
    <path d="m8 6 4 4-4 4" {...s} />
  </svg>
);

export const IconBackspace = () => (
  <svg viewBox="0 0 22 22" className="size-[20px]" aria-hidden="true">
    <path d="M8 4h10.5A1.5 1.5 0 0 1 20 5.5v11a1.5 1.5 0 0 1-1.5 1.5H8L2 11l6-7Z" {...s} />
    <path d="m11 8.5 5 5m0-5-5 5" {...s} />
  </svg>
);

export const IconLock = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <rect x="4.5" y="9.5" width="13" height="9" rx="2.2" {...s} />
    <path d="M7.5 9.5V7a3.5 3.5 0 1 1 7 0v2.5" {...s} />
  </svg>
);

export const IconCash = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <rect x="2.5" y="6" width="17" height="10" rx="2" {...s} />
    <circle cx="11" cy="11" r="2.4" {...s} />
    <path d="M5.5 9v4M16.5 9v4" {...s} />
  </svg>
);

export const IconClock = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <circle cx="11" cy="11" r="7.5" {...s} />
    <path d="M11 7v4.2l2.6 1.6" {...s} />
  </svg>
);

/* ── зүүн цэсний дүрсүүд ── */

export const NavCash = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <path d="M4 9.5 11 4l7 5.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9.5Z" {...s} />
  </svg>
);

export const NavChart = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <circle cx="11" cy="11" r="7.5" {...s} />
    <path d="M11 4v7h7" {...s} />
  </svg>
);

export const NavTrend = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <path d="M3 15.5 8 10l3.5 3.5L19 6" {...s} />
    <path d="M14.5 6H19v4.5" {...s} />
  </svg>
);

export const NavCard = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <rect x="3" y="5.5" width="16" height="11" rx="2.2" {...s} />
    <path d="M3 9.5h16" {...s} />
  </svg>
);

export const NavBox = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <rect x="3.5" y="5" width="15" height="12.5" rx="2" {...s} />
    <path d="M3.5 9h15M9 13h4" {...s} />
  </svg>
);

export const NavGear = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <circle cx="11" cy="11" r="2.8" {...s} />
    <path d="M11 3.2V5M11 17v1.8M18.8 11H17M5 11H3.2M16.5 5.5l-1.3 1.3M6.8 15.2l-1.3 1.3M16.5 16.5l-1.3-1.3M6.8 6.8 5.5 5.5" {...s} />
  </svg>
);

export const NavShield = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <path d="M11 3.2 4.6 5.8V11c0 3.9 2.7 6.5 6.4 7.8 3.7-1.3 6.4-3.9 6.4-7.8V5.8L11 3.2Z" {...s} />
  </svg>
);

export const NavHelp = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <circle cx="11" cy="11" r="7.5" {...s} />
    <path d="M9.2 8.8a1.9 1.9 0 1 1 2.6 1.8c-.5.2-.8.7-.8 1.2v.4" {...s} />
    <circle cx="11" cy="14.8" r=".8" fill="currentColor" stroke="none" />
  </svg>
);

/* ── брэнд ── */

export const Wordmark = ({ size = 17 }: { size?: number }) => (
  <span className="flex items-center gap-2">
    <span
      className="grid place-items-center rounded-full bg-ink font-extrabold text-paper"
      style={{ width: size * 1.9, height: size * 1.9, fontSize: size * 0.76 }}
    >
      G
    </span>
    <span
      className="font-extrabold tracking-[-0.03em] text-ink"
      style={{ fontSize: size }}
    >
      Gerege<span className="text-accent">pos</span>
    </span>
  </span>
);

export const ThemeToggle = ({ onClick }: { onClick: () => void }) => (
  <button type="button" className="tt" onClick={onClick} aria-label="Сэдэв солих">
    <span className="tt-icons" aria-hidden="true">
      <svg className="tt-sun" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.7-6.7-1.4 1.4M7.7 16.3l-1.4 1.4m12 0-1.4-1.4M7.7 7.7 6.3 6.3M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
      <svg className="tt-moon" width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path
          d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  </button>
);

export const IconMenu = () => (
  <svg viewBox="0 0 22 22" className="size-[19px]" aria-hidden="true">
    <path d="M4 7h14M4 11h14M4 15h9" {...s} strokeWidth={1.8} />
  </svg>
);

export const IconClose = () => (
  <svg viewBox="0 0 22 22" className="size-[19px]" aria-hidden="true">
    <path d="M6 6l10 10M16 6 6 16" {...s} strokeWidth={1.8} />
  </svg>
);

export const IconLogout = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <path d="M13 6V4.5A1.5 1.5 0 0 0 11.5 3h-6A1.5 1.5 0 0 0 4 4.5v13A1.5 1.5 0 0 0 5.5 19h6a1.5 1.5 0 0 0 1.5-1.5V16" {...s} />
    <path d="M9 11h10m0 0-2.6-2.6M19 11l-2.6 2.6" {...s} />
  </svg>
);

export const IconCamera = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <path d="M3.5 7.5h3L8 5.5h6l1.5 2h3a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" {...s} />
    <circle cx="11" cy="12" r="3" {...s} />
  </svg>
);

export const IconImage = () => (
  <svg viewBox="0 0 22 22" className="size-[18px]" aria-hidden="true">
    <rect x="3" y="4.5" width="16" height="13" rx="2" {...s} />
    <circle cx="8" cy="9" r="1.4" {...s} />
    <path d="m4.5 15 4-4 3.5 3.5 2.5-2 3 3" {...s} />
  </svg>
);

export const IconEdit = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M13.2 3.6a1.7 1.7 0 0 1 2.4 2.4l-8 8L4 15l1-3.6 8.2-7.8Z" {...s} />
    <path d="M12.2 4.6 15 7.4" {...s} />
  </svg>
);

export const IconQr = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <rect x="2.5" y="2.5" width="6" height="6" rx="1.4" {...s} />
    <rect x="11.5" y="2.5" width="6" height="6" rx="1.4" {...s} />
    <rect x="2.5" y="11.5" width="6" height="6" rx="1.4" {...s} />
    <path d="M11.5 11.5h2.5v2.5h-2.5zM15.5 15.5h2v2h-2M11.5 17.5h2" {...s} />
  </svg>
);

export const IconList = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M4 6h12M4 10h12M4 14h12" {...s} strokeWidth={1.8} />
  </svg>
);

export const IconGrid = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <rect x="3.5" y="3.5" width="5.5" height="5.5" rx="1.3" {...s} />
    <rect x="11" y="3.5" width="5.5" height="5.5" rx="1.3" {...s} />
    <rect x="3.5" y="11" width="5.5" height="5.5" rx="1.3" {...s} />
    <rect x="11" y="11" width="5.5" height="5.5" rx="1.3" {...s} />
  </svg>
);

export const IconBarcode = () => (
  <svg viewBox="0 0 20 20" className="size-[17px]" aria-hidden="true">
    <path d="M3 6.5V4.6A1.6 1.6 0 0 1 4.6 3H6.5M13.5 3h1.9A1.6 1.6 0 0 1 17 4.6v1.9M17 13.5v1.9a1.6 1.6 0 0 1-1.6 1.6h-1.9M6.5 17H4.6A1.6 1.6 0 0 1 3 15.4v-1.9" {...s} />
    <path d="M6.5 7v6M9 7v6M11.5 7v6M13.5 7v6" {...s} strokeWidth={1.4} />
  </svg>
);

export const IconPrint = () => (
  <svg viewBox="0 0 20 20" className="size-[16px]" aria-hidden="true">
    <path d="M6 7.5V3.5h8v4" {...s} />
    <rect x="3" y="7.5" width="14" height="6" rx="1.6" {...s} />
    <path d="M6 11.5h8v5H6z" {...s} />
  </svg>
);
