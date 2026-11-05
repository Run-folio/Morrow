import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

// Execute the actual route with NextResponse itself. Only session and repository
// boundaries are replaced; no server, database, real token or account is used.
const nextServer = createRequire(import.meta.url)("next/server");
const source = readFileSync(new URL("../app/api/easyt/gifts/[token]/route.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const preview = {
  tripTitle: "Synthetic trip", senderName: "Synthetic sender", note: "Shared invitation note",
  status: "pending", expiresAt: "2026-12-01T00:00:00.000Z",
  recipientEmail: "private-recipient@example.test", senderEmail: "private-sender@example.test",
  ownerId: "private-owner", document: { bookings: ["private-booking"] },
  tokenHash: "private-token-hash", futurePrivateField: "private-future-field",
};
const context = () => ({ params: Promise.resolve({ token: "synthetic-token" }) });
const request = (method = "GET") => new Request("https://morrovia.test/api/easyt/gifts/synthetic-token", { method });
const owner = { id: "synthetic-owner", email: "invited@example.test" };
const publicPreview = (status = "pending", note: string | null = preview.note) => ({
  tripTitle: preview.tripTitle, senderName: preview.senderName, note, status, expiresAt: preview.expiresAt,
});

function giftRoute({ gift = preview as unknown, previewError = false, authenticated = false, claim = { trip: { id: "synthetic-copy" } } as unknown, claimError = "" } = {}) {
  const calls: { previewTokens: string[]; ownerReads: number; claims: unknown[][] } = { previewTokens: [], ownerReads: 0, claims: [] };
  type Handler = (request: Request, routeContext: ReturnType<typeof context>) => Promise<Response>;
  const exports: Partial<Record<"GET" | "POST", Handler>> = {};
  runInNewContext(compiled, {
    exports, Error,
    require(name: string) {
      if (name === "next/server") return nextServer;
      if (name === "@/lib/easyt/owner") return { requireEasyTOwner: async () => {
        calls.ownerReads++;
        if (!authenticated) throw new Error("Unauthorized");
        return owner;
      } };
      if (name === "@/lib/easyt/repository") return {
        getTripGiftPreview: async (token: string) => {
          calls.previewTokens.push(token);
          if (previewError) throw new Error("private database details");
          return gift;
        },
        claimTripGift: async (...args: unknown[]) => {
          calls.claims.push(args);
          if (claimError) throw new Error(claimError);
          return claim;
        },
      };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  assert.equal(typeof exports.GET, "function");
  assert.equal(typeof exports.POST, "function");
  assert.ok(exports.GET && exports.POST);
  return { GET: exports.GET, POST: exports.POST, calls };
}

for (const status of ["pending", "claimed", "revoked", "expired"]) test(`public ${status} gift preview serializes only the five permitted fields`, async () => {
  const route = giftRoute({ gift: { ...preview, status } });
  const response = await route.GET(request(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { gift: publicPreview(status) });
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(route.calls.previewTokens, ["synthetic-token"]);
  assert.equal(route.calls.ownerReads, 0, "limited preview remains public; claiming owns authentication");
  assert.deepEqual(route.calls.claims, []);
});

test("preview preserves a null shared note without consulting private properties or repository serialization", async () => {
  const gift = { ...preview, note: null, toJSON: () => ({ recipientEmail: preview.recipientEmail }) };
  Object.defineProperty(gift, "futurePrivateField", { enumerable: true, get() { throw new Error("private getter must not run"); } });
  const response = await giftRoute({ gift }).GET(request(), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { gift: publicPreview("pending", null) });
});

for (const [name, options, status, message] of [
  ["missing", { gift: null }, 404, "Invitation not found."],
  ["unavailable", { previewError: true }, 503, "Unable to load invitation."],
] as const) test(`${name} preview is non-cacheable and returns only the generic error`, async () => {
  const response = await giftRoute(options).GET(request(), context());
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: message });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("unauthenticated claim rejects before reading or mutating a gift", async () => {
  const route = giftRoute();
  const response = await route.POST(request("POST"), context());
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(route.calls.ownerReads, 1);
  assert.deepEqual(route.calls.previewTokens, []);
  assert.deepEqual(route.calls.claims, []);
});

test("authenticated claim passes the exact token and owner to the existing claim boundary", async () => {
  const route = giftRoute({ authenticated: true });
  const response = await route.POST(request("POST"), context());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { trip: { id: "synthetic-copy" } });
  assert.deepEqual(route.calls.claims, [["synthetic-token", owner]]);
  assert.deepEqual(route.calls.previewTokens, []);
});

test("authenticated missing claim retains the existing 404 contract", async () => {
  const response = await giftRoute({ authenticated: true, claim: null }).POST(request("POST"), context());
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "Invitation not found." });
});

test("recipient rejection remains authoritative at the existing claim boundary", async () => {
  const message = "This invitation was sent to a different email address.";
  const route = giftRoute({ authenticated: true, claimError: message });
  const response = await route.POST(request("POST"), context());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: message });
  assert.deepEqual(route.calls.claims, [["synthetic-token", owner]]);
});
