import type { NextConfig } from "next";

/* Capacitor руу савлахад статик экспорт хэрэгтэй болно.
   Одоо хөгжүүлэлтийн горимд ажиллуулж байгаа тул унтраалттай;
   APK болгох үед `output: "export"` болгоно. */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  /* Зэрэг build/тест (өөр өөр хавтас) — NEXT_DIST_DIR=.next-a гэх мэт. Анхдагч .next */
  distDir: process.env.NEXT_DIST_DIR || ".next",
  /* Утаснаас (нэг Wi-Fi) туршихад dev сервер рүү өөр хаягаар хандана —
     Next 16 үүнийг зөвшөөрөлгүйгээр хориглодог. */
  allowedDevOrigins: ["192.168.*.*", "*.ngrok-free.app", "*.trycloudflare.com"],
};

export default nextConfig;
