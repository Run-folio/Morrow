import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { build } from "esbuild";
import { createPrivacyConsentRecord } from "../lib/privacy-consent.ts";

type Settings = { node?: string; environment?: string; enabled?: string; origin?: string; configuredOrigin?: string; key?: string; host?: string };
const current = (analytics = true) => JSON.stringify(createPrivacyConsentRecord({ analytics, affiliateTracking: false }));
const bundles = new Map<string, Promise<string>>();
async function fixture(settings: Settings = {}, consent: string | null = current()) {
  const env = { NODE_ENV: settings.node ?? "production", NEXT_PUBLIC_ANALYTICS_ENVIRONMENT: settings.environment ?? "production", NEXT_PUBLIC_POSTHOG_REPLAY_ENABLED: settings.enabled ?? "true", NEXT_PUBLIC_POSTHOG_REPLAY_ORIGIN: settings.configuredOrigin ?? "https://morrovia.com", NEXT_PUBLIC_POSTHOG_KEY: settings.key ?? "phc_synthetic_only", NEXT_PUBLIC_POSTHOG_HOST: settings.host ?? "https://posthog.invalid", NEXT_PUBLIC_GA_MEASUREMENT_ID: "" };
  const cacheKey = JSON.stringify(env);
  if (!bundles.has(cacheKey)) bundles.set(cacheKey, build({
    stdin: { contents: 'export * from "./lib/analytics.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, write: false, platform: "browser", format: "iife", globalName: "analytics",
    define: Object.fromEntries(Object.entries(env).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
    plugins: [{ name: "synthetic-sdk-only", setup(builder) {
      builder.onResolve({ filter: /^posthog-js$/ }, () => ({ path: "posthog-js", namespace: "mock" }));
      builder.onLoad({ filter: /.*/, namespace: "mock" }, () => ({ contents: "export default globalThis.__sdk;" }));
    } }],
  }).then((result) => result.outputFiles[0].text));
  const calls: { method: string; args: any[] }[] = [];
  const sdk = Object.fromEntries(["init", "opt_in_capturing", "opt_out_capturing", "reset", "identify", "capture", "startSessionRecording", "stopSessionRecording"].map((method) => [method, (...args: any[]) => calls.push({ method, args })]));
  const storage = new Map<string, string>(consent === null ? [] : [["easyt-analytics-consent", consent]]);
  storage.set("easyt-home-trip-draft", "synthetic-private-draft");
  const localStorage = { getItem: (key: string) => storage.get(key) ?? null, removeItem: (key: string) => storage.delete(key), key: (index: number) => [...storage.keys()][index] ?? null, get length() { return storage.size; } };
  const origin = settings.origin ?? "https://morrovia.com";
  const context = vm.createContext({ __sdk: sdk, URL, document: { cookie: "" }, window: { localStorage, sessionStorage: { ...localStorage, length: 0 }, location: { origin, pathname: "/journey/private-trip/itinerary" } } });
  vm.runInContext(await bundles.get(cacheKey)!, context);
  const api = context.analytics as Record<string, (...args: any[]) => any>;
  return { api, calls, storage, sdk, window: context.window, config: () => calls.find((call) => call.method === "init")?.args[1], count: (method: string) => calls.filter((call) => call.method === method).length };
}

test("replay requires an explicit production rollout and exact approved HTTPS origin", async () => {
  for (const settings of [
    { enabled: "" }, { enabled: "false" }, { enabled: "1" }, { node: "development" },
    { environment: "" }, { environment: "preview" }, { environment: "development" },
    { configuredOrigin: "" }, { origin: "http://localhost:3000", configuredOrigin: "http://localhost:3000" },
    { origin: "https://staging.morrovia.com", configuredOrigin: "https://staging.morrovia.com" },
    { origin: "https://branch.netlify.app", configuredOrigin: "https://branch.netlify.app" },
    { origin: "https://morrovia.com.evil.invalid", configuredOrigin: "https://morrovia.com.evil.invalid" },
    { origin: "https://www.morrovia.com" }, { configuredOrigin: "https://morrovia.com/path" },
    { configuredOrigin: "https://morrovia.com?token=private" }, { key: "" }, { host: "" },
  ]) {
    const f = await fixture(settings); f.api.initializeAnalytics();
    assert.equal(f.count("startSessionRecording"), 0, JSON.stringify(settings));
    if (f.config()) assert.equal(f.config().advanced_disable_flags, true);
  }
  const f = await fixture(); f.api.initializeAnalytics();
  assert.equal(f.count("startSessionRecording"), 1);
  assert.equal(f.config().disable_session_recording, true, "no automatic or pre-consent start");
  assert.equal(f.config().advanced_disable_flags, false);
  assert.equal(f.config().advanced_disable_feature_flags, true);
  assert.deepEqual(f.calls.find((call) => call.method === "startSessionRecording")!.args, [], "project sampling/triggers are never overridden");
});

test("missing, rejected, malformed, obsolete and legacy consent never initialize or start replay", async () => {
  for (const consent of [null, current(false), "granted", "declined", "not-json", JSON.stringify({ analytics: true }), current().replace("2026-08-30.1", "obsolete")]) {
    const f = await fixture({}, consent); f.api.initializeAnalytics(); f.api.updateAnalyticsConsent("granted");
    assert.equal(f.count("init"), 0); assert.equal(f.count("startSessionRecording"), 0);
  }
});

test("current grant starts once across repeat initialization and consent notifications", async () => {
  const f = await fixture({}, null); f.api.initializeAnalytics();
  f.storage.set("easyt-analytics-consent", current()); f.api.updateAnalyticsConsent("granted");
  f.api.initializeAnalytics(); f.api.initializeAnalytics(); f.api.updateAnalyticsConsent("granted");
  assert.equal(f.count("init"), 1); assert.equal(f.count("startSessionRecording"), 1);
  assert.ok(f.calls.findIndex((call) => call.method === "opt_in_capturing") < f.calls.findIndex((call) => call.method === "startSessionRecording"));
  const reload = await fixture({}, current()); reload.api.initializeAnalytics();
  assert.equal(reload.count("startSessionRecording"), 1);
});

test("withdrawal stops replay before reset and prevents later events until a fresh grant", async () => {
  const f = await fixture(); f.api.initializeAnalytics();
  f.storage.set("easyt-analytics-consent", current(false)); f.api.updateAnalyticsConsent("declined");
  assert.equal(f.count("stopSessionRecording"), 1);
  assert.ok(f.calls.findIndex((call) => call.method === "stopSessionRecording") < f.calls.findIndex((call) => call.method === "reset"));
  f.api.pageView(); f.api.trackEvent("trip_edit_started", { source: "dashboard" });
  assert.equal(f.count("capture"), 0); assert.equal(f.count("startSessionRecording"), 1);
  assert.equal(f.storage.get("easyt-home-trip-draft"), "synthetic-private-draft");
  f.storage.set("easyt-analytics-consent", current()); f.api.updateAnalyticsConsent("granted");
  assert.equal(f.count("init"), 1); assert.equal(f.count("startSessionRecording"), 2);
});

test("strict replay masking covers text, inputs, attributes and disables extra capture", async () => {
  const f = await fixture(); f.api.initializeAnalytics(); const config = f.config();
  assert.equal(config.enable_recording_console_log, false);
  assert.equal(config.capture_performance, false);
  assert.equal(config.session_recording.maskAllInputs, true);
  assert.equal(config.session_recording.maskTextSelector, "*");
  assert.equal(config.session_recording.maskAllElementAttributes, true);
  assert.equal(config.session_recording.captureCanvas.recordCanvas, false);
  assert.equal(config.session_recording.recordCrossOriginIframes, false);
  assert.ok(config.session_recording.blockSelector.includes("img"));
  assert.ok(config.session_recording.blockSelector.includes("script"));
  assert.equal(config.session_recording.slimDOMOptions, "all");
  assert.equal(config.session_recording.recordHeaders, false);
  assert.equal(config.session_recording.recordBody, false);
  assert.equal(config.session_recording.maskNetworkRequestFn({ url: "https://morrovia.com/api/private?token=secret", body: "private" }), null);
});

test("throwing analytics vendors or identity reset cannot prevent recorder withdrawal and opt-out", async () => {
  for (const vendor of ["gtag", "clarity", "reset"]) {
    const f = await fixture(); f.api.initializeAnalytics();
    if (vendor === "reset") f.sdk.reset = () => { throw new Error("Synthetic reset failure"); };
    else (f.window as Record<string, any>)[vendor] = () => { throw new Error("Synthetic vendor failure"); };
    f.storage.set("easyt-analytics-consent", current(false));
    assert.doesNotThrow(() => f.api.updateAnalyticsConsent("declined"));
    assert.equal(f.count("stopSessionRecording"), 1, vendor);
    assert.equal(f.count("opt_out_capturing"), 1, vendor);
  }
});

test("replay vendor failure cannot block existing consented product analytics", async () => {
  const f = await fixture(); f.sdk.startSessionRecording = () => { throw new Error("Synthetic recorder failure"); };
  assert.doesNotThrow(() => f.api.initializeAnalytics());
  f.api.trackEvent("trip_edit_started", { source: "dashboard" });
  assert.equal(f.count("capture"), 1);
  const event = f.calls.find((call) => call.method === "capture")!;
  assert.equal(event.args[1].page_path, "/journey/[tripId]/itinerary");
  assert.equal(event.args[1].environment, "production");
});

test("event sanitization also strips replay-generated session entry URLs and referrers", async () => {
  const f = await fixture(); f.api.initializeAnalytics();
  const event = f.config().before_send({ event: "$pageview", properties: { title: "PRIVATE_DOCUMENT_TITLE", $title: "PRIVATE_TITLE", $page_title: "PRIVATE_PAGE_TITLE", $session_entry_url: "https://morrovia.com/journey/PRIVATE_TRIP/itinerary?token=PRIVATE_QUERY#PRIVATE_HASH", $session_entry_pathname: "/journey/PRIVATE_TRIP/itinerary", $session_entry_referrer: "https://private.invalid/PRIVATE_REFERENCE?secret=PRIVATE_REFERRER" } });
  assert.equal(event.properties.$session_entry_url, "https://morrovia.com/journey/[tripId]/itinerary");
  assert.equal(event.properties.$session_entry_pathname, "/journey/[tripId]/itinerary");
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE_/);
});

test("replay send boundary drops CSSOM, plugin, unknown and compressed payloads", async () => {
  const f = await fixture(); f.api.initializeAnalytics();
  const sanitize = f.config().before_send;
  const event = sanitize({ event: "$snapshot", properties: { $snapshot_data: [
    { type: 2, timestamp: 1, data: { node: { type: 0, childNodes: [] }, initialOffset: { top: 0, left: 0 } } },
    { type: 3, timestamp: 2, data: { source: 2, id: 1, type: 0, x: 4, y: 5 } },
    { type: 3, timestamp: 3, data: { source: 8, rules: ["PRIVATE_CSS"] } },
    { type: 3, timestamp: 4, data: { source: 13, set: { color: "PRIVATE_STYLE" } } },
    { type: 6, timestamp: 5, data: { plugin: "console", payload: "PRIVATE_CONSOLE" } },
    { type: 5, timestamp: 6, data: { tag: "network", payload: "PRIVATE_NETWORK" } },
    { type: 99, timestamp: 7, data: { unknown: "PRIVATE_UNKNOWN" } },
  ] } });
  assert.equal(event.properties.$snapshot_data.length, 2);
  assert.doesNotMatch(JSON.stringify(event), /PRIVATE_/);
  assert.equal(sanitize({ event: "$snapshot", properties: { $snapshot_data: "compressed-unknown" } }), null);
  f.storage.set("easyt-analytics-consent", current(false));
  assert.equal(sanitize({ event: "$snapshot", properties: { $snapshot_data: [] } }), null);
});

test("default-off rollout preserves event dispatch and disables all remote config", async () => {
  const f = await fixture({ enabled: "" }); f.api.initializeAnalytics();
  f.api.trackEvent("trip_edit_started", { source: "dashboard" });
  assert.equal(f.count("init"), 1); assert.equal(f.count("capture"), 1);
  assert.equal(f.config().advanced_disable_flags, true); assert.equal(f.count("startSessionRecording"), 0);
});

test("privacy proposal describes optional masked replay in English and Spanish without activation claims", () => {
  const privacy = readFileSync("app/journey/privacy/privacy-notice.tsx", "utf8");
  const copy = readFileSync("lib/analytics-replay-copy.ts", "utf8");
  assert.match(privacy, /sessionReplayPrivacyCopy.en/);
  assert.match(privacy, /sessionReplayPrivacyCopy.es/);
  assert.match(copy, /Session replay is off by default/);
  assert.match(copy, /La grabación de sesión está desactivada por defecto/);
  const cookies = readFileSync("app/journey/cookies/page.tsx", "utf8");
  assert.match(cookies, /<SessionReplayNotice \/>/);
  assert.match(readFileSync("components/session-replay-notice.tsx", "utf8"), /sessionReplayPrivacyCopy\[language\]/);
});
