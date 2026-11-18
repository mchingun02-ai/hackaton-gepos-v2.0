/**
 * Хар хайрцаг: түр SP_DATA_DIR + mock Qwen/QPay дээр `next start`-ыг тусдаа портод асаана.
 * Урьдчилж `npm run build` хийсэн байх ёстой (.next/BUILD_ID). Хөгжүүлэлтийн сервер (3100)-т хөндөхгүй.
 */
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { startMock } from "./mock.mjs";
import { ROOT } from "./ts.mjs";

const freePort = () =>
  new Promise((res) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => res(p));
    });
  });

/** `extraEnv` — тест тутмын нэмэлт орчин (ж: FB mock Graph). Mock-ийн хаягийг `${MOCK}` гэж бичвэл орлуулна. */
export async function startServer(extraEnv = {}) {
  const dist = process.env.NEXT_DIST_DIR || ".next";
  if (!existsSync(path.join(ROOT, dist, "BUILD_ID"))) throw new Error(`Эхлээд \`npm run build\` хийнэ үү (${dist}/BUILD_ID алга)`);
  const mock = await startMock();
  const dataDir = mkdtempSync(path.join(os.tmpdir(), "gepos-test-"));
  const port = await freePort();
  const secret = randomBytes(48).toString("base64url");
  const env = {
    ...process.env,
    NODE_ENV: "production",
    SP_DATA_DIR: dataDir,
    AUTH_SECRET: secret,
    AUTH_ALLOW_BOOTSTRAP: "yes",
    // AI — зөвхөн mock (жинхэнэ gateway руу явахгүй)
    AI_BASE_URL: `${mock.url}/v1`,
    DASHSCOPE_API_KEY: "test-key",
    AI_MODEL: "mock-plus",
    AI_FAST_MODEL: "mock-flash",
    AI_EMBED_MODEL: "mock-embed",
    AI_OMNI_MODEL: "mock-omni",
    AI_TTS_MODEL: "none",
    // QPay sandbox — mock
    QPAY_URL: `${mock.url}/qpay-sandbox`,
    QPAY_USERNAME: "TEST",
    QPAY_PASSWORD: "TEST",
    QPAY_INVOICE_CODE: "TEST",
    SP_PUBLIC_URL: "",
    // Facebook, хуучин туслах — хоосон (демо горим, гадагш дуудлагагүй)
    FB_APP_ID: "",
    FB_APP_SECRET: "",
    FB_VERIFY_TOKEN: "",
    GOOGLE_CLIENT_ID: "",
    GOOGLE_CLIENT_SECRET: "",
    QWEN_API_KEY: "",
  };
  for (const [k, v] of Object.entries(extraEnv)) env[k] = String(v).replaceAll("${MOCK}", mock.url);
  const child = spawn(process.execPath, [path.join(ROOT, "node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  child.stdout.on("data", (d) => (log += d));
  child.stderr.on("data", (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`next start унтарлаа:\n${log}`);
    try {
      const r = await fetch(`${base}/api/auth/me`);
      if (r.ok) break;
    } catch {
      /* асаж байна */
    }
    if (Date.now() - t0 > 60_000) throw new Error(`next start хариу өгсөнгүй:\n${log}`);
    await new Promise((r) => setTimeout(r, 300));
  }
  return {
    base,
    mock,
    secret,
    dataDir,
    log: () => log,
    async stop() {
      child.kill("SIGTERM");
      await new Promise((r) => (child.exitCode !== null ? r() : child.once("exit", r)));
      await mock.close();
      rmSync(dataDir, { recursive: true, force: true });
    },
  };
}

let ipSeq = 0;
/** Cookie-тэй жижиг клиент (хөтчийг дуурайна: Origin = өөрийн host) */
export class Client {
  constructor(base) {
    this.base = base;
    this.cookie = "";
    // IP тутмын хязгаарлалтаас (rate) тест хооронд хамааралгүй байх
    this.ip = `10.9.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;
  }
  async req(method, p, { json, headers = {}, origin = true, raw } = {}) {
    const h = { "x-forwarded-for": this.ip, ...headers };
    if (this.cookie) h.cookie = this.cookie;
    if (origin && method !== "GET") h.origin = this.base;
    let body;
    if (json !== undefined) {
      h["content-type"] = "application/json";
      body = JSON.stringify(json);
    } else if (raw !== undefined) body = raw;
    const r = await fetch(this.base + p, { method, headers: h, body, redirect: "manual" });
    const sc = r.headers.get("set-cookie");
    if (sc) {
      const m = /gp_s=([^;]*)/.exec(sc);
      if (m) this.cookie = m[1] ? `gp_s=${m[1]}` : "";
    }
    const text = await r.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      /* текст */
    }
    return { status: r.status, text, data };
  }
  get = (p, o) => this.req("GET", p, o);
  post = (p, json, o) => this.req("POST", p, { ...o, json });
  put = (p, json, o) => this.req("PUT", p, { ...o, json });
  patch = (p, json, o) => this.req("PATCH", p, { ...o, json });
  del = (p, o) => this.req("DELETE", p, o);
}
