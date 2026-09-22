import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";

// Use an existing browser runtime; this helper never installs a dependency.
const require = createRequire(import.meta.url);
export const builderBrowserTestsEnabled = process.env.MORROVIA_BUILDER_BROWSER_TESTS === "1";
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const runtime = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
let bundle: Promise<string> | undefined;

async function builderBundle() {
  bundle ??= build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Builder from './app/journey/new/trip-builder'; import Importer from './app/journey/new/import/spreadsheet-import-client'; import Overview from './components/easyt/trip-overview-workspace'; import Transport from './components/easyt/trip-transport-workspace'; import TripShell from './components/easyt/trip-shell'; import {useTripShellTrip} from './components/easyt/trip-shell-client';
      function WorkspaceFromShell(){const trip=useTripShellTrip();return location.pathname.endsWith('/transport')?React.createElement(Transport,{trip}):React.createElement(Overview,{trip,initialPrepActions:[],initialPrepReadinessCards:[],initialPrepProviderStatus:'available'});}
      function App(){if(location.pathname.endsWith('/import'))return React.createElement(Importer);if(location.pathname!=='/journey/new'){const trip=Object.keys(localStorage).filter(key=>key.startsWith('easyt:trip-recovery:v2:')).map(key=>JSON.parse(localStorage.getItem(key))).filter(record=>record.trip).sort((left,right)=>(Date.parse(right.savedAt)||0)-(Date.parse(left.savedAt)||0)||right.writeId.localeCompare(left.writeId))[0]?.trip;return trip?React.createElement(TripShell,{trip,cacheTrip:false,orientationAutoStart:false},React.createElement(WorkspaceFromShell)):React.createElement('p',null,'Trip unavailable');}return React.createElement(Builder);}
      createRoot(document.getElementById('root')).render(React.createElement(App));`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    loader: { ".css": "empty", ".module.css": "empty" },
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
    plugins: [{ name: "framework-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, ({ path }) => ({ path, namespace: "framework" }));
      builder.onResolve({ filter: /^@\/components\/journey-planner-map$/ }, () => ({ path: "map", namespace: "fixture" }));
      builder.onLoad({ filter: /^map$/, namespace: "fixture" }, () => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: `import React from 'react'; export function JourneyPlannerMap(){return React.createElement('div',{'aria-label':'Whole-trip route map preview'});}` }));
      builder.onResolve({ filter: /^@\/lib\/auth-client$/ }, () => ({ path: fileURLToPath(new URL("../../.storybook/auth-client.mock.ts", import.meta.url)) }));
      builder.onLoad({ filter: /.*/, namespace: "framework" }, ({ path }) => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: path.endsWith("navigation")
        ? `export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname; export const useRouter=()=>({push:href=>location.assign(href),replace:href=>location.replace(href)});`
        : `import React from 'react'; export default function Component({children, priority, fill, unoptimized, ...props}) {return React.createElement('${path.endsWith("link") ? "a" : "img"}',props,children)}`,
      }));
    } }],
  }).then((result) => result.outputFiles[0].text);
  return bundle;
}

export async function renderBuilder({
  query = "",
  draft,
  initialTrip,
  path = "/journey/new",
  browserName = "chromium",
  geocodeDelayMs = 0,
  geocodeCandidates = {},
  nearbyCandidates = [],
  nearbyStatus,
}: {
  query?: string;
  draft?: unknown;
  initialTrip?: { id: string; ownerId: string | null } & Record<string, unknown>;
  path?: string;
  browserName?: "chromium" | "webkit";
  geocodeDelayMs?: number;
  geocodeCandidates?: Record<string, unknown[]>;
  nearbyCandidates?: unknown[];
  nearbyStatus?: "ready" | "empty" | "unavailable";
} = {}) {
  const script = await builderBundle();
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/api/")) {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === "/api/journey-transfer-resolution") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const payload = JSON.parse(Buffer.concat(chunks).toString()) as { legs?: Array<{ id?: string; fromStopId?: string | null; toStopId?: string }> };
        const canonicalLegs = (initialTrip as { legs?: Array<{ id: string; fromStopId: string | null; toStopId: string }> } | undefined)?.legs ?? [];
        const legs = (payload.legs ?? []).map((leg) => canonicalLegs.find((candidate) => candidate.id === leg.id
          && candidate.fromStopId === leg.fromStopId
          && candidate.toStopId === leg.toStopId) ?? leg);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ legs }));
        return;
      }
      if (url.pathname === "/api/journey-capture") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const { brief } = JSON.parse(Buffer.concat(chunks).toString());
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify(captureJourneyBrief(brief)));
        return;
      }
      if (url.pathname === "/api/journey-geocode" && url.searchParams.get("nearbyBases") === "1") {
        response.setHeader("Content-Type", "application/json");
        response.statusCode = nearbyStatus === "unavailable" ? 503 : 200;
        response.end(JSON.stringify({ candidates: nearbyCandidates, status: nearbyStatus ?? (nearbyCandidates.length ? "ready" : "empty") }));
        return;
      }
      if (url.pathname === "/api/journey-geocode" && url.searchParams.get("candidates") === "1") {
        const place = url.searchParams.get("place") ?? "";
        const country = url.searchParams.get("country");
        const defaultCandidate = place === "Tokyo"
          ? { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895], kind: "city" }
          : undefined;
        const candidates = (geocodeCandidates[place] ?? (defaultCandidate ? [defaultCandidate] : []))
          .filter((candidate) => !country || (candidate as { country?: string }).country === country);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ candidates }));
        return;
      }
      const result = url.pathname === "/api/journey-geocode" && url.searchParams.get("place") === "Tokyo"
        ? { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895], kind: "city" }
        : null;
      response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ candidates: result ? [result] : [], places: [], result })); return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`<div id="root"></div><script>${script.replaceAll("</script>", "<\\/script>")}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { chromium, webkit } = require(runtime);
  const browser = browserName === "webkit"
    ? await webkit.launch({ headless: true })
    : await chromium.launch({ channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  if (geocodeDelayMs > 0) await page.route("**/api/journey-geocode?**", async (route: { continue: () => Promise<void> }) => {
    await new Promise((resolve) => setTimeout(resolve, geocodeDelayMs));
    await route.continue();
  });
  if (draft) await page.addInitScript((value: unknown) => localStorage.setItem("easyt-home-trip-draft", JSON.stringify(value)), draft);
  if (initialTrip) await page.addInitScript((value: { id: string; ownerId: string | null } & Record<string, unknown>) => {
    const scope = value.ownerId === null ? "guest" : `owner-${encodeURIComponent(value.ownerId)}`;
    const writeId = "browser-fixture";
    localStorage.setItem(`easyt:trip-recovery:v2:${scope}:${encodeURIComponent(value.id)}:${writeId}`, JSON.stringify({
      version: 2,
      ownerId: value.ownerId,
      tripId: value.id,
      trip: value,
      state: "pending",
      writeId,
      savedAt: "2026-09-22T12:00:00.000Z",
    }));
  }, initialTrip);
  const address = server.address() as { port: number };
  await page.goto(`http://127.0.0.1:${address.port}${path}${query}`);
  try {
    await page.waitForFunction(() => location.pathname.endsWith("/import")
      ? Boolean(document.querySelector('a[href="/journey/new"]'))
      : location.pathname === "/journey/new"
        ? Boolean(document.querySelector('[data-builder-root="true"]:not([aria-busy="true"])'))
        : location.pathname.endsWith("/transport")
          ? Boolean(document.querySelector('[aria-labelledby="transport-workspace-heading"]'))
          : Boolean(document.querySelector('[aria-label="Trip overview"]')), undefined, { timeout: 10000 });
  } catch (error) {
    await browser.close(); server.close();
    throw new Error(`Builder failed to render: ${errors.join("; ")}`, { cause: error });
  }
  return { page, errors, close: async () => { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}
