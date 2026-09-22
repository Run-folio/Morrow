import assert from "node:assert/strict";
import { registerHooks } from "node:module";
import test from "node:test";

// Node's native TypeScript runner needs the explicit Next.js ESM entry point.
registerHooks({
  resolve(specifier, context, nextResolve) {
    return nextResolve(specifier === "next/server" ? "next/server.js" : specifier, context);
  },
});

const { NextRequest } = await import("next/server.js");
const { GET } = await import("../app/api/journey-route-image/route.ts");

test("a query with no suitable Unsplash image remains retryable at both API cache layers", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
  let requestCache: RequestCache | undefined;
  globalThis.fetch = async (_input, init) => {
    requestCache = init?.cache;
    return Response.json({ results: [] });
  };

  const response = await GET(new NextRequest("http://localhost/api/journey-route-image?query=Almaty"));
  assert.equal((await response.json()).reason, "no-result");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(requestCache, "no-store");
});

test("a suitable Unsplash image retains the seven-day positive response cache", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
  globalThis.fetch = async () => Response.json({ results: [{
    id: "photo-1",
    urls: { regular: "https://images.unsplash.com/photo-1" },
    links: { download_location: "https://api.unsplash.com/photos/photo-1/download" },
    user: { name: "Example Photographer", links: { html: "https://unsplash.com/@example" } },
  }] });

  const response = await GET(new NextRequest("http://localhost/api/journey-route-image?query=Almaty"));
  const body = await response.json();
  assert.equal(body.image.id, "photo-1");
  assert.equal(response.headers.get("Cache-Control"), "public, s-maxage=604800, stale-while-revalidate=2592000");
});
