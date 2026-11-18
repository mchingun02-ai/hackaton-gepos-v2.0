import { NextResponse } from "next/server";

/**
 * Е-баримт PosAPI рүү дамжуулагч.
 *
 * Яагаад хэрэгтэй вэ: PosAPI нь CORS толгой буцаадаггүй тул браузераас
 * `http://127.0.0.1:7080` руу шууд fetch хийхийг браузер хориглоно. Сервер
 * талд CORS гэж байхгүй учир энэ маршрут дамжуулж өгнө.
 *
 * Хаана ажиллах вэ: Next.js сервер нь PosAPI-тай ИЖИЛ машин дээр байх
 * ёстой — PosAPI зөвхөн localhost дээр сонсдог (аюулгүй байдлын үүднээс
 * тэгэх ч ёстой: PosAPI-д нэвтрэлт байхгүй, 7080 порт руу хүрсэн бүхэн
 * тухайн мерчантын нэрийн өмнөөс баримт үүсгэж чадна).
 *
 * Capacitor дээр савлахад энэ маршрут хэрэггүй: native HTTP (CapacitorHttp)
 * нь браузерын CORS шалгуураас гадуур ажиллах тул шууд 127.0.0.1:7080 руу
 * ханддаг. Тэр үед `PosApiEbarimtClient`-ийн baseUrl-ыг солино.
 */

const TARGET = process.env.EBARIMT_URL ?? "http://127.0.0.1:7080";
const TIMEOUT_MS = 90_000;

async function proxy(request: Request, path: string[]) {
  const url = new URL(request.url);
  const target = `${TARGET}/${path.join("/")}${url.search}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const body =
      request.method === "GET" || request.method === "HEAD" ? undefined : await request.text();

    const response = await fetch(target, {
      method: request.method,
      headers: { "Content-Type": "application/json" },
      body,
      signal: controller.signal,
      cache: "no-store",
    });

    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    // Сервис унтраалттай, суулгаагүй, эсвэл хугацаа хэтэрсэн.
    // 503 буцаана — клиент талд энэ нь "дахин оролдоно" гэсэн утгатай.
    return NextResponse.json(
      {
        error: "posapi_unreachable",
        target: TARGET,
        message: error instanceof Error ? error.message : "Холбогдож чадсангүй",
      },
      { status: 503 },
    );
  } finally {
    clearTimeout(timer);
  }
}

type Ctx = { params: Promise<{ path: string[] }> };

export async function GET(request: Request, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}

export async function POST(request: Request, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}

export async function DELETE(request: Request, ctx: Ctx) {
  return proxy(request, (await ctx.params).path);
}
