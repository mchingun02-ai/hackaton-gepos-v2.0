/* Gerege хэрэглэгчийн апп — Web Push мэдэгдэл (сервер VAPID-аар илгээнэ). Кэш хийхгүй. */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (e) => {
  let d = {};
  try {
    d = e.data ? e.data.json() : {};
  } catch {
    d = { title: "Gerege", body: e.data ? e.data.text() : "" };
  }
  e.waitUntil(
    self.registration.showNotification(d.title || "Gerege", {
      body: d.body || "",
      tag: d.tag,
      icon: "/app-icon-192.png",
      badge: "/app-icon-192.png",
      data: { url: typeof d.url === "string" && d.url.startsWith("/") ? d.url : "/app" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/app";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((ws) => {
      const w = ws.find((x) => new URL(x.url).pathname.startsWith("/app"));
      return w ? w.focus() : self.clients.openWindow(url);
    }),
  );
});
