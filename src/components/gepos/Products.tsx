"use client";

/*
 * Бараа бүртгэл пос дээр (BR03) — порталын барааны формтой ижил талбарууд.
 * «products» модультай эрх шууд засна; кассчин менежерийн PIN-ээр (BR09-2).
 */

import { useState, type ReactNode } from "react";
import { uid, upsertCategory, upsertProduct, useSp } from "@/lib/sp/store";
import { activePointCampaign, money } from "@/lib/sp/logic";
import type { Product } from "@/lib/sp/types";
import { useBarcodeScanner } from "@/lib/scanner";
import { CameraScanner } from "@/components/CameraScanner";
import { Badge, Btn, Empty, Group, IconBtn, NavBar, NumPad, Row, SearchField, Sheet, Switch, cx, toast, useKeypad } from "@/components/sp/ui";
import { Icon } from "@/components/sp/icons";
import { FoundCategory, LookupBadge, OwnProduction, TaxLine, TilePicker, shareToCatalog, useCatalogLookup } from "@/components/sp/TaxPick";
import { DEFAULT_TAX } from "@/lib/sp/tax";
import { Screen, usePos } from "./ctx";
import { useGuard } from "./Approval";

const canEdit = (modules: string[]) => modules.includes("products");

function Thumb({ p, size = 48 }: { p: { image: string }; size?: number }) {
  return (
    <span className="plate grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <Icon name="box" size={size * 0.45} className="text-black/30" />
      {p.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.image} alt="" className="absolute inset-0 size-full bg-[inherit] p-1" onError={(e) => (e.currentTarget.style.display = "none")} />
      )}
    </span>
  );
}

export function Products() {
  const s = useSp();
  const pos = usePos();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const term = q.trim().toLowerCase();
  const list = s.products
    .filter((p) => (cat === "all" || p.categoryId === cat) && (!term || p.name.toLowerCase().includes(term) || p.barcode.includes(term)))
    .sort((a, b) => Number(b.active) - Number(a.active) || Number(a.stock > a.minStock) - Number(b.stock > b.minStock) || a.name.localeCompare(b.name));
  const cats = s.categories.filter((c) => c.active);
  useBarcodeScanner((code) => {
    const p = s.products.find((x) => x.barcode === code);
    pos.go(p ? { s: "product", id: p.id } : { s: "product", barcode: code });
  });

  return (
    <Screen
      nav={<NavBar title="Бараа" onBack={pos.back} trailing={<IconBtn name="plus" label="Бараа нэмэх" tone="plain" onClick={() => pos.go({ s: "product" })} />} />}
      bottom={
        <Btn size="xl" block icon="plus" onClick={() => pos.go({ s: "product" })}>
          Бараа нэмэх
        </Btn>
      }
    >
      <div className="sp-material sticky top-0 z-10 space-y-2 px-4 pb-2 pt-3">
        <SearchField value={q} onChange={setQ} placeholder="Нэр эсвэл бар код" />
        <div className="sp-scroll -mx-4 flex gap-1.5 overflow-x-auto px-4">
          {[{ id: "all", name: "Бүгд" }, ...cats].map((c) => (
            <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)} className="chip chip--lg shrink-0">
              {c.name}
            </button>
          ))}
        </div>
      </div>
      {list.length === 0 ? (
        <Empty icon="box" title={s.products.length ? "Бараа олдсонгүй" : "Бараа бүртгэлгүй"} body="«Бараа нэмэх» дарж эхний бараагаа бүртгэнэ үү. Бар кодыг уншуулбал шууд бөглөгдөнө." />
      ) : (
        <div className="px-4 pb-6 pt-1">
          <div className="overflow-hidden rounded-[var(--sp-r-group)] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
            {list.map((p) => {
              const low = p.stock <= p.minStock;
              return (
                <button key={p.id} type="button" onClick={() => pos.go({ s: "product", id: p.id })} className={cx("sp-row flex w-full items-center gap-3 px-3 py-2.5 text-left", !p.active && "opacity-50")}>
                  <Thumb p={p} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15.5px] font-medium text-ink">{p.name}</span>
                    <span className="flex flex-wrap items-center gap-x-1.5 text-[13px]">
                      <span className="font-semibold text-ink tnum">{money(p.price)}</span>
                      <span className={cx("tnum", low ? "font-semibold text-warn" : "text-mute")}>· Үлдэгдэл {p.stock}</span>
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    {!p.active && <Badge>Идэвхгүй</Badge>}
                    {p.active && p.deliveryStopped && <Badge tone="warn">Зогссон</Badge>}
                  </span>
                  <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Screen>
  );
}

/* ───────── форм ───────── */

function ean13() {
  const body = "486" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const sum = body.split("").reduce((a, ch, i) => a + Number(ch) * (i % 2 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}

/** Зургийг жижигрүүлж data URL болгоно (localStorage-д багтаана) */
function shrink(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 240;
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", 0.8));
      };
      img.onerror = rej;
      img.src = String(r.result);
    };
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

const digits = (v: string) => v.replace(/\D/g, "").slice(0, 9);

function FRow({ label, children, req }: { label: string; children: ReactNode; req?: boolean }) {
  return (
    <label className="flex min-h-[52px] items-center gap-3 px-4">
      <span className="w-[112px] shrink-0 text-[15px] text-ink">
        {label}
        {req && <span className="text-accent"> *</span>}
      </span>
      <span className="flex min-w-0 flex-1 items-center justify-end gap-1">{children}</span>
    </label>
  );
}

const inputCls = "h-11 min-w-0 flex-1 bg-transparent text-right text-[16px] text-ink outline-none placeholder:text-mute";

export function ProductForm({ id, barcode }: { id?: string; barcode?: string }) {
  const s = useSp();
  const pos = usePos();
  const guard = useGuard();
  const prev = id ? s.products.find((p) => p.id === id) : undefined;
  const [f, setF] = useState<Product>(
    () =>
      prev ?? {
        id: uid("p"),
        name: "",
        categoryId: s.categories.find((c) => c.active)?.id ?? "",
        price: 0,
        stock: 0,
        minStock: 5,
        delivery: true,
        deliveryStopped: false,
        points: 0,
        image: "",
        barcode: barcode ?? "",
        unit: "ш",
        active: true,
      },
  );
  const [cost, setCost] = useState(prev?.cost != null ? String(prev.cost) : "");
  const [tried, setTried] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [cam, setCam] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQty, setAddQty] = useState("");
  const allowed = canEdit(pos.role.modules);
  const camp = activePointCampaign(s);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setF((x) => ({ ...x, [k]: v }));
  const dupe = f.barcode && s.products.find((p) => p.barcode === f.barcode && p.id !== f.id);
  const profile = s.merchant.tax ?? DEFAULT_TAX;
  const [bunaName, setBunaName] = useState<string | undefined>();
  const [pick, setPick] = useState(false);
  const res = useCatalogLookup(f.barcode, (r) => {
    setPick(false);
    // Баркод санд олдвол нэр, ангиллыг бөглөнө (нэр хоосон бол л)
    setF((x) => ({ ...x, name: x.name.trim() ? x.name : r.name.replace(/\s+/g, " "), bunaCode: r.buna ?? x.bunaCode, bunaSource: r.buna ? r.source : x.bunaSource }));
    setBunaName(r.bunaName);
  });
  const errs = { name: !f.name.trim(), price: f.price <= 0, cat: !f.categoryId, buna: !f.bunaCode };
  const invalid = errs.name || errs.price || errs.cat || errs.buna || !!dupe;

  useBarcodeScanner((code) => {
    if (!cam && !catOpen && !addOpen) set("barcode", code);
  });

  const save = () => {
    setTried(true);
    if (invalid) return toast(dupe ? "Энэ бар код өөр бараанд бүртгэлтэй" : errs.buna ? "Ангиллаа сонгоно уу" : "Нэр, төрөл, үнийг бөглөнө үү", "danger");
    const p: Product = { ...f, name: f.name.trim(), cost: cost ? Number(cost) : undefined, addedBy: prev ? f.addedBy : "pos" };
    if (res.st === "miss") shareToCatalog(f.barcode, p.name, p.bunaCode);
    guard({ title: "Хадгалах уу?", ok: "Хадгалах", action: prev ? "Бараа засах" : "Бараа бүртгэх", allowed, quiet: true }, (actor) => {
      upsertProduct(actor, p);
      toast(prev ? "Хадгалагдлаа" : `«${p.name}» бүртгэгдлээ`, "ok");
      pos.back();
    });
  };

  const addStock = () => {
    const n = Number(addQty || 0);
    if (!prev || n <= 0) return;
    guard({ title: "Нөөц нэмэх үү?", ok: "Нэмэх", action: "Нөөц нэмэх", allowed, quiet: true }, (actor) => {
      const cur = s.products.find((p) => p.id === prev.id) ?? prev;
      upsertProduct(actor, { ...cur, stock: cur.stock + n });
      setF((x) => ({ ...x, stock: cur.stock + n }));
      setAddOpen(false);
      setAddQty("");
      toast(`+${n} нөөц нэмэгдлээ`, "ok");
    });
  };
  useKeypad((k) => {
    if (k === "back") setAddQty((v) => v.slice(0, -1));
    else if (k === "enter") addStock();
    else setAddQty((v) => digits(v + k));
  }, addOpen);

  const addCategory = () => {
    const name = newCat.trim();
    if (!name) return;
    guard({ title: "Төрөл нэмэх үү?", ok: "Нэмэх", action: "Барааны төрөл нэмэх", allowed, quiet: true }, (actor) => {
      const c = { id: uid("c"), name, active: true };
      upsertCategory(actor, c);
      set("categoryId", c.id);
      setNewCat("");
      setCatOpen(false);
    });
  };

  const catName = s.categories.find((c) => c.id === f.categoryId)?.name;

  return (
    <Screen
      nav={
        <NavBar
          title={prev ? "Бараа засах" : "Шинэ бараа"}
          leading={
            <button type="button" onClick={pos.back} className="sp-tap h-11 rounded-full px-2 text-[17px] text-accent">
              Болих
            </button>
          }
          trailing={
            <button type="button" onClick={save} className="sp-tap h-11 rounded-full px-2 text-[17px] font-semibold text-accent">
              Хадгалах
            </button>
          }
        />
      }
      bottom={
        <>
          <Btn size="xl" block onClick={save}>
            Хадгалах
          </Btn>
          {!allowed && <p className="pt-2 text-center text-[12px] text-mute">Менежер эсвэл админы PIN шаардлагатай</p>}
        </>
      }
    >
      <div className="flex items-center gap-4 px-4 pt-4">
        <label className="sp-tap relative cursor-pointer">
          <Thumb p={f} size={84} />
          <span className="absolute -bottom-1 -right-1 grid size-8 place-items-center rounded-full bg-accent text-white shadow">
            <Icon name="plus" size={18} stroke={2.4} />
          </span>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Зураг"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                set("image", await shrink(file));
              } catch {
                toast("Зураг уншиж чадсангүй", "danger");
              }
            }}
          />
        </label>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] text-mute">Зураг</div>
          <div className="text-[14px] leading-snug text-ink-2">Камераар авах эсвэл файлаас сонгоно</div>
          {f.image && (
            <button type="button" className="mt-1 h-8 text-[14px] font-semibold text-danger" onClick={() => set("image", "")}>
              Зураг хасах
            </button>
          )}
        </div>
      </div>

      <Group header="Бар код ба ангилал" footer="Бар кодоор и-Баримтын сангаас нэр, ангиллыг хайна. Татварыг систем тооцно — та сонгохгүй.">
        <FRow label="Бар код">
          <input inputMode="numeric" className={cx(inputCls, "tnum")} placeholder="Уншуулах эсвэл бичих" value={f.barcode} onChange={(e) => set("barcode", e.target.value.replace(/\s/g, ""))} />
        </FRow>
        <div className="grid grid-cols-2 gap-2 px-4 py-2.5">
          <Btn variant="tinted" size="md" icon="scan" onClick={() => setCam(true)}>
            Камераар
          </Btn>
          <Btn variant="gray" size="md" icon="sparkle" onClick={() => set("barcode", ean13())}>
            Баркодгүй бараа
          </Btn>
        </div>
        {res.st !== "idle" && (
          <div className="px-4 pb-3">
            <LookupBadge res={res} />
          </div>
        )}
        <div className="space-y-2 px-4 pb-3">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className={cx("font-medium", tried && errs.buna ? "text-danger" : "text-mute")}>Ангилал{!f.bunaCode && " — сонгоно уу"}</span>
            {f.bunaCode && <span className="text-mute">{bunaName ?? ""} · {f.bunaCode}</span>}
          </div>
          {res.st === "found" && res.buna && f.bunaCode === res.buna && !pick ? (
            <FoundCategory name={bunaName} code={f.bunaCode} onChange={() => setPick(true)} />
          ) : (
            <TilePicker profile={profile} value={f.bunaCode} compact onChange={(b) => { setF((x) => ({ ...x, bunaCode: b, bunaSource: "tile" })); setBunaName(undefined); }} />
          )}
          <TaxLine profile={profile} product={f} price={f.price} />
          <OwnProduction profile={profile} value={!!f.ownProduction} onChange={(v) => set("ownProduction", v)} />
        </div>
      </Group>

      <Group header="Үндсэн">
        <FRow label="Нэр" req>
          <input className={cx(inputCls, tried && errs.name && "placeholder:text-danger")} placeholder="Барааны нэр" value={f.name} onChange={(e) => set("name", e.target.value)} />
        </FRow>
        <button type="button" onClick={() => setCatOpen(true)} className="sp-row flex min-h-[52px] w-full items-center gap-3 px-4 text-left">
          <span className="w-[112px] shrink-0 text-[15px] text-ink">
            Төрөл<span className="text-accent"> *</span>
          </span>
          <span className={cx("min-w-0 flex-1 truncate text-right text-[16px]", catName ? "text-ink" : tried ? "text-danger" : "text-mute")}>{catName ?? "Сонгох"}</span>
          <Icon name="chevron" size={17} stroke={2.2} className="text-[var(--line)]" />
        </button>
        <FRow label="Үнэ" req>
          <input
            inputMode="numeric"
            className={cx(inputCls, "tnum", tried && errs.price && "placeholder:text-danger")}
            placeholder="0"
            value={f.price ? String(f.price) : ""}
            onChange={(e) => set("price", Number(digits(e.target.value) || 0))}
          />
          <span className="text-mute">₮</span>
        </FRow>
        <FRow label="Өртөг">
          <input inputMode="numeric" className={cx(inputCls, "tnum")} placeholder="Заавал биш" value={cost} onChange={(e) => setCost(digits(e.target.value))} />
          {cost && <span className="text-mute">₮</span>}
        </FRow>
      </Group>

      <Group header="Нөөц" footer="Үлдэгдэл доод хэмжээнд хүрэхэд мэдэгдэл ирнэ. 0 болбол хүргэлт автоматаар зогсоно.">
        <FRow label="Үлдэгдэл">
          <input inputMode="numeric" className={cx(inputCls, "tnum")} value={String(f.stock)} onChange={(e) => set("stock", Number(digits(e.target.value) || 0))} />
          <span className="text-mute">{f.unit}</span>
        </FRow>
        <FRow label="Доод хэмжээ">
          <input inputMode="numeric" className={cx(inputCls, "tnum")} value={String(f.minStock)} onChange={(e) => set("minStock", Number(digits(e.target.value) || 0))} />
          <span className="text-mute">{f.unit}</span>
        </FRow>
        {prev && <Row icon="plus" iconTone="accent" title={<span className="font-semibold text-accent">Нөөц нэмэх</span>} onClick={() => setAddOpen(true)} />}
      </Group>

      <Group header="Хүргэлт">
        <Row title="Хүргэлттэй" sub="Захиалгын хуудсанд харагдана" trailing={<Switch checked={f.delivery} onChange={(v) => set("delivery", v)} label="Хүргэлттэй" />} />
        <Row title="Хүргэлт зогссон" sub="Түр хугацаанд захиалга авахгүй" trailing={<Switch checked={f.deliveryStopped} disabled={!f.delivery} onChange={(v) => set("deliveryStopped", v)} label="Хүргэлт зогссон" />} />
      </Group>

      <Group header="Оноо" footer={camp ? `«${camp.name}» идэвхтэй — нэг ширхэг зарагдах бүрт харилцагчид олгоно.` : "Идэвхтэй онооны урамшуулал алга. Оноо бэлтгэл утга болж хадгалагдах ба урамшуулал идэвхжмэгц тооцогдоно."}>
        <FRow label="Нэг ширхэгт">
          <input inputMode="numeric" className={cx(inputCls, "tnum")} value={String(f.points)} onChange={(e) => set("points", Number(digits(e.target.value) || 0))} />
          <span className="text-mute">оноо</span>
        </FRow>
      </Group>

      {dupe && <p className="px-8 pt-1.5 text-[13px] font-medium text-danger">Энэ код «{dupe.name}»-д бүртгэлтэй байна.</p>}

      {prev && (
        <Group footer="Бараа устгагдахгүй — идэвхгүй болгоход кассанд харагдахгүй, түүх хадгалагдана.">
          <Row title="Идэвхтэй" trailing={<Switch checked={f.active} onChange={(v) => set("active", v)} label="Идэвхтэй" />} />
        </Group>
      )}
      <div className="h-6" />

      <Sheet open={catOpen} onClose={() => setCatOpen(false)} title="Төрөл">
        <div className="pb-6">
          <Group>
            {s.categories
              .filter((c) => c.active)
              .map((c) => (
                <Row
                  key={c.id}
                  title={c.name}
                  trailing={f.categoryId === c.id ? <Icon name="check" size={20} stroke={2.4} className="text-accent" /> : null}
                  onClick={() => {
                    set("categoryId", c.id);
                    setCatOpen(false);
                  }}
                />
              ))}
          </Group>
          <Group header="Шинэ төрөл">
            <div className="flex items-center gap-2 px-3 py-2">
              <input className="sp-field" placeholder="Жишээ: Хөлдөөсөн" value={newCat} onChange={(e) => setNewCat(e.target.value)} />
              <Btn size="md" variant="tinted" className="!h-12" disabled={!newCat.trim()} onClick={addCategory}>
                Нэмэх
              </Btn>
            </div>
          </Group>
        </div>
      </Sheet>

      <Sheet open={addOpen} onClose={() => setAddOpen(false)} title="Нөөц нэмэх">
        <div className="space-y-4 px-4 pb-5 pt-3">
          <div className="text-center">
            <div className="text-[14px] text-mute">Одоо {prev?.stock ?? 0} {f.unit}</div>
            <div className="mt-1 text-[40px] font-bold text-ink tnum">+{addQty || 0}</div>
          </div>
          <NumPad onKey={(k) => (k === "back" ? setAddQty((v) => v.slice(0, -1)) : setAddQty((v) => digits(v + k)))} />
          <Btn size="xl" block disabled={!Number(addQty)} onClick={addStock}>
            Нэмэх
          </Btn>
        </div>
      </Sheet>
      {cam && (
        <CameraScanner
          title="Бар код уншуулах"
          okText="Бичигдлээ"
          missText="—"
          onScan={(code) => {
            set("barcode", code);
            setCam(false);
            return true;
          }}
          onClose={() => setCam(false)}
        />
      )}
    </Screen>
  );
}
