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
// Opt-in styled fixtures render production CSS modules and tokens without a full
// app/Storybook build. Framework, auth and map boundaries retain the same stubs.
const bundles = new Map<boolean, Promise<{ script: string; css: string }>>();

async function builderBundle(styled = false) {
  if (!bundles.has(styled)) bundles.set(styled, build({
    stdin: {
      contents: `${styled ? "import './app/journey/journey-design.css';" : ""}import React from 'react'; import {createRoot} from 'react-dom/client'; import Builder from './app/journey/new/trip-builder'; import Home from './app/journey/home/home-trip-starter'; import LegacyPlanner from './components/journey-map-planner-workspace'; import Resolver from './components/easyt/trip-shell-resolver'; import Explore from './components/easyt/trip-explore-workspace'; import Stay from './components/easyt/trip-stay-workspace'; import MapWorkspace from './components/easyt/trip-map-workspace'; import Importer from './app/journey/new/import/spreadsheet-import-client'; import Overview from './components/easyt/trip-overview-workspace'; import Transport from './components/easyt/trip-transport-workspace'; import Itinerary from './components/easyt/trip-itinerary-workspace'; import Dashboard from './app/journey/dashboard/dashboard-client'; import {loadLocalTripFromStorage} from './lib/easyt/storage'; import TripShell from './components/easyt/trip-shell'; import {useTripShellTrip} from './components/easyt/trip-shell-client';
      function WorkspaceFromShell(){const trip=useTripShellTrip();return location.pathname.endsWith('/map')?React.createElement(MapWorkspace,{trip}):location.pathname.endsWith('/stay')?React.createElement(Stay,{trip}):location.pathname.endsWith('/explore')?React.createElement(Explore,{trip,initialDestinationId:new URLSearchParams(location.search).get('stop')??undefined}):location.pathname.endsWith('/transport')?React.createElement(Transport,{trip,language:localStorage.getItem('easyt-language')==='es'?'es':'en'}):location.pathname.endsWith('/itinerary')?React.createElement(Itinerary,{trip,selectedDayNumber:Number(new URLSearchParams(location.search).get('day'))||undefined}):React.createElement(Overview,{trip,...(window.__BUILDER_TEST_LIVE_PREP__?{}:{initialPrepActions:[],initialPrepReadinessCards:[],initialPrepProviderStatus:'available'})});}
      function App(){if(location.pathname==='/journey/dashboard')return React.createElement(Dashboard,{trips:window.__BUILDER_TEST_DASHBOARD_TRIPS__??[],stamps:[],ownerId:window.__BUILDER_TEST_OWNER__??'owner-a'});if(location.pathname==='/')return React.createElement(Home);if(location.pathname==='/journey/plan')return React.createElement(LegacyPlanner);if(location.pathname.endsWith('/import'))return React.createElement(Importer);if(location.pathname!=='/journey/new'){const tripId=decodeURIComponent(location.pathname.split('/')[2]??'');const trip=window.__BUILDER_TEST_CANONICAL_TRIP__??loadLocalTripFromStorage(localStorage,tripId,window.__BUILDER_TEST_OWNER__??null);return trip&&!window.__BUILDER_TEST_FORCE_RESOLVER__?React.createElement(TripShell,{trip,cacheTrip:Boolean(window.__BUILDER_TEST_CANONICAL_TRIP__),orientationAutoStart:false},React.createElement(WorkspaceFromShell)):React.createElement(Resolver,{tripId,ownerId:window.__BUILDER_TEST_OWNER__??undefined},React.createElement(WorkspaceFromShell));}return React.createElement(Builder);}
      createRoot(document.getElementById('root')).render(React.createElement(App));`,
      resolveDir: fileURLToPath(new URL("../../", import.meta.url)), loader: "tsx",
    },
    bundle: true, write: false, outfile: "builder-fixture.js", platform: "browser", format: "iife", jsx: "automatic",
    loader: styled ? { ".css": "css", ".module.css": "local-css" } : { ".css": "empty", ".module.css": "empty" },
    define: { "process.env.NODE_ENV": '"test"', "process.env": "{}" },
    plugins: [{ name: "framework-boundaries", setup(builder) {
      builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, ({ path }) => ({ path, namespace: "framework" }));
      builder.onResolve({ filter: /^@\/components\/journey-planner-map$/ }, () => ({ path: "map", namespace: "fixture" }));
      builder.onLoad({ filter: /^map$/, namespace: "fixture" }, () => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: `import React,{useEffect} from 'react'; export function JourneyPlannerMap({legs=[],stops=[],selectedId,selectedLegId,onSelect,onLegSelect,onLifecycleChange}){useEffect(()=>onLifecycleChange?.(window.__MORROVIA_MAP_UNAVAILABLE__?'unavailable':'ready'),[onLifecycleChange]);return React.createElement('div',{'aria-label':'Whole-trip route map preview','data-selected-leg-id':selectedLegId??''},[...stops.map(stop=>React.createElement('button',{key:'stop:'+stop.id,type:'button','aria-label':'Map stop '+(stop.city||stop.name),'aria-pressed':stop.id===selectedId,onClick:()=>onSelect?.(stop.id)},stop.city||stop.name)),...legs.map(leg=>React.createElement('button',{key:'leg:'+leg.id,type:'button','aria-label':'Map leg '+leg.fromName+' to '+leg.toName,'aria-pressed':leg.id===selectedLegId,onClick:()=>onLegSelect?.(leg)},leg.fromName+' → '+leg.toName))]);}` }));
      builder.onResolve({ filter: /^@\/lib\/auth-client$/ }, () => ({ path: "auth", namespace: "fixture" }));
      builder.onLoad({ filter: /^auth$/, namespace: "fixture" }, () => ({resolveDir:fileURLToPath(new URL("../../",import.meta.url)),contents:`import {useState,useEffect} from 'react'; export const authClient={useSession(){const [owner,setOwner]=useState(window.__BUILDER_TEST_OWNER__??null);useEffect(()=>{const update=()=>setOwner(window.__BUILDER_TEST_OWNER__??null);window.addEventListener('builder-test-owner',update);return()=>window.removeEventListener('builder-test-owner',update)},[]);return {data:owner?{user:{id:owner,name:'Test traveller',email:'fixture@example.invalid'}}:null,isPending:false,error:null}},getSession:async()=>({data:window.__BUILDER_TEST_OWNER__?{user:{id:window.__BUILDER_TEST_OWNER__}}:null,error:null})};` }));
      builder.onLoad({ filter: /.*/, namespace: "framework" }, ({ path }) => ({ resolveDir: fileURLToPath(new URL("../../", import.meta.url)), contents: path.endsWith("navigation")
        ? `const searchParams=new URLSearchParams(location.search); export const useSearchParams=()=>searchParams; export const usePathname=()=>location.pathname; export const useSelectedLayoutSegment=()=>null; export const useRouter=()=>({push:href=>location.assign(href),replace:href=>location.replace(href)});export const notFound=()=>{throw Error('Fixture route not found')};`
        : `import React from 'react'; export default function Component({children, priority, fill, unoptimized, ...props}) {return React.createElement('${path.endsWith("link") ? "a" : "img"}',props,children)}`,
      }));
    } }],
  }).then((result) => ({ script: result.outputFiles.find((file) => file.path.endsWith(".js"))!.text,
    css: result.outputFiles.find((file) => file.path.endsWith(".css"))?.text ?? "" })));
  return bundles.get(styled)!;
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
  forceResolver = false,
  simulatedSignIn = false,
  shellCanonicalTrip,
  discoveryRequest,
  transferRequest,
  styled = false,
  liveOverviewPrep = false,
  prepRequest,
  offlineOnly = false,
  dashboardTrips,
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
  forceResolver?: boolean;
  simulatedSignIn?: boolean;
  styled?: boolean;
  liveOverviewPrep?: boolean;
  /** Opt-in isolated integration checks must never contact external services. */
  offlineOnly?: boolean;
  /** Server-supplied synthetic listing, allowing actual dashboard reopen paths. */
  dashboardTrips?: () => unknown[];
  prepRequest?: (input:{path:string;body:unknown}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
  shellCanonicalTrip?: { id: string; ownerId: string | null } & Record<string, unknown>;
  accountRequest?: (input:{method:string;path:string;trip:unknown}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
  transferRequest?: (input:{legs:unknown[]}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
  discoveryRequest?: (destination:string,context:{cacheControl:string|undefined}) => Promise<{status:number;body:unknown}> | {status:number;body:unknown};
} = {}) {
  const { script, css } = await builderBundle(styled);
  let captureRequests = 0;
  const geocodeRequests = new Map<string, number>();
  const server = createServer(async (request, response) => {
    if (request.url?.startsWith("/api/")) {
      const url = new URL(request.url, "http://localhost");
      if ((url.pathname === '/api/journey-booking-readiness' || url.pathname === '/api/journey-readiness') && prepRequest) {
        const chunks:Buffer[]=[];for await(const chunk of request)chunks.push(Buffer.from(chunk));
        const result=await prepRequest({path:url.pathname,body:JSON.parse(Buffer.concat(chunks).toString())});
        response.statusCode=result.status;response.setHeader('Content-Type','application/json');response.end(JSON.stringify(result.body));return;
      }
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
    if (simulatedSignIn && request.url?.startsWith('/journey/login?')) {
      response.setHeader('Content-Type','text/html');
      response.end(`<button id="complete">Complete simulated sign in</button><script>document.getElementById('complete').onclick=()=>{sessionStorage.setItem('builder-fixture-owner','owner-a');location.assign(new URLSearchParams(location.search).get('next'))}</script>`);return;
    }
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    response.end(`${styled ? `<style>*,::before,::after{box-sizing:border-box}body{margin:0}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}${css}</style>` : ""}<div id="root"></div><script>window.__BUILDER_TEST_DASHBOARD_TRIPS__=${JSON.stringify(dashboardTrips?.()??[]).replaceAll("<","\\u003c")}</script><script>${script.replaceAll("</script>", "<\\/script>")}</script>`);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { chromium, webkit } = require(runtime);
  let browser;
  try {
    const executablePath = process.env.MORROVIA_BUILDER_BROWSER_EXECUTABLE;
    if (executablePath && !existsSync(executablePath)) throw new Error("The explicitly selected test browser does not exist");
    browser = browserName === "webkit"
      ? await webkit.launch({ headless: true })
      : await chromium.launch(executablePath ? { executablePath, headless: true } : { channel: process.env.MORROVIA_BROWSER_CHANNEL ?? "chrome", headless: true });
  } catch (error) {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    throw error;
  }
  const page = await browser.newPage();
  if (offlineOnly) await page.route("**/*", async (route: { request: () => { url: () => string }; continue: () => Promise<void>; abort: () => Promise<void> }) => {
    const url = new URL(route.request().url());
    if (url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === String((server.address() as {port:number}).port)) await route.continue();
    else await route.abort();
  });
  if (liveOverviewPrep) await page.addInitScript(() => { (window as Window & { __BUILDER_TEST_LIVE_PREP__?: boolean }).__BUILDER_TEST_LIVE_PREP__ = true; });
  if(ownerId) await page.addInitScript((owner:string)=>{(window as Window & {__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__=owner},ownerId);
  if (forceResolver) await page.addInitScript(() => { (window as Window & {__BUILDER_TEST_FORCE_RESOLVER__?:boolean}).__BUILDER_TEST_FORCE_RESOLVER__ = true; });
  if (simulatedSignIn) await page.addInitScript(() => { (window as Window & {__BUILDER_TEST_OWNER__?:string}).__BUILDER_TEST_OWNER__ = sessionStorage.getItem('builder-fixture-owner') ?? undefined; });
  const errors: string[] = [];
  page.on("pageerror", (error: Error) => errors.push(error.message));
  if (geocodeDelayMs > 0) await page.route("**/api/journey-geocode?**", async (route: { continue: () => Promise<void> }) => {
    await new Promise((resolve) => setTimeout(resolve, geocodeDelayMs));
    await route.continue();
  });
  if (draft) await page.addInitScript((value: unknown) => localStorage.setItem("easyt-home-trip-draft", JSON.stringify(value)), draft);
  if (storedInput) await page.addInitScript(({ key, value, entryPath }: { key: string; value: unknown; entryPath: string }) => {
    if (entryPath === "/" && location.pathname !== "/") return;
    localStorage.setItem(key, JSON.stringify(value));
  }, {
    key: homepageInputStorageKey(storedInput.snapshot.ownerId), value: storedInput, entryPath: path,
  });
  if (language) await page.addInitScript((value: "en" | "es") => localStorage.setItem("easyt-language", value), language);
  if (shellCanonicalTrip) await page.addInitScript((value: unknown) => { (window as Window & { __BUILDER_TEST_CANONICAL_TRIP__?: unknown }).__BUILDER_TEST_CANONICAL_TRIP__ = value; }, shellCanonicalTrip);
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
    await page.waitForFunction(() => location.pathname === "/"
      ? Boolean(document.getElementById("start-building"))
      : location.pathname === "/journey/plan"
        ? Boolean(document.querySelector("main"))
      : location.pathname.endsWith("/import")
      ? Boolean(document.querySelector('a[href="/journey/new"]'))
      : location.pathname === "/journey/new"
        ? Boolean(document.querySelector('[data-builder-root="true"]:not([aria-busy="true"])'))
        : location.pathname.endsWith("/explore")
          ? Boolean(document.querySelector('[aria-label="Explore recommendations"]'))
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
