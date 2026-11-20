import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { build } from "esbuild";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const bundle = await build({
  entryPoints: ["components/easyt/trip-stay-workspace.tsx"],
  bundle: true, write: false, format: "cjs", platform: "node", packages: "external", jsx: "automatic",
  plugins: [{
    name: "stay-workspace-render-boundaries",
    setup(builder) {
      const stubs = {
        "next/navigation": "export const useRouter = () => ({}); export const usePathname = () => '/journey/japan-trip/stay';",
        "@/components/journey-local-finder": "export const JourneyLocalFinder = ({render}) => render(globalThis.stayFixture.finder);",
        "@/components/journey-planner-map": "export const JourneyPlannerMap = () => null;",
        "@/components/journey-planner-strip": "export const JourneyRouteStopTrack = () => null;",
        "@/lib/analytics": "export const trackEvent = () => {};",
        "./trip-shell-client": "export const useTripShellMutation = () => globalThis.stayFixture.mutation;",
        "./trip-stay-shortlist": "export default function TripStayShortlist() { return null; }",
        "./journey-local-place-photo": "export const JourneyLocalPlacePhotoMedia = () => null; export const useJourneyLocalPlacePhotos = () => ({});",
        "./trip-mobile-sheet": "export const useMobileTripWorkspace = () => false;",
        "./itinerary-item-detail": "export default function ItineraryItemDetail() { return null; }",
      };
      builder.onResolve({ filter: /./ }, ({path}) => Object.hasOwn(stubs, path) || path.endsWith(".css") ? { path, namespace: "stay-fixture" } : undefined);
      builder.onLoad({ filter: /./, namespace: "stay-fixture" }, ({path}) => ({ contents: stubs[path] ?? "export default {};" }));
    },
  }],
});
const lib = { exports: {} };
new Function("require", "module", "exports", "globalThis", bundle.outputFiles[0].text)(require, lib, lib.exports, {
  stayFixture: {
    get mutation() { return { trip, error: scenario.error, isPending: () => false }; },
    get finder() { return { candidates: scenario.candidates ?? [], selectedPlace: null, status: scenario.status, accommodationInventoryStatus: scenario.inventory, retry: () => {} }; },
  },
});

const trip = {
  id: "japan-trip", ownerId: null, title: "Japan", startDate: "2027-03-06", endDate: "2027-03-09",
  brief: { origin: "London" }, legs: [], planItems: [], recommendations: [],
  stops: [{ id: "kyoto", order: 0, name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-03-06", departureDate: "2027-03-09", nights: 3 }],
};
let scenario;
const render = (options) => {
  scenario = options;
  return renderToStaticMarkup(createElement(lib.exports.default, { trip }));
};

test("a refused Stay edit tells the traveller it was not applied, without implying a device save", () => {
  const html = render({ status: "ready", error: "Browser storage is unavailable, so this change was not applied." });
  assert.match(html, /Stay update needs attention/);
  assert.match(html, /Browser storage is unavailable, so this change was not applied/);
  assert.doesNotMatch(html, /change is safe|saved on this device/i);
});

test("Stay loading names the stop without restating the visible dates and nights", () => {
  const html = render({ status: "loading" });
  assert.match(html, /Finding stays in Kyoto…/);
  assert.match(html, /3 nights/);
  assert.doesNotMatch(html, /Keeping Kyoto/);
});

test("Explore preserves the shared mutation reason without claiming every failure was saved", () => {
  const source = require("node:fs").readFileSync(new URL("../components/easyt/trip-explore-workspace.tsx", import.meta.url), "utf8");
  assert.match(source, /mutation\.error \? <MorroviaStatusBanner[^\n]*title="Plan update needs attention" detail=\{mutation\.error\}/);
  assert.doesNotMatch(source, /This change is safe on this device/);
});

test("a failed room-availability lane is explained and retryable beside usable mapped stays", () => {
  const candidate = { id: "synthetic-kyoto", name: "Synthetic Kyoto guesthouse", address: "Kyoto, Japan", category: "Guesthouse", coordinates: [135.7681,35.0116], mapsUrl: "https://example.invalid/stay", provider: "openstreetmap", availability: "check" };
  const html = render({ status: "ready", inventory: "unavailable", candidates: [candidate] });
  assert.match(html, /Couldn’t check room availability/);
  assert.match(html, /Retry stay search/);
  assert.match(html, /Synthetic Kyoto guesthouse/);
  assert.match(html, /Photos unavailable/);
  assert.doesNotMatch(html, /Couldn’t load stays|Current availability found|BOOKING.COM LIVE INFO/);
  for (const inventory of ["unconfigured", "not-requested", "empty"]) {
    const inactive = render({status:"ready", inventory, candidates:[candidate]});
    assert.doesNotMatch(inactive, /Couldn’t check room availability|Retry stay search/);
  }
});

test("Stay retry transfers focus to the mounted options region before starting retrieval", () => {
  const fs = require("node:fs");
  const ts = require("typescript");
  const file = "components/easyt/trip-stay-workspace.tsx";
  const source = fs.readFileSync(file, "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let retry;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === "retryStaySearch") retry = node.initializer;
    ts.forEachChild(node, visit);
  }
  visit(tree);
  assert.ok(retry, "a shared retry callback keeps focus stable");
  const calls = [];
  const activate = new Function("optionsRegionRef", "finder", `return ${retry.getText(tree)};`)(
    { current: { focus: options => calls.push(["focus", options]) } },
    { retry: () => calls.push(["retry"]) },
  );
  assert.deepEqual(calls, [], "passive rendering must not move focus");
  activate();
  assert.deepEqual(calls, [["focus", { preventScroll: true }], ["retry"]]);
  assert.match(source, /<section ref=\{optionsRegionRef\} tabIndex=\{-1\} className=\{styles.options\}/);
  assert.equal([...source.matchAll(/onRetry=\{retryStaySearch\}/g)].length, 2);
});
