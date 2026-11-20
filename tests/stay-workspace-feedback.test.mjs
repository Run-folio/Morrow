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
        "next/navigation": "export const useRouter = () => ({});",
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
    get mutation() { return { trip, error: scenario.error }; },
    get finder() { return { candidates: [], selectedPlace: null, status: scenario.status }; },
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
