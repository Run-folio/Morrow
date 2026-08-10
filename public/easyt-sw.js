/* EasyT only keeps public app-shell files offline. It never stores account,
 * dashboard, profile, API, or user-specific trip responses in Cache Storage. */
const CACHE_NAME = "easyt-public-shell-v2";
const PUBLIC_SHELL = [
  "/journey/home",
  "/journey/new",
  "/journey/plan",
  "/easyt-icon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PUBLIC_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.search) return;

  const isPublicShell = PUBLIC_SHELL.includes(url.pathname);
  const isStaticAsset = url.pathname.startsWith("/_next/static/");

  if (isPublicShell || isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
    return;
  }

  if (request.mode === "navigate" && url.pathname.startsWith("/journey/")) {
    event.respondWith(
      fetch(request).catch(async () => {
        const cache = await caches.open(CACHE_NAME);
        return (await cache.match("/journey/home")) || Response.error();
      }),
    );
  }
});
