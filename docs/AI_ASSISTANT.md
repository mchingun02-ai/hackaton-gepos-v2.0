# AI туслах (Gemini)

Мерчант **AI туслах** цэснээс «Google-ээр холбох» дарна → Gmail-ээрээ нэвтэрч зөвшөөрнө → порталд буцаж ирэхэд
Gemini **автоматаар** тохирно (`autoProject`): AI Studio-ийн «Default Gemini Project» (`gen-lang-client-…`) байвал түүнийг,
үгүй бол «Gerege AI туслах» project үүсгэнэ, чадахгүй бол байгаа эхний project; Gemini API-г асаана → шууд чатлана.
Project-ийг дараа нь толгойн «Project» товчоор сольж болно.
Gemini-ийн хэрэглээ, хязгаар **мерчантын project** дээр бодогдоно (project бүрт үнэгүй хязгаартай).

## Код

| Файл | Үүрэг |
|---|---|
| `src/lib/ai/server.ts` | Google OAuth, refresh token шифрлэлт, project жагсаах/үүсгэх, Gemini API асаах, Gemini stream, демо |
| `src/app/api/ai/connect`, `callback` | Google-ийн зөвшөөрлийн цонх, code → refresh token |
| `src/app/api/ai/status` | төлөв · DELETE салгах (Google-ээс эрх цуцална, түүх устгана) |
| `src/app/api/ai/projects` | GET project-ууд · POST `{projectId}` эсвэл `{create:true}` → Gemini API асаана |
| `src/app/api/ai/chat` | GET түүх · POST `{text, context}` → текст stream · DELETE түүх устгах |
| `src/components/portal/Assistant.tsx` | Портал UI; бизнесийн товч мэдээллийг (борлуулалт, нөөц, бараа, урамшуулал — утас, нэргүй) асуулт бүрт дагуулна |

Refresh token шифрлэгдэж `data/storeplus-fb.db`-ийн `ai_accounts`-д хадгалагдана, браузер руу гарахгүй.

## Gerege-ийн нэг удаагийн тохиргоо (Google Cloud)

1. console.cloud.google.com → Gerege-ийн project → **APIs & Services → Library**: *Cloud Resource Manager API*, *Service Usage API* асаана.
2. **OAuth consent screen (Google Auth Platform)**: User type **External**, App name «Gerege POS», support email, scopes:
   `openid`, `email`, `https://www.googleapis.com/auth/cloud-platform`.
3. **Audience → Test users**: туршилтын үед мерчантуудын Gmail-ийг нэмнэ (100 хүртэл).
4. **Credentials → Create OAuth client ID → Web application**. Authorized redirect URI:
   `http://localhost:3100/api/ai/callback` (локал), `https://<портал-домэйн>/api/ai/callback` (production).
5. Client ID, Secret-ийг `.env.local`-д `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` болгож бичнэ.

## Анхаарах

- `cloud-platform` нь Google-ийн **эмзэг (sensitive) эрх**. Test users-ээс бусад хүнд нээхийн өмнө Google-ийн
  **app verification** шаардлагатай (нууцлалын бодлого, домэйн, видео тайлбар; хэдэн долоо хоног). Тэр хүртэл
  «Google hasn't verified this app» анхааруулга гарч, зөвхөн Test users нэвтэрнэ.
- Google Cloud-д анх удаа орж байгаа Gmail бол project үүсгэхийн өмнө console.cloud.google.com-д нэг удаа орж
  үйлчилгээний нөхцөлийг зөвшөөрөх ёстой (алдааны мессеж үүнийг хэлнэ).
- Үнэгүй хязгаар хэтэрвэл мерчант project-доо billing нэмнэ.
- Мерчантыг `x-sp-merchant` толгойгоор таньдаг — Facebook чатын адил жинхэнэ session хэрэгтэй (`docs/FACEBOOK_CHAT.md`).

## Qwen (Gerege-ийн AI gateway)

AI туслахын дээд талд «Qwen | Gemini» сонголт бий. Qwen-ийг default болгосон. Мерчант Google холбох шаардлагагүй.

- Код: `src/lib/ai/qwen.ts`, `src/app/api/ai/chat/route.ts` (`?p=qwen`, multipart), `src/app/api/ai/files/[id]/route.ts`.
- Тохиргоо: `QWEN_API_URL`, `QWEN_API_KEY`, `QWEN_MODEL` (.env.local).
- Хавсралт: нэг дор 5 хүртэл файл, тус бүр 10 MB, нийт 20 MB. Товч, чирж оруулах, Ctrl+V-ээр нэмнэ.
  - Зураг (JPG, PNG, WEBP, GIF) нь base64 `image_url` хэлбэрээр явна.
  - PDF-ийн текстийг `unpdf`-ээр гаргаж явуулна. Скан хийсэн, текстгүй PDF-ийг уншихгүй.
  - CSV, TXT, JSON, MD файлыг агуулгаар нь явуулна.
- Файлууд `data/ai-files/`-д хадгалагдана. Сүүлийн 3 хавсралттай асуултын файл дараагийн асуултуудад дахин дагалдана.
  Чатын түүх устгахад файлууд ч устна. Файлыг зөвхөн тухайн мерчант харна.
- Gemini, Qwen хоёрын түүх тусдаа хадгалагдана (`ai_messages.provider`).

## Qwen — бүх боломж (2026-11-03)

Код: `src/lib/ai/models.ts` (загвар, үнэ), `qwen.ts` (чат), `video.ts` (Wan), `/api/ai/video`.

- **Загвар сонгох** (чатын доор): Хурдан `qwen3.8-flash` · Тэнцвэртэй `qwen3.7-plus` · Хамгийн ухаалаг `qwen3.8-max` · Зураг, видео `qwen3-vl-plus` · OCR `qwen-vl-ocr` · Дуу хоолой `qwen3.5-omni-plus` · Код `qwen3-coder-flash`.
  Хавсралтаас хамаарч автоматаар солигдоно: видео → `qwen3-vl-plus`, дуу эсвэл дуут хариу → omni.
- **Хавсралт**: зураг, видео (MP4/MOV/WEBM), дуу (WAV/MP3; бусдыг хөтөч WAV болгоно), PDF, CSV, текст. 10 MB хүртэл.
- **Микрофон**: дуугаар асууна (WAV болж хавсарна).
- **Дуугаар хариулах**: omni текст + 24kHz PCM урсгана → `хариу.wav` хариунд хавсарна. Хоолой: Serena, Tina, Ethan (Cherry, Chelsie gateway дээр ажиллахгүй).
- **Видео хийх** («Видео» горим эсвэл «… видео хийгээд өг» / зурагтай «бүжиглүүл, инээлг…»):
  0 зураг — текстээс, 1 зураг — зургаас, 2 зураг — эхний ба сүүлийн кадраас. Монгол тайлбарыг эхлээд англи prompt болгоно.
  Gateway: `POST /v1/video/generations` → `GET /v1/video/generations/:id` → `GET /v1/videos/:id/content` (MP4-ийг data/ai-files-д хадгална; эх холбоос 24 цагт устдаг).
  **Нягтралыг `metadata.parameters.resolution`-оор л дамжуулна** — эс бөгөөс gateway 720P/1080P-ээр (үнэтэй) хийнэ.
- `qwen-mt-*` орчуулгын загварт gateway `translation_options`-ийг дамжуулдаггүй тул орчуулгыг энгийн чатаар хийнэ.
