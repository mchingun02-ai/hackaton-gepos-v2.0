# Gerege AI — түнш ПОС-д 30 минутад холбох

Танай кассын програмын мерчантууд Gerege AI ажилтан (чат, мэдлэгийн сан, тооллого)-ыг **өөрсдийн ПОС-ын өгөгдөл дээр**
ашиглана. Та **нэг удаа** холбоно; мерчант бүр өөрөө нэгдэж, өөрөө кредит авна (QPay). Анхдагч **LIVE** горим: Gerege
таны серверээс асуулт бүрт шууд уншина — каталог, борлуулалтыг хуулж хадгалахгүй.

Бүрэн гэрээ: `GET /api/v1/openapi.json` (Gerege-ийн API) · `docs/partner-connector-openapi.yaml` (таны хэрэгжүүлэх connector).

## 0. Sandbox (5 мин)

```bash
# Сервер (127.0.0.1 connector-т sandbox-д зөвшөөрөх)
ALLOW_PRIVATE_CONNECTOR=yes npm run dev                     # эсвэл next start
node scripts/seed-partner.mjs --base http://127.0.0.1:3100 --connector http://127.0.0.1:3200
#   → Partner key (gpk_sandbox_…) НЭГ удаа хэвлэнэ, «Dayansoft-demo» + 2 синтетик мерчант (ds-1001, ds-1002), onboarding холбоос
node examples/partner-connector/server.mjs --secret-file data/partner-connector.secret   # «таны сервер» (синтетик)
```

```bash
H=http://127.0.0.1:3100/api/v1
PK=gpk_sandbox_…        # seed хэвлэсэн
```

## 1. Connector-оо бүртгэх (нэг удаа)

5 GET + 1 POST endpoint хэрэгжүүлнэ (`docs/partner-connector-openapi.yaml`), эсвэл `examples/partner-connector/server.mjs`-ийг хуулна.

```bash
curl -sX PUT $H/partner/connector -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' \
  -d '{"url":"https://pos.dayansoft.example/gerege","mode":"live"}'
# → {"url":"…","mode":"live","secret":"gcs_…"}   ← НЭГ удаа. Гарын үсэг шалгахад хадгална.
```

Хүсэлт бүрийг шалгана (Node жишээ):

```js
const bh = createHash("sha256").update(rawBody).digest("hex");
const want = "v1=" + createHmac("sha256", SECRET).update(`${ts}\n${req.method}\n${req.url}\n${bh}`).digest("hex");
// ts = X-Gerege-Timestamp (±5 мин), X-Gerege-Request-Id давхардахгүй, timingSafeEqual(want, X-Gerege-Signature)
```

## 2. Мерчантаа үүсгэх

```bash
curl -sX POST $H/partner/tenants -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' \
  -d '{"extMerchantId":"ds-1001","name":"Сансар хүнсний дэлгүүр (demo)"}'
# → 201 {"tenantId":"p…","status":"pending_terms","posKind":"live","created":true}   (ижил extMerchantId → 200, ижил tenant)
```

## 3. «AI холбох» товч

Таны **сервер** токен авна (partner key хөтөч рүү ХЭЗЭЭ Ч гарахгүй), хөтөч `url`-ийг iframe эсвэл шинэ цонхонд нээнэ.

```bash
curl -sX POST $H/partner/tenants/p…/embed-token -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' \
  -d '{"user":{"id":"u-7","name":"Б. Сараа","role":"owner"},"view":"onboarding"}'
# → {"token":"get_…","url":"https://<host>/connect?e=get_…","expiresAt":"…"}   (5 мин, НЭГ удаа)
```

`/connect`: ① нөхцөл (зөвхөн `owner`) → ② багц → QPay QR (sandbox-д «Sandbox төлбөр баталгаажуулах») → ③ самбар
(хэрэглээний график, кассын холболт «N бараа», өгөгдөл ба нууцлал). iframe-д зөвшөөрөх эх сурвалж, брэнд:

```bash
curl -sX PUT $H/partner/branding -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' \
  -d '{"name":"Dayansoft","color":"#5B21B6","logoUrl":"https://pos.dayansoft.example/logo.png","frameOrigins":["https://pos.dayansoft.example"]}'
```

## 4. Шалгах

```bash
curl -sX POST $H/partner/connector/test -H "Authorization: Bearer $PK"     # бидний гарын үсэгтэй GET /health + products?limit=1
curl -s  $H/partner/tenants -H "Authorization: Bearer $PK"                 # төлөв, багц, үлдэгдэл кредит
curl -s "$H/partner/usage?days=30" -H "Authorization: Bearer $PK"          # зөвхөн тоон нийлбэр
curl -s "$H/partner/access-log?tenant=p…" -H "Authorization: Bearer $PK"   # хэн, хэзээ, төрөл, тоо (агуулгагүй)
```

## Үйл явдал (webhook, заавал биш)

```bash
curl -sX PUT $H/partner/webhook -H "Authorization: Bearer $PK" -H 'Content-Type: application/json' \
  -d '{"url":"https://pos.dayansoft.example/gerege-events"}'      # → {"secret":"gws_…"} НЭГ удаа
```
`POST <url>` · `X-Gerege-Event` · `X-Gerege-Delivery` · `X-Gerege-Signature: sha256=hex(HMAC(secret, body))` ·
дугтуй `{id, event, tenantId, extMerchantId, at, data}` · үйл явдал `tenant.activated`, `tenant.suspended`, `wallet.low`,
`wallet.empty`, `stock.adjusted`, `product.created` · алдаа гарвал 1м, 5м, 30м, 2ц, 12ц-ийн дараа дахин.

## Бусад

| | |
|---|---|
| Түдгэлзүүлэх / сэргээх | `POST /partner/tenants/{id}/suspend` · `/resume` |
| Tenant-ын түлхүүр (sync, тооллогын апп) | `POST /partner/tenants/{id}/keys {"scopes":["connector:read","connector:write","inventory:count"]}` — `mcp`, `agent:*` → 400 |
| Sync горим (хуулбар) | `PUT /partner/connector {"mode":"sync"}` → tenant түлхүүрээр `PUT /products`, `PUT /stock`, `POST /sales`, `GET /stock-adjustments` + `ack` |
| Хадгалах хугацаа | `PUT /partner/retention {"transcriptsDays":30,"contactsDays":180,"actionsDays":90}` |
| Экспорт | `POST /partner/tenants/{id}/export` — мерчант «Өгөгдөл ба нууцлал»-д зөвшөөрсөн үед л (үгүй бол 403 `consent_required`) |
| Бүрэн устгалт | `DELETE /partner/tenants/{id}/data` — шифрлэх түлхүүр + мөр + файл; хариу нь тоонуудын гэрчилгээ |

Алдааны хэлбэр: `{"error":{"code":"not_found","message":"…"}}`. Өөр түншийн tenant үргэлж 404. Хязгаар: түлхүүр бүрт 600 хүсэлт/мин.
Партнер түлхүүр tenant-ын өгөгдөл (яриа, мэдлэгийн сан, бараа) уншиж ЧАДАХГҮЙ — зөвхөн удирдлага ба тоон нийлбэр.
