import assert from "node:assert/strict";
import { build } from "esbuild";
import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import test from "node:test";
import { gunzipSync } from "node:zlib";

const enabled = process.env.MORROVIA_REPLAY_BROWSER_TESTS === "1";
const require = createRequire(import.meta.url);
const bundled = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const { chromium } = require(existsSync(bundled) ? bundled : "playwright");
let bundle: Promise<string>;
function fixtureBundle() {
  return bundle ??= build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import posthog from 'posthog-js'; import * as analytics from './lib/analytics';
      import {Analytics} from './components/analytics'; import {setPrivacyConsentPreferences} from './components/privacy-consent';
      import SessionReplayNotice from './components/session-replay-notice';
      window.fixture={...analytics,sdk:posthog,choose:(analytics)=>setPrivacyConsentPreferences({analytics,affiliateTracking:false})};
      createRoot(document.getElementById('app')).render(React.createElement(React.Fragment,null,React.createElement(Analytics),React.createElement(SessionReplayNotice)));`,
      resolveDir: process.cwd(), loader: "tsx" },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", loader: { ".css": "empty" },
    define: Object.fromEntries(Object.entries({ NODE_ENV: "production", NEXT_PUBLIC_ANALYTICS_ENVIRONMENT: "production", NEXT_PUBLIC_POSTHOG_REPLAY_ENABLED: "true", NEXT_PUBLIC_POSTHOG_REPLAY_ORIGIN: "https://morrovia.com", NEXT_PUBLIC_POSTHOG_KEY: "phc_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", NEXT_PUBLIC_POSTHOG_HOST: "https://posthog.invalid", NEXT_PUBLIC_GA_MEASUREMENT_ID: "" }).map(([key, value]) => [`process.env.${key}`, JSON.stringify(value)])),
    plugins: [{ name: "framework-only-boundaries", setup(builder) {
      builder.onResolve({ filter: /\.css$/ }, (args) => ({ path: args.path, namespace: "style" }));
      builder.onLoad({ filter: /.*/, namespace: "style" }, () => ({ contents: "export default {};" }));
      builder.onResolve({ filter: /^next\/(link|script|navigation)$/ }, (args) => ({ path: args.path, namespace: "framework" }));
      builder.onLoad({ filter: /.*/, namespace: "framework" }, ({ path }) => ({ contents: path.endsWith("navigation") ? 'export const usePathname=()=>location.pathname;' : 'export default function Boundary(){return null;}' }));
    } }],
  }).then((result) => result.outputFiles[0].text);
}

function decodeBody(buffer: Buffer | null) {
  if (!buffer) return "";
  if (buffer[0] === 0x1f && buffer[1] === 0x8b) return gunzipSync(buffer).toString();
  const text = buffer.toString();
  if (text.startsWith("data=")) {
    const data = new URLSearchParams(text).get("data") ?? "";
    try { return Buffer.from(data, "base64").toString(); } catch { return data; }
  }
  return text;
}

function privateMarkerPaths(value: unknown, path = ""): string[] {
  if (typeof value === "string") return /PRIVATE_[A-Z_]+_719/.test(value) ? [path] : [];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => privateMarkerPaths(child, `${path}/${key}`));
}

test("real recorder masks synthetic private DOM and obeys grant, withdrawal, reload and cross-tab rejection", { skip: !enabled, timeout: 60_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const packets: string[] = []; const requests: string[] = [];
  try {
    const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36" });
    const script = await fixtureBundle();
    await context.route("**/*", async (route: any) => {
      const request = route.request(); const url = new URL(request.url());
      requests.push(`${request.method()} ${url.hostname}${url.pathname}`);
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: script });
      if (url.hostname === "posthog.invalid" && url.pathname.includes("/static/") && url.pathname.endsWith(".js")) {
        const filename = url.pathname.split("/").at(-1)!;
        assert.match(filename, /^[a-zA-Z0-9._-]+\.js$/);
        return route.fulfill({ contentType: "text/javascript", body: readFileSync(require.resolve(`posthog-js/dist/${filename}`)), headers });
      }
      if (url.hostname === "posthog.invalid" && url.pathname.endsWith("/config.js")) return route.fulfill({ status: 404, body: "", headers });
      if (url.hostname === "posthog.invalid" && /\/(flags|decide|config)\/?$/.test(url.pathname)) return route.fulfill({ json: { featureFlags: {}, sessionRecording: { enabled: true, endpoint: "/s/", sampleRate: "1", minimumDurationMilliseconds: 0,
        // Local privacy controls must remain strict even if remote settings loosen.
        consoleLogRecordingEnabled: true, recordCanvas: true, networkPayloadCapture: { recordHeaders: true, recordBody: true },
        masking: { maskAllInputs: false, maskTextSelector: "", maskAllElementAttributes: false, blockSelector: "" },
      } }, headers });
      if (url.hostname === "posthog.invalid" && /\/(e|s)\/?$/.test(url.pathname)) {
        packets.push(decodeBody(request.postDataBuffer()));
        return route.fulfill({ json: { status: 1 }, headers });
      }
      if (request.resourceType() === "document" && url.hostname === "morrovia.com") return route.fulfill({ contentType: "text/html", body: `<!doctype html><html><head><title>PRIVATE_TITLE_719</title><script type="application/ld+json">{"name":"PRIVATE_JSONLD_719"}</script></head><body>
        <main><style id="fixture-style">.probe::after{content:"PRIVATE_STYLE_719"}</style><h1 title="PRIVATE_ATTRIBUTE_719" data-trip="PRIVATE_DATA_719">PRIVATE_TRIP_719</h1><p id="PRIVATE_ELEMENT_ID_719" class="PRIVATE_CLASS_719" style="--private-note:PRIVATE_INLINE_STYLE_719;background-image:url(/PRIVATE_BACKGROUND_719)">PRIVATE_NOTE_719</p><input aria-label="PRIVATE_LABEL_719" value="PRIVATE_INPUT_719"><textarea>PRIVATE_TEXTAREA_719</textarea><a href="/journey/PRIVATE_LINK_719?token=PRIVATE_TOKEN_719">PRIVATE_LINK_TEXT_719</a><img src="/PRIVATE_PHOTO_719" alt="PRIVATE_ALT_719"><canvas></canvas><div data-replay-private>PRIVATE_BLOCK_719</div></main><div id="app"></div><script src="/fixture.js"></script></body></html>` });
      // Every request is fulfilled locally. No route.continue(), external sockets or real token.
      return route.fulfill({ status: 200, body: url.pathname.startsWith("/api/") ? "PRIVATE_RESPONSE_719" : "{}", headers });
    });
    const page = await context.newPage();
    page.on("pageerror", (error: Error) => console.log("Synthetic page error:", error.message));
    await page.goto("https://morrovia.com/journey/PRIVATE_ID_719/itinerary?token=PRIVATE_QUERY_719#PRIVATE_HASH_719");
    await page.waitForFunction(() => Boolean((window as any).fixture));
    assert.equal(requests.some((request) => request.includes("posthog.invalid")), false, "fresh visit sends nothing");
    await page.evaluate(() => {
      (window as any).fixture.choose(true);
      // The SDK filters browser automation as bot traffic. This fixture-only
      // override exercises capture while every ingestion request is intercepted.
      // Compression is disabled only so assertions inspect actual packet JSON.
      (window as any).fixture.sdk.set_config({ disable_compression: true, request_batching: false, opt_out_useragent_filter: true });
    });
    await page.waitForFunction(() => (window as any).fixture.sdk.sessionRecordingStarted(), undefined, { timeout: 10_000 }).catch(async (error: Error) => {
      console.log(JSON.stringify({ requests }));
      throw error;
    });
    await page.locator("input").fill("PRIVATE_EDIT_719");
    await page.evaluate(async () => {
      document.querySelector("p")!.textContent = "PRIVATE_MUTATION_719";
      document.querySelector("p")!.style.setProperty("--private-note", "PRIVATE_INLINE_MUTATION_719");
      document.querySelector("h1")!.setAttribute("title", "PRIVATE_CHANGED_ATTRIBUTE_719");
      (document.querySelector("style") as HTMLStyleElement).sheet!.insertRule('.probe{background-image:url("/PRIVATE_CSS_URL_719")}');
      console.log("PRIVATE_CONSOLE_719");
      await fetch("/api/PRIVATE_NETWORK_719?secret=PRIVATE_REQUEST_QUERY_719", { method: "POST", body: "PRIVATE_BODY_719", headers: { "x-private-test": "PRIVATE_HEADER_719" } });
      (window as any).fixture.trackEvent("trip_edit_started", { source: "dashboard" });
    });
    await page.waitForTimeout(11_000);
    assert.equal(await page.evaluate(() => (window as any).fixture.sdk.sessionRecordingStarted()), true);
    await page.evaluate(() => (window as any).fixture.choose(false));
    await page.waitForTimeout(1000);
    const snapshotPackets = packets.filter((packet) => packet.includes("$snapshot"));
    assert.ok(snapshotPackets.length > 0, `real recorder must emit snapshots; requests=${requests.join(", ")}`);
    assert.ok(snapshotPackets.some((packet) => packet.includes("childNodes")), "full DOM snapshot is present, not an empty recorder");
    assert.deepEqual([...new Set(snapshotPackets.join("\n").match(/PRIVATE_[A-Z_]+_719/g) ?? [])], [], "no synthetic private content in recorder payloads");
    assert.deepEqual(packets.flatMap((packet) => privateMarkerPaths(JSON.parse(packet))), [], "SDK event properties do not retain private content either");
    await page.evaluate(() => (window as any).fixture.choose(false));
    assert.equal(await page.evaluate(() => (window as any).fixture.sdk.sessionRecordingStarted()), false);
    await page.reload();
    await page.waitForFunction(() => Boolean((window as any).fixture));
    assert.equal(await page.evaluate(() => (window as any).fixture.sdk.sessionRecordingStarted()), false, "rejected choice remains off after reload");
    await page.evaluate(() => (window as any).fixture.choose(true));
    await page.waitForFunction(() => (window as any).fixture.sdk.sessionRecordingStarted());
    const otherTab = await context.newPage();
    await otherTab.goto("https://morrovia.com/journey/dashboard");
    await otherTab.waitForFunction(() => Boolean((window as any).fixture));
    await otherTab.evaluate(() => (window as any).fixture.choose(false));
    await page.waitForFunction(() => !(window as any).fixture.sdk.sessionRecordingStarted());
    await otherTab.evaluate(() => (window as any).fixture.choose(true));
    await page.waitForFunction(() => (window as any).fixture.sdk.sessionRecordingStarted());
    await page.evaluate(() => (window as any).fixture.choose(false));
    await page.evaluate(() => { window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: "es" })); });
    await page.getByText(/La grabación de sesión está desactivada por defecto/).waitFor();
    console.log(JSON.stringify({ syntheticOnly: true, externalRequestsContinued: 0, snapshotPackets: snapshotPackets.length, requests: requests.length }));
  } finally { await browser.close(); }
});

test("a delayed remote configuration cannot start replay after consent withdrawal", { skip: !enabled, timeout: 25_000 }, async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  let releaseConfig = () => {};
  let configSeen = () => {};
  const held = new Promise<void>((resolve) => { releaseConfig = resolve; });
  const seen = new Promise<void>((resolve) => { configSeen = resolve; });
  const requests: string[] = [];
  try {
    const context = await browser.newContext();
    const script = await fixtureBundle();
    await context.route("**/*", async (route: any) => {
      const request = route.request(); const url = new URL(request.url());
      requests.push(url.pathname);
      const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "*" };
      if (url.pathname === "/fixture.js") return route.fulfill({ contentType: "text/javascript", body: script });
      if (url.pathname.endsWith("/config.js")) return route.fulfill({ status: 404, body: "", headers });
      if (url.pathname.endsWith("/config")) {
        configSeen(); await held;
        return route.fulfill({ json: { sessionRecording: { enabled: true, endpoint: "/s/", sampleRate: "1" } }, headers });
      }
      if (url.hostname === "posthog.invalid" && url.pathname.endsWith(".js")) return route.fulfill({ contentType: "text/javascript", body: readFileSync(require.resolve(`posthog-js/dist/${url.pathname.split("/").at(-1)}`)), headers });
      if (request.resourceType() === "document") return route.fulfill({ contentType: "text/html", body: '<!doctype html><div id="app"></div><script src="/fixture.js"></script>' });
      return route.fulfill({ json: { status: 1 }, headers });
    });
    const page = await context.newPage();
    await page.goto("https://morrovia.com/journey/dashboard");
    await page.waitForFunction(() => Boolean((window as any).fixture));
    await page.evaluate(() => (window as any).fixture.choose(true));
    await seen;
    await page.evaluate(() => (window as any).fixture.choose(false));
    releaseConfig();
    await page.waitForTimeout(1000);
    assert.equal(await page.evaluate(() => (window as any).fixture.sdk.sessionRecordingStarted()), false);
    assert.equal(requests.some((path) => /^\/s\/?$/.test(path)), false);
  } finally { releaseConfig(); await browser.close(); }
});
