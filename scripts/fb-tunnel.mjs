/**
 * Локал хөгжүүлэлт: Facebook Messenger webhook-ийг интернэтээс локал портал (3100) руу дамжуулна.
 *   npm run fb:tunnel
 * Cloudflare quick tunnel асааж, гарсан https хаягийг Meta App-ын webhook (object=page) болгон бүртгэнэ.
 * Tunnel-ийн хаяг асаах бүрт өөрчлөгддөг тул скрипт бүртгэлийг өөрөө шинэчилнэ. Энэ цонхыг хаавал мессеж ирэхгүй.
 * Page-ийг App-д захиалах нь мерчант «Facebook-ээр холбох» дарахад автоматаар хийгддэг.
 * Бодит серверт: Meta App → Webhooks-д https://<портал-домэйн>/api/fb/webhook-ийг нэг удаа бүртгэнэ — энэ скрипт хэрэггүй.
 * Шаардлага: cloudflared (brew install cloudflared), .env.local-д FB_APP_ID, FB_APP_SECRET, FB_VERIFY_TOKEN.
 */
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const { FB_APP_ID: APP_ID, FB_APP_SECRET: SECRET, FB_VERIFY_TOKEN: VERIFY } = env;
const GRAPH = `https://graph.facebook.com/${env.FB_GRAPH_VERSION || "v23.0"}`;
const PORT = process.env.PORT || 3100;
const FIELDS = "messages,message_echoes,messaging_postbacks,message_reads,message_deliveries,standby";

for (const [k, v] of Object.entries({ FB_APP_ID: APP_ID, FB_APP_SECRET: SECRET, FB_VERIFY_TOKEN: VERIFY }))
  if (!v) {
    console.error(`[fb] .env.local-д ${k} алга`);
    process.exit(1);
  }

async function register(url) {
  const callback = `${url}/api/fb/webhook`;
  // Tunnel-ийн DNS бэлэн болохыг хүлээнэ (Meta бүртгэхдээ GET-ээр шалгадаг)
  let ready = false;
  for (let i = 0; i < 150 && !ready; i++) {
    try {
      const r = await fetch(`${callback}?hub.mode=subscribe&hub.verify_token=${VERIFY}&hub.challenge=ping`);
      ready = (await r.text()) === "ping";
    } catch {}
    if (!ready) await new Promise((r) => setTimeout(r, 1000));
  }
  if (!ready) throw new Error(`${callback} хариу өгөхгүй байна — портал (npm run dev) асаалттай эсэхийг шалгана уу`);
  const r = await fetch(`${GRAPH}/${APP_ID}/subscriptions`, {
    method: "POST",
    body: new URLSearchParams({ access_token: `${APP_ID}|${SECRET}`, object: "page", callback_url: callback, verify_token: VERIFY, fields: FIELDS, include_values: "true" }),
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  console.log(`[fb] Webhook бүртгэгдлээ: ${callback}`);
}

const cf = spawn("cloudflared", ["tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
cf.on("error", () => {
  console.error("[fb] cloudflared олдсонгүй — brew install cloudflared");
  process.exit(1);
});
let done = false;
const scan = (buf) => {
  const m = String(buf).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (m && !done) {
    done = true;
    console.log(`[fb] Tunnel: ${m[0]}`);
    // Шинэ tunnel-ийн DNS тархахад хэдэн минут болж магадгүй — 3 удаа оролдоно
    (async () => {
      for (let n = 1; n <= 3; n++) {
        try {
          return await register(m[0]);
        } catch (e) {
          console.error(`[fb] Бүртгэл амжилтгүй (${n}/3):`, e.message);
        }
      }
    })();
  }
};
cf.stdout.on("data", scan);
cf.stderr.on("data", scan);
const stop = () => {
  cf.kill();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
