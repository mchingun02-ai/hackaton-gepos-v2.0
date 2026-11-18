/**
 * Загвараар (LLM-гүй) үүсдэг автомат баримтууд (docs/ARCHITECTURE.md §8):
 *   auto:catalog    — ангиллаар бараа, үнэ, хүргэлтээр авах боломжтой эсэх
 *   auto:store      — нэр, цаг, хүргэлтийн дүүрэг/төлбөр, төлбөрийн хэлбэр
 *   auto:promotions — идэвхтэй урамшуулал, хугацаа (valid_until = дуусах огноо)
 * ҮЛ ОРУУЛАХ: нөөцийн тоо (байгаа/дууссан ч), өртөг, борлуулалтын дүн, харилцагчийн нэр/утас.
 */
import { getSettings } from "@/lib/agent/settings";
import { unitLabel } from "@/lib/pos/canonical";
import { money } from "@/lib/sp/logic";
import { spNow } from "@/lib/sp/server";
import type { Campaign } from "@/lib/sp/types";
import type { TenantContext } from "@/lib/tenant/context";

export type AutoDoc = { key: string; title: string; text: string; label: string; source: string; ids?: string[]; validUntil?: number | null; empty?: boolean };

/** Каталог: ангилал бүр «## ангилал» гарчигтай — хэсэг бүрт ангиллын нэр давтагдана (хайлтад тусна) */
export async function catalogDoc(ctx: TenantContext): Promise<AutoDoc | null> {
  // Live горимд каталогийг KB-д хуулахгүй (§4B.1) — AI үргэлж хэрэгслээр шууд асууна
  if (ctx.pos.kind === "live") return null;
  const products = (await ctx.pos.listProducts({ limit: 2000 })).filter((p) => p.active);
  const byCat = new Map<string, string[]>();
  for (const p of products.sort((a, b) => a.name.localeCompare(b.name, "mn"))) {
    const cat = (p.category || "Бусад").trim() || "Бусад";
    const line = `- ${p.name} — ${money(p.price)} / ${unitLabel(p)}${p.delivery && !p.deliveryStopped ? " · хүргэлтээр захиалж болно" : ""}`;
    byCat.set(cat, [...(byCat.get(cat) ?? []), line]);
  }
  const sections = [...byCat.entries()].sort((a, b) => a[0].localeCompare(b[0], "mn")).map(([cat, lines]) => `## ${cat}\n${lines.join("\n")}`);
  return {
    key: "auto:catalog",
    title: "Бараа, үнийн жагсаалт",
    label: "бараа, үнэ",
    source: "pos.listProducts",
    ids: products.slice(0, 500).map((p) => p.id),
    empty: !products.length,
    text: [
      "# Бараа, үнийн жагсаалт",
      "Касс (ПОС)-ын каталогоос автоматаар шинэчлэгддэг. Үлдэгдэл энд БАЙХГҮЙ — байгаа эсэхийг list_products хэрэгслээр шалгана.",
      ...sections,
    ].join("\n\n"),
  };
}

const PAYMENT = ["Бэлэн мөнгө", "Банкны карт", "QPay QR"];

export async function storeDoc(ctx: TenantContext): Promise<AutoDoc> {
  const info = await ctx.pos.storeInfo();
  const st = getSettings(ctx);
  const name = st.businessName || info.name;
  const lines = [
    `# ${name} — дэлгүүрийн мэдээлэл`,
    `Нэр: ${name}`,
    st.businessAbout || info.description ? `Танилцуулга: ${st.businessAbout || info.description}` : "",
    `Ажлын цаг: ${st.hours || info.hours || "тодорхойгүй"}`,
    "## Хүргэлт",
    info.deliveryEnabled && info.delivery
      ? `Хүргэлт хийнэ. Хүргэлтийн дүүргүүд: ${info.delivery.districts.join(", ") || "тодорхойгүй"}. Хүргэлтийн төлбөр: ${money(info.delivery.fee)}.`
      : "Одоогоор хүргэлт хийхгүй.",
    "## Төлбөрийн хэлбэр",
    PAYMENT.join(", "),
  ];
  return { key: "auto:store", title: `${name} — дэлгүүрийн мэдээлэл`, label: "дэлгүүр, хүргэлт", source: "pos.storeInfo+settings", text: lines.filter(Boolean).join("\n") };
}

const endOfDayUb = (ymd: string) => Date.parse(`${ymd}T23:59:59+08:00`);

function campaignLine(c: Campaign) {
  const when = `${c.start} – ${c.end}`;
  if (c.type === "point") return `- ${c.name}: худалдан авалтаар оноо цуглуулна (${when})`;
  const reward = c.reward.kind === "percent" ? `${c.reward.value}% хямдрал` : c.reward.kind === "amount" ? `${money(c.reward.value)} хямдрал` : "бэлэгтэй";
  const time = c.from && c.to && (c.from !== "00:00" || c.to !== "23:59") ? `, ${c.from}–${c.to} цагт` : "";
  return `- ${c.name}: ${c.qty > 1 ? `${c.qty} ширхэг авбал ` : ""}${reward}${time} (${when})`;
}

/** Урамшуулал: GePOS-д огноотой (sp_state.campaigns); бусад ПОС-д адаптерын өнөөдрийн жагсаалт */
export async function promotionsDoc(ctx: TenantContext): Promise<AutoDoc> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Ulaanbaatar" });
  let lines: string[] = [];
  let validUntil: number | null = null;
  if (ctx.pos.kind === "gepos") {
    const active = spNow(ctx).campaigns.filter((c) => c.active && c.end >= today);
    lines = active.map(campaignLine);
    if (active.length) validUntil = Math.max(...active.map((c) => endOfDayUb(c.end)));
  } else {
    const promos = (await ctx.pos.storeInfo()).promotions ?? [];
    lines = promos.map((p) => `- ${p.name}${p.type === "percent" ? `: ${p.value}% хямдрал` : p.type === "amount" ? `: ${money(p.value ?? 0)} хямдрал` : ""}`);
  }
  return {
    key: "auto:promotions",
    title: "Идэвхтэй урамшуулал",
    label: "урамшуулал",
    source: "pos.campaigns",
    validUntil,
    empty: !lines.length,
    text: ["# Идэвхтэй урамшуулал, хямдрал", "Касс (ПОС)-ын урамшууллаас автоматаар шинэчлэгддэг. Хугацаа нь дууссан урамшуулал хүчингүй.", ...lines].join("\n"),
  };
}
