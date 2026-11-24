/* Service worker: cache-first para que funcione sin cobertura.
 * Acordarse de subir la versión cuando cambie algún archivo.
 */

const CACHE = "chuchi-v3";

const ASSETS = [
  "/",
  "/styles.css",
  "/privacidad",
  "/manifest.webmanifest",
  "/fonts/gabarito.woff2",
  "/js/theme.js",
  "/js/app.js",
  "/js/logic.js",
  "/js/art.js",
  "/js/mesa.js",
  "/js/share.js",
  "/js/qrcode.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/icon-maskable-512.png",
  "/icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  // cache: "reload" para no guardar copias viejas del navegador
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(ASSETS.map((url) => new Request(url, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  // La mesa en directo va siempre a la red
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/_vercel/")) return;

  // Los enlaces de invitación (/?mesa=...) son la misma página
  event.respondWith(
    caches.match(request, { ignoreSearch: true, cacheName: CACHE }).then(
      (hit) =>
        hit ||
        fetch(request).catch(async () => {
          const home = request.mode === "navigate" && (await caches.match("/"));
          return home || Response.error();
        })
    )
  );
});
