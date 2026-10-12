/* Public shells and build assets only. No API, account, profile or trip
 * response is persisted. Older caches are retained for already-open clients. */
importScripts("/easyt-offline-manifest.js");

const READER_FLOOR = "idb-recovery-v1";
const MANIFEST = self.MORROVIA_OFFLINE_SHELL;
const CACHE_PREFIX = "easyt-public-shell-";
const CACHE_NAME = `${CACHE_PREFIX}${READER_FLOOR}-${MANIFEST?.artifactId}`;
const READY_KEY = "/__morrovia_offline_ready__";
const PUBLIC_SHELL = [
  "/",
  "/journey/new",
  "/journey/plan",
  "/easyt-icon.svg",
];
const DOCUMENTS = PUBLIC_SHELL.filter((path) => path !== "/easyt-icon.svg");

function validManifest() {
  return MANIFEST?.version === 1 && MANIFEST.readerFloor === READER_FLOOR
    && /^[A-Za-z0-9_-]{1,100}$/.test(MANIFEST.buildId)
    && typeof MANIFEST.buildCommit === "string"
    && (MANIFEST.buildCommit === "" || /^[a-f0-9]{40}$/i.test(MANIFEST.buildCommit))
    && Array.isArray(MANIFEST.assets) && MANIFEST.assets.length > 0
    && MANIFEST.assets.every((asset) => asset && typeof asset === "object")
    && /^[a-f0-9]{64}$/.test(MANIFEST.artifactId)
    && new Set(MANIFEST.assets.map((asset) => asset.url)).size === MANIFEST.assets.length
    && MANIFEST.assets.every((asset) => typeof asset.url === "string"
      && /^\/[A-Za-z0-9_./-]+$/.test(asset.url) && !asset.url.includes("..")
      && (asset.url.startsWith("/_next/static/") || asset.url === "/easyt-icon.svg" || asset.url === "/maplibre/maplibre-gl-worker.mjs")
      && /^[a-f0-9]{64}$/.test(asset.sha256));
}

async function sha256(bytes) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function validArtifact() {
  if (!validManifest()) return false;
  const identity = { version: MANIFEST.version, readerFloor: MANIFEST.readerFloor,
    buildId: MANIFEST.buildId, buildCommit: MANIFEST.buildCommit, assets: MANIFEST.assets };
  return await sha256(new TextEncoder().encode(JSON.stringify(identity))) === MANIFEST.artifactId;
}

function meta(html, name) {
  for (const tag of html.matchAll(/<meta\s+[^>]*>/gi)) {
    const attributes = new Map([...tag[0].matchAll(/([\w-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), match[2]]));
    if (attributes.get("name") === name) return attributes.get("content");
  }
}

async function readerDocument(response, exactBuild) {
  if (!response?.ok || response.headers.get("content-type")?.split(";")[0] !== "text/html") return false;
  const html = await response.clone().text();
  if (meta(html, "morrovia-offline-reader") !== READER_FLOOR) return false;
  if (!exactBuild) return true; // A newer online reader may have its own graph.
  if (meta(html, "morrovia-build-commit") !== MANIFEST.buildCommit) return false;
  const urls = new Set(MANIFEST.assets.map((asset) => asset.url));
  return [...html.matchAll(/\/_next\/static\/[^"'\\\s<]+/g)].every((match) =>
    urls.has(new URL(match[0].replaceAll("&amp;", "&"), self.location.origin).pathname));
}

async function exactAsset(response, asset) {
  if (!response?.ok) return false;
  return await sha256(await response.clone().arrayBuffer()) === asset.sha256;
}

async function readyCache() {
  if (!(await validArtifact())) return null;
  const cache = await caches.open(CACHE_NAME);
  const marker = await cache.match(READY_KEY);
  if (!marker) return null;
  const ready = await marker.json().catch(() => null);
  if (ready?.readerFloor !== READER_FLOOR || ready.artifactId !== MANIFEST.artifactId || ready.buildId !== MANIFEST.buildId || ready.assets !== MANIFEST.assets.length) return null;
  // Eviction can remove a lazy chunk after installation. A readiness record
  // alone must not authorize a document with an incomplete cold graph.
  for (const asset of MANIFEST.assets) if (!(await exactAsset(await cache.match(asset.url), asset))) return null;
  for (const path of DOCUMENTS) if (!(await readerDocument(await cache.match(path), true))) return null;
  return cache;
}

async function precachePublicShell() {
  if (!(await validArtifact())) throw new Error("Unsupported offline reader manifest");
  // A replacement with the identical artifact must not invalidate an active
  // accepted snapshot if a later network/preparation attempt fails.
  if (await readyCache()) return;
  const cache = await caches.open(CACHE_NAME);
  // Only this artifact marker is invalidated, never user data or old graphs.
  await cache.delete(READY_KEY);
  const options = { credentials: "omit", cache: "no-store", redirect: "error" };
  for (const path of DOCUMENTS) {
    const response = await fetch(path, { ...options, headers: { Accept: "text/html" } });
    if (!(await readerDocument(response, true))) throw new Error("Offline reader shell mismatch");
    await cache.put(path, response);
  }
  // Pin the emitted public client graph, including all lazy boundaries and
  // the local map worker, before granting takeover.
  for (const asset of MANIFEST.assets) {
    const response = await fetch(asset.url, options);
    if (!(await exactAsset(response, asset))) throw new Error("Offline asset mismatch");
    await cache.put(asset.url, response);
  }
  await cache.put(READY_KEY, new Response(JSON.stringify({ readerFloor: READER_FLOOR, artifactId: MANIFEST.artifactId, buildId: MANIFEST.buildId, assets: MANIFEST.assets.length })));
  if (!(await readyCache())) throw new Error("Offline preparation incomplete");
}

self.addEventListener("install", (event) => {
  event.waitUntil(precachePublicShell().then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(readyCache().then((cache) => {
    if (!cache) throw new Error("Offline reader is not ready");
    return self.clients.claim();
  }));
});

async function offlineDocument(pathname) {
  try {
    const cache = await readyCache();
    if (!cache) return Response.error();
    const response = await cache.match(pathname);
    return (await readerDocument(response, true)) ? response : Response.error();
  } catch { return Response.error(); }
}

async function networkFirstPublicShell(request, pathname) {
  try {
    const response = await fetch(request);
    if (await readerDocument(response, false)) return response;
  } catch { /* The validated build remains the offline/rollback reader floor. */ }
  // No legacy document lookup and no queried/authenticated response caching.
  return offlineDocument(pathname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" && DOCUMENTS.includes(url.pathname)) {
    event.respondWith(networkFirstPublicShell(request, url.pathname));
    return;
  }
  if (url.search) return;
  const asset = validManifest() ? MANIFEST.assets.find((entry) => entry.url === url.pathname) : null;
  if (asset || url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const current = await cache.match(request);
      if (current && (!asset || await exactAsset(current, asset))) return current;
      // Prior immutable assets remain available; this global lookup is never
      // used for documents.
      const previous = await caches.match(request);
      if (previous && (!asset || await exactAsset(previous, asset))) return previous;
      const response = await fetch(request);
      if (asset) {
        if (!(await exactAsset(response, asset))) return Response.error();
        await cache.put(request, response.clone());
      }
      return response;
    })());
    return;
  }
  if (request.mode === "navigate" && url.pathname.startsWith("/journey/")) {
    event.respondWith(fetch(request).catch(() => offlineDocument("/")));
  }
});
