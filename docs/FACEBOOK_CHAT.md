# Facebook чат (Merchant portal)

Мерчант порталын **Facebook чат** цэснээс «Facebook-ээр холбох» дарна → Facebook-ээр нэвтэрч Page-ээ зөвшөөрнө →
порталд буцаж Page-ээ сонгоно. Үүний дараа харилцагчийн Messenger мессеж порталд ирж, мерчант/ажилтан эндээс хариулна.

## Код

| Файл | Үүрэг |
|---|---|
| `src/lib/fb/server.ts` | OAuth, токен шифрлэлт (AES-256-GCM), SQLite хадгалалт, webhook, илгээх дүрэм, демо |
| `src/app/api/fb/connect` | Facebook-ийн нэвтрэх цонх руу үсэргэнэ (state + httpOnly nonce cookie — CSRF) |
| `src/app/api/fb/callback` | code → урт хугацаат токен → `/me/accounts` → Page-үүдийг 15 мин түр хадгална |
| `src/app/api/fb/pages` | GET сонгох Page-үүд (токенгүй) · POST сонгосныг холбож `subscribed_apps` хийнэ |
| `src/app/api/fb/status` | GET холболтын төлөв · DELETE салгах (webhook-оос гаргаж, токен, түүх устгана) |
| `src/app/api/fb/webhook` | Meta webhook (verify + `X-Hub-Signature-256` шалгана), Page id-аар мерчантыг олно |
| `src/app/api/fb/threads/...` | чатын жагсаалт, мессеж, уншсан, шийдсэн, хариу илгээх |
| `src/components/portal/Chat.tsx` | Портал UI |

Өгөгдөл: `data/storeplus-fb.db` (git-д орохгүй). Page токен шифрлэгдэж хадгалагдана, браузер руу хэзээ ч гарахгүй.
Урт хугацаат хэрэглэгчийн токеноос авсан Page токен хугацаагүй байдаг (Page-ийн нууц үг солигдох, эрх хасагдах хүртэл).

## Илгээх дүрэм (Meta)

| Харилцагчийн сүүлийн мессежээс | Илгээх |
|---|---|
| 24 цагийн дотор | Чөлөөтэй (`RESPONSE`) |
| 24 цаг – 7 хоног | Зөвхөн ажилтны гараар бичсэн хариу (`HUMAN_AGENT` tag — сервер өөрөө нэмнэ) |
| 7 хоногоос хойш | Илгээхгүй — харилцагч дахин бичихийг хүлээнэ |

## Meta App тохируулах (Gerege-ийн өөрийн App)

1. developers.facebook.com → App үүсгэх (Business төрөл). **Messenger** ба **Facebook Login for Business** нэмнэ.
2. Facebook Login → Settings → *Valid OAuth Redirect URIs*: `https://<портал-домэйн>/api/fb/callback`.
3. Messenger → Webhooks → Callback URL `https://<портал-домэйн>/api/fb/webhook`, Verify token = `FB_VERIFY_TOKEN`.
   Талбарууд: `messages`, `message_echoes`, `messaging_postbacks`, `message_reads`, `message_deliveries`.
4. `.env.local`-д `.env.example`-ийн утгуудыг бөглөөд серверийг дахин асаана.
5. Development горимд зөвхөн App-д үүрэгтэй хүмүүс холбож, туршина.
   **Бусад мерчант холбохын тулд:** Business Verification + App Review — `pages_messaging`, `pages_manage_metadata`,
   `pages_show_list`, `pages_read_engagement` (Advanced Access), мөн Human Agent feature. Дараа нь App-ийг Live болгоно.

Локал туршилт: webhook нийтэд нээлттэй HTTPS шаарддаг тул `cloudflared tunnel --url http://localhost:3100` эсвэл ngrok,
`SP_PUBLIC_URL`-ийг tunnel-ийн хаяг болгоно.

## Production-оос өмнө заавал

- **Нэвтрэлт:** API нь мерчантыг `x-sp-merchant` толгойгоор (РД) таньдаг — портал одоо демо eID-ээр браузерт нэвтэрдэг учир.
  Жинхэнэ серверийн session-оор солих хэрэгтэй (`merchantOf()` нэг газар). Эс бөгөөс РД мэдэх хүн чатыг уншиж чадна.
- SQLite нэг серверт тохирно; олон инстанс бол PostgreSQL руу шилжүүлнэ.
- Шинэ мессеж 4 сек тутам polling-оор ирнэ (дараа нь SSE/WebSocket болгож болно).

## Одоогоор ороогүй

Зураг/файл илгээх, reaction, ажилтанд хуваарилах, хурдан хариултын товч (Yuno-д байгаа — шаардлагатай бол нэмнэ).
Ирсэн зураг Facebook-ийн холбоосоор харагдана (хэсэг хугацааны дараа хүчингүй болж болно).
