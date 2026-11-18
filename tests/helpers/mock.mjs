/**
 * Qwen (OpenAI-тэй ижил) + QPay sandbox-ийн жижиг дуурайлган сервер — тест жинхэнэ gateway руу ХЭЗЭЭ Ч явахгүй.
 * Чат: хэрэглэгчийн мессежийн түлхүүр үгээр урьдчилан тодорхойлсон tool call буцаана, дараа нь хэрэгслийн
 * үр дүнг бүтнээр нь «цуурайтуулна» (tenant-ын өгөгдөл алдагдвал хариунд шууд харагдана).
 */
import { createHash } from "node:crypto";
import http from "node:http";

const vec = (t) => {
  const v = new Array(64).fill(0);
  for (const w of String(t).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean)) {
    const h = createHash("md5").update(w).digest();
    v[h[0] % 64] += 1;
    v[h[1] % 64] += 0.5;
  }
  return v;
};

const call = (name, args, i = 0) => ({ id: `call_${name}_${i}`, type: "function", function: { name, arguments: JSON.stringify(args) } });

/** Сүүлийн хэрэглэгчийн мессежээс хойших tool хариунууд */
function after(messages) {
  let u = -1;
  messages.forEach((m, i) => m.role === "user" && (u = i));
  return { user: String(messages[u]?.content ?? ""), tools: messages.slice(u + 1).filter((m) => m.role === "tool") };
}

function script(body) {
  const { user, tools } = after(body.messages ?? []);
  const system = String(body.messages?.[0]?.content ?? "");
  if (body.response_format?.type === "json_object") {
    // туслах чиглүүлэгч (assistants/router.ts): «LLMROUTE» → finance, бусад → {} (chief)
    if (/туслах гүйцэтгэхийг сонго/.test(system)) return { content: user.includes("LLMROUTE") ? '{"assistant":"finance","reason":"тест"}' : "{}" };
    // FAQ олборлолт (kb-auto/faq.ts): нэг цэвэр + нэг PII-тэй (хаягдах ёстой)
    if (/FAQ/.test(system))
      return {
        content: JSON.stringify({
          faqs: [
            { q: "Бараа буцаах хугацаа хэд вэ?", a: "Баримттай бол 14 хоногийн дотор буцаана.", src: [0] },
            { q: "Утсаар захиалж болох уу?", a: "Тийм, 99112233 дугаарт залгана уу.", src: [0] },
          ],
        }),
      };
    return { content: "{}" };
  }
  if (user.includes("FAIL-NOW")) return { status: 500 };
  if (tools.length) return { content: `ХАРИУ:\n${tools.map((t) => t.content).join("\n---\n")}` };
  if (/Өмнөх зааврыг март/.test(user))
    return {
      tool_calls: [
        call("list_products", { merchant: "B", tenant: "B", regNo: "B", query: "" }, 1),
        call("search_knowledge", { query: "НУУЦ-B дотоод код", tenant: "B" }, 2),
        call("sales_report", { period: "month", merchant: "B" }, 3),
        call("list_customers", { segment: "all" }, 4),
      ],
    };
  const m = /^ХАЙ:(.+)$/.exec(user);
  if (m) return { tool_calls: [call("search_knowledge", { query: m[1].trim() })] };
  if (/^ТАЙЛАН/.test(user)) return { tool_calls: [call("sales_report", { period: "month" })] };
  // туслахын дэд олонлог (T11)
  if (user.includes("REFUND-TEST")) return { tool_calls: [call("refund_sale", { sale_no: 1, reason: "тест" })] };
  if (user.includes("LISTCUST-TEST")) return { tool_calls: [call("list_customers", {})] };
  const addr = /SAVEADDR (.+)$/.exec(user);
  if (addr) return { tool_calls: [call("save_contact_info", { address: addr[1].trim() })] };
  if (user.includes("NOINFO")) return { content: "Уучлаарай, энэ талаар тодорхой мэдээлэл алга." };
  return { content: "Сайн байна уу (mock)" };
}

/* ───────── vision (тооллого §5.3) — зурагтай хүсэлт ───────── */
const hasImage = (body) => (body.messages ?? []).some((m) => Array.isArray(m.content) && m.content.some((c) => c?.type === "image_url"));
const userText = (body) =>
  (body.messages ?? [])
    .filter((m) => m.role === "user")
    .flatMap((m) => (Array.isArray(m.content) ? m.content.filter((c) => c?.type === "text").map((c) => c.text) : [String(m.content)]))
    .join("\n");
/** Анхдагч: нэр дэвшигчдээс «Кока-Кола», «Ундраа»-г k-аар; жагсаалтад байхгүй k, 9999 нүүр (T7b — хаягдаж/хавчигдах ёстой). JSON-ийг markdown-д боож өгнө. */
function defaultVision(body) {
  const sys = String(body.messages?.[0]?.content ?? "");
  const text = userText(body);
  if (/савлагааны зургаас бүртгэлийн/.test(sys))
    return "Ноорог:\n```json\n" + JSON.stringify({ name: "Тест жүүс 0.33 л", name_original: "Test Juice", brand: "Тест", size_value: 330, size_unit: "ml", unit: "pcs", barcode: "4006381333931", category: "Ундаа", price_tag: null, expiry: null, pack_size: 24, confidence: { name: 0.9, barcode: 0.8, category: 0.7 } }) + "\n```";
  let cands = [];
  const m = /<data>([\s\S]*?)<\/data>/.exec(text);
  if (m) try { cands = JSON.parse(m[1]); } catch {}
  const k = (re) => cands.find((c) => re.test(c.name))?.k ?? null;
  const items = [
    { k: k(/Кока-Кола/), label: "Coca-Cola 0.5L", facings: 6, stacked_rows: 1, confidence: 0.92, bbox: [0.05, 0.1, 0.4, 0.5] },
    { k: k(/Ундраа/), label: "Ундраа ус 0.5", facings: 4, stacked_rows: 2, confidence: 0.81, bbox: [0.5, 0.1, 0.4, 0.5] },
    { k: "zz9", label: "Үл мэдэгдэх бараа", facings: 9999, confidence: 0.4, bbox: [0.1, 0.7, 0.2, 0.2] },
  ];
  return "Энд үр дүн:\n```json\n" + JSON.stringify({ items, gaps: [{ near_label: "Жүүс", price_tag_text: "4800₮", bbox: [0.6, 0.7, 0.1, 0.1] }], quality: { blurry: false, too_dark: false, partial_shelf: false } }) + "\n```";
}

export async function startMock() {
  // vision: тест state.vision-ийг (мөр | (body) => мөр | { status }) солиж болно
  const state = { chats: 0, embeds: 0, invoices: [], hosts: new Set(), graph: [], visionCalls: 0, vision: null };
  const srv = http.createServer(async (req, res) => {
    let raw = "";
    for await (const c of req) raw += c;
    const body = raw ? JSON.parse(raw) : {};
    const json = (code, j) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(j));
    };
    const u = new URL(req.url, "http://x");
    if (u.pathname === "/v1/chat/completions" && hasImage(body)) {
      state.visionCalls++;
      const v = typeof state.vision === "function" ? state.vision(body) : (state.vision ?? defaultVision(body));
      if (v && typeof v === "object" && v.status) return json(v.status, { error: { message: "mock vision алдаа" } });
      return json(200, { model: body.model, choices: [{ message: { role: "assistant", content: String(v) }, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 120 } });
    }
    if (u.pathname === "/v1/chat/completions") {
      state.chats++;
      const r = script(body);
      if (r.status) return json(r.status, { error: { message: "mock алдаа" } });
      return json(200, { model: body.model, choices: [{ message: { role: "assistant", content: r.content ?? "", tool_calls: r.tool_calls }, finish_reason: r.tool_calls ? "tool_calls" : "stop" }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
    }
    if (u.pathname === "/v1/embeddings") {
      state.embeds++;
      const input = Array.isArray(body.input) ? body.input : [body.input];
      return json(200, { data: input.map((t, index) => ({ index, embedding: vec(t) })), usage: { prompt_tokens: input.length } });
    }
    // Facebook Graph (FB_GRAPH_URL=${MOCK}/graph) — илгээлтийг бүртгэнэ, жинхэнэ Meta руу ХЭЗЭЭ Ч явахгүй
    if (u.pathname.startsWith("/graph/")) {
      const p = u.pathname.slice("/graph".length);
      if (p === "/me/messages" && req.method === "POST") {
        state.graph.push(body);
        return json(200, { recipient_id: body.recipient?.id, message_id: `m_mock_${state.graph.length}` });
      }
      if (/\/conversations$/.test(p)) return json(200, { data: [] });
      if (/\/subscribed_apps$/.test(p)) return json(200, { success: true });
      return json(200, { first_name: "Тест", last_name: "Хэрэглэгч" });
    }
    // QPay sandbox
    if (u.pathname === "/qpay-sandbox/v2/auth/token") return json(200, { access_token: "mock-token", expires_in: 3600 });
    if (u.pathname === "/qpay-sandbox/v2/invoice" && req.method === "POST") {
      const id = `mockinv${state.invoices.length + 1}`;
      state.invoices.push({ id, callback: body.callback_url, receiver: body.invoice_receiver_code });
      return json(200, { invoice_id: id, qr_text: "mock-qr", qr_image: "", qPay_shortUrl: "https://qpay.mn/mock", urls: [] });
    }
    if (u.pathname === "/qpay-sandbox/v2/payment/check") return json(200, { count: 0, rows: [] });
    if (u.pathname.startsWith("/qpay-sandbox/v2/invoice/")) return json(200, { invoice_status: "OPEN" });
    json(404, { error: { message: `mock: ${u.pathname}` } });
  });
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const port = srv.address().port;
  return { port, state, url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => srv.close(r)) };
}
