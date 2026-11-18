"use client";

/* Sales эхлэл — «Биет борлуулалт» / «Хүргэлт» хоёр том карт (BR09-1). */

import { useState } from "react";
import { useSp } from "@/lib/sp/store";
import { initials, isToday, money, orderState, PLAN_LABEL, staffName } from "@/lib/sp/logic";
import { Avatar, Badge, Group, Row, Sheet, Switch, cx, useTheme } from "@/components/sp/ui";
import { Icon, type IconName } from "@/components/sp/icons";
import { OfflineBanner, Screen, posAccess, usePos } from "./ctx";

export function Home() {
  const s = useSp();
  const pos = usePos();
  const [menu, setMenu] = useState(false);
  const [show, setShow] = useState(false);
  const [lockInfo, setLockInfo] = useState(false);
  const plan = s.merchant.plan;
  const sales = posAccess("sales", plan, pos.role);
  const delivery = posAccess("delivery", plan, pos.role);
  const products = posAccess("products", plan, pos.role);

  const mine = s.sales.filter((x) => isToday(x.at) && x.staffId === pos.staff.id && !x.refund);
  const sum = mine.reduce((a, x) => a + x.total, 0);
  const active = s.orders.filter((o) => orderState(s, o) === "active");
  const later = active.filter((o) => o.payLater && !o.paid).length;

  return (
    <Screen
      nav={
        <header className="flex shrink-0 items-center gap-3 px-4 pb-1 pt-3">
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold text-ink">{s.delivery.page.name}</div>
            <div className="flex items-center gap-1.5 text-[12px] text-mute">
              <span className={cx("size-2 rounded-full", s.online ? "bg-ok" : "bg-danger")} />
              {s.online ? "Онлайн" : "Офлайн"} · Касс 1
            </div>
          </div>
          <button type="button" aria-label="Ажилтны цэс" onClick={() => setMenu(true)} className="sp-tap rounded-full">
            <Avatar text={initials(pos.staff.first, pos.staff.last)} size={42} tone="accent" />
          </button>
        </header>
      }
    >
      <h1 className="px-4 pb-2 pt-2 text-[32px] font-bold tracking-[-0.03em] text-ink">Борлуулалт</h1>
      {!s.online && <OfflineBanner what="Гүйлгээ хийх боломжгүй" />}

      <div className="space-y-3 px-4 pt-3">
        {sales !== "hidden" && (
          <BigCard icon="bag" title="Биет борлуулалт" sub="Сагсаар эсвэл зөвхөн дүнгээр" onClick={() => pos.go({ s: "sell" })} />
        )}
        {delivery !== "hidden" && (
          <BigCard
            icon="truck"
            title="Хүргэлт"
            locked={delivery === "locked"}
            sub={
              delivery === "locked" ? (
                <span className="inline-flex items-center gap-1">
                  <Icon name="lock" size={13} /> Plus багцад нээгдэнэ
                </span>
              ) : (
                <span className="mt-1 flex flex-wrap gap-1.5">
                  <Badge tone="accent">{active.length} идэвхтэй</Badge>
                  {later > 0 && <Badge tone="warn">{later} дараа төлөх</Badge>}
                </span>
              )
            }
            onClick={() => (delivery === "locked" ? setLockInfo(true) : pos.go({ s: "orders" }))}
          />
        )}
      </div>

      {sales !== "hidden" && (
        <Group header={`Өнөөдөр · ${staffName(pos.staff)}`}>
          <Row
            title={<span className="font-semibold">{mine.length} гүйлгээ</span>}
            sub={<span className="tnum">{show ? money(sum) : "••••••₮"}</span>}
            trailing={
              <button type="button" aria-label={show ? "Дүн нуух" : "Дүн харах"} onClick={() => setShow((v) => !v)} className="sp-tap grid size-11 place-items-center rounded-full text-mute">
                <Icon name={show ? "eyeOff" : "eye"} size={22} />
              </button>
            }
          />
          <Row icon="receipt" title="Гүйлгээний түүх" chevron onClick={() => pos.go({ s: "history" })} />
        </Group>
      )}
      {products !== "hidden" && (
        <Group>
          <Row icon="box" title="Бараа" sub="Бүртгэх, үнэ, нөөц засах" chevron onClick={() => pos.go({ s: "products" })} />
        </Group>
      )}
      <div className="h-6" />

      <StaffMenu open={menu} onClose={() => setMenu(false)} />
      <Sheet open={lockInfo} onClose={() => setLockInfo(false)} title="Хүргэлт">
        <div className="px-6 pb-8 pt-4 text-center">
          <span className="mx-auto grid size-16 place-items-center rounded-full bg-accent-soft text-accent">
            <Icon name="truck" size={30} />
          </span>
          <h3 className="mt-4 text-[18px] font-semibold text-ink">Plus багцад шилжих</h3>
          <p className="mt-2 text-[14px] leading-snug text-mute">
            Хүргэлт Plus, Premium багцад багтана. Таны багц: {PLAN_LABEL[plan]}. Админ Merchant portal → Миний бүртгэл хэсгээс багцаа ахиулна.
          </p>
        </div>
      </Sheet>
    </Screen>
  );
}

function BigCard({ icon, title, sub, onClick, locked }: { icon: IconName; title: string; sub: React.ReactNode; onClick: () => void; locked?: boolean }) {
  return (
    <button type="button" onClick={onClick} className="sp-tap flex min-h-[124px] w-full items-center gap-4 rounded-[22px] bg-paper px-5 py-5 text-left shadow-[0_1px_0_rgb(0_0_0/0.04)]">
      <span className={cx("grid size-14 shrink-0 place-items-center rounded-[16px]", locked ? "bg-[var(--sp-fill)] text-mute" : "bg-accent-soft text-accent")}>
        <Icon name={icon} size={28} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx("block text-[22px] font-bold leading-tight tracking-[-0.02em]", locked ? "text-mute" : "text-ink")}>{title}</span>
        <span className="mt-1 block text-[14px] text-mute">{sub}</span>
      </span>
      <Icon name={locked ? "lock" : "chevron"} size={20} stroke={2.2} className="text-mute" />
    </button>
  );
}

function StaffMenu({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSp();
  const pos = usePos();
  const { theme, toggle } = useTheme();
  return (
    <>
      <Sheet open={open} onClose={onClose} title="Тохиргоо">
        <div className="pb-6">
          <div className="flex items-center gap-3 px-6 pb-1 pt-3">
            <Avatar text={initials(pos.staff.first, pos.staff.last)} size={52} tone="accent" />
            <div>
              <div className="text-[18px] font-semibold text-ink">{staffName(pos.staff)}</div>
              <div className="text-[13px] text-mute">{pos.role.name}</div>
            </div>
          </div>
          <Group>
            <Row icon={theme === "dark" ? "moon" : "sun"} title="Харанхуй горим" trailing={<Switch checked={theme === "dark"} onChange={toggle} label="Харанхуй горим" />} />
          </Group>
          <Group header="Тохиргоо" footer="Ebarimt-ийн холболтыг Merchant portal-аас тохируулна.">
            <Row
              icon="receipt"
              title="Ebarimt"
              sub={s.ebarimt ? "Холбогдсон" : "Холбогдоогүй"}
              trailing={<Switch checked={s.ebarimt} disabled onChange={() => {}} label="Ebarimt холболт" />}
            />
          </Group>
          <Group>
            <Row
              icon="logout"
              title="Гарах"
              destructive
              onClick={() => {
                onClose();
                pos.logout();
              }}
            />
          </Group>
        </div>
      </Sheet>
    </>
  );
}
