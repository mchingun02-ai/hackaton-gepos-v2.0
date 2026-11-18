/**
 * AI туслах — Gerege-ийн AI gateway (ali.gerege.mn) дээрх Qwen/Wan загварууд.
 * Сервер ба UI хоёулаа ашиглана (node модульгүй).
 * Үнэ — gateway-ийн /api/pricing (USD, видеоны секунд тутам), 2026-11-03.
 */

/* ───────── чат ───────── */

export type ChatModel = { id: string; label: string; hint: string };

export const CHAT_MODELS: ChatModel[] = [
  { id: "qwen3.8-flash", label: "Хурдан", hint: "qwen3.8-flash · өдөр тутмын асуулт, хурдан" },
  { id: "qwen3.7-plus", label: "Тэнцвэртэй", hint: "qwen3.7-plus · пост, тайлан, дүн шинжилгээ" },
  { id: "qwen3.8-max", label: "Хамгийн ухаалаг", hint: "qwen3.8-max · нарийн тооцоо, бодож хариулна (удаан)" },
  { id: "qwen3-vl-plus", label: "Зураг, видео", hint: "qwen3-vl-plus · зураг, видео, баримт унших" },
  { id: "qwen-vl-ocr", label: "Текст таних (OCR)", hint: "qwen-vl-ocr · баримт, нэхэмжлэх, шошгоноос текст гаргах" },
  { id: "qwen3.5-omni-plus", label: "Дуу хоолой", hint: "qwen3.5-omni-plus · дуу сонсох, дуугаар хариулах" },
  { id: "qwen3-coder-flash", label: "Код", hint: "qwen3-coder-flash · Excel томьёо, скрипт" },
];
export const DEFAULT_CHAT = "qwen3.8-flash";
/** Видео хавсралтыг унших загвар (бусад загвар видео авахгүй) */
export const VIDEO_READER = "qwen3-vl-plus";
/** Аудио сонсох, дуугаар хариулах — зөвхөн omni */
export const OMNI = "qwen3.5-omni-plus";
export const isOmni = (m: string) => /omni/.test(m);
/** Зураг уншдаг загварууд (gateway дээр шалгасан) */
export const seesImages = (m: string) => /vl|omni|qwen3\.[6-9]/.test(m);

export const VOICES = [
  { id: "", label: "Дуугүй" },
  { id: "Serena", label: "Эмэгтэй хоолой" },
  { id: "Tina", label: "Эмэгтэй хоолой 2" },
  { id: "Ethan", label: "Эрэгтэй хоолой" },
] as const;
export const voiceOk = (v: string) => VOICES.some((x) => x.id === v && v);

/* ───────── видео (Wan) ───────── */

/** t2v — текстээс, i2v — 1 зургаас, kf2v — эхний + сүүлийн кадраас */
export type VideoMode = "t2v" | "i2v" | "kf2v";
export type Res = "480P" | "720P" | "1080P";
export type Aspect = "16:9" | "9:16" | "1:1";

export type VideoModel = {
  id: string;
  label: string;
  modes: VideoMode[];
  /** нягтрал → секундын үнэ (USD) */
  price: Partial<Record<Res, number>>;
  durations: number[];
  /** «дуутай» сонголт (нэмэлт үнэтэй) */
  audio?: Partial<Record<Res, number>>;
  note?: string;
};

export const VIDEO_MODELS: VideoModel[] = [
  { id: "wan3.0-video", label: "Wan 3.0", modes: ["t2v", "i2v"], price: { "480P": 0.05, "720P": 0.1, "1080P": 0.2 }, durations: [5, 10], note: "хамгийн шинэ" },
  { id: "wan3.0-video-prime", label: "Wan 3.0 Prime", modes: ["t2v", "i2v"], price: { "480P": 0.068, "720P": 0.14, "1080P": 0.28 }, durations: [5, 10], note: "хамгийн өндөр чанар" },
  { id: "wan2.7-t2v", label: "Wan 2.7", modes: ["t2v"], price: { "720P": 0.1, "1080P": 0.15 }, durations: [5, 10, 15] },
  { id: "wan2.7-i2v", label: "Wan 2.7", modes: ["i2v"], price: { "720P": 0.1, "1080P": 0.15 }, durations: [5, 10, 15] },
  { id: "wan2.6-t2v", label: "Wan 2.6", modes: ["t2v"], price: { "720P": 0.1, "1080P": 0.15 }, durations: [5, 10, 15] },
  { id: "wan2.6-i2v", label: "Wan 2.6", modes: ["i2v"], price: { "720P": 0.1, "1080P": 0.15 }, durations: [5, 10, 15] },
  { id: "wan2.6-i2v-flash", label: "Wan 2.6 Flash", modes: ["i2v"], price: { "720P": 0.025, "1080P": 0.0375 }, audio: { "720P": 0.05, "1080P": 0.075 }, durations: [5, 10, 15], note: "хямд, дуу нэмж болно" },
  { id: "wan2.5-t2v-preview", label: "Wan 2.5", modes: ["t2v"], price: { "480P": 0.05, "720P": 0.1, "1080P": 0.15 }, durations: [5, 10] },
  { id: "wan2.5-i2v-preview", label: "Wan 2.5", modes: ["i2v"], price: { "480P": 0.05, "720P": 0.1, "1080P": 0.15 }, durations: [5, 10] },
  { id: "wan2.2-t2v-plus", label: "Wan 2.2", modes: ["t2v"], price: { "480P": 0.02, "1080P": 0.1 }, durations: [5], note: "хамгийн хямд" },
  { id: "wan2.2-i2v-plus", label: "Wan 2.2", modes: ["i2v"], price: { "480P": 0.02, "1080P": 0.1 }, durations: [5] },
  { id: "wan2.2-i2v-flash", label: "Wan 2.2 Flash", modes: ["i2v"], price: { "480P": 0.015, "720P": 0.036, "1080P": 0.07 }, durations: [5], note: "хамгийн хямд" },
  { id: "wan2.2-kf2v-flash", label: "Wan 2.2 Flash", modes: ["kf2v"], price: { "480P": 0.015, "720P": 0.036, "1080P": 0.07 }, durations: [5] },
];

export const DEFAULT_VIDEO: Record<VideoMode, string> = { t2v: "wan3.0-video", i2v: "wan3.0-video", kf2v: "wan2.2-kf2v-flash" };
export const modeOf = (images: number): VideoMode => (images >= 2 ? "kf2v" : images === 1 ? "i2v" : "t2v");
export const MODE_LABEL: Record<VideoMode, string> = { t2v: "Текстээс видео", i2v: "Зургаас видео", kf2v: "Эхний ба сүүлийн кадраас" };
export const videoModel = (id: string) => VIDEO_MODELS.find((m) => m.id === id);
export const resOf = (m: VideoModel) => (["480P", "720P", "1080P"] as Res[]).filter((r) => m.price[r] !== undefined);

/** Текстээс видеоны хэмжээ (өргөн*өндөр) */
export const SIZE: Record<Res, Record<Aspect, string>> = {
  "480P": { "16:9": "832*480", "9:16": "480*832", "1:1": "624*624" },
  "720P": { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960" },
  "1080P": { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440" },
};

export type VideoOpts = { model: string; res: Res; aspect: Aspect; duration: number; audio: boolean };

/** Урьдчилсан үнэ (USD) */
export function videoCost(o: VideoOpts) {
  const m = videoModel(o.model);
  if (!m) return 0;
  const per = (o.audio && m.audio?.[o.res]) || m.price[o.res] || 0;
  return per * o.duration;
}

/** Тохиргоог загварт тааруулна (байхгүй нягтрал, хугацааг хамгийн ойрынхоор солино) */
export function fitVideo(o: VideoOpts): VideoOpts {
  const m = videoModel(o.model) ?? VIDEO_MODELS[0];
  const rs = resOf(m);
  const res = rs.includes(o.res) ? o.res : rs.includes("720P") ? "720P" : rs[0];
  const duration = m.durations.includes(o.duration) ? o.duration : m.durations[0];
  return { model: m.id, res, aspect: o.aspect, duration, audio: !!(o.audio && m.audio) };
}

/**
 * «видео хийгээд өг» гэх мэт хүсэлтийг таних.
 * Зураг хавсаргасан бол «хөдөлгө, бүжиглүүл, инээлг, дуулуул, ярь…» гэх мэт хөдөлгөөний үйлийг ч видео гэж үзнэ.
 */
export const wantsVideo = (t: string, image = false) =>
  (/(видео|бичлэг|reels?|клип|video)/i.test(t) && /(хий|бүтээ|гарга|үүсгэ|бэлд|бэлтгэ|хөдөлгө|generate|make|create)/i.test(t)) ||
  (image && /(хөдөлгө|хөдлүүл|бүжиглүүл|бүжигл|инээлг|инээмсэглүүл|дуулуул|ярьуул|яриул|алхуул|гүйлг|эргүүл|даллуул|animate|dance|move)/i.test(t));
