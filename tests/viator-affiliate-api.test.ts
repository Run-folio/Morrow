import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

type ViatorModule = typeof import("../lib/easyt/viator-affiliate.server.ts");

let viatorModule: Promise<ViatorModule> | undefined;

function loadViatorModule() {
  const countrySource = readFileSync("lib/easyt/country-registry.ts", "utf8");
  const destinationResolverSource = readFileSync("lib/easyt/viator-destination-resolver.server.ts", "utf8")
    .replace('import { countryFor } from "./country-registry.ts";\n', "");
  const timeoutSource = readFileSync("lib/easyt/provider-timeout.ts", "utf8");
  const viatorSource = readFileSync("lib/easyt/viator-affiliate.server.ts", "utf8")
    .replace('import "server-only";\n', "")
    .replace('import { withProviderTimeout } from "./provider-timeout.ts";\n', "")
    .replace(/import \{[\s\S]*?\} from "\.\/viator-destination-resolver\.server\.ts";\n/, "")
    .replace('export type { ActivityDestinationIdentity, ViatorDestinationResolution } from "./viator-destination-resolver.server.ts";\n', "");
  viatorModule ??= import(`data:text/javascript;base64,${Buffer.from(transpileModule(
    `${countrySource}\n${destinationResolverSource}\n${timeoutSource}\n${viatorSource}`,
    { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext } },
  ).outputText).toString("base64")}`) as Promise<ViatorModule>;
  return viatorModule;
}

const apiKey = "test-viator-secret";
const configuration = { environment: "sandbox" as const, apiBaseUrl: "https://api.sandbox.viator.com/partner", apiKey };
const paris = { canonicalPlaceId: "paris", name: "Paris", country: "France", placeType: "city", coordinates: { latitude: 48.8566, longitude: 2.3522 } };
const resolvedDestination = (destination: { canonicalPlaceId: string; name: string }) => ({ ...destination, providerDestinationId: "479" });
const checkedAt = "2026-09-01T12:00:00.000Z";
const trackedProductUrl = "https://www.viator.com/tours/Paris/d479-PARIS-1?medium=api&campaign=a%2Bb";

function product(overrides: Record<string, unknown> = {}) {
  return {
    productCode: "PARIS-1",
    title: "Paris museum visit",
    destinations: [{ ref: "479", primary: true }],
    images: [{ isCover: true, variants: [{ width: 200, url: "https://images.example.test/200.jpg" }, { width: 800, url: "https://images.example.test/800.jpg" }] }],
    reviews: { combinedAverageRating: 4.8, totalReviews: 120 },
    duration: { fixedDurationInMinutes: 90 },
    pricing: { summary: { fromPrice: 31.5 }, currency: "EUR" },
    productUrl: trackedProductUrl,
    ...overrides,
  };
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

test("selects only the requested server-side environment credential", async () => {
  const { ViatorAffiliateError, resolveViatorApiConfiguration } = await loadViatorModule();
  const sandbox = resolveViatorApiConfiguration({ VIATOR_API_ENV: "sandbox", VIATOR_API_KEY_SANDBOX: apiKey, NEXT_PUBLIC_VIATOR_API_KEY: "public-must-be-ignored" });
  const production = resolveViatorApiConfiguration({ VIATOR_API_ENV: "production", VIATOR_API_KEY_PRODUCTION: "production-secret" });
  assert.deepEqual({ environment: sandbox.environment, apiBaseUrl: sandbox.apiBaseUrl }, { environment: "sandbox", apiBaseUrl: "https://api.sandbox.viator.com/partner" });
  assert.deepEqual({ environment: production.environment, apiBaseUrl: production.apiBaseUrl }, { environment: "production", apiBaseUrl: "https://api.viator.com/partner" });
  assert.throws(() => resolveViatorApiConfiguration({ VIATOR_API_ENV: "sandbox", NEXT_PUBLIC_VIATOR_API_KEY: "public-only" }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "configuration");
  assert.throws(() => resolveViatorApiConfiguration({ VIATOR_API_ENV: "unexpected", VIATOR_API_KEY_SANDBOX: apiKey }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "configuration");
});

test("keeps provider destination identity inside the adapter and uses the documented taxonomy endpoint", () => {
  const source = readFileSync("lib/easyt/viator-affiliate.server.ts", "utf8");
  assert.match(source, /apiBaseUrl}\/destinations/);
  assert.doesNotMatch(source, /verifiedDestinationIds|paris:\s*["']479/);
});

test("sends the exact required headers, locale fallback, and one bounded search request", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  let requestCount = 0;
  let requestedUrl = "";
  let capturedHeaders = new Headers();
  let capturedBody: Record<string, unknown> = {};
  const client = new ViatorAffiliateClient(configuration, { request: async (url, options) => {
    requestCount += 1;
    requestedUrl = String(url);
    capturedHeaders = new Headers(options?.headers);
    capturedBody = JSON.parse(String(options?.body));
    return jsonResponse({ products: [product()], totalCount: 500 });
  }, cache: new Map(), now: () => Date.parse(checkedAt), resolveDestination: resolvedDestination });

  await client.searchActivities({ destination: paris, start: 11, count: 50, currency: "eur" });
  assert.equal(requestedUrl, "https://api.sandbox.viator.com/partner/products/search");
  assert.equal(requestCount, 1, "one requested page must never trigger automatic pagination");
  assert.equal(capturedHeaders.get("exp-api-key"), apiKey);
  assert.equal(capturedHeaders.get("Accept"), "application/json;version=2.0");
  assert.equal(capturedHeaders.get("Accept-Language"), "en-US");
  assert.equal(capturedHeaders.get("Authorization"), null);
  assert.deepEqual(capturedBody, {
    filtering: { destination: "479" },
    sorting: { sort: "DEFAULT" },
    pagination: { start: 11, count: 50 },
    currency: "EUR",
  });
});

test("normalizes a small provider-neutral activity result and preserves productUrl byte-for-byte", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  const client = new ViatorAffiliateClient(configuration, { request: async () => jsonResponse({ products: [product({ unexpectedProviderField: "must-not-reach-result" })] }), cache: new Map(), now: () => Date.parse(checkedAt), resolveDestination: resolvedDestination });
  assert.deepEqual(await client.searchActivities({ destination: paris, count: 3, locale: "en_gb" }), [{
    provider: "viator",
    source: "viator",
    providerProductId: "PARIS-1",
    title: "Paris museum visit",
    destination: { canonicalPlaceId: "paris", label: "Paris", providerDestinationId: "479" },
    image: "https://images.example.test/800.jpg",
    rating: 4.8,
    reviewCount: 120,
    duration: { fixedMinutes: 90 },
    price: { amount: 31.5, currency: "EUR" },
    productUrl: trackedProductUrl,
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt },
  }]);
});

test("omits unsupported optional claims and unsafe product URLs rather than inventing certainty", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  const client = new ViatorAffiliateClient(configuration, { request: async () => jsonResponse({ products: [product({
    images: undefined,
    reviews: undefined,
    duration: undefined,
    pricing: undefined,
    productUrl: "https://notviator.com/tours/unsafe",
  })] }), cache: new Map(), now: () => Date.parse(checkedAt), resolveDestination: resolvedDestination });
  const [activity] = await client.searchActivities({ destination: paris });
  assert.deepEqual(activity, {
    provider: "viator",
    source: "viator",
    providerProductId: "PARIS-1",
    title: "Paris museum visit",
    destination: { canonicalPlaceId: "paris", label: "Paris", providerDestinationId: "479" },
    provenance: { kind: "live_provider_search", provider: "viator", checkedAt },
  });
  for (const unsupported of ["availability", "livePrice", "instantConfirmation", "cancellation", "operationalStatus", "venueOfficial"]) {
    assert.equal(unsupported in activity, false);
  }
});

test("supports start, defaults to a small page, and rejects invalid or over-50 counts without fetching", async () => {
  const { ViatorAffiliateClient, ViatorAffiliateError, VIATOR_DEFAULT_PAGE_COUNT } = await loadViatorModule();
  const bodies: Array<{ pagination: { start: number; count: number } }> = [];
  const client = new ViatorAffiliateClient(configuration, { request: async (_url, options) => {
    bodies.push(JSON.parse(String(options?.body)));
    return jsonResponse({ products: [] });
  }, cache: new Map(), resolveDestination: resolvedDestination });
  await client.searchActivities({ destination: paris, start: 4 });
  assert.deepEqual(bodies[0].pagination, { start: 4, count: VIATOR_DEFAULT_PAGE_COUNT });
  for (const count of [0, 51, 1.5]) {
    await assert.rejects(client.searchActivities({ destination: paris, count }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "malformed");
  }
  assert.equal(bodies.length, 1, "invalid pages must fail before a provider request");
});

test("cache TTL is below one hour, is capped at one hour, and expires without permanent storage", async () => {
  const { ViatorAffiliateClient, VIATOR_CACHE_TTL_MS, VIATOR_MAX_CACHE_TTL_MS } = await loadViatorModule();
  assert.ok(VIATOR_CACHE_TTL_MS < 60 * 60_000);
  assert.equal(VIATOR_MAX_CACHE_TTL_MS, 60 * 60_000);
  let now = 1_000;
  let requestCount = 0;
  const cache = new Map();
  const client = new ViatorAffiliateClient(configuration, {
    request: async () => { requestCount += 1; return jsonResponse({ products: [product()] }); },
    cache,
    cacheTtlMs: 2 * 60 * 60_000,
    now: () => now,
    resolveDestination: resolvedDestination,
  });
  await client.searchActivities({ destination: paris });
  now += VIATOR_MAX_CACHE_TTL_MS - 1;
  await client.searchActivities({ destination: paris });
  assert.equal(requestCount, 1);
  now += 1;
  await client.searchActivities({ destination: paris });
  assert.equal(requestCount, 2);
  assert.equal(cache.size, 1);
});

test("cache keys separate canonical destination, locale, currency, start, and count", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  let requestCount = 0;
  const client = new ViatorAffiliateClient(configuration, {
    request: async () => { requestCount += 1; return jsonResponse({ products: [] }); },
    cache: new Map(),
    resolveDestination: (destination) => ({ ...destination, providerDestinationId: destination.canonicalPlaceId === "paris" ? "479" : "576" }),
  });
  await client.searchActivities({ destination: paris, locale: "en-US", currency: "USD", start: 1, count: 3 });
  await client.searchActivities({ destination: paris, locale: "en-US", currency: "USD", start: 1, count: 3 });
  await client.searchActivities({ destination: paris, locale: "es-ES", currency: "USD", start: 1, count: 3 });
  await client.searchActivities({ destination: paris, locale: "en-US", currency: "EUR", start: 1, count: 3 });
  await client.searchActivities({ destination: paris, locale: "en-US", currency: "USD", start: 4, count: 3 });
  await client.searchActivities({ destination: paris, locale: "en-US", currency: "USD", start: 1, count: 4 });
  await client.searchActivities({ destination: { canonicalPlaceId: "rome", name: "Rome" }, locale: "en-US", currency: "USD", start: 1, count: 3 });
  assert.equal(requestCount, 6);
});

test("returns an empty list for an authenticated empty response", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  const client = new ViatorAffiliateClient(configuration, { request: async () => jsonResponse({ products: [] }), cache: new Map(), resolveDestination: resolvedDestination });
  assert.deepEqual(await client.searchActivities({ destination: paris }), []);
});

test("classifies 401, 403, 429, and other provider status failures without leaking bodies", async () => {
  const { ViatorAffiliateClient, ViatorAffiliateError } = await loadViatorModule();
  for (const [status, category] of [[401, "authentication"], [403, "authentication"], [429, "rate_limited"], [500, "unavailable"]] as const) {
    const client = new ViatorAffiliateClient(configuration, { request: async () => new Response(`provider says ${apiKey}`, { status }), cache: new Map(), resolveDestination: resolvedDestination });
    await assert.rejects(client.searchActivities({ destination: paris }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === category && error.status === status && !error.message.includes(apiKey));
  }
});

test("classifies timeout, network, invalid JSON, and malformed provider shapes safely", async () => {
  const { ViatorAffiliateClient, ViatorAffiliateError, normalizeViatorProducts } = await loadViatorModule();
  const timeout = new ViatorAffiliateClient(configuration, { request: async () => new Promise<Response>(() => undefined), cache: new Map(), timeoutMs: 5, resolveDestination: resolvedDestination });
  await assert.rejects(timeout.searchActivities({ destination: paris }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "timeout");
  const network = new ViatorAffiliateClient(configuration, { request: async () => { throw new Error(`network ${apiKey}`); }, cache: new Map(), resolveDestination: resolvedDestination });
  await assert.rejects(network.searchActivities({ destination: paris }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "unavailable" && !error.message.includes(apiKey));
  const invalidJson = new ViatorAffiliateClient(configuration, { request: async () => new Response("{", { status: 200 }), cache: new Map(), resolveDestination: resolvedDestination });
  await assert.rejects(invalidJson.searchActivities({ destination: paris }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "malformed");
  assert.throws(() => normalizeViatorProducts({ unexpected: [] }, { ...paris, providerDestinationId: "479" }, checkedAt), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "malformed");
});

test("default resolution fetches the documented taxonomy once and caches only a supported canonical mapping", async () => {
  const { ViatorAffiliateClient, viatorTaxonomyCachePolicy } = await loadViatorModule();
  const taxonomyCache = new Map();
  const destinationResolutionCache = new Map();
  let taxonomyRequests = 0;
  let productRequests = 0;
  const client = new ViatorAffiliateClient(configuration, {
    request: async (url, options) => {
      if (String(url).endsWith("/destinations")) {
        taxonomyRequests += 1;
        assert.equal(options?.method, "GET");
        assert.equal(new Headers(options?.headers).get("exp-api-key"), apiKey);
        return jsonResponse({ destinations: [
          { destinationId: 2, name: "Asia", type: "REGION", parentDestinationId: 0, lookupId: "2" },
          { destinationId: 16, name: "Japan", type: "COUNTRY", parentDestinationId: 2, lookupId: "2.16" },
          { destinationId: 334, name: "Tokyo", type: "CITY", parentDestinationId: 16, lookupId: "2.16.334", center: { latitude: 35.6895, longitude: 139.6917 } },
        ] });
      }
      productRequests += 1;
      return jsonResponse({ products: [product({ title: "Tokyo food walk", destinations: [{ ref: "334", primary: true }] })] });
    },
    cache: new Map(), taxonomyCache, destinationResolutionCache,
  });
  const tokyo = { canonicalPlaceId: "tokyo", name: "Tokyo", country: "Japan", placeType: "city", coordinates: { latitude: 35.6762, longitude: 139.6503 } };
  await Promise.all([
    client.searchActivities({ destination: tokyo, currency: "USD" }),
    client.searchActivities({ destination: tokyo, currency: "JPY" }),
  ]);
  assert.equal(taxonomyRequests, 1);
  assert.equal(productRequests, 2);
  assert.equal(taxonomyCache.size, 1);
  assert.equal(destinationResolutionCache.size, 1);
  assert.equal(viatorTaxonomyCachePolicy.policy, "refresh weekly");
  assert.equal(viatorTaxonomyCachePolicy.refreshIntervalMs, 7 * 24 * 60 * 60_000);
});

test("taxonomy errors and ambiguous destinations are not cached as provider truth", async () => {
  const { ViatorAffiliateClient, ViatorAffiliateError } = await loadViatorModule();
  const destinationResolutionCache = new Map();
  let requests = 0;
  const client = new ViatorAffiliateClient(configuration, {
    request: async () => {
      requests += 1;
      return requests === 1 ? jsonResponse({ destinations: "malformed" }) : jsonResponse({ destinations: [
        { destinationId: 8, name: "Americas", type: "REGION", parentDestinationId: 0, lookupId: "8" },
        { destinationId: 77, name: "United States", type: "COUNTRY", parentDestinationId: 8, lookupId: "8.77" },
        { destinationId: 930, name: "Springfield", type: "CITY", parentDestinationId: 77, lookupId: "8.77.930" },
        { destinationId: 931, name: "Springfield", type: "CITY", parentDestinationId: 77, lookupId: "8.77.931" },
      ] });
    },
    cache: new Map(), taxonomyCache: new Map(), destinationResolutionCache,
  });
  const springfield = { canonicalPlaceId: "springfield", name: "Springfield", country: "United States", placeType: "city" };
  await assert.rejects(client.searchActivities({ destination: springfield }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "malformed");
  await assert.rejects(client.searchActivities({ destination: springfield }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "configuration");
  assert.equal(requests, 2, "the malformed taxonomy is retried, while ambiguity never triggers product search");
  assert.equal(destinationResolutionCache.size, 0);
});

test("the provider boundary has no database ingestion, trip payload, analytics, or secret-leakage path", () => {
  const source = readFileSync("lib/easyt/viator-affiliate.server.ts", "utf8");
  const route = readFileSync("app/api/internal/viator-sandbox/route.ts", "utf8");
  const env = readFileSync(".env.example", "utf8");
  assert.match(source, /import "server-only"/);
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*VIATOR|console\.|rawPrompt|raw_prompt|traveller|bookingReference|fullTrip|tripJson|profile/);
  assert.doesNotMatch(`${source}\n${route}`, /repository|DATABASE_URL|INSERT INTO|UPDATE .* SET|upsert|affiliate_click|trackEvent/);
  assert.doesNotMatch(env, /NEXT_PUBLIC_VIATOR_API_KEY/);
  assert.match(route, /accepts no traveller or trip content/);
  assert.match(route, /process\.env\.NODE_ENV !== "development"/);
});

test("the generic approved Viator fallback remains unchanged and separate from live product URLs", () => {
  const booking = readFileSync("lib/easyt/booking-readiness.ts", "utf8");
  assert.match(booking, /activitiesUrl: "https:\/\/vi\.me\/IiuWB"/);
  assert.match(booking, /if \(viatorAction\) return viatorAction/);
  assert.match(booking, /const fallback = getBookingAction\(\{ category: "activities" \}, tripCom\)/);
});
