import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

async function diagnosticsApi() {
  const api = await import(new URL("../lib/easyt/map-runtime-diagnostics.ts", import.meta.url).href).catch(error => {
    if (error.code === "ERR_MODULE_NOT_FOUND" && error.url?.endsWith("/map-runtime-diagnostics.ts")) return {};
    throw error;
  });
  assert.equal(typeof api.createMorroviaMapDiagnostics, "function", "bounded map diagnostic capture must exist");
  return api;
}

const commit = "a".repeat(40);
const local = { origin: "http://localhost:3000", search: "?morroviaMapDiagnostics=1", nodeEnv: "development", buildCommit: "" };
const snapshot = {
  status: "loading", zoom: 14.123456, styleLoaded: false,
  detailedSourcePresent: true, detailedSourceLoaded: false,
  visibleDetailedLayerCount: 3, reason: null,
};

test("diagnostics require explicit local development or exact HTTPS staging revision opt-in", async () => {
  const { mapDiagnosticsEnabled } = await diagnosticsApi();
  assert.equal(mapDiagnosticsEnabled(local), true);
  for (const change of [{ search: "" }, { nodeEnv: "production" }, { origin: "https://morrovia.com" }, { origin: "http://localhost.attacker.invalid" }]) assert.equal(mapDiagnosticsEnabled({ ...local, ...change }), false);
  const staging = { ...local, origin: "https://staging.morrovia.com", nodeEnv: "production", buildCommit: commit, search: "?morroviaMapDiagnostics=" + commit };
  assert.equal(mapDiagnosticsEnabled(staging), true);
  for (const change of [{ search: "?morroviaMapDiagnostics=1" }, { buildCommit: "b".repeat(40) }, { origin: "http://staging.morrovia.com" }, { origin: "https://staging.morrovia.com:444" }, { buildCommit: "" }]) assert.equal(mapDiagnosticsEnabled({ ...staging, ...change }), false);
});

test("capture uses a closed schema and repeated readiness snapshots do not grow with elapsed time", async () => {
  const { createMorroviaMapDiagnostics, readMorroviaMapDiagnostics } = await diagnosticsApi();
  let now = 0;
  const capture = createMorroviaMapDiagnostics({ ...local, now: () => now });
  const hostile = { ...snapshot, reason: "private-city https://private.invalid/token", coordinates: [1, 2], tripId: "private-trip" };
  capture.trace("initial", hostile);
  const initial = readMorroviaMapDiagnostics().length;
  for (let i = 0; i < 300; i++) { now++; capture.trace("initial", hostile); }
  assert.equal(readMorroviaMapDiagnostics().length, initial);
  capture.trace("private-event", hostile);
  capture.error("map-error", { error: { name: "TypeError", message: "private-message", stack: "private-stack", url: "https://private.invalid/token" } });
  const rows = readMorroviaMapDiagnostics(), row = rows.at(-1);
  assert.equal(row.errorClass, "type");
  assert.deepEqual(Object.keys(rows.at(-2)).sort(), ["detailedSourceLoaded", "detailedSourcePresent", "elapsedMs", "event", "reason", "status", "styleLoaded", "visibleDetailedLayers"].sort());
  assert.doesNotMatch(JSON.stringify(rows), /private|14\.123456|coordinates|tripId|stack|token|https:/);
  rows[0].event = "mutated";
  assert.notEqual(readMorroviaMapDiagnostics()[0].event, "mutated");
  capture.dispose();
});

test("the single tab buffer obeys both entry and UTF-8 byte caps across owners", async () => {
  const { createMorroviaMapDiagnostics, readMorroviaMapDiagnostics } = await diagnosticsApi();
  let now = 0;
  const first = createMorroviaMapDiagnostics({ ...local, now: () => now });
  const second = createMorroviaMapDiagnostics({ ...local, now: () => now });
  for (let i = 0; i < 1_000; i++) {
    now++;
    (i % 2 ? first : second).trace(i % 2 ? "fallback-requested" : "retry-requested", { ...snapshot, reason: "The detailed basemap source or layers disappeared after zooming in." });
  }
  const rows = readMorroviaMapDiagnostics();
  assert.equal(rows.length, 64, "alternating readiness snapshots fill but cannot exceed the tab entry cap");
  assert.ok(Buffer.byteLength(JSON.stringify(rows), "utf8") <= 16 * 1024);
  assert.equal(rows.at(-1).elapsedMs, 1_000);
  assert.ok(rows[0].elapsedMs > 0, "oldest evidence is discarded when the cap is reached");
  first.dispose();
  const length = readMorroviaMapDiagnostics().length;
  first.trace("initial", snapshot);
  assert.equal(readMorroviaMapDiagnostics().length, length);
  second.trace("detailed-style.ready", { ...snapshot, detailedSourceLoaded: true });
  assert.equal(readMorroviaMapDiagnostics().at(-1).event, "detailed-style.ready");
  second.dispose();
});

test("context and error listeners record only fixed classes and are removed on disposal", async () => {
  const { createMorroviaMapDiagnostics, readMorroviaMapDiagnostics } = await diagnosticsApi();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const map = {
    on(type: string, listener: (event: unknown) => void) { const entries = listeners.get(type) ?? new Set(); entries.add(listener); listeners.set(type, entries); },
    off(type: string, listener: (event: unknown) => void) { listeners.get(type)?.delete(listener); },
  };
  const capture = createMorroviaMapDiagnostics(local);
  let snapshotReads = 0;
  capture.observe(map, () => { snapshotReads++; return snapshot; });
  assert.deepEqual([...listeners.keys()].sort(), ["error", "webglcontextlost", "webglcontextrestored"]);
  const queued = [...listeners.values()].flatMap(entries => [...entries]);
  for (const callback of listeners.get("webglcontextlost")!) callback({ statusMessage: "private-driver-message" });
  assert.equal(readMorroviaMapDiagnostics().at(-1).event, "webglcontextlost");
  for (const callback of listeners.get("webglcontextrestored")!) callback({});
  assert.equal(readMorroviaMapDiagnostics().at(-1).event, "webglcontextrestored");
  for (const callback of listeners.get("error")!) callback({ error: { name: "SecurityError", message: "private-worker-url" } });
  assert.equal(readMorroviaMapDiagnostics().at(-1).errorClass, "security");
  assert.doesNotMatch(JSON.stringify(readMorroviaMapDiagnostics()), /private/);
  capture.dispose();
  const readsAfterDisposal = snapshotReads;
  const after = JSON.stringify(readMorroviaMapDiagnostics());
  for (const callback of queued) callback({ error: { name: "SyntaxError" } });
  assert.equal(snapshotReads, readsAfterDisposal, "disposed callbacks cannot inspect a removed map");
  assert.equal(JSON.stringify(readMorroviaMapDiagnostics()), after);
  for (const entries of listeners.values()) assert.equal(entries.size, 0);
});

test("disabled capture installs no listeners and cannot write to the tab buffer", async () => {
  const { createMorroviaMapDiagnostics, readMorroviaMapDiagnostics } = await diagnosticsApi();
  const before = JSON.stringify(readMorroviaMapDiagnostics());
  const capture = createMorroviaMapDiagnostics({ ...local, search: "" });
  capture.observe({ on() { assert.fail("off by default"); }, off() {} }, () => snapshot);
  capture.trace("initial", snapshot);
  capture.error("initialization-error", new Error("private"));
  let errorReads = 0;
  capture.error("map-error", { get error() { errorReads++; return {}; } });
  assert.equal(errorReads, 0, "disabled diagnostics cannot inspect error values");
  capture.dispose();
  assert.equal(JSON.stringify(readMorroviaMapDiagnostics()), before);
});

test("diagnostic getter failures cannot interfere with map lifecycle and no raw reasons escape", async () => {
  const { createMorroviaMapDiagnostics, readMorroviaMapDiagnostics } = await diagnosticsApi();
  const capture = createMorroviaMapDiagnostics(local);
  const hostile = { get name() { throw new Error("private"); }, get error() { throw new Error("private"); } };
  assert.doesNotThrow(() => capture.error("map-error", hostile));
  assert.equal(readMorroviaMapDiagnostics().at(-1).errorClass, "unknown");
  assert.doesNotThrow(() => capture.trace("initial", { get status() { throw new Error("private"); } }));
  capture.dispose();
});

test("the map owner connects trace and diagnostic disposal without changing worker construction", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  assert.match(source, /onTrace:\s*mapDiagnostics\.trace/);
  assert.match(source, /mapDiagnostics\.observe\(map/);
  assert.match(source, /mapDiagnostics\.dispose\(\)/);
  assert.doesNotMatch(source, /setWorkerClass|workerFactory\s*=/);
});
