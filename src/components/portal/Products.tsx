"use client";

/* Бараа (7.1 №5–7, BR03) — барааны төрөл, жагсаалт, нэмэх/засах */

import { useEffect, useMemo, useState } from "react";
import { Icon } from "@/components/sp/icons";
import { Badge, Btn, cx, Empty, Field, Notice, SearchField, Switch, toast, useConfirm } from "@/components/sp/ui";
import { activePointCampaign, money, num } from "@/lib/sp/logic";
import { setDeliveryStopped, SpError, uid, upsertCategory, upsertProduct } from "@/lib/sp/store";
import type { Category, Product } from "@/lib/sp/types";
import { FoundCategory, LookupBadge, OwnProduction, TaxLine, TilePicker, bunaLabel, shareToCatalog, useCatalogLookup } from "@/components/sp/TaxPick";
import { DEFAULT_TAX, taxText } from "@/lib/sp/tax";
import { Check, Dialog, Drawer, Page, Select, Table, Toolbar, readImage, usePortal } from "./kit";

/* ───────── барааны төрөл ───────── */

export function Categories() {
  const { s, actor } = usePortal();
  const [edit, setEdit] = useState<Category | null>(null);
  const [name, setName] = useState("");
  const { confirm, node } = useConfirm();
  const count = (id: string) => s.products.filter((p) => p.categoryId === id && p.active).length;

  const openEdit = (c: Category | null) => {
    setEdit(c ?? { id: uid("c"), name: "", active: true });
    setName(c?.name ?? "");
  };
  const save = () => {
    if (!edit || !name.trim()) return;
    if (s.categories.some((c) => c.id !== edit.id && c.name.trim().toLowerCase() === name.trim().toLowerCase())) {
      toast("Ийм нэртэй төрөл байна", "danger");
      return;
    }
    upsertCategory(actor, { ...edit, name: name.trim() });
    toast(s.categories.some((c) => c.id === edit.id) ? "Хадгаллаа" : `«${name.trim()}» нэмэгдлээ`, "ok");
    setEdit(null);
  };
  const isNew = edit && !s.categories.some((c) => c.id === edit.id);

  return (
    <Page title="Барааны төрөл" sub={`${s.categories.filter((c) => c.active).length} идэвхтэй төрөл`} actions={<Btn size="md" icon="plus" onClick={() => openEdit(null)}>Төрөл нэмэх</Btn>}>
      <div className="max-w-[760px]">
        <Table
          rows={[...s.categories].sort((a, b) => Number(b.active) - Number(a.active))}
          rowKey={(c) => c.id}
          onRow={(c) => openEdit(c)}
          empty={<Empty icon="grid" title="Төрөл алга" body="Бараагаа ангилахын тулд эхлээд төрөл нэмнэ үү. Жишээ: Хүнс, Ундаа." action={<Btn size="md" icon="plus" onClick={() => openEdit(null)}>Төрөл нэмэх</Btn>} />}
          cols={[
            { key: "n", label: "Нэр", render: (c) => <span className={cx("font-medium", !c.active && "text-mute")}>{c.name}</span> },
            { key: "c", label: "Бараа", align: "right", w: "100px", render: (c) => num(count(c.id)) },
            { key: "s", label: "Төлөв", w: "140px", render: (c) => (c.active ? <Badge tone="ok">Идэвхтэй</Badge> : <Badge>Идэвхгүй</Badge>) },
            {
              key: "a",
              label: "",
              align: "right",
              w: "160px",
              render: (c) => (
                <span onClick={(e) => e.stopPropagation()}>
                  {c.active ? (
                    <Btn
                      size="sm"
                      variant="plain"
                      onClick={() =>
                        confirm({
                          title: `«${c.name}»-г идэвхгүй болгох уу?`,
                          message: count(c.id) ? `${count(c.id)} бараа энэ төрөлд байна. Бараа устахгүй, шинэ бараанд энэ төрөл сонгогдохгүй.` : "Шинэ бараанд энэ төрөл сонгогдохгүй.",
                          ok: "Идэвхгүй болгох",
                          destructive: true,
                          run: () => upsertCategory(actor, { ...c, active: false }),
                        })
                      }
                    >
                      Идэвхгүй болгох
                    </Btn>
                  ) : (
                    <Btn size="sm" variant="plain" onClick={() => upsertCategory(actor, { ...c, active: true })}>
                      Идэвхжүүлэх
                    </Btn>
                  )}
                </span>
              ),
            },
          ]}
        />
        <p className="mt-3 px-1 text-[13px] text-mute">Төрлийг устгахгүй — идэвхгүй болгоход өмнөх борлуулалтын тайлан эвдрэхгүй.</p>
      </div>
      <Dialog
        open={!!edit}
        onClose={() => setEdit(null)}
        title={isNew ? "Шинэ төрөл" : "Төрөл засах"}
        width={420}
        footer={
          <Btn size="md" disabled={!name.trim()} onClick={save}>
            Хадгалах
          </Btn>
        }
      >
        <Field label="Нэр">
          <input className="sp-field" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="Жишээ: Хүнс" />
        </Field>
      </Dialog>
      {node}
    </Page>
  );
}

/* ───────── барааны жагсаалт ───────── */

type StatusFilter = "all" | "active" | "low" | "stopped" | "inactive";

export function Products() {
  const { s, actor, sub, go, canManage } = usePortal();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("all");
  const [st, setSt] = useState<StatusFilter>(sub === "low" ? "low" : "active");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Product | null>(null);

  useEffect(() => {
    if (sub === "new") setEdit(blank(s.categories.find((c) => c.active)?.id ?? ""));
    else if (sub && sub !== "low") {
      const p = s.products.find((x) => x.id === sub);
      if (p) setEdit(p);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sub]);

  const catName = (id: string) => s.categories.find((c) => c.id === id)?.name ?? "—";
  const rows = useMemo(() => {
    const t = q.trim().toLowerCase();
    return s.products.filter((p) => {
      if (t && !p.name.toLowerCase().includes(t) && !p.barcode.includes(t)) return false;
      if (cat !== "all" && p.categoryId !== cat) return false;
      if (st === "active") return p.active;
      if (st === "inactive") return !p.active;
      if (st === "low") return p.active && p.stock <= p.minStock;
      if (st === "stopped") return p.active && p.deliveryStopped;
      return true;
    });
  }, [s.products, q, cat, st]);

  const close = () => {
    setEdit(null);
    if (sub) go("products");
  };
  const bulk = (stopped: boolean) => {
    const ids = [...sel];
    setDeliveryStopped(actor, ids, stopped);
    toast(stopped ? `${ids.length} барааны хүргэлт зогслоо` : `${ids.length} барааны хүргэлт сэргэлээ`, "ok", {
      label: "Буцаах",
      run: () => setDeliveryStopped(actor, ids, !stopped),
    });
    setSel(new Set());
  };

  return (
    <Page
      title="Барааны жагсаалт"
      sub={`${s.products.filter((p) => p.active).length} идэвхтэй бараа`}
      actions={<Btn size="md" icon="plus" onClick={() => setEdit(blank(s.categories.find((c) => c.active)?.id ?? ""))}>Бараа нэмэх</Btn>}
    >
      <Toolbar>
        <div className="w-[260px] max-w-full">
          <SearchField value={q} onChange={setQ} placeholder="Нэр эсвэл бар код" />
        </div>
        <Select label="Төрөл" value={cat} onChange={setCat} options={[{ id: "all", label: "Бүх төрөл" }, ...s.categories.map((c) => ({ id: c.id, label: c.name }))]} />
        <Select
          label="Төлөв"
          value={st}
          onChange={setSt}
          options={[
            { id: "active", label: "Идэвхтэй" },
            { id: "low", label: "Нөөц бага" },
            { id: "stopped", label: "Хүргэлт зогссон" },
            { id: "inactive", label: "Идэвхгүй" },
            { id: "all", label: "Бүгд" },
          ]}
        />
        {sel.size > 0 && canManage && (
          <div className="ml-auto flex items-center gap-2 rounded-full bg-accent-soft py-1 pl-4 pr-1">
            <span className="text-[13px] font-semibold text-accent">{sel.size} сонгосон</span>
            <Btn size="sm" variant="filled" icon="stop" onClick={() => bulk(true)}>
              Хүргэлт зогссон
            </Btn>
            <Btn size="sm" variant="gray" onClick={() => bulk(false)}>
              Сэргээх
            </Btn>
          </div>
        )}
      </Toolbar>
      <Table
        rows={rows}
        rowKey={(p) => p.id}
        onRow={(p) => setEdit(p)}
        select={canManage ? { selected: sel, onChange: setSel } : undefined}
        rowClass={(p) => !p.active && "opacity-55"}
        empty={
          s.products.length === 0 ? (
            <Empty icon="box" title="Бараа бүртгэгдээгүй" body="Эхний бараагаа нэмээд кассаар зарж эхэлнэ үү." action={<Btn size="md" icon="plus" onClick={() => setEdit(blank(s.categories[0]?.id ?? ""))}>Бараа нэмэх</Btn>} />
          ) : (
            <Empty icon="search" title="Бараа олдсонгүй" body="Хайлт эсвэл шүүлтүүрээ өөрчилнө үү." />
          )
        }
        cols={[
          {
            key: "n",
            label: "Нэр",
            render: (p) => (
              <span className="flex min-w-[200px] items-center gap-3">
                <Thumb src={p.image} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{p.name}</span>
                  <span className="block font-mono text-[11px] text-mute">{p.barcode}</span>
                </span>
              </span>
            ),
          },
          { key: "c", label: "Төрөл", render: (p) => <span className="whitespace-nowrap text-ink-2">{catName(p.categoryId)}</span> },
          {
            key: "tx",
            label: "Ангилал · татвар",
            render: (p) => (
              <span className="block min-w-[150px] whitespace-nowrap">
                <span className={cx("block text-[13px]", p.bunaCode ? "text-ink-2" : "font-semibold text-danger")}>{p.bunaCode ? bunaLabel(p.bunaCode, s.merchant.tax ?? DEFAULT_TAX) : "Ангилал сонгоогүй"}</span>
                <span className="block text-[12px] text-mute">{taxText(s.merchant.tax ?? DEFAULT_TAX, p)}</span>
                {p.addedBy === "pos" && <Badge tone="accent">Кассаас нэмсэн</Badge>}
              </span>
            ),
          },
          { key: "pr", label: "Үнэ", align: "right", render: (p) => <span className="font-semibold">{money(p.price)}</span> },
          { key: "co", label: "Өртөг", align: "right", render: (p) => <span className="text-mute">{p.cost ? money(p.cost) : "—"}</span> },
          {
            key: "st",
            label: "Нөөц",
            align: "right",
            render: (p) =>
              p.stock <= p.minStock ? (
                <Badge tone={p.stock === 0 ? "danger" : "warn"} icon="warn">
                  {num(p.stock)}
                </Badge>
              ) : (
                num(p.stock)
              ),
          },
          {
            key: "d",
            label: "Хүргэлт",
            render: (p) => (!p.delivery ? <span className="text-mute">Үгүй</span> : p.deliveryStopped ? <Badge tone="warn" icon="stop">Зогссон</Badge> : <Badge tone="ok" icon="truck">Тийм</Badge>),
          },
          { key: "pt", label: "Оноо", align: "right", render: (p) => (p.points ? num(p.points) : <span className="text-mute">—</span>) },
          { key: "s", label: "Төлөв", render: (p) => (p.active ? <Badge tone="ok">Идэвхтэй</Badge> : <Badge>Идэвхгүй</Badge>) },
          {
            key: "e",
            label: "",
            align: "right",
            render: () => (
              <span className="inline-flex items-center gap-1 text-[13px] font-semibold text-accent">
                <Icon name="edit" size={15} /> Засах
              </span>
            ),
          },
        ]}
      />
      <ProductEditor product={edit} onClose={close} />
    </Page>
  );
}

function Thumb({ src }: { src: string }) {
  const [bad, setBad] = useState(false);
  return src && !bad ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" onError={() => setBad(true)} className="size-10 shrink-0 rounded-[10px] bg-[var(--sp-fill)] object-contain p-0.5" />
  ) : (
    <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-[var(--sp-fill)] text-mute">
      <Icon name="box" size={18} />
    </span>
  );
}

function blank(categoryId: string): Product {
  return {
    id: uid("p"),
    name: "",
    categoryId,
    price: 0,
    stock: 0,
    minStock: 5,
    delivery: true,
    deliveryStopped: false,
    points: 0,
    image: "",
    barcode: "",
    unit: "ш",
    active: true,
  };
}

/* ───────── нэмэх / засах ───────── */

function ProductEditor({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { s, actor, go, can } = usePortal();
  const [p, setP] = useState<Product | null>(product);
  const [tried, setTried] = useState(false);
  const { confirm, node } = useConfirm();
  useEffect(() => {
    setP(product);
    setTried(false);
  }, [product]);

  const isNew = !!product && !s.products.some((x) => x.id === product.id);
  const camp = activePointCampaign(s);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => (x ? { ...x, [k]: v } : x));
  const numIn = (v: string) => Math.max(0, Math.round(Number(v.replace(/[^\d]/g, "")) || 0));

  const profile = s.merchant.tax ?? DEFAULT_TAX;
  const [bunaName, setBunaName] = useState<string>();
  const [pick, setPick] = useState(false);
  const res = useCatalogLookup(p?.barcode ?? "", (r) => {
    setPick(false);
    setP((x) => (x ? { ...x, name: x.name.trim() ? x.name : r.name.replace(/\s+/g, " "), bunaCode: r.buna ?? x.bunaCode, bunaSource: r.buna ? r.source : x.bunaSource } : x));
    setBunaName(r.bunaName);
  });
  const err = p
    ? {
        buna: !p.bunaCode ? "Ангиллаа сонгоно уу" : null,
        name: !p.name.trim() ? "Нэр оруулна уу" : s.products.some((x) => x.id !== p.id && x.name.trim().toLowerCase() === p.name.trim().toLowerCase()) ? "Ийм нэртэй бараа байна" : null,
        cat: !p.categoryId ? "Төрөл сонгоно уу" : null,
        price: p.price <= 0 ? "Зарах үнэ оруулна уу" : null,
        barcode: p.barcode && s.products.some((x) => x.id !== p.id && x.barcode === p.barcode) ? "Энэ бар код өөр бараанд бүртгэлтэй" : null,
      }
    : null;
  const valid = err && !Object.values(err).some(Boolean);

  const save = () => {
    setTried(true);
    if (!p || !valid) return;
    try {
      upsertProduct(actor, { ...p, name: p.name.trim(), barcode: p.barcode || genBarcode(), addedBy: isNew ? "portal" : p.addedBy });
      if (res.st === "miss") shareToCatalog(p.barcode, p.name, p.bunaCode);
      toast(isNew ? `«${p.name.trim()}» нэмэгдлээ` : "Хадгаллаа", "ok");
      onClose();
    } catch (e) {
      toast(e instanceof SpError ? e.message : "Хадгалж чадсангүй", "danger");
    }
  };

  const margin = p?.cost && p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : null;

  return (
    <Drawer
      open={!!p}
      onClose={onClose}
      title={isNew ? "Бараа нэмэх" : (product?.name ?? "")}
      sub={isNew ? "Шинэ бараа" : "Бараа засах"}
      width={560}
      footer={
        <>
          {!isNew && p?.active && (
            <Btn
              size="md"
              variant="dangerTinted"
              className="mr-auto"
              onClick={() =>
                confirm({
                  title: "Барааг идэвхгүй болгох уу?",
                  message: "Касс, захиалгын хуудсанд харагдахгүй болно. Өмнөх борлуулалтын түүх хэвээр үлдэнэ.",
                  ok: "Идэвхгүй болгох",
                  destructive: true,
                  run: () => {
                    upsertProduct(actor, { ...p, active: false });
                    toast("Бараа идэвхгүй боллоо", "ok");
                    onClose();
                  },
                })
              }
            >
              Идэвхгүй болгох
            </Btn>
          )}
          {!isNew && p && !p.active && (
            <Btn size="md" variant="tinted" className="mr-auto" onClick={() => set("active", true)}>
              Идэвхжүүлэх
            </Btn>
          )}
          <Btn size="md" variant="gray" onClick={onClose}>
            Болих
          </Btn>
          <Btn size="md" onClick={save} disabled={tried && !valid}>
            {isNew ? "Нэмэх" : "Хадгалах"}
          </Btn>
        </>
      }
    >
      {p && err && (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className="relative grid size-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-[16px] bg-paper text-mute shadow-[inset_0_0_0_1px_var(--sp-sep)]" title="Зураг солих">
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.image} alt="" className="size-full object-contain p-1" />
              ) : (
                <Icon name="upload" size={24} />
              )}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) set("image", await readImage(f, 320));
                }}
              />
            </label>
            <div className="text-[13px] leading-snug text-mute">Зураг (заавал биш). Касс, захиалгын хуудсанд харагдана.</div>
          </div>
          <Field label="Бар код" error={tried ? err.barcode : null} hint={!p.barcode ? "Уншуулбал и-Баримтын сангаас нэр, ангиллыг хайна. Хоосон бол автоматаар үүснэ." : undefined}>
            <input className="sp-field font-mono" inputMode="numeric" value={p.barcode} onChange={(e) => set("barcode", e.target.value.replace(/\D/g, "").slice(0, 14))} placeholder="EAN-13" autoFocus={isNew} />
          </Field>
          <LookupBadge res={res} />
          <div>
            <div className="mb-1.5 flex items-baseline justify-between px-1 text-[13px]">
              <span className={cx("font-medium", tried && err.buna ? "text-danger" : "text-ink-2")}>Ангилал (и-Баримтын БҮНА){tried && err.buna ? " — сонгоно уу" : ""}</span>
              {p.bunaCode && <span className="text-mute">{bunaName ?? bunaLabel(p.bunaCode, profile)} · {p.bunaCode}</span>}
            </div>
            {res.st === "found" && res.buna && p.bunaCode === res.buna && !pick ? (
              <FoundCategory name={bunaName} code={p.bunaCode} onChange={() => setPick(true)} />
            ) : (
              <TilePicker profile={profile} value={p.bunaCode} onChange={(b) => { setP((x) => (x ? { ...x, bunaCode: b, bunaSource: "tile" } : x)); setBunaName(undefined); }} />
            )}
          </div>
          <TaxLine profile={profile} product={p} price={p.price} />
          <OwnProduction profile={profile} value={!!p.ownProduction} onChange={(v) => set("ownProduction", v)} />
          <Field label="Төрөл (дэлгүүрийн, зөвхөн шүүлтүүрт)" error={tried ? err.cat : null}>
            <select className="sp-field" value={p.categoryId} onChange={(e) => set("categoryId", e.target.value)}>
              <option value="">Сонгох…</option>
              {s.categories
                .filter((c) => c.active || c.id === p.categoryId)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </Field>
          <Field label="Нэр" error={tried ? err.name : null}>
            <input className="sp-field" value={p.name} onChange={(e) => set("name", e.target.value)} placeholder="Жишээ: Сүү 1 л" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Зарах үнэ, ₮" error={tried ? err.price : null}>
              <input className="sp-field tnum" inputMode="numeric" value={p.price ? num(p.price) : ""} onChange={(e) => set("price", numIn(e.target.value))} placeholder="0" />
            </Field>
            <Field label="Өртөг үнэ, ₮ (заавал биш)" hint={margin !== null ? `Ашиг ${margin}%` : undefined}>
              <input className="sp-field tnum" inputMode="numeric" value={p.cost ? num(p.cost) : ""} onChange={(e) => set("cost", numIn(e.target.value) || undefined)} placeholder="—" />
            </Field>
            <Field label="Нөөц, ширхэг" hint="Борлуулахад автоматаар хасагдана">
              <input className="sp-field tnum" inputMode="numeric" value={String(p.stock)} onChange={(e) => set("stock", numIn(e.target.value))} />
            </Field>
            <Field label="Доод үлдэгдлийн босго" hint="Хүрэхэд Dashboard дээр анхааруулна">
              <input className="sp-field tnum" inputMode="numeric" value={String(p.minStock)} onChange={(e) => set("minStock", numIn(e.target.value))} />
            </Field>
          </div>

          <Field label="Нэг ширхэгт олгох оноо">
            <input className="sp-field tnum" inputMode="numeric" value={p.points ? String(p.points) : ""} onChange={(e) => set("points", numIn(e.target.value))} placeholder="0" />
          </Field>
          {!camp ? (
            <Notice
              tone="accent"
              icon="info"
              action={
                can("campaigns") === "ok" ? (
                  <button type="button" className="shrink-0 text-[13px] font-semibold underline" onClick={() => go("campaigns", "new-point")}>
                    Үүсгэх
                  </button>
                ) : undefined
              }
            >
              Идэвхтэй оноон урамшуулал алга. Оноо хадгалагдана, гэхдээ «Point based» урамшуулал үүсгэж идэвхжүүлсний дараа л харилцагчид олгогдоно.
            </Notice>
          ) : (
            <p className="-mt-2 px-1 text-[13px] text-mute">«{camp.name}» идэвхтэй — касс дээр шууд олгогдоно. 1 оноо = 1₮.</p>
          )}

          <div className="overflow-hidden rounded-[14px] bg-paper [&>*+*]:border-t [&>*+*]:border-[var(--sp-sep)]">
            <div className="flex min-h-[52px] items-center px-4">
              <Check checked={p.delivery} onChange={(v) => set("delivery", v)}>
                Хүргэлттэй
              </Check>
            </div>
            <div className={cx("flex min-h-[60px] items-center justify-between gap-3 px-4 py-2", !p.delivery && "opacity-40")}>
              <span>
                <span className="block text-[15px] text-ink">Хүргэлт зогссон</span>
                <span className="block text-[13px] text-mute">Дэлгүүрт зарагдана, захиалгын хуудсанд сонгогдохгүй</span>
              </span>
              <Switch label="Хүргэлт зогссон" checked={p.deliveryStopped} disabled={!p.delivery} onChange={(v) => set("deliveryStopped", v)} />
            </div>
          </div>
          {!isNew && <p className="px-1 text-[13px] text-mute">Үнэ, оноо, нөөцийн өөрчлөлт бүр тохиргооны лог тайланд бичигдэнэ.</p>}
        </div>
      )}
      {node}
    </Drawer>
  );
}

function genBarcode() {
  const body = "486" + String(Math.floor(Math.random() * 1e9)).padStart(9, "0");
  const sum = body.split("").reduce((a, ch, i) => a + Number(ch) * (i % 2 ? 3 : 1), 0);
  return body + String((10 - (sum % 10)) % 10);
}
