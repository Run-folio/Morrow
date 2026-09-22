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

test("failed Unsplash responses expose bounded diagnostics without leaking credentials or caching a miss", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });
  process.env.UNSPLASH_ACCESS_KEY = "  test-secret-key  ";
  const scenarios = [
    { status: 401, reason: "unauthorized", responseStatus: 502 },
    { status: 403, reason: "forbidden", responseStatus: 502 },
    { status: 429, reason: "rate-limited", responseStatus: 429 },
    { status: 503, reason: "upstream-server-error", responseStatus: 502 },
    { status: 400, reason: "other-upstream-error", responseStatus: 502 },
  ];

  for (const scenario of scenarios) {
    globalThis.fetch = async (_input, init) => {
      assert.equal(new Headers(init?.headers).get("Authorization"), "Client-ID test-secret-key");
      return Response.json({ errors: ["Invalid credential test-secret-key", "Client-ID another-secret-value"] }, {
        status: scenario.status,
        headers: {
          "X-Ratelimit-Limit": "50",
          "X-Ratelimit-Remaining": "0",
          "Retry-After": "3600",
        },
      });
    };
    const response = await GET(new NextRequest("http://localhost/api/journey-route-image?query=Almaty"));
    const body = await response.json();
    assert.equal(response.status, scenario.responseStatus);
    assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal(body.image, null);
    assert.equal(body.configured, true);
    assert.equal(body.reason, scenario.reason);
    assert.equal(body.upstreamStatus, scenario.status);
    assert.deepEqual(body.upstreamErrors, ["Invalid credential [redacted]", "Client-ID [redacted]"]);
    assert.equal(body.rateLimitLimit, "50");
    assert.equal(body.rateLimitRemaining, "0");
    assert.equal(body.retryAfter, "3600");
    assert.equal(JSON.stringify(body).includes("test-secret-key"), false);
    assert.equal(JSON.stringify(body).includes("another-secret-value"), false);
  }
});

test("an invalid provider body and headers cannot become public diagnostic text", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
  globalThis.fetch = async () => new Response("not json", {
    status: 502,
    headers: { "X-Ratelimit-Limit": "secret", "Retry-After": "secret" },
  });

  const response = await GET(new NextRequest("http://localhost/api/journey-route-image?query=Almaty"));
  const body = await response.json();
  assert.equal(body.reason, "upstream-server-error");
  assert.equal(body.upstreamStatus, 502);
  assert.deepEqual(body.upstreamErrors, []);
  assert.equal(body.rateLimitLimit, null);
  assert.equal(body.retryAfter, null);
});

test("request failures remain neutral and distinct from upstream HTTP errors", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.UNSPLASH_ACCESS_KEY;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.UNSPLASH_ACCESS_KEY;
    else process.env.UNSPLASH_ACCESS_KEY = originalKey;
  });
  process.env.UNSPLASH_ACCESS_KEY = "test-key";
  globalThis.fetch = async () => { throw new TypeError("test-key must not be returned"); };

  const response = await GET(new NextRequest("http://localhost/api/journey-route-image?query=Almaty"));
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.reason, "request-failed");
  assert.equal(body.image, null);
  assert.equal(body.configured, true);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(JSON.stringify(body).includes("test-key"), false);
});
