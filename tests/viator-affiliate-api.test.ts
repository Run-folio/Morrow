import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { transpileModule, ModuleKind, ScriptTarget } from "typescript";

type ViatorModule = typeof import("../lib/easyt/viator-affiliate.server.ts");

let viatorModule: Promise<ViatorModule> | undefined;

function loadViatorModule() {
  viatorModule ??= import(`data:text/javascript;base64,${Buffer.from(transpileModule(
    readFileSync("lib/easyt/viator-affiliate.server.ts", "utf8").replace('import "server-only";\n', ""),
    { compilerOptions: { module: ModuleKind.ESNext, target: ScriptTarget.ESNext } },
  ).outputText).toString("base64")}`) as Promise<ViatorModule>;
  return viatorModule;
}

const apiKey = "test-viator-secret";
const configuration = { environment: "sandbox" as const, apiBaseUrl: "https://api.sandbox.viator.com/partner", apiKey };

test("selects the sandbox credential and never accepts a public Viator key", async () => {
  const { ViatorAffiliateError, resolveViatorApiConfiguration } = await loadViatorModule();
  const resolved = resolveViatorApiConfiguration({ VIATOR_API_ENV: "sandbox", VIATOR_API_KEY_SANDBOX: apiKey });
  assert.deepEqual({ environment: resolved.environment, apiBaseUrl: resolved.apiBaseUrl }, { environment: "sandbox", apiBaseUrl: "https://api.sandbox.viator.com/partner" });
  assert.throws(() => resolveViatorApiConfiguration({ VIATOR_API_ENV: "sandbox" }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "configuration");
  const source = readFileSync("lib/easyt/viator-affiliate.server.ts", "utf8");
  assert.doesNotMatch(source, /NEXT_PUBLIC_.*VIATOR/);
  assert.match(source, /import "server-only"/);
});

test("normalizes only activity card fields from a successful Viator response", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  let requestedUrl = "";
  let capturedKey = "";
  const client = new ViatorAffiliateClient(configuration, async (url, options) => {
    requestedUrl = String(url);
    capturedKey = new Headers(options?.headers).get("exp-api-key") ?? "";
    return new Response(JSON.stringify({ products: [{
      productCode: "PARIS-1",
      title: "Paris museum visit",
      destinations: [{ ref: "479", primary: true }],
      images: [{ isCover: true, variants: [{ width: 200, url: "https://images.example.test/200.jpg" }, { width: 800, url: "https://images.example.test/800.jpg" }] }],
      reviews: { combinedAverageRating: 4.8, totalReviews: 120 },
      durationInMinutes: 90,
      pricing: { summary: { fromPrice: 31.5 }, currency: "EUR" },
      productUrl: "https://www.viator.com/tours/Paris/d479-PARIS-1?medium=api",
      unexpectedProviderField: "must-not-reach-client",
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  });
  const activities = await client.searchActivities({ destinationId: "479", destinationName: "Paris", count: 3 });
  assert.equal(requestedUrl, "https://api.sandbox.viator.com/partner/products/search");
  assert.equal(capturedKey, apiKey);
  assert.deepEqual(activities, [{ id: "PARIS-1", title: "Paris museum visit", destination: { id: "479", name: "Paris" }, image: "https://images.example.test/800.jpg", rating: 4.8, reviewCount: 120, durationMinutes: 90, price: { amount: 31.5, currency: "EUR" }, bookingUrl: "https://www.viator.com/tours/Paris/d479-PARIS-1?medium=api", source: "viator-affiliate-api" }]);
});

test("returns safe categories for provider failures without leaking a credential or provider body", async () => {
  const { ViatorAffiliateClient, ViatorAffiliateError, normalizeViatorProducts } = await loadViatorModule();
  const client = new ViatorAffiliateClient(configuration, async () => new Response("provider says: test-viator-secret", { status: 401 }));
  await assert.rejects(client.searchActivities({ destinationId: "479" }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "authentication" && !error.message.includes(apiKey));
  assert.throws(() => normalizeViatorProducts({ unexpected: [] }, { id: "479" }), (error: unknown) => error instanceof ViatorAffiliateError && error.category === "malformed");
});

test("returns an empty list for an authenticated empty response", async () => {
  const { ViatorAffiliateClient } = await loadViatorModule();
  const client = new ViatorAffiliateClient(configuration, async () => new Response(JSON.stringify({ products: [] }), { status: 200 }));
  assert.deepEqual(await client.searchActivities({ destinationId: "479" }), []);
});
