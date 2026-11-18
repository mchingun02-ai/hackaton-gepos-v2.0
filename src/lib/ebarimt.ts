/**
 * Е-баримт PosAPI 3.0 клиент.
 *
 * PosAPI нь харилцагчийн төхөөрөмж дээрээ ажилладаг ЛОКАЛ сервис
 * (`http://127.0.0.1:7080`). Төв API биш — баримтыг cloud үүсгэж
 * болохгүй, зөвхөн касс өөрөө үүсгэнэ.
 *
 * Endpoint-ууд:
 *   GET    /rest/info          төлөв, оператор, posNo, мерчантууд
 *   POST   /rest/receipt       баримт үүсгэх
 *   DELETE /rest/receipt       баримт цуцлах
 *   GET    /rest/sendData      дараалалд байгаа баримтыг татвар руу илгээх
 *   GET    /rest/bankAccounts  ТТД-ын банкны данс
 *
 * ⚠ ШАЛГАХ — доорх талбарын нэрсийг е-баримтын албан тодорхойлолттой
 * (share.itc.gov.mn · POS API 3.0.1.pdf) заавал тулгана. Тодруулахгүйгээр
 * бичсэн хэсгүүд:
 *   · `totalVAT` үү, `totalVat` уу — нийтийн хэрэгжүүлэлтүүдэд хоёулаа таарсан
 *   · `receipts` доторх бүлэглэлт (taxType-аар бүлэглэх нь зөв эсэх)
 *   · `measureUnit` хаалттай жагсаалттай эсэх
 *   · `districtCode`-ын формат
 * Эдгээр нь буруу байвал PosAPI `Rejected` буцаана — апп унахгүй, баримт
 * дараалалд орно.
 */

export type EbarimtTaxType = "VAT_ABLE" | "VAT_FREE" | "VAT_ZERO" | "NOT_VAT";
export type EbarimtReceiptType = "B2C_RECEIPT" | "B2B_RECEIPT" | "B2C_INVOICE" | "B2B_INVOICE";
export type EbarimtPaymentCode = "CASH" | "PAYMENT_CARD";
export type EbarimtPaymentStatus = "PAID" | "PAY" | "REVERSED" | "ERROR";
export type EbarimtBarCodeType = "UNDEFINED" | "GS1" | "ISBN";

export type EbarimtItem = {
  name: string;
  barCode: string;
  barCodeType: EbarimtBarCodeType;
  classificationCode: string;
  taxProductCode: string;
  measureUnit: string;
  qty: number;
  unitPrice: number;
  totalAmount: number;
  totalVAT: number;
  totalCityTax: number;
};

export type EbarimtReceiptGroup = {
  totalAmount: number;
  totalVAT: number;
  totalCityTax: number;
  taxType: EbarimtTaxType;
  merchantTin: string;
  items: EbarimtItem[];
};

export type EbarimtPayment = {
  code: EbarimtPaymentCode;
  status: EbarimtPaymentStatus;
  paidAmount: number;
  exchangeCode?: string;
};

export type EbarimtRequest = {
  totalAmount: number;
  totalVAT: number;
  totalCityTax: number;
  branchNo: string;
  districtCode: string;
  merchantTin: string;
  posNo: string;
  customerTin?: string;
  type: EbarimtReceiptType;
  receipts: EbarimtReceiptGroup[];
  payments: EbarimtPayment[];
};

export type EbarimtInfo = {
  available: boolean;
  configured: boolean;
  posNo?: string;
  merchants?: string[];
  message: string;
};

/**
 * Баримт үүсгэх оролдлогын үр дүн.
 *
 * `rejected` ба `unavailable` хоёрыг ялгах нь энэ файлын хамгийн чухал зүйл:
 *  - rejected   = дата буруу. Дахин илгээхэд бас татгалзана → хүн засна
 *  - unavailable = сервис хариулахгүй. Дата зөв → дараалалд, дахин оролдоно
 * Хольвол эвдэрсэн баримт мөнхөд дахин илгээгдэнэ, эсвэл түр саатал үүрд
 * алдагдсан баримт болж хувирна.
 */
export type EbarimtResult =
  | { kind: "success"; id: string; qrData: string; lottery?: string; date: string }
  | { kind: "rejected"; code?: string; message: string }
  | { kind: "unavailable"; message: string };

export interface EbarimtClient {
  info(): Promise<EbarimtInfo>;
  issue(request: EbarimtRequest): Promise<EbarimtResult>;
  cancel(id: string, date: string): Promise<EbarimtResult>;
  sendData(): Promise<{ ok: boolean; message: string }>;
}

/* ───────────────────────── бодит клиент ───────────────────────── */

/**
 * Жинхэнэ PosAPI клиент.
 *
 * Браузераас `127.0.0.1:7080` руу ШУУД хандаж болохгүй — PosAPI нь CORS
 * толгой буцаадаггүй тул fetch-ийг браузер хориглоно. Тиймээс анхдагчаар
 * манай Next.js серверийн `/api/ebarimt/...` дамжуулагчаар дайрна (сервер
 * талд CORS байхгүй).
 *
 * Capacitor дээр савлахад `baseUrl`-ыг шууд `http://127.0.0.1:7080` болгож,
 * CapacitorHttp (native) ашиглавал дамжуулагч шаардлагагүй.
 */
export class PosApiEbarimtClient implements EbarimtClient {
  constructor(
    private readonly baseUrl: string = "/api/ebarimt",
    private readonly timeoutMs: number = 20_000,
  ) {}

  private async call<T>(
    path: string,
    init?: RequestInit,
  ): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await fetch(this.baseUrl + path, {
        ...init,
        signal: controller.signal,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
        cache: "no-store",
      });
      const text = await response.text();
      if (!response.ok) return { ok: false, status: response.status, body: text };
      return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
    } finally {
      clearTimeout(timer);
    }
  }

  async info(): Promise<EbarimtInfo> {
    try {
      const result = await this.call<Record<string, unknown>>("/rest/info");
      if (!result.ok) {
        // Шинэ PosAPI бүртгэгдэхээсээ өмнө 503 "PosAPI is not configured" буцаана
        return {
          available: true,
          configured: result.status !== 503,
          message:
            result.status === 503
              ? "PosAPI бүртгэгдээгүй байна — /web хаягаар оператор нэвтэрч идэвхжүүлнэ"
              : `PosAPI алдаа (${result.status})`,
        };
      }
      const data = result.data;
      return {
        available: true,
        configured: true,
        posNo: typeof data.posNo === "string" ? data.posNo : undefined,
        merchants: Array.isArray(data.merchants) ? (data.merchants as string[]) : undefined,
        message: "Холбогдсон",
      };
    } catch (error) {
      return {
        available: false,
        configured: false,
        message: error instanceof Error ? error.message : "Сервис хариулахгүй байна",
      };
    }
  }

  async issue(request: EbarimtRequest): Promise<EbarimtResult> {
    try {
      const result = await this.call<Record<string, unknown>>("/rest/receipt", {
        method: "POST",
        body: JSON.stringify(request),
      });

      if (!result.ok) {
        // 4xx = дата буруу (засах шаардлагатай), 5xx = сервис (дахин оролдоно)
        if (result.status >= 400 && result.status < 500) {
          return { kind: "rejected", code: String(result.status), message: result.body.slice(0, 300) };
        }
        return { kind: "unavailable", message: `PosAPI ${result.status}` };
      }

      const data = result.data;
      const status = String(data.status ?? "").toUpperCase();
      if (status && status !== "SUCCESS") {
        return {
          kind: "rejected",
          code: status,
          message: String(data.message ?? "PosAPI татгалзлаа"),
        };
      }

      return {
        kind: "success",
        id: String(data.id ?? ""),
        qrData: String(data.qrData ?? ""),
        lottery: data.lottery ? String(data.lottery) : undefined,
        date: String(data.date ?? new Date().toISOString()),
      };
    } catch (error) {
      return {
        kind: "unavailable",
        message: error instanceof Error ? error.message : "Сервис хариулахгүй байна",
      };
    }
  }

  async cancel(id: string, date: string): Promise<EbarimtResult> {
    try {
      const result = await this.call<Record<string, unknown>>("/rest/receipt", {
        method: "DELETE",
        body: JSON.stringify({ id, date }),
      });
      if (!result.ok) return { kind: "unavailable", message: `PosAPI ${result.status}` };
      return { kind: "success", id, qrData: "", date };
    } catch (error) {
      return {
        kind: "unavailable",
        message: error instanceof Error ? error.message : "Сервис хариулахгүй байна",
      };
    }
  }

  async sendData(): Promise<{ ok: boolean; message: string }> {
    try {
      const result = await this.call<Record<string, unknown>>("/rest/sendData");
      return result.ok
        ? { ok: true, message: "Дараалал татвар руу илгээгдлээ" }
        : { ok: false, message: `PosAPI ${result.status}` };
    } catch (error) {
      return {
        ok: false,
        message: error instanceof Error ? error.message : "Сервис хариулахгүй байна",
      };
    }
  }
}

/* ───────────────────────── дуурайлган клиент ───────────────────────── */

/**
 * PosAPI байхгүй үед ажиллана.
 *
 * Зүгээр «амжилттай» гэж хариулдаггүй — бодит сервисийн зан төлвийг дуурайна:
 * татварын кодгүй бараа → rejected, холболт унтраалттай → unavailable.
 */
export class FakeEbarimtClient implements EbarimtClient {
  constructor(private offline = false) {}

  setOffline(value: boolean) {
    this.offline = value;
  }

  async info(): Promise<EbarimtInfo> {
    await wait(200);
    return this.offline
      ? { available: false, configured: true, message: "Сервис хариулахгүй (туршилт)" }
      : {
          available: true,
          configured: true,
          posNo: "10000001",
          message: "Туршилтын горим — бодит баримт үүсэхгүй",
        };
  }

  async issue(request: EbarimtRequest): Promise<EbarimtResult> {
    await wait(400);
    if (this.offline) return { kind: "unavailable", message: "PosAPI хариулахгүй байна" };

    const missing = request.receipts
      .flatMap((group) => group.items)
      .filter((item) => !item.classificationCode || !item.taxProductCode);

    if (missing.length > 0) {
      return {
        kind: "rejected",
        code: "ITEM_CODE_MISSING",
        message: "Татварын код дутуу: " + missing.map((item) => item.name).join(", "),
      };
    }

    const id = Math.random().toString(16).slice(2, 12).toUpperCase().padEnd(10, "0");
    return {
      kind: "success",
      id,
      qrData: [id, request.merchantTin, request.totalAmount, request.totalVAT].join("|"),
      lottery: fakeLottery(),
      date: new Date().toISOString(),
    };
  }

  async cancel(id: string, date: string): Promise<EbarimtResult> {
    await wait(300);
    return this.offline
      ? { kind: "unavailable", message: "PosAPI хариулахгүй байна" }
      : { kind: "success", id, qrData: "", date };
  }

  async sendData() {
    await wait(300);
    return this.offline
      ? { ok: false, message: "Сервис хариулахгүй байна" }
      : { ok: true, message: "Туршилтын горимд дараалал хоосон" };
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fakeLottery = () => {
  const letters = "АБВГДЕЁЖЗИЙКЛМНОӨПРСТУҮФХЦЧШЭЮЯ";
  const pick = () => letters[Math.floor(Math.random() * letters.length)];
  return pick() + pick() + String(Math.floor(10_000_000 + Math.random() * 89_999_999));
};

/* ───────────────────── сагс → PosAPI хүсэлт ───────────────────── */

import type { CartLine } from "@/lib/demo";

/** НӨАТ 10%, үнэд багтсан: дүн / 11, хагасыг дээш */
const vatOf = (amount: number) => Math.floor((amount * 10 + 55) / 110);

export type BillContext = {
  merchantTin: string;
  branchNo: string;
  districtCode: string;
  posNo: string;
  customerTin?: string;
  /** 0–1 хооронд. Хөнгөлөлтийг мөр бүрт пропорциональ хуваана. */
  discountRate: number;
  payment: { code: EbarimtPaymentCode; paidAmount: number; exchangeCode?: string };
};

/**
 * Сагсыг PosAPI-гийн хүсэлт болгоно.
 *
 * Хоёр зүйлийг анхаарсан:
 *  1. **Хөнгөлөлтийг мөр бүрт хуваана.** Баримтад бодитоор авсан мөнгө
 *     бичигдэх ёстой — толгойд нь хөнгөлсөн дүн, мөрүүдэд нь хөнгөлөөгүй
 *     дүн бичвэл PosAPI тэнцэхгүй гэж татгалзана.
 *  2. **Толгойн дүн нь мөрүүдийн НИЙЛБЭР.** Хувьчлан бодсоныг дахин
 *     нийлбэрлэнэ — бөөрөнхийллийн 1₮ зөрүү ч татгалзах шалтгаан болно.
 */
export function buildEbarimtRequest(lines: CartLine[], ctx: BillContext): EbarimtRequest {
  const items = lines.map((line) => {
    const gross = line.product.price * line.qty;
    const net = Math.round(gross * (1 - ctx.discountRate));
    const vatable = line.product.taxType === "VAT_ABLE";
    return {
      taxType: (vatable ? "VAT_ABLE" : "VAT_FREE") as EbarimtTaxType,
      item: {
        name: line.product.name,
        barCode: line.product.barCode ?? "",
        barCodeType: (line.product.barCode ? "GS1" : "UNDEFINED") as EbarimtBarCodeType,
        classificationCode: line.product.taxCoded ? "6110000" : "",
        taxProductCode: line.product.taxCoded ? "1" : "",
        measureUnit: line.product.unit,
        qty: line.qty,
        unitPrice: line.product.price,
        totalAmount: net,
        totalVAT: vatable ? vatOf(net) : 0,
        totalCityTax: 0,
      } satisfies EbarimtItem,
    };
  });

  // Татварын төрлөөр бүлэглэнэ — PosAPI баримтыг ингэж хүлээж авдаг
  const groups = new Map<EbarimtTaxType, EbarimtItem[]>();
  for (const entry of items) {
    const list = groups.get(entry.taxType) ?? [];
    list.push(entry.item);
    groups.set(entry.taxType, list);
  }

  const receipts: EbarimtReceiptGroup[] = [...groups.entries()].map(([taxType, groupItems]) => ({
    taxType,
    merchantTin: ctx.merchantTin,
    totalAmount: sum(groupItems, (item) => item.totalAmount),
    totalVAT: sum(groupItems, (item) => item.totalVAT),
    totalCityTax: sum(groupItems, (item) => item.totalCityTax),
    items: groupItems,
  }));

  const totalAmount = sum(receipts, (group) => group.totalAmount);

  return {
    totalAmount,
    totalVAT: sum(receipts, (group) => group.totalVAT),
    totalCityTax: sum(receipts, (group) => group.totalCityTax),
    branchNo: ctx.branchNo,
    districtCode: ctx.districtCode,
    merchantTin: ctx.merchantTin,
    posNo: ctx.posNo,
    customerTin: ctx.customerTin,
    type: ctx.customerTin ? "B2B_RECEIPT" : "B2C_RECEIPT",
    receipts,
    payments: [
      {
        code: ctx.payment.code,
        status: "PAID",
        // Төлбөр нь баримтын дүнтэй тэнцүү байна — хариулт энд ордоггүй
        paidAmount: totalAmount,
        exchangeCode: ctx.payment.exchangeCode,
      },
    ],
  };
}

const sum = <T,>(list: T[], pick: (item: T) => number) =>
  list.reduce((total, item) => total + pick(item), 0);
