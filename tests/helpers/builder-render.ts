import { build } from "esbuild";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { existsSync } from "node:fs";
import { captureJourneyBrief } from "../../lib/easyt/journey-capture.ts";
import { homepageInputStorageKey } from "../../lib/easyt/private-browser-context.ts";

// Use an existing browser runtime; this helper never installs a dependency.
const require = createRequire(import.meta.url);
export const builderBrowserTestsEnabled = process.env.MORROVIA_BUILDER_BROWSER_TESTS === "1";
const bundledRuntime = `${homedir()}/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright`;
const runtime = process.env.MORROVIA_PLAYWRIGHT_MODULE ?? (existsSync(bundledRuntime) ? bundledRuntime : "playwright");
let bundle: Promise<string> | undefined;

async function builderBundle() {
  bundle ??= build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import Builder from './app/journey/new/trip-builder'; import Importer from './app/journey/new/import/spreadsheet-import-client'; import Overview from './components/easyt/trip-overview-workspace'; import Transport from './components/easyt/trip-transport-workspace'; import Itinerary from './components/easyt/trip-itinerary-workspace'; import {loadLocalTripFromStorage} from './lib/easyt/storage'; import TripShell from './components/easyt/trip-shell'; import {useTripShellTrip} from './components/easyt/trip-shell-client';
      function WorkspaceFromShell(){const trip=useTripShellTrip();return location.pathname.endsWith('/transport')?React.createElement(Transport,{trip}):location.pathname.endsWith('/itinerary')?React.createElement(Itinerary,{trip}):React.createElement(Overview,{trip,initialPrepActions:[],initialPrepReadinessCards:[],initialPrepProviderStatus:'available'});}
      function App(){if(location.pathname.endsWith('/import'))return React.createElement(Importer);if(location.pathname!=='/journey/new'){const tripId=decodeURIComponent(location.pathname.split('/')[2]??'');const trip=loadLocalTripFromStorage(localStorage,tripId,window.__BUILDER_TEST_OWNER__??null);return trip?React.createElement(TripShell,{trip,cacheTrip:false,orientationAutoStart:false},React.createElement(WorkspaceFromShell)):React.createElement('p',null,'Trip unavailable');}return React.createElement(Builder);}
      createRoot(document.getElementById('root')).render(React.createElement(App));`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "tsx",
    },
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    loader: { ".css": "empty", ".module.css": "empty" },
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
    plugins: [{ name: "framework-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, ({ path }) => ({ path, namespace: "framework" }));
      builder.onResolve({ filter: /^@\/components\/journey-planner-map$/ }, () => ({ path: "map", namespace: "fixture" }));
      builder.onLoad({ filter: /^map$/, namespace: "fixture" }, () => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: `import React,{useEffect} from 'react'; export function JourneyPlannerMap({legs=[],stops=[],selectedId,selectedLegId,onSelect,onLegSelect,onLifecycleChange}){useEffect(()=>onLifecycleChange?.(window.__MORROVIA_MAP_UNAVAILABLE__?'unavailable':'ready'),[onLifecycleChange]);return React.createElement('div',{'aria-label':'Whole-trip route map preview','data-selected-leg-id':selectedLegId??''},[...stops.map(stop=>React.createElement('button',{key:'stop:'+stop.id,type:'button','aria-label':'Map stop '+(stop.city||stop.name),'aria-pressed':stop.id===selectedId,onClick:()=>onSelect?.(stop.id)},stop.city||stop.name)),...legs.map(leg=>React.createElement('button',{key:'leg:'+leg.id,type:'button','aria-label':'Map leg '+leg.fromName+' to '+leg.toName,'aria-pressed':leg.id===selectedLegId,onClick:()=>onLegSelect?.(leg)},leg.fromName+' → '+leg.toName))]);}` }));
      builder.onResolve({ filter: /^@\/lib\/auth-client$/ }, () => ({ path: "auth", namespace: "fixture" }));
      builder.onLoad({ filter: /^auth$/, namespace: "fixture" }, () => ({resolveDir:fileURLToPath(new URL("../../",import.meta.url)),contents:`import {useState,useEffect} from 'react'; export const authClient={useSession(){const [owner,setOwner]=useState(window.__BUILDER_TEST_OWNER__??null);useEffect(()=>{const update=()=>setOwner(window.__BUILDER_TEST_OWNER__??null);window.addEventListener('builder-test-owner',update);return()=>window.removeEventListener('builder-test-owner',update)},[]);return {data:owner?{user:{id:owner,name:'Test traveller',email:'fixture@example.invalid'}}:null,isPending:false,error:null}},getSession:async()=>({data:window.__BUILDER_TEST_OWNER__?{user:{id:window.__BUILDER_TEST_OWNER__}}:null,error:null})};` }));
      builder.onLoad({ filter: /.*/, namespace: "framework" }, ({ path }) => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: path.endsWith("navigation")
        ? `export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname; export const useSelectedLayoutSegment=()=>null; export const useRouter=()=>({push:href=>location.assign(href),replace:href=>location.replace(href)});`
        : `import React from 'react'; export default function Component({children, priority, fill, unoptimized, ...props}) {return React.createElement('${path.endsWith("link") ? "a" : "img"}',props,children)}`,
      }));
    } }],
  }).then((result) => result.outputFiles[0].text);
  return bundle;
}

export async function renderBuilder({
  query = "",
  draft,
  storedInput,
  initialTrip,
  path = "/journey/new",
  browserName = "chromium",
  geocodeDelayMs = 0,
  captureDelayMs = 0,
  captureFailures = 0,
  geocodeCandidates = {},
  geocodeFailures = {},
  nearbyCandidates = [],
  nearbyStatus,
  mapUnavailable = false,
  receiptLockDelayMs = 0,
  language,
  ownerId,
  accountRequest,
  seedRecovery = true,
  discoveryRequest,
  transferRequest,
}: {
  query?: string;
  draft?: unknown;
  storedInput?: { snapshot: { ownerId: string | null } } & Record<string, unknown>;
  initialTrip?: { id: string; ownerId: string | null } & Record<string, unknown>;
  path?: string;
  browserName?: "chromium" | "webkit";
  geocodeDelayMs?: number;
  captureDelayMs?: number;
  captureFailures?: number;
  geocodeCandidates?: Record<string, unknown[]>;
  geocodeFailures?: Record<string, number>;
  nearbyCandidates?: unknown[];
  nearbyStatus?: "ready" | "empty" | "unavailable";
  mapUnavailable?: boolean;
  receiptLockDelayMs?: number;
  language?: "en" | "es";
  ownerId?: string;
  seedRecovery?: boolean;
  accountRequest?: (input:{method:string;path:string;trip:unknown}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
  transferRequest?: (input:{legs:unknown[]}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
  discoveryRequest?: (destination:string,context:{cacheControl:string|undefined}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
} = {}) {
  const script = await builderBundle();
  let captureRequests = 0;
  const geocodeRequests = new Map<string, number>();
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/api/")) {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname === '/api/journey-discover' && discoveryRequest) {
        const result = await discoveryRequest(url.searchParams.get('destination') ?? '',{cacheControl:request.headers['cache-control']});
        response.statusCode = result.status; response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(result.body)); return;
      }
      if (url.pathname.startsWith("/api/easyt/trips/") && accountRequest) {
        const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
        const raw=Buffer.concat(chunks).toString();
        let result;try{result=await accountRequest({method:request.method??'GET',path:url.pathname,trip:raw?JSON.parse(raw):null})}catch(error){errors.push(`Fixture account boundary failed: ${String(error)}`);response.statusCode=500;response.end(JSON.stringify({error:String(error)}));return;}
        response.statusCode=result.status;response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result.body));return;
      }
      if (url.pathname.startsWith("/api/easyt/trips/")) {
        response.statusCode = 404;
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ error: "Trip not found" }));
        return;
      }
      if (url.pathname === "/api/journey-transfer-resolution") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const payload = JSON.parse(Buffer.concat(chunks).toString()) as { legs?: Array<{ id?: string; fromStopId?: string | null; toStopId?: string }> };
        if(transferRequest){const result=await transferRequest({legs:payload.legs??[]});response.statusCode=result.status;response.setHeader("Content-Type","application/json");response.end(JSON.stringify(result.body));return;}
        const canonicalLegs = (initialTrip as { legs?: Array<{ id: string; fromStopId: string | null; toStopId: string }> } | undefined)?.legs ?? [];
        const legs = (payload.legs ?? []).map((leg) => canonicalLegs.find((candidate) => candidate.id === leg.id
          && candidate.fromStopId === leg.fromStopId
          && candidate.toStopId === leg.toStopId) ?? leg);
        response.setHeader("Content-Type", "application/json");
        response.end(JSON.stringify({ legs }));
        return;
      }
      if (url.pathname === "/api/journey-capture") {
        captureRequests += 1;
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(Buffer.from(chunk));
        const { brief } = JSON.parse(Buffer.concat(chunks).toString());
        if (captureDelayMs) await new Promise((resolve) => setTimeout(resolve, captureDelayMs));
        if (captureRequests <= captureFailures) {
          response.statusCode = 503;
          response.end(JSON.stringify({ error: "Provider unavailable" }));
          return;
        }
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
        const count = (geocodeRequests.get(place) ?? 0) + 1;
        geocodeRequests.set(place, count);
        if (count <= (geocodeFailures[place] ?? 0)) {
          response.statusCode = 503;
          response.setHeader("Content-Type", "application/json");
          response.end(JSON.stringify({ error: "Provider unavailable" }));
          return;
        }
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
      const queryPlace = url.pathname === "/api/journey-geocode" ? url.searchParams.get("place") ?? "" : "";
      const result = geocodeCandidates[queryPlace]?.[0]
        ?? (url.pathname === "/api/journey-geocode" && queryPlace === "Tokyo"
        ? { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895], kind: "city" }
        : null);
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
  if(ownerId) await page.addInitScript((owner:string)=>{(window as Window & {__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__=owner},ownerId);
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  if (geocodeDelayMs > 0) await page.route("**/api/journey-geocode?**", async (route: { continue: () => Promise<void> }) => {
    await new Promise((resolve) => setTimeout(resolve, geocodeDelayMs));
    await route.continue();
  });
  if (draft) await page.addInitScript((value: unknown) => localStorage.setItem("easyt-home-trip-draft", JSON.stringify(value)), draft);
  if (storedInput) await page.addInitScript(({ key, value }: { key: string; value: unknown }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: homepageInputStorageKey(storedInput.snapshot.ownerId), value: storedInput,
  });
  if (language) await page.addInitScript((value: "en" | "es") => localStorage.setItem("easyt-language", value), language);
  if (receiptLockDelayMs) await page.addInitScript((delay: number) => {
    const original = navigator.locks.request.bind(navigator.locks);
    navigator.locks.request = ((...args: Parameters<typeof original>) => {
      if (args[0] !== "morrovia-home-handoff:guest") return original(...args);
      return new Promise((resolve, reject) => window.setTimeout(() => {
        original(...args).then(resolve, reject);
      }, delay)) as ReturnType<typeof original>;
    }) as typeof navigator.locks.request;
  }, receiptLockDelayMs);
  if (mapUnavailable) await page.addInitScript(() => { (window as Window & { __MORROVIA_MAP_UNAVAILABLE__?: boolean }).__MORROVIA_MAP_UNAVAILABLE__ = true; });
  if (initialTrip && seedRecovery) await page.addInitScript((value: { id: string; ownerId: string | null } & Record<string, unknown>) => {
    if(sessionStorage.getItem('builder-fixture-seeded'))return;
    sessionStorage.setItem('builder-fixture-seeded','1');
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
          : location.pathname.endsWith("/itinerary")
            ? Boolean(document.querySelector('[aria-label="Trip itinerary"]'))
          : Boolean(document.querySelector('[aria-label="Trip overview"]')), undefined, { timeout: 10000 });
  } catch (error) {
    await browser.close(); server.close();
    throw new Error(`Builder failed to render: ${errors.join("; ")}`, { cause: error });
  }
  return { page, errors, captureRequests: () => captureRequests, geocodeRequests: () => Object.fromEntries(geocodeRequests), close: async () => { await browser.close(); await new Promise<void>((resolve) => server.close(() => resolve())); } };
}
