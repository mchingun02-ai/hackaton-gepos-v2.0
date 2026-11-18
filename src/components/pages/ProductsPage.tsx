"use client";

import { useMemo, useRef, useState } from "react";
import {
  type Category,
  type Product,
  categories,
  makeBarcode,
  unitOf,
  units,
} from "@/lib/demo";
import { downloadCsv, useStore } from "@/lib/store";
import { formatBytes, prepareProductImage } from "@/lib/image";
import { isValidEan13 } from "@/lib/ean13";
import { Barcode } from "@/components/Barcode";
import { CameraScanner } from "@/components/CameraScanner";
import {
  IconAlert,
  IconBarcode,
  IconEdit,
  IconCamera,
  IconClose,
  IconExport,
  IconImage,
  IconPlus,
  IconPrint,
  IconSearch,
} from "@/components/icons";
import { Chip, Empty, Money, PrimaryButton, ProductImage, Td, Th, btnGhost } from "@/components/ui";

/**
 * Барааны бүртгэл.
 *
 * Татварын код дутуу барааг жагсаалтын түвшинд харуулна — нэг нэгээр нь
 * нээж шалгах шаардлагагүй. Бар кодгүй бараанд дотоод EAN-13 үүсгэнэ.
 */
export default function ProductsPage({ narrow }: { narrow: boolean }) {
  const { catalog, upsertProduct, adjustStock, perms } = useStore();
  /* Каталог (нэр, нийтлэг үнэ) — эзэн; менежер зөвхөн салбарынхаа үлдэгдэл. Сервер ч ижил шалгана. */
  const canCatalog = perms.editProducts;
  const [query, setQuery] = useState("");
  const [onlyMissing, setOnlyMissing] = useState(false);
  const [editing, setEditing] = useState<Product | "new" | null>(null);

  const visible = useMemo(
    () =>
      catalog.filter((item) => {
        const byQuery =
          query.trim() === "" ||
          item.name.toLowerCase().includes(query.trim().toLowerCase()) ||
          (item.barCode ?? "").includes(query.trim());
        return byQuery && (!onlyMissing || !item.taxCoded);
      }),
    [query, onlyMissing, catalog],
  );

  const missing = catalog.filter((item) => !item.taxCoded).length;

  const exportCsv = () =>
    downloadCsv("baraa.csv", [
      ["Нэр", "Бар код", "Ангилал", "Нэгж", "Үлдэгдэл", "Үнэ", "НӨАТ", "Татварын код"],
      ...catalog.map((item) => [
        item.name,
        item.barCode ?? "",
        item.category,
        item.unit,
        item.stock,
        item.price,
        item.taxType === "VAT_ABLE" ? "НӨАТ-тай" : "НӨАТ-гүй",
        item.taxCoded ? "Бэлэн" : "Дутуу",
      ]),
    ]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <label className="relative block w-full sm:w-[280px]">
          <span className="sr-only">Бараа хайх</span>
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-mute">
            <IconSearch />
          </span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Нэр, бар кодоор хайх"
            className="h-10 w-full rounded-xl bg-paper pl-4 pr-10 text-[13px] text-ink ring-1 ring-inset ring-hair placeholder:text-mute focus:outline-none focus:ring-accent"
          />
        </label>

        <button
          type="button"
          onClick={() => setOnlyMissing((value) => !value)}
          className={`press flex h-10 items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold ${
            onlyMissing
              ? "bg-warn-soft text-warn ring-1 ring-inset ring-warn"
              : "bg-stage text-ink-2 hover:text-ink"
          }`}
        >
          <IconAlert />
          Татварын код дутуу · {missing}
        </button>

        <button type="button" onClick={exportCsv} className={btnGhost}>
          <IconExport />
          Excel
        </button>

        {canCatalog && (
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="press ml-auto flex h-10 items-center gap-2 rounded-xl bg-accent px-4 text-[13px] font-bold text-[color:var(--accent-ink)]"
          >
            <IconPlus />
            Бараа нэмэх
          </button>
        )}
      </div>

      <div className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {visible.length === 0 ? (
          <Empty text="Бараа олдсонгүй" />
        ) : narrow ? (
          <ul className="divide-y divide-hair">
            {visible.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setEditing(item)}
                  className="group flex w-full items-center gap-3 py-3 text-left"
                >
                  <span className="plate size-11 shrink-0">
                    <ProductImage src={item.image} name={item.name} sizes="44px" pad="p-1.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[14px] font-bold text-ink">{item.name}</span>
                      {!item.taxCoded && (
                        <span className="shrink-0 text-warn">
                          <IconAlert />
                        </span>
                      )}
                    </span>
                    <span className="tnum mt-0.5 block text-[12px] text-mute">
                      {item.barCode ?? "бар кодгүй"} · {item.stock} {item.unit}
                    </span>
                  </span>
                  <Money value={item.price} className="text-[14px] font-bold text-ink" />
                  {/* Мөр дарахад засварлагдана гэдгийг харуулах тэмдэг */}
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg text-mute ring-1 ring-inset ring-hair group-hover:text-ink group-hover:ring-line">
                    <IconEdit />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <table className="w-full border-separate border-spacing-0">
            <thead>
              <tr>
                <Th>Бараа</Th>
                <Th>Бар код</Th>
                <Th>Ангилал</Th>
                <Th align="right">Үлдэгдэл</Th>
                <Th align="right">Үнэ</Th>
                <Th align="right">Е-баримт</Th>
                <Th align="right">Засах</Th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id} className="row">
                  <Td>
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      className="flex items-center gap-3 text-left hover:underline hover:underline-offset-4 hover:decoration-line"
                    >
                      <span className="plate size-10 shrink-0">
                        <ProductImage src={item.image} name={item.name} sizes="40px" pad="p-1" />
                      </span>
                      <span className="font-bold text-ink">{item.name}</span>
                    </button>
                  </Td>
                  <Td className="tnum text-mute">{item.barCode ?? "—"}</Td>
                  <Td className="text-mute">{item.category}</Td>
                  <Td align="right" className="tnum">
                    {item.stock} {item.unit}
                  </Td>
                  <Td align="right" className="font-bold text-ink">
                    <Money value={item.price} />
                    {item.unit !== "ш" && (
                      <span className="text-[12px] font-medium text-mute">/{item.unit}</span>
                    )}
                  </Td>
                  <Td align="right">
                    {item.taxCoded ? (
                      <span className="text-[12px] text-mute">Бэлэн</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-1 text-[11px] font-semibold text-warn">
                        <IconAlert />
                        Код дутуу
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <button
                      type="button"
                      onClick={() => setEditing(item)}
                      title="Засах"
                      className="press ml-auto grid size-9 place-items-center rounded-xl text-ink-2 ring-1 ring-inset ring-hair hover:text-ink hover:ring-line"
                    >
                      <IconEdit />
                    </button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && editing !== "new" && !canCatalog && (
        <StockForm
          product={editing}
          onClose={() => setEditing(null)}
          onSave={async (qty) => {
            const failed = await adjustStock(editing, qty);
            if (!failed) setEditing(null);
            return failed;
          }}
        />
      )}

      {editing && canCatalog && (
        <ProductForm
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={async (product) => {
            const failed = await upsertProduct(product);
            if (!failed) setEditing(null);
            return failed;
          }}
        />
      )}
    </>
  );
}

/** Менежер: зөвхөн энэ салбарын үлдэгдэл (нэр, үнэ эзэнд) */
function StockForm({
  product,
  onClose,
  onSave,
}: {
  product: Product;
  onClose: () => void;
  onSave: (qty: number) => Promise<string | null>;
}) {
  const [stock, setStock] = useState(String(product.stock));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Сервер ч ижил шалгана: ширхэг, багц г.м. — бүхэл; кг, л, м — 0.001 хүртэл
  const fractional = unitOf(product.unit).fractional;
  const qty = Number(stock);
  const valid =
    stock.trim() !== "" &&
    Number.isFinite(qty) &&
    qty >= 0 &&
    (fractional ? /^\d+(\.\d{1,3})?$/.test(stock) : /^\d+$/.test(stock));

  const save = async () => {
    setBusy(true);
    setError(null);
    const failed = await onSave(qty);
    if (failed) {
      setError(failed);
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/35">
      <div className="flex h-full w-full max-w-[460px] flex-col bg-paper">
        <div className="flex items-center justify-between border-b border-hair py-3 pl-5 pr-3">
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-ink">Үлдэгдэл</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-stage hover:text-ink"
          >
            <IconClose />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl bg-stage px-4 py-3">
            <span className="block text-[15px] font-bold text-ink">{product.name}</span>
            <span className="tnum block text-[13px] text-mute">
              {product.price.toLocaleString("en-US")}₮ · нэр, үнийг байгууллагын эзэн өөрчилнө
            </span>
          </div>
          <label className="block">
            <span className="meta mb-1.5 block">Энэ салбарын үлдэгдэл ({product.unit})</span>
            <input
              value={stock}
              onChange={(e) => setStock(fractional ? e.target.value.replace(/[^\d.]/g, "") : e.target.value.replace(/\D/g, ""))}
              inputMode={fractional ? "decimal" : "numeric"}
              className="tnum h-12 w-full rounded-xl bg-stage px-3.5 text-[15px] text-ink focus:bg-paper focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </label>
          <p className="text-[12px] text-mute">
            {fractional ? "0.001 хүртэлх нарийвчлалтай." : "Бүхэл тоогоор."} Зөрүү нь «тохируулга» хөдөлгөөн болж, хэн
            өөрчилснийг audit log-д бичнэ.
          </p>
        </div>
        <div className="border-t border-hair p-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
              {error}
            </p>
          )}
          <PrimaryButton onClick={save} disabled={!valid || busy} arrow={false}>
            {busy ? "Хадгалж байна…" : "Хадгалах"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}

function ProductForm({
  product,
  onClose,
  onSave,
}: {
  product: Product | null;
  onClose: () => void;
  /** Алдаа гарвал мессежийг буцаана — маягт нээлттэй үлдэнэ */
  onSave: (product: Product) => Promise<string | null>;
}) {
  const [name, setName] = useState(product?.name ?? "");
  const [price, setPrice] = useState(product ? String(product.price) : "");
  const [stock, setStock] = useState(product ? String(product.stock) : "");
  const [barcode, setBarcode] = useState(product?.barCode ?? "");
  const [readingBarcode, setReadingBarcode] = useState(false);
  const labelRef = useRef<HTMLDivElement>(null);

  /* Шошго хэвлэх: баримтын хэвлэлтийн дүрмийг (.print-paper) түр зээлнэ —
     зөвхөн шошго цаасан дээр гарна. */
  const printLabel = () => {
    const el = labelRef.current;
    if (!el) return;
    el.classList.add("print-paper");
    window.print();
    el.classList.remove("print-paper");
  };
  const [category, setCategory] = useState<Category>(product?.category ?? "хүнс");
  const [unit, setUnit] = useState(product?.unit ?? "ш");
  const [image, setImage] = useState(product?.image ?? "");
  const [imageNote, setImageNote] = useState("");
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    try {
      const prepared = await prepareProductImage(file);
      setImage(prepared.dataUrl);
      setImageNote(`${prepared.width}×${prepared.height} · ${formatBytes(prepared.bytes)}`);
    } catch (error) {
      setImageNote(error instanceof Error ? error.message : "Зураг уншиж чадсангүй");
    }
  };
  const [vatFree, setVatFree] = useState(product?.taxType === "VAT_FREE");
  const [classification, setClassification] = useState(product?.taxCoded ? "6110000" : "");
  const [taxProduct, setTaxProduct] = useState(product?.taxCoded ? "1" : "");

  const field =
    "h-12 w-full rounded-xl bg-stage px-3.5 text-[15px] text-ink ring-1 ring-inset ring-transparent placeholder:text-mute focus:bg-paper focus:outline-none focus:ring-accent";
  const label = "meta mb-1.5 block";

  const coded = classification.trim() !== "" && taxProduct.trim() !== "";
  const valid = name.trim() !== "" && Number(price) > 0;

  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const save = async () => {
    setBusy(true);
    setSaveError(null);
    const failed = await onSave({
      id: product?.id ?? "p" + Math.random().toString(36).slice(2, 9),
      name: name.trim(),
      price: Number(price),
      stock: Number(stock || 0),
      category,
      unit,
      barCode: barcode || undefined,
      taxType: vatFree ? "VAT_FREE" : "VAT_ABLE",
      taxCoded: coded,
      oldPrice: product?.oldPrice,
      // Шинэ бараанд зураг байхгүй — хавтан дээр нэрийн эхний үсэг гарна
      image,
    });
    if (failed) {
      setSaveError(failed);
      setBusy(false);
    }
  };

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-black/35">
      <div className="flex h-full w-full max-w-[460px] flex-col bg-paper">
        <div className="flex items-center justify-between border-b border-hair py-3 pl-5 pr-3">
          <h2 className="text-[17px] font-bold tracking-[-0.03em] text-ink">
            {product ? "Бараа засах" : "Шинэ бараа"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Хаах"
            className="press grid size-11 place-items-center rounded-xl text-ink-2 hover:bg-stage hover:text-ink"
          >
            <IconClose />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div>
            <span className={label}>Зураг</span>
            <div className="flex items-start gap-3">
              <span className="plate size-24 shrink-0">
                <ProductImage src={image} name={name || "?"} sizes="96px" pad="p-2" />
              </span>

              <div className="flex-1 space-y-2">
                <div className="flex gap-2">
                  {/* capture="environment" — утсан дээр арын камер шууд нээгдэнэ */}
                  <button
                    type="button"
                    onClick={() => camera.current?.click()}
                    className={`${btnGhost} flex-1 justify-center`}
                  >
                    <IconCamera />
                    Камер
                  </button>
                  <button
                    type="button"
                    onClick={() => gallery.current?.click()}
                    className={`${btnGhost} flex-1 justify-center`}
                  >
                    <IconImage />
                    Файлаас
                  </button>
                </div>

                {image !== "" && (
                  <button
                    type="button"
                    onClick={() => {
                      setImage("");
                      setImageNote("");
                    }}
                    className="press text-[12px] font-semibold text-mute hover:text-danger"
                  >
                    Зураг хасах
                  </button>
                )}

                <p className="text-[12px] leading-[16px] text-mute">
                  {imageNote || "640px хүртэл жижигрүүлж хадгална — кассын жагсаалт хурдан байна."}
                </p>
              </div>
            </div>

            <input
              ref={camera}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(event) => pickImage(event.target.files?.[0])}
            />
            <input
              ref={gallery}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => pickImage(event.target.files?.[0])}
            />
          </div>

          <div>
            <span className={label}>Нэр</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={field}
              placeholder="Барааны нэр"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className={label}>Үнэ (₮)</span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className={`${field} tnum`}
                placeholder="0"
              />
            </div>
            <div>
              <span className={label}>Үлдэгдэл</span>
              <input
                value={stock}
                onChange={(e) => setStock(e.target.value.replace(/\D/g, ""))}
                inputMode="numeric"
                className={`${field} tnum`}
                placeholder="0"
              />
            </div>
          </div>

          <div>
            <span className={label}>Ангилал</span>
            <div className="flex flex-wrap gap-2">
              {categories
                .filter((item) => item.key !== "бүгд")
                .map((item) => (
                  <Chip
                    key={item.key}
                    on={category === item.key}
                    onClick={() => setCategory(item.key as Category)}
                  >
                    {item.label}
                  </Chip>
                ))}
            </div>
          </div>

          <div>
            <span className={label}>Хэмжих нэгж</span>
            <div className="flex flex-wrap gap-2">
              {units.map((item) => (
                <Chip
                  key={item.key}
                  on={unit === item.key}
                  onClick={() => setUnit(item.key)}
                  title={item.label}
                >
                  {item.key}
                </Chip>
              ))}
            </div>
            <p className="mt-1.5 text-[12px] text-mute">
              Үнэ нь нэг нэгжийн үнэ. Кг, литр, метрээр зарагддаг бараа кассад бутархай тоогоор
              нэмэгдэнэ (0.35 кг).
            </p>
          </div>

          <div>
            <span className={label}>Бар код</span>
            <div className="flex gap-2">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value.replace(/\D/g, "").slice(0, 13))}
                inputMode="numeric"
                className={`${field} tnum`}
                placeholder="Уншуулах эсвэл үүсгэх"
              />
              <button
                type="button"
                onClick={() => setReadingBarcode(true)}
                aria-label="Камераар уншуулах"
                title="Камераар уншуулах"
                className={`${btnGhost} h-12 shrink-0`}
              >
                <IconBarcode />
              </button>
              <button
                type="button"
                onClick={() => setBarcode(makeBarcode(Math.floor(Math.random() * 99999)))}
                className={`${btnGhost} h-12 shrink-0`}
              >
                Үүсгэх
              </button>
            </div>
            <p className="mt-1.5 text-[12px] text-mute">
              Бар кодгүй бараанд дотоод EAN-13 үүснэ. Шошго хэвлэж наана.
            </p>
            {barcode.length === 13 && !isValidEan13(barcode) && (
              <p className="mt-1.5 text-[12px] font-semibold text-warn">
                Шалгах орон таарахгүй байна — уншигч энэ кодыг уншихгүй.
              </p>
            )}
            {isValidEan13(barcode) && (
              <div className="mt-3 flex items-center gap-3 rounded-xl bg-stage p-3">
                <div ref={labelRef} className="rounded-lg bg-white p-2">
                  <p className="mb-1 max-w-[180px] truncate text-[11px] font-bold text-black">{name || "Бараа"}</p>
                  <Barcode code={barcode} height={52} module={2} />
                </div>
                <button type="button" onClick={printLabel} className={`${btnGhost} ml-auto h-11 shrink-0`}>
                  <IconPrint />
                  Шошго хэвлэх
                </button>
              </div>
            )}
            {readingBarcode && (
              <CameraScanner
                title="Бар код уншуулах"
                onScan={(code) => {
                  setBarcode(code.replace(/\D/g, "").slice(0, 13));
                  setReadingBarcode(false);
                  return true;
                }}
                onClose={() => setReadingBarcode(false)}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setVatFree((value) => !value)}
            aria-pressed={vatFree}
            className={`press flex h-11 w-full items-center gap-2 rounded-xl px-3.5 text-[13px] font-semibold ${
              vatFree ? "bg-ink text-paper" : "bg-stage text-ink-2 hover:text-ink"
            }`}
          >
            НӨАТ-гүй бараа
            <span className={`ml-auto text-[12px] ${vatFree ? "text-paper/60" : "text-mute"}`}>
              {vatFree ? "Тийм" : "Үгүй"}
            </span>
          </button>

          <div className="rounded-xl bg-stage p-3.5">
            <span className="meta">Татварын кодууд — е-баримтад заавал</span>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <div>
                <span className={label}>classificationCode</span>
                <input
                  value={classification}
                  onChange={(e) => setClassification(e.target.value)}
                  className={`${field} tnum bg-paper`}
                  placeholder="6110000"
                />
              </div>
              <div>
                <span className={label}>taxProductCode</span>
                <input
                  value={taxProduct}
                  onChange={(e) => setTaxProduct(e.target.value)}
                  className={`${field} tnum bg-paper`}
                  placeholder="1"
                />
              </div>
            </div>
            {!coded && (
              <p className="mt-2.5 flex items-start gap-1.5 text-[12px] leading-[16px] text-warn">
                <IconAlert />
                <span>
                  Эдгээрийг бөглөөгүй бол бараа худалдагдах боловч{" "}
                  <strong className="font-semibold">е-баримт үүсэхгүй</strong> — гүйлгээ дараалалд
                  орно.
                </span>
              </p>
            )}
          </div>
        </div>

        <div className="border-t border-hair p-4">
          {saveError && (
            <p role="alert" className="mb-3 rounded-xl bg-danger-soft px-3.5 py-2.5 text-[13px] font-semibold text-danger">
              {saveError}
            </p>
          )}
          <PrimaryButton onClick={save} disabled={!valid || busy} arrow={false}>
            {busy ? "Хадгалж байна…" : "Хадгалах"}
          </PrimaryButton>
        </div>
      </div>
    </div>
  );
}
