import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import test from "node:test";
import { build } from "esbuild";
import { adaptedDiscoveryPlaces } from "../lib/easyt/discovery-evidence-adapter.ts";
import { defaultTripIntent, type EasyTTrip, type TripLeg } from "../lib/easyt/trip.ts";
import { selectTripLegTransportChoice, supportedTransportChoicesForLeg } from "../lib/easyt/transport-mode-choice.ts";
import { searchReferencePlaces } from "../lib/easyt/place-reference.server.ts";
import { REFERENCE_SNAPSHOT_ID } from "../lib/easyt/place-reference.ts";
import { acceptedGeographicPlace } from "../lib/easyt/geographic-binding.ts";

const project = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
// Bundle the actual component and domain helpers in memory. Substitute only React
// scheduling and visual leaf components; never launch a browser or run effects.
const script = (await build({
  entryPoints: [project + "app/journey/new/trip-builder-route-workspace.tsx"], bundle: true, write: false,
  outfile: "offline-builder.cjs", format: "cjs", platform: "node", packages: "external", jsx: "automatic", logLevel: "silent", loader: { ".css": "empty", ".module.css": "empty" },
  plugins: [{ name: "offline-builder-render", setup(builder) {
    builder.onResolve({ filter: /^react$/ }, () => ({ path: "hooks", namespace: "offline" }));
    builder.onResolve({ filter: /(?:journey-planner-map|trip-transport-choice-control|morrovia-loading-states)$/ }, args => ({ path: args.path, namespace: "leaves" }));
    builder.onLoad({ filter: /.*/, namespace: "offline" }, () => ({ contents: "export const useState=x=>[typeof x==='function'?x():x,()=>{}];export const useRef=x=>({current:x});export const useMemo=f=>f();export const useCallback=f=>f;export const useEffect=()=>{};" }));
    builder.onLoad({ filter: /.*/, namespace: "leaves" }, () => ({ contents: "export default function TripTransportChoiceControl(){};export function JourneyPlannerMap(){};export function MorroviaSectionStatus(){};" }));
  } }],
})).outputFiles[0].text;

function elements(node: any): any[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(elements);
  return node.props ? [node, ...elements(node.props.children)] : [];
}
function text(node: any): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(text).join(" ");
  return node?.props ? text(node.props.children) : "";
}
function fixture(): EasyTTrip {
  const places = adaptedDiscoveryPlaces();
  const origin = places.find(place => place.id === "tokyo")!;
  const stops = ["kyoto", "osaka"].map((id, order) => {
    const place = places.find(candidate => candidate.id === id)!;
    return { id, order, canonicalPlaceId: id, name: place.name, country: place.country, longitude: place.coordinates[0], latitude: place.coordinates[1], arrivalDate: "2027-04-01", departureDate: "2027-04-03", nights: 2 };
  });
  const departure: TripLeg = {
    id: "return-leg", classification: "departure", fromStopId: "osaka", toStopId: "return-fixture-end",
    fromEndpoint: { kind: "stop", id: "osaka", name: "Osaka", country: "Japan", canonicalPlaceId: "osaka", coordinates: [stops[1].longitude, stops[1].latitude] },
    toEndpoint: { kind: "end", id: "return-fixture-end", name: origin.name, country: origin.country, canonicalPlaceId: "tokyo", coordinates: [...origin.coordinates] },
    mode: "unknown", durationMinutes: null, distanceKm: null, provider: null, provenance: "unknown", confidence: "unknown", routeMetadata: {},
  };
  return {
    schemaVersion: 1, id: "return-fixture", ownerId: null, title: "Return fixture", status: "draft", startDate: "2027-04-01", endDate: "2027-04-05", travellers: 2, currency: "GBP",
    brief: { selectedPlaces: {}, origin: origin.name, originCountry: origin.country, originCanonicalPlaceId: "tokyo", originCoordinates: [...origin.coordinates], journeyEnd: { mode: "same_as_start" }, mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", intent: defaultTripIntent({ stopIds: stops.map(stop => stop.id), durationDays: 5 }) },
    stops, legs: [departure], planItems: [], recommendations: [], createdAt: "2027-04-01T00:00:00Z", updatedAt: "2027-04-01T00:00:00Z",
  };
}
function render(trip: EasyTTrip, overrides: Record<string, unknown> = {}) {
  const module = { exports: {} as any };
  new vm.Script(script).runInNewContext({ module, exports: module.exports, require, console, process, structuredClone });
  const calls: unknown[][] = [];
  const props = { canonicalTrip: trip, previewStopIds: null, selectedStopId: null, lockedStopIds: [], fixedOrder: false, routeCheckProposalStopIds: null,
    nightStatus: { total: 4, allocated: 4, complete: true, language: "en" }, onSelectStop() {}, onPreviewOrder() {}, onCommitOrder() { return false; }, onEditNights() {}, onRemoveStop() {}, onTransportChoiceChange: (...args: unknown[]) => calls.push(args), ...overrides };
  const tree = module.exports.TripBuilderRouteWorkspace(props);
  return { nodes: elements(tree), calls, endpoint: elements(tree).find(node => node.props["data-builder-endpoint-leg-id"] === "return-leg") };
}

test("actual Builder renders canonical return after overnight stops without endpoint editing controls", () => {
  const trip = fixture(), before = JSON.stringify(trip), view = render(trip);
  assert.ok(view.endpoint, "the existing departure leg must be visible in the route table");
  assert.match(text(view.endpoint), /Return[\s\S]*Tokyo/);
  assert.match(text(view.endpoint), /Timing to confirm/);
  const rows = view.nodes.filter(node => node.props.role === "row");
  assert.equal(rows.at(-1), view.endpoint);
  assert.equal(view.nodes.filter(node => node.props["data-builder-stop-id"]).length, 2);
  assert.equal(view.endpoint.props.onDrop, undefined); assert.equal(view.endpoint.props.onDragOver, undefined);
  assert.equal(view.endpoint.props["data-builder-stop-id"], undefined);
  assert.equal(elements(view.endpoint).some(node => node.type === "button" || node.type === "details"), false);
  assert.doesNotMatch(text(view.endpoint), /Usable time|nights|Remove stop|Reorder/i);
  assert.equal(JSON.stringify(trip), before);
});

test("return transport preserves pending, failed, unknown and separate road-reference states", () => {
  for (const [state, expected] of [
    [{ retrieval: "checking", evidence: "insufficient", retryable: false }, /Checking transport options/],
    [{ retrieval: "unavailable", evidence: "insufficient", reason: "timeout", retryable: true }, /Transport check unavailable/],
    [{ retrieval: "completed", evidence: "insufficient", retryable: false }, /Transfer needs checking/],
  ] as const) {
    const view = render(fixture(), { transferAssessments: [{ legId: "return-leg", state }], legReview: (id: string) => id === "return-leg" ? "Review return connection" : null });
    assert.ok(view.endpoint); assert.match(text(view.endpoint), expected); assert.match(text(view.endpoint), /Review return connection/);
  }
  const trip = fixture();
  trip.legs[0].roadEstimate = { provider: "openrouteservice", profile: "driving-car", provenance: "routed", checkedAt: "2027-04-01T00:00:00Z", distanceKm: 500, durationMinutes: 390, confidence: "medium", routeGeometry: [], attribution: "Reference", warnings: [] };
  const view = render(trip); assert.ok(view.endpoint);
  assert.match(text(view.endpoint), /Transfer needs checking/); assert.match(text(view.endpoint), /Road estimate only/);
  assert.match(text(view.endpoint), /Timing to confirm/);
});

test("one-way or unknown journeys never manufacture a missing departure; actual explicit departure is Finish", () => {
  for (const end of [undefined, { mode: "unknown" as const }, { mode: "same_as_start" as const }]) {
    const trip = fixture(); trip.legs = []; trip.brief.journeyEnd = end;
    assert.equal(render(trip).endpoint, undefined);
  }
  const trip = fixture(); trip.brief.journeyEnd = { mode: "explicit", place: { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: trip.brief.originCoordinates! } };
  const view = render(trip); assert.ok(view.endpoint); assert.match(text(view.endpoint), /Finish[\s\S]*Tokyo/); assert.doesNotMatch(text(view.endpoint), /Return/);
  trip.legs[0].fromStopId = "kyoto";
  assert.equal(render(trip).endpoint, undefined, "a stale departure from an earlier stop must not masquerade as the current finish");
});

test("the endpoint uses the selected effective mode and the existing canonical choice callback", () => {
  const trip = fixture(), leg = trip.legs[0];
  const segment = { id: "road-option", mode: "road", fromEndpoint: leg.fromEndpoint, toEndpoint: leg.toEndpoint, durationMinutes: 390, distanceKm: 500, provider: "Offline road fixture", provenance: "routing_engine", confidence: "high", scheduleNeedsChecking: true };
  leg.routeMetadata = { multimodalResolution: { version: 1, candidates: [{ id: "road-option", summaryMode: "road", segments: [segment], totalDurationMinutes: 390, distanceKm: 500, confidence: "high", provenance: "routing_engine", evidence: "routed_road", connectionCount: 0, score: 55, reasons: [] }] } };
  const choice = supportedTransportChoicesForLeg(trip, leg)[0]; assert.ok(choice);
  const selected = selectTripLegTransportChoice(trip, leg.id, choice.identity);
  const view = render(selected); assert.ok(view.endpoint); assert.match(text(view.endpoint), /Road|Drive/); assert.match(text(view.endpoint), /6h 30m/);
  const control = elements(view.endpoint).find(node => node.type?.name === "TripTransportChoiceControl"); assert.ok(control);
  assert.equal(control.props.trip, selected); assert.equal(control.props.leg.id, leg.id);
  control.props.onChange(null); assert.deepEqual(view.calls, [[leg.id, null]]);
});

test("incoming and return airport assumptions remain conditional, unknown and hidden for booked legs", () => {
  const place = (query: string, country: string) => {
    const row = searchReferencePlaces(query, { explicitCountryNames: [country] })[0]!;
    const owner = { name: row.canonicalName, country, canonicalPlaceId: row.canonicalPlaceId };
    return acceptedGeographicPlace(owner, { ...row, ...owner, referenceSnapshotId: REFERENCE_SNAPSHOT_ID }, "endpoint")!;
  };
  const paris = place("Paris", "France"), heathrow = place("LHR", "United Kingdom");
  const trip = fixture();
  trip.stops = [{ ...trip.stops[0], ...paris, id: "paris-stop", longitude: paris.coordinates![0], latitude: paris.coordinates![1] }];
  trip.brief.intent!.route = { version: 1, origin: heathrow, tripType: "return_to_start", journeyEnd: { mode: "same_as_start" }, destinations: [], orderAuthority: "manual", explicitIntentIds: null, orderedStopIds: ["paris-stop"], projectionInputKey: null };
  trip.legs = [
    { ...trip.legs[0], id: "arrival-leg", classification: "arrival", fromStopId: `${trip.id}-origin`, toStopId: "paris-stop", fromEndpoint: undefined, toEndpoint: undefined },
    { ...trip.legs[0], fromStopId: "paris-stop", fromEndpoint: undefined, toEndpoint: undefined },
  ];
  const before = JSON.stringify(trip), view = render(trip);
  const incoming = view.nodes.find(node => node.props["data-builder-stop-id"] === "paris-stop");
  for (const row of [incoming, view.endpoint]) {
    assert.ok(row); assert.match(text(row), /If flying.*CDG/); assert.match(text(row), /Timing to confirm/);
  }
  assert.equal(JSON.stringify(trip), before);
  trip.brief.bookings = trip.legs.map(leg => ({ id: leg.id, type: "transport", title: "Booked connection", date: null, confirmation: null, url: null }));
  assert.doesNotMatch(text(render(trip).endpoint), /assumed airports/i);
  assert.doesNotMatch(text(render(trip).nodes.find(node => node.props["data-builder-stop-id"] === "paris-stop")), /assumed airports/i);
  trip.brief.intent!.route.tripType = "one_way"; trip.brief.journeyEnd = { mode: "unknown" }; trip.legs = trip.legs.slice(0, 1);
  assert.equal(render(trip).endpoint, undefined);
});
