"use client";

/* Бараа (BR03), Wallet карт (BR02 Premium, 6.2.7), мэдэгдэл (BR09-10) — гар утсанд хэрэгтэй хэсэг л */

import { useState } from "react";
import { ago, lowStock, money, num } from "@/lib/sp/logic";
import { readNotices, setDeliveryStopped, uid, upsertProduct, useSp } from "@/lib/sp/store";
import { DEFAULT_TAX, modeOf } from "@/lib/sp/tax";
import { FoundCategory, LookupBadge, OwnProduction, TaxLine, TilePicker, bunaLabel, shareToCatalog, useCatalogLookup } from "@/components/sp/TaxPick";
import { CameraScanner } from "@/components/CameraScanner";
import type { Product } from "@/lib/sp/types";
import { Badge, Btn, cx, Empty, Field, Group, IconBtn, NavBar, Notice, Row, SearchField, Segmented, Sheet, Switch, toast, useConfirm } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { QrCode } from "@/components/QrCode";
import { Locked, Screen, useM } from "./core";

type F = "all" | "low" | "stopped";

export function Products() {
  const s = useSp();
  const m = useM();
  const { confirm, node } = useConfirm();
  const [f, setF] = useState<F>("all");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string[] | null>(null);
  const [edit, setEdit] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const low = new Set(lowStock(s).map((p) => p.id));
  const list = s.products
    .filter((p) => p.active)
    .filter((p) => (f === "low" ? low.has(p.id) : f === "stopped" ? p.delivery && p.deliveryStopped : true))
    .filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => Number(low.has(b.id)) - Number(low.has(a.id)) || a.name.localeCompare(b.name));
  const picking = sel !== null;
  const bulk = (stopped: boolean) => {
    const ids = sel ?? [];
    const run = () => {
      setDeliveryStopped(m.actor, ids, stopped);
      toast(stopped ? `${ids.length} барааны хүргэлт зогслоо` : `${ids.length} барааны хүргэлт сэргэлээ`, "ok");
      setSel(null);
    };
    if (stopped) confirm({ title: `${ids.length} барааны хүргэлтийг зогсоох уу?`, message: "Захиалгын хуудсанд «Хүргэлт түр зогссон» гэж харагдана. Касс дээр зарагдсаар байна.", ok: "Зогсоох", destructive: true, run });
    else run();
  };

  return (
    <Screen
      nav={
        <NavBar
          onBack={m.pop}
          backLabel="Бусад"
          title="Бараа"
          trailing={
            m.manage ? (
              <span className="flex items-center gap-1">
                {!picking && <IconBtn name="plus" label="Бараа нэмэх" tone="accent" size={36} onClick={() => setAdding(true)} />}
                <Btn variant="plain" size="sm" onClick={() => setSel(picking ? null : [])}>
                  {picking ? "Болих" : "Сонгох"}
                </Btn>
              </span>
            ) : undefined
          }
        />
      }
      footer={
        picking ? (
          <div className="grid grid-cols-2 gap-2">
            <Btn variant="dangerTinted" size="md" disabled={!sel?.length} onClick={() => bulk(true)}>
              Хүргэлт зогсоох
            </Btn>
            <Btn variant="tinted" size="md" disabled={!sel?.length} onClick={() => bulk(false)}>
              Хүргэлт сэргээх
            </Btn>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-2.5 px-4 pt-3">
        <SearchField value={q} onChange={setQ} placeholder="Бараа хайх" />
        <Segmented
          value={f}
          onChange={setF}
          options={[
            { id: "all", label: "Бүгд" },
            { id: "low", label: `Нөөц бага · ${low.size}` },
            { id: "stopped", label: "Зогссон" },
          ]}
        />
      </div>
      {list.length === 0 ? (
        <Empty icon="box" title="Бараа алга" body={f === "low" ? "Бүх барааны нөөц хангалттай." : "Бараа Merchant portal дээр бүртгэнэ."} />
      ) : (
        <Group className="mt-3">
          {list.map((p) => {
            const on = sel?.includes(p.id);
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => (picking ? setSel(on ? sel!.filter((x) => x !== p.id) : [...sel!, p.id]) : setEdit(p))}
                className="sp-row flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left"
              >
                {picking && (
                  <span className={cx("grid size-6 shrink-0 place-items-center rounded-full", on ? "bg-accent text-white" : "shadow-[inset_0_0_0_1.5px_var(--line)]")}>{on && <Icon name="check" size={15} stroke={2.6} />}</span>
                )}
                {p.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image} alt="" className="size-11 shrink-0 rounded-[10px] bg-white object-contain p-1" />
                ) : (
                  <span className="grid size-11 shrink-0 place-items-center rounded-[10px] bg-[var(--sp-fill)] text-mute">
                    <Icon name="box" size={20} />
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] text-ink">{p.name}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[13px] text-mute">
                    <span className="tnum">{money(p.price)}</span>
                    <span>{bunaLabel(p.bunaCode, s.merchant.tax ?? DEFAULT_TAX)}</span>
                    {p.addedBy === "pos" && <Badge tone="accent">Кассаас нэмсэн</Badge>}
                    {p.delivery && p.deliveryStopped && <Badge tone="warn" icon="stop">Хүргэлт зогссон</Badge>}
                    {!p.delivery && <Badge>Хүргэлтгүй</Badge>}
                  </span>
                </span>
                <span className={cx("shrink-0 text-[15px] tnum", p.stock === 0 ? "font-semibold text-danger" : low.has(p.id) ? "font-semibold text-warn" : "text-mute")}>
                  {num(p.stock)} {p.unit}
                </span>
              </button>
            );
          })}
        </Group>
      )}
      <p className="px-8 pt-2 text-[13px] leading-snug text-mute">«+» дарж баркод уншуулаад бараа нэмнэ. Зураг, оноо — Merchant portal дээр. Үнэ, нөөцийн засвар бүр лог тайланд бичигдэнэ.</p>
      <ProductSheet p={edit} onClose={() => setEdit(null)} />
      <AddProduct open={adding} onClose={() => setAdding(false)} />
      {node}
    </Screen>
  );
}

/* ───────── бараа нэмэх: баркод → (сан) → нэр, ангилал → үнэ ───────── */

function AddProduct({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useSp();
  const m = useM();
  const profile = s.merchant.tax ?? DEFAULT_TAX;
  const blank = () => ({ barcode: "", name: "", price: 0, stock: 0, bunaCode: undefined as string | undefined, ownProduction: false, categoryId: s.categories.find((c) => c.active)?.id ?? "" });
  const [f, setF] = useState(blank);
  const [cam, setCam] = useState(false);
  const [bunaName, setBunaName] = useState<string>();
  const [tried, setTried] = useState(false);
  const [pick, setPick] = useState(false);
  const res = useCatalogLookup(f.barcode, (r) => {
    setPick(false);
    setF((x) => ({ ...x, name: x.name.trim() ? x.name : r.name.replace(/\s+/g, " "), bunaCode: r.buna ?? x.bunaCode }));
    setBunaName(r.bunaName);
  });
  const dupe = f.barcode && s.products.find((p) => p.barcode === f.barcode);
  const err = !f.name.trim() ? "Нэр бичнэ үү" : !f.bunaCode ? "Ангиллаа сонгоно уу" : f.price <= 0 ? "Үнэ оруулна уу" : dupe ? `Энэ баркод «${dupe.name}»-д бүртгэлтэй` : null;
  const reset = () => {
    setF(blank());
    setBunaName(undefined);
    setTried(false);
    setPick(false);
  };
  const save = (next: boolean) => {
    setTried(true);
    if (err) return toast(err, "danger");
    const p: Product = {
      id: uid("p"), name: f.name.trim(), categoryId: f.categoryId, price: f.price, stock: f.stock, minStock: 5, delivery: true, deliveryStopped: f.stock === 0,
      points: 0, image: "", barcode: f.barcode, unit: "ш", active: true, bunaCode: f.bunaCode,
      bunaSource: res.st === "found" && res.buna === f.bunaCode ? res.source : "tile", ownProduction: f.ownProduction || undefined, addedBy: "mobile",
    };
    upsertProduct(m.actor, p);
    if (res.st === "miss") shareToCatalog(f.barcode, p.name, p.bunaCode);
    toast(`«${p.name}» нэмэгдлээ`, "ok");
    reset();
    if (!next) onClose();
  };
  const mode = modeOf(profile);
  return (
    <Sheet
      open={open}
      full
      onClose={() => { reset(); onClose(); }}
      title="Бараа нэмэх"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Btn variant="tinted" size="md" onClick={() => save(true)}>Хадгалаад дараагийнх</Btn>
          <Btn size="md" onClick={() => save(false)}>Хадгалах</Btn>
        </div>
      }
    >
      <div className="space-y-4 px-4 pb-6 pt-2">
        <Field label="Баркод">
          <div className="flex gap-2">
            <input className="sp-field tnum" inputMode="numeric" placeholder="Уншуулах эсвэл бичих" value={f.barcode} onChange={(e) => setF({ ...f, barcode: e.target.value.replace(/\D/g, "").slice(0, 14) })} name="nbarcode" />
            <IconBtn name="scan" label="Камераар уншуулах" tone="accent" size={48} onClick={() => setCam(true)} />
          </div>
        </Field>
        <LookupBadge res={res} />
        <Field label="Нэр (ямар ч хэлээр)" error={tried && !f.name.trim() ? "Нэр бичнэ үү" : null}>
          <input className="sp-field" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Жишээ: Сүү 1 л" name="nname" />
        </Field>
        <div>
          <div className="mb-1.5 flex items-baseline justify-between px-1 text-[13px]">
            <span className={cx("font-medium", tried && !f.bunaCode ? "text-danger" : "text-mute")}>{res.st === "found" && f.bunaCode ? "Ангилал (сангаас)" : "Аль ангилалд орох вэ?"}</span>
            {f.bunaCode && <span className="truncate pl-2 text-mute">{bunaName ?? bunaLabel(f.bunaCode, profile)}</span>}
          </div>
          {res.st === "found" && res.buna && f.bunaCode === res.buna && !pick ? (
            <FoundCategory name={bunaName} code={f.bunaCode} onChange={() => setPick(true)} />
          ) : (
            <TilePicker profile={profile} value={f.bunaCode} compact onChange={(b) => { setF({ ...f, bunaCode: b }); setBunaName(undefined); }} />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Зарах үнэ, ₮" error={tried && f.price <= 0 ? "Үнэ оруулна уу" : null}>
            <input className="sp-field tnum" inputMode="numeric" value={f.price || ""} placeholder="0" onChange={(e) => setF({ ...f, price: Number(e.target.value.replace(/\D/g, "")) || 0 })} name="nprice" />
          </Field>
          <Field label="Үлдэгдэл">
            <input className="sp-field tnum" inputMode="numeric" value={f.stock || ""} placeholder="0" onChange={(e) => setF({ ...f, stock: Number(e.target.value.replace(/\D/g, "")) || 0 })} name="nstock" />
          </Field>
        </div>
        <TaxLine profile={profile} product={f} price={f.price} />
        <OwnProduction profile={profile} value={f.ownProduction} onChange={(v) => setF({ ...f, ownProduction: v })} />
        <Field label="Дэлгүүрийн төрөл (кассын шүүлтүүрт)">
          <Segmented value={f.categoryId} onChange={(v) => setF({ ...f, categoryId: v })} options={s.categories.filter((c) => c.active).slice(0, 5).map((c) => ({ id: c.id, label: c.name }))} />
        </Field>
        <p className="px-1 text-[12px] leading-snug text-mute">Таны татварын горим: <b>{mode.title}</b>. Gerege бүртгэлийн үед тохируулсан. Дэлгүүрийн төрөл нь зөвхөн кассын шүүлтүүр, татварт нөлөөлөхгүй.</p>
      </div>
      {cam && (
        <CameraScanner
          title="Баркод уншуулах"
          okText="Уншлаа"
          missText="—"
          onScan={(code) => {
            setF((x) => ({ ...x, barcode: code }));
            setCam(false);
            return true;
          }}
          onClose={() => setCam(false)}
        />
      )}
    </Sheet>
  );
}

function ProductSheet({ p, onClose }: { p: Product | null; onClose: () => void }) {
  const m = useM();
  const [f, setF] = useState<Product | null>(p);
  const [was, setWas] = useState(p);
  if (p !== was) {
    setWas(p);
    setF(p);
  }
  const save = () => {
    if (!f) return;
    if (f.price <= 0) return toast("Үнэ 0-ээс их байна", "danger");
    // BR03-8: нөөц 0 бол хүргэлт автоматаар зогсоно
    upsertProduct(m.actor, { ...f, deliveryStopped: f.stock === 0 ? true : f.deliveryStopped });
    toast("Хадгаллаа", "ok");
    onClose();
  };
  return (
    <Sheet open={!!p} onClose={onClose} title={p?.name} footer={<Btn block onClick={save}>Хадгалах</Btn>}>
      {f && (
        <div className="space-y-4 px-4 pb-4 pt-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Үнэ, ₮">
              <input className="sp-field tnum" inputMode="numeric" value={f.price} onChange={(e) => setF({ ...f, price: Number(e.target.value.replace(/\D/g, "")) || 0 })} name="pprice" />
            </Field>
            <Field label={`Нөөц, ${f.unit}`} hint={`Доод босго ${f.minStock}`}>
              <div className="flex items-center gap-1.5">
                <IconBtn name="minus" label="Хасах" size={40} onClick={() => setF({ ...f, stock: Math.max(0, f.stock - 1) })} />
                <input className="sp-field !px-2 text-center tnum" inputMode="numeric" value={f.stock} onChange={(e) => setF({ ...f, stock: Number(e.target.value.replace(/\D/g, "")) || 0 })} name="pstock" />
                <IconBtn name="plus" label="Нэмэх" size={40} onClick={() => setF({ ...f, stock: f.stock + 1 })} />
              </div>
            </Field>
          </div>
          {f.delivery ? (
            <div className="flex items-center gap-3 rounded-[14px] bg-paper px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="text-[16px] text-ink">Хүргэлтээр зарах</div>
                <div className="text-[13px] text-mute">{f.stock === 0 ? "Нөөц 0 тул автоматаар зогссон" : f.deliveryStopped ? "Түр зогссон — захиалгын хуудсанд саарал" : "Захиалгын хуудсанд харагдана"}</div>
              </div>
              <Switch checked={!f.deliveryStopped && f.stock > 0} disabled={f.stock === 0} onChange={(v) => setF({ ...f, deliveryStopped: !v })} label="Хүргэлтээр зарах" />
            </div>
          ) : (
            <Notice tone="gray" icon="info">Энэ бараа хүргэлтэд ороогүй.</Notice>
          )}
        </div>
      )}
    </Sheet>
  );
}

export function WalletPassScreen() {
  const s = useSp();
  const m = useM();
  const issued = s.customers.filter((c) => !c.erased && c.passSerial);
  const link = typeof window !== "undefined" ? `${window.location.origin}/shop` : "/shop";
  if (m.can("wallet") === "locked")
    return (
      <Screen nav={<NavBar onBack={m.pop} backLabel="Бусад" title="Wallet карт" />}>
        <Locked module="wallet" />
      </Screen>
    );
  const pts = issued.reduce((a, c) => a + c.points, 0);
  const sample = [...issued].sort((a, b) => b.points - a.points)[0];
  return (
    <Screen nav={<NavBar onBack={m.pop} backLabel="Бусад" title="Wallet карт" />}>
      <div className="px-4 pt-4">
        <div className="rounded-[20px] p-5 shadow-[0_20px_40px_-24px_rgb(0_0_0/0.5)]" style={{ background: s.pass.bg, color: s.pass.fg }}>
          <div className="flex items-center justify-between text-[14px] opacity-80">
            <span className="font-semibold">{s.delivery.page.name}</span>
            <span>{s.pass.label}</span>
          </div>
          <div className="mt-6 text-[34px] font-bold tracking-[-0.03em] tnum">{num(sample?.points ?? 0)}</div>
          <div className="mt-4 flex items-end justify-between">
            <span className="text-[12px] opacity-70">{sample ? `${sample.name ?? "Харилцагч"} · ${sample.passSerial}` : "Жишээ карт"}</span>
            <span className="rounded-[8px] bg-white p-1">
              <QrCode value={sample?.passSerial ?? "GP-DEMO"} size={56} label="Жишээ карт" />
            </span>
          </div>
        </div>
        <div className="mt-3 flex justify-center">
          <Badge tone={s.pass.published ? "ok" : "warn"} icon={s.pass.published ? "check" : "warn"}>
            {s.pass.published ? "Нийтлэгдсэн" : "Нийтлээгүй"}
          </Badge>
        </div>
      </div>
      <Group className="mt-3">
        <Row icon="wallet" title="Олгосон карт" value={num(issued.length)} />
        <Row icon="star" title="Карттай харилцагчийн оноо" value={num(pts)} />
      </Group>
      <Group header="Карт тараах холбоос" footer="Касс дээрх QR, SMS, захиалгын хуудсаар тарна. Апп суулгах шаардлагагүй.">
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="rounded-[10px] bg-white p-1.5">
            <QrCode value={link} size={84} label="Холбоос" />
          </span>
          <span className="min-w-0 flex-1 break-all text-[14px] text-ink-2">{link}</span>
        </div>
        <Row
          icon="link"
          iconTone="accent"
          title={<span className="text-accent">Холбоос хуваалцах</span>}
          onClick={async () => {
            try {
              if (navigator.share) await navigator.share({ title: s.delivery.page.name, url: link });
              else {
                await navigator.clipboard.writeText(link);
                toast("Холбоос хууллаа", "ok");
              }
            } catch {
              /* хэрэглэгч болиулсан */
            }
          }}
        />
      </Group>
      <p className="px-8 pt-2 text-[13px] text-mute">Загвар, өнгө, лого — Merchant portal дээр.</p>
    </Screen>
  );
}

export function Notices() {
  const s = useSp();
  const m = useM();
  const unread = s.notices.filter((n) => !n.read).length;
  return (
    <Screen
      nav={
        <NavBar
          onBack={m.pop}
          backLabel="Нүүр"
          title="Мэдэгдэл"
          trailing={
            unread ? (
              <Btn variant="plain" size="sm" onClick={() => readNotices()}>
                Бүгдийг уншсан
              </Btn>
            ) : undefined
          }
        />
      }
    >
      {s.notices.length === 0 ? (
        <Empty icon="bell" title="Мэдэгдэл алга" body="Шинэ захиалга, нөөц дуусах анхааруулга энд ирнэ." />
      ) : (
        <Group className="pt-3">
          {s.notices.map((n) => {
            const no = Number(n.title.match(/#(\d+)/)?.[1]);
            const o = n.kind === "order" ? s.orders.find((x) => x.no === no) : undefined;
            const go = o && m.can("delivery") === "ok" ? () => m.goTab("delivery", { k: "order", id: o.id }) : n.kind === "stock" && m.can("products") !== "hidden" ? () => m.goTab("more", { k: "products" }) : undefined;
            return (
              <Row
                key={n.id}
                icon={n.kind === "order" ? "truck" : n.kind === "stock" ? "warn" : "info"}
                iconTone={n.read ? "gray" : n.kind === "stock" ? "warn" : "accent"}
                title={<span className={n.read ? "" : "font-semibold"}>{n.title}</span>}
                sub={`${n.body} · ${ago(n.at)}`}
                chevron={!!go}
                onClick={go}
                trailing={!n.read ? <span className="size-2.5 rounded-full bg-accent" aria-label="Уншаагүй" /> : undefined}
              />
            );
          })}
        </Group>
      )}
    </Screen>
  );
}
