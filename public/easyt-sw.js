/* EasyT only keeps public app-shell files offline. It never stores account,
 * dashboard, profile, API, or user-specific trip responses in Cache Storage. */
const CACHE_PREFIX = "easyt-public-shell-";
const CACHE_NAME = `${CACHE_PREFIX}v6`;
const PREVIOUS_CACHE_NAME = `${CACHE_PREFIX}v5`;
const PUBLIC_SHELL = [
  "/journey/home",
  "/journey/new",
  "/journey/plan",
  "/easyt-icon.svg",
];

async function precachePublicShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(PUBLIC_SHELL);

  // The HTML shell is not runnable without its hashed Next.js/CSS assets. Read
  // the installed public pages and pin their dependency graph in the same
  // public-only cache, so the first offline planner reopen can hydrate even if
  // that route was never previously visited under service-worker control.
  const dependencies = new Set();
  for (const pathname of PUBLIC_SHELL.filter((entry) => entry.startsWith("/journey/"))) {
    const response = await cache.match(pathname);
    if (!response) continue;
    const html = await response.clone().text();
    for (const match of html.matchAll(/\/_next\/static\/[^"'\\\s<]+/g)) {
      dependencies.add(match[0].replaceAll("&amp;", "&"));
    }
  }
  await Promise.all([...dependencies].map((asset) => cache.add(asset)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(Promise.all([precachePublicShell(), self.skipWaiting()]));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME && key !== PREVIOUS_CACHE_NAME)
        .map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

async function networkFirstPublicShell(request, pathname) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(pathname, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(pathname);
    return cached || Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  const isPublicShell = PUBLIC_SHELL.includes(url.pathname);
  const isStaticAsset = url.pathname.startsWith("/_next/static/");

  // Documents must advance with the deployment. Store a successful response
  // under its query-free shell path so recovery URLs can reopen offline without
  // pinning their query or an older deployment's asset graph.
  if (request.mode === "navigate" && isPublicShell) {
    event.respondWith(networkFirstPublicShell(request, url.pathname));
    return;
  }

  if (url.search) return;

  if (isPublicShell || isStaticAsset) {
    event.respondWith(
      caches.open(CACHE_NAME).then(async (cache) => {
        // Keep the immediately previous graph available while already-open
        // clients finish, but all new documents come from the network above.
        const cached = await cache.match(request) || await caches.match(request);
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
