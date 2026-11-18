import type { MetadataRoute } from "next";

/* Gerege хэрэглэгчийн аппыг утсанд суулгах (PWA) — «Нүүр дэлгэцэд нэмэх» */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gerege — урамшуулал, хэтэвч",
    short_name: "Gerege",
    description: "Хамтрагч дэлгүүрүүдийн урамшуулал, хүргэлт, оноо, хэтэвч",
    start_url: "/app",
    scope: "/app",
    display: "standalone",
    background_color: "#f4f4f5",
    theme_color: "#ff6a00",
    lang: "mn",
    icons: [
      { src: "/app-icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
