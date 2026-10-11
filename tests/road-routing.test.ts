import { selectedTransferPlace } from "./fixtures/accepted-transfer-place.ts";
import { geographicallyReady } from "../lib/easyt/geographic-binding.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import {
  OpenRouteServiceRoadRoutingProvider,
  RoadRoutingError,
  normalizeOpenRouteServiceRoute,
  resolveOpenRouteServiceConfiguration,
  type RoadRouteRequest,
  type RoadRouteResult,
  type RoadRoutingProvider,
} from "../lib/easyt/road-routing.ts";
import { directRoadPlausibilityConflict, resolveCanonicalRoadFallback, resolveCanonicalRoadFallbacks } from "../lib/easyt/road-transfer-resolution.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import type { EasyTTrip, TripLeg, TripStop } from "../lib/easyt/trip.ts";

const configuration = {
  apiBaseUrl: "https://api.heigit.org/openrouteservice/v2" as const,
  apiKey: "test-server-key",
  providerVersion: "v2" as const,
};

const geoJson = (distanceMetres = 305_000, durationSeconds = 15_120) => ({
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: { summary: { distance: distanceMetres, duration: durationSeconds } },
    geometry: { type: "LineString", coordinates: [[-75.768, -14.088], [-76.5, -13.2], [-77.043, -12.046]] },
  }],
});

const stop = (id: string, order: number, name: string, country: string, coordinates?: [number, number]): TripStop => ({
  id,
  order,
  name,
  country,
  canonicalPlaceId: id,
  latitude: coordinates?.[1] ?? null,
  longitude: coordinates?.[0] ?? null,
  arrivalDate: null,
  departureDate: null,
  nights: 2,
});

function unresolvedInternalLeg(
  from: TripStop,
  to: TripStop,
  tripId = "road-test",
) {
  return buildCanonicalTripLegs({
    tripId,
    origin: {
      name: from.name,
      country: from.country,
      canonicalPlaceId: from.canonicalPlaceId,
      providerId: from.providerId, geographicBinding: from.geographicBinding,
      coordinates: from.longitude !== null && from.latitude !== null ? [from.longitude, from.latitude] : null,
    },
    stops: [from, to],
  }).find((leg) => leg.fromStopId === from.id && leg.toStopId === to.id)!;
}

// Exact compiled Discovery/route points already used by canonical geography.
// No provider binding is synthesized for these curated place identities.
function peruCorridor() {
  const from = stop("huacachina", 0, "Huacachina", "Peru", [-75.7642, -14.0875]);
  const to = stop("lima", 1, "Lima", "Peru", [-77.0428, -12.0464]);
  return [from, to] as const;
}
function selectedStop(id: string, order: number, name: string, country: string, referenceId: string): TripStop {
  const selected = selectedTransferPlace(name, country, referenceId, "stop");
  return { ...stop(id, order, selected.name, country, selected.coordinates),
    canonicalPlaceId: selected.canonicalPlaceId, providerId: selected.providerId, geographicBinding: selected.geographicBinding };
}
function assertReadyRoadStage(leg: TripLeg) {
  for (const endpoint of [leg.fromEndpoint, leg.toEndpoint]) {
    assert.ok(endpoint);
    assert.equal(geographicallyReady({ ...endpoint, coordinates: endpoint.coordinates ?? undefined }, "stop"), true);
  }
  assert.equal(leg.mode, "unknown");
  assert.equal(leg.durationMinutes, null);
  assert.equal(leg.routeMetadata.source, "morrovia-planner");
  assert.equal(leg.routeMetadata.roadFallbackEligible, true);
}
function assertRequestedEndpoints(provider: FixtureProvider, leg: TripLeg) {
  assert.equal(provider.calls.length, 1);
  assert.equal(provider.calls[0].origin.canonicalIdentity, leg.fromEndpoint!.canonicalPlaceId);
  assert.equal(provider.calls[0].destination.canonicalIdentity, leg.toEndpoint!.canonicalPlaceId);
  assert.deepEqual(provider.calls[0].origin.coordinates, leg.fromEndpoint!.coordinates);
  assert.deepEqual(provider.calls[0].destination.coordinates, leg.toEndpoint!.coordinates);
}

class FixtureProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  calls: RoadRouteRequest[] = [];
  private readonly result: RoadRouteResult | Error;
  constructor(result: RoadRouteResult | Error) { this.result = result; }
  async route(input: RoadRouteRequest) {
    this.calls.push(input);
    if (this.result instanceof Error) throw this.result;
    return structuredClone(this.result);
  }
}

const routedResult: RoadRouteResult = normalizeOpenRouteServiceRoute(
  geoJson(),
  "2026-09-01T12:00:00.000Z",
  "driving-car",
);

test("OpenRouteService GeoJSON normalizes to useful rounded road planning facts", () => {
  assert.equal(routedResult.mode, "road");
  assert.equal(routedResult.distanceKm, 305);
  assert.equal(routedResult.durationMinutes, 255);
  assert.equal(routedResult.provenance, "routed");
  assert.equal(routedResult.routeGeometry.length, 3);
});

test("road routing selects only the server-side credential", () => {
  assert.equal(resolveOpenRouteServiceConfiguration({ OPENROUTESERVICE_API_KEY: "server-value", NEXT_PUBLIC_OPENROUTESERVICE_API_KEY: "public-value" }).apiKey, "server-value");
  assert.throws(
    () => resolveOpenRouteServiceConfiguration({ NEXT_PUBLIC_OPENROUTESERVICE_API_KEY: "public-only" }),
    (error: unknown) => error instanceof RoadRoutingError && error.category === "configuration",
  );
});

test("Huacachina to Lima resolves from unknown to one canonical road leg", async () => {
  const [huacachina, lima] = peruCorridor();
  const unresolved = JSON.parse(JSON.stringify(unresolvedInternalLeg(huacachina, lima, "huacachina-lima"))) as TripLeg;
  assertReadyRoadStage(unresolved);
  assert.equal(unresolved.mode, "unknown");
  assert.equal(unresolved.routeMetadata.roadFallbackEligible, true);

  const geometry: [number, number][] = [unresolved.fromEndpoint!.coordinates!, [-76.5, -13.2], unresolved.toEndpoint!.coordinates!];
  const provider = new FixtureProvider({ ...routedResult, routeGeometry: geometry });
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider });
  assertRequestedEndpoints(provider, unresolved);
  assert.deepEqual(resolved.leg.routeGeometry, geometry);
  assert.equal(resolved.outcome, "resolved");
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 255);
  assert.equal(resolved.leg.distanceKm, 305);
  assert.equal(resolved.leg.routedDistanceKm, 305);
  assert.equal(resolved.leg.provenance, "routing_engine");
  assert.equal(resolved.leg.confidence, "medium");
  assert.equal(resolved.leg.routeGeometry?.length, 3);
  assert.equal(provider.calls.length, 1);

  const trip = {
    id: "huacachina-lima",
    brief: { origin: "Huacachina", originCountry: "Peru", originCoordinates: [-75.768, -14.088] },
    stops: [huacachina, lima],
    legs: [resolved.leg],
  } as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  const mapped = mapRouteLegsFromTrip(trip).find((leg) => leg.id === resolved.leg.id);
  assert.equal(mapped?.mode, "road");
  assert.equal(mapped?.modeLabel, "Road");
  assert.equal(mapped?.distanceKm, 305);
  assert.deepEqual(mapped?.routeGeometry, resolved.leg.routeGeometry);
});

test("a supported flight remains flight and never invokes road routing", async () => {
  const flight: TripLeg = {
    id: "flight",
    fromStopId: "lima",
    toStopId: "tokyo",
    mode: "flight",
    distanceKm: 15_000,
    durationMinutes: 1_200,
    fromEndpoint: { kind: "stop", id: "lima", name: "Lima", country: "Peru", coordinates: [-77.043, -12.046] },
    toEndpoint: { kind: "stop", id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
    provider: "Supported flight estimate",
    routeMetadata: { source: "morrovia-planner", roadFallbackEligible: true },
  };
  const provider = new FixtureProvider(routedResult);
  const [resolved] = await resolveCanonicalRoadFallbacks([flight], { provider });
  assert.equal(resolved.mode, "flight");
  assert.equal(provider.calls.length, 0);
});

test("a second land-connected pair resolves when the provider succeeds", async () => {
  const austin = selectedStop("austin", 0, "Austin", "United States", "reference:geonames:4671654");
  const dallas = selectedStop("dallas", 1, "Dallas", "United States", "reference:geonames:4684888");
  const unresolved = JSON.parse(JSON.stringify(unresolvedInternalLeg(austin, dallas, "austin-dallas"))) as TripLeg;
  assertReadyRoadStage(unresolved);
  const result = normalizeOpenRouteServiceRoute({
    features: [{ properties: { summary: { distance: 305_000, duration: 15_300 } }, geometry: { type: "LineString", coordinates: [unresolved.fromEndpoint!.coordinates!, [-97.2, 31.5], unresolved.toEndpoint!.coordinates!] } }],
  }, "2026-09-01T12:00:00.000Z", "driving-car");
  const provider = new FixtureProvider(result);
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider });
  assertRequestedEndpoints(provider, unresolved);
  assert.equal(resolved.outcome, "resolved");
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 255);
  assert.equal(resolved.leg.distanceKm, 305);
  assert.equal(resolved.leg.provenance, "routing_engine");
  assert.deepEqual(resolved.leg.routeGeometry, result.routeGeometry);
});

test("a legacy planner-owned unsupported-rail leg can be healed without touching authored unknowns", async () => {
  const [from, to] = peruCorridor();
  const current = unresolvedInternalLeg(from, to, "legacy-road");
  assertReadyRoadStage(current);
  const legacy = { ...current, routeMetadata: { ...current.routeMetadata } };
  delete legacy.routeMetadata.roadFallbackEligible;
  const provider = new FixtureProvider({ ...routedResult, routeGeometry: [legacy.fromEndpoint!.coordinates!, [-76.5, -13.2], legacy.toEndpoint!.coordinates!] });
  assert.equal((await resolveCanonicalRoadFallback(legacy, { provider })).leg.mode, "road");

  const authored = { ...legacy, provider: "Traveller left this transfer open.", routeMetadata: { source: "traveller-authored" } };
  assert.deepEqual((await resolveCanonicalRoadFallback(authored, { provider })).leg, authored);
  assertRequestedEndpoints(provider, legacy);
  assert.equal(provider.calls.length, 1);
});

test("accepted Palermo to Naples stays protected before a car provider call", async () => {
  const palermo = selectedStop("palermo", 0, "Palermo", "Italy", "reference:geonames:2523920");
  const naples = selectedStop("naples", 1, "Naples", "Italy", "reference:geonames:3172394");
  const unresolved = unresolvedInternalLeg(palermo, naples, "cross-water");
  const provider = new FixtureProvider(new RoadRoutingError("no_route"));
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider });
  assert.equal(resolved.outcome, "unchanged");
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(resolved.leg.durationMinutes, null);
  assert.equal(directRoadPlausibilityConflict(unresolved), "land_separation");
  assert.equal(resolved.reason, "explicit_or_unsupported_source");
  assert.equal(provider.calls.length, 0);
  assert.equal(resolved.leg.routeGeometry, undefined);
});

test("same-land provider no-route retains the honest unresolved fallback", async () => {
  const [from, to] = peruCorridor();
  const unresolved = unresolvedInternalLeg(from, to, "provider-no-route");
  assertReadyRoadStage(unresolved);
  const provider = new FixtureProvider(new RoadRoutingError("no_route"));
  const result = await resolveCanonicalRoadFallback(unresolved, { provider });
  assertRequestedEndpoints(provider, unresolved);
  assert.equal(result.outcome, "unchanged");
  assert.equal(result.reason, "provider_no_route");
  assert.equal(result.leg.mode, "unknown");
  assert.equal(result.leg.durationMinutes, null);
  assert.equal(result.estimate, undefined);
  assert.equal(result.leg.routeGeometry, undefined);
});

test("missing coordinates skip the provider and safely remain unresolved", async () => {
  const leg: TripLeg = {
    id: "missing-coordinates",
    fromStopId: "a",
    toStopId: "b",
    mode: "unknown",
    distanceKm: null,
    durationMinutes: null,
    provider: null,
    fromEndpoint: { kind: "stop", id: "a", name: "A", country: "Peru", coordinates: null },
    toEndpoint: { kind: "stop", id: "b", name: "B", country: "Peru", coordinates: [-77, -12] },
    routeMetadata: { source: "morrovia-planner", roadFallbackEligible: true },
  };
  const provider = new FixtureProvider(routedResult);
  const resolved = await resolveCanonicalRoadFallback(leg, { provider });
  assert.equal(resolved.reason, "unverified_geography");
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(provider.calls.length, 0);
});

test("provider timeout and malformed responses are classified without raw bodies", async () => {
  const timeoutClient = new OpenRouteServiceRoadRoutingProvider(configuration, {
    request: async () => await new Promise<Response>(() => undefined),
    timeoutMs: 5,
    cache: new Map(),
  });
  const request: RoadRouteRequest = {
    origin: { canonicalIdentity: "huacachina", coordinates: [-75.768, -14.088] },
    destination: { canonicalIdentity: "lima", coordinates: [-77.043, -12.046] },
  };
  await assert.rejects(() => timeoutClient.route(request), (error: unknown) => error instanceof RoadRoutingError && error.category === "timeout" && !error.message.includes("body"));

  const malformedClient = new OpenRouteServiceRoadRoutingProvider(configuration, {
    request: async () => new Response(JSON.stringify({ unexpected: "provider payload" }), { status: 200 }),
    cache: new Map(),
  });
  await assert.rejects(() => malformedClient.route(request), (error: unknown) => error instanceof RoadRoutingError && error.category === "malformed" && !error.message.includes("provider payload"));
});

test("authentication, rate limit, network failure and no-route statuses stay typed", async () => {
  const request: RoadRouteRequest = {
    origin: { canonicalIdentity: "huacachina", coordinates: [-75.768, -14.088] },
    destination: { canonicalIdentity: "lima", coordinates: [-77.043, -12.046] },
  };
  const expectations = [[401, "authentication"], [429, "rate_limited"], [500, "unavailable"], [422, "no_route"]] as const;
  for (const [status, category] of expectations) {
    const client = new OpenRouteServiceRoadRoutingProvider(configuration, {
      request: async () => new Response("provider details must not escape", { status }),
      cache: new Map(),
    });
    await assert.rejects(() => client.route(request), (error: unknown) => error instanceof RoadRoutingError
      && error.category === category
      && !error.message.includes("provider details"));
  }
  const networkClient = new OpenRouteServiceRoadRoutingProvider(configuration, {
    request: async () => { throw new Error("private network detail"); },
    cache: new Map(),
  });
  await assert.rejects(() => networkClient.route(request), (error: unknown) => error instanceof RoadRoutingError
    && error.category === "unavailable"
    && !error.message.includes("private network detail"));
});

test("implausible and cross-border results are rejected conservatively", async () => {
  const [from, to] = peruCorridor();
  const unresolved = unresolvedInternalLeg(from, to, "implausible-road");
  assertReadyRoadStage(unresolved);
  const implausible = { ...routedResult, distanceKm: 1_700, durationMinutes: 255 };
  const provider = new FixtureProvider(implausible);
  const rejected = await resolveCanonicalRoadFallback(unresolved, { provider });
  assert.equal(rejected.reason, "implausible_route");
  assert.equal(rejected.leg.mode, "unknown");

  assertRequestedEndpoints(provider, unresolved);
  const tacna = selectedStop("tacna", 0, "Tacna", "Peru", "reference:geonames:3928128");
  const arica = selectedStop("arica", 1, "Arica", "Chile", "reference:geonames:3899361");
  // Direct resolver policy-stage fixture: selected endpoint identities are real;
  // canonical construction currently chooses air, so this does not claim it
  // naturally produces an unresolved road candidate for Tacna–Arica.
  const constructedCrossBorder = unresolvedInternalLeg(tacna, arica, "selected-cross-border");
  const crossBorder: TripLeg = { ...constructedCrossBorder, mode: "unknown", durationMinutes: null,
    provider: "Rail could be considered for this distance, but no supported service fact for this exact leg.",
    routeMetadata: { source: "morrovia-planner" } };
  for (const endpoint of [crossBorder.fromEndpoint, crossBorder.toEndpoint]) {
    assert.ok(endpoint);
    assert.equal(geographicallyReady({ ...endpoint, coordinates: endpoint.coordinates ?? undefined }, "stop"), true);
  }
  const blocked = await resolveCanonicalRoadFallback(crossBorder, { provider });
  assert.equal(blocked.reason, "cross_border");
  assert.equal(provider.calls.length, 1);
});

test("road routing is skipped when either endpoint country is unknown", async () => {
  const [from, to] = peruCorridor();
  const unresolved = unresolvedInternalLeg(from, to, "unknown-country");
  assertReadyRoadStage(unresolved);
  const withoutOriginCountry = {
    ...unresolved,
    fromEndpoint: { ...unresolved.fromEndpoint!, country: undefined },
  };
  const withoutDestinationCountry = {
    ...unresolved,
    toEndpoint: { ...unresolved.toEndpoint!, country: undefined },
  };

  for (const leg of [withoutOriginCountry, withoutDestinationCountry]) {
    const provider = new FixtureProvider(routedResult);
    const result = await resolveCanonicalRoadFallback(leg, { provider });

    assert.equal(result.reason, "unverified_geography");
    assert.equal(result.outcome, "unchanged");
    assert.equal(result.leg.mode, "unknown");
    assert.equal(result.estimate, undefined);
    assert.equal(provider.calls.length, 0);
  }
});

test("successful repeated routes use the bounded provider cache and send only routing geography", async () => {
  let calls = 0;
  let providerBody: Record<string, unknown> | null = null;
  const client = new OpenRouteServiceRoadRoutingProvider(configuration, {
    request: async (_url, init) => {
      calls += 1;
      providerBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      assert.equal((init?.headers as Record<string, string>).Authorization, "test-server-key");
      return new Response(JSON.stringify(geoJson()), { status: 200 });
    },
    cache: new Map(),
    cacheTtlMs: 60_000,
  });
  const request: RoadRouteRequest = {
    origin: { canonicalIdentity: "huacachina", coordinates: [-75.768, -14.088] },
    destination: { canonicalIdentity: "lima", coordinates: [-77.043, -12.046] },
  };
  await client.route(request);
  await client.route(request);
  assert.equal(calls, 1);
  assert.deepEqual(Object.keys(providerBody ?? {}).sort(), ["coordinates", "instructions", "options"]);
  assert.equal(JSON.stringify(providerBody).includes("huacachina"), false);
  assert.equal(JSON.stringify(providerBody).includes("test-server-key"), false);
});

test("the Map marker registry uses the canonical road icon and keeps unknown fallback distinct", () => {
  const source = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");
  const icons = readFileSync(new URL("../components/easyt/morrovia-transport-icons.ts", import.meta.url), "utf8");
  assert.match(icons, /road: CarFront/);
  assert.match(icons, /mixed: Route/);
  assert.match(icons, /unknown: CircleHelp/);
  assert.match(source, /mapTransportIcon\(leg\.mode\)/);
  assert.match(source, /segment\.routeGeometry\?\.length \? segment\.routeGeometry/);
});

test("historical raw road fixtures remain unverified zero-call negatives", async () => {
  const pairs = [
    [stop("huacachina", 0, "Huacachina", "Peru", [-75.768, -14.088]), stop("lima", 1, "Lima", "Peru", [-77.043, -12.046])],
    [stop("austin", 0, "Austin", "United States", [-97.7431, 30.2672]), stop("dallas", 1, "Dallas", "United States", [-96.797, 32.7767])],
    [stop("legacy-from", 0, "Legacy From", "Peru", [-75.768, -14.088]), stop("legacy-to", 1, "Legacy To", "Peru", [-77.043, -12.046])],
    [stop("safe-from", 0, "Safe From", "Peru", [-75.768, -14.088]), stop("safe-to", 1, "Safe To", "Peru", [-77.043, -12.046])],
  ];
  for (const [from, to] of pairs) {
    const raw = unresolvedInternalLeg(from!, to!, "historical-raw");
    const variants = [raw, { ...raw, toEndpoint: { ...raw.toEndpoint!, country: "Chile" } }];
    if (from!.id === "legacy-from") {
      const legacy = structuredClone(raw); delete legacy.routeMetadata.roadFallbackEligible; variants.push(legacy);
    }
    for (const leg of variants) {
      const provider = new FixtureProvider(routedResult);
      const result = await resolveCanonicalRoadFallback(leg, { provider });
      assert.equal(result.reason, "unverified_geography");
      assert.equal(result.outcome, "unchanged");
      assert.equal(result.leg.fromEndpoint?.id, leg.fromEndpoint?.id);
      assert.equal(result.leg.toEndpoint?.id, leg.toEndpoint?.id);
      assert.equal(result.leg.routeGeometry, undefined);
      assert.equal(result.leg.roadEstimate, undefined);
      assert.equal(result.leg.mode, "unknown");
      assert.equal(result.leg.durationMinutes, null);
      assert.equal(provider.calls.length, 0);
    }
  }
});

test("historical Palermo to Naples points cannot require a direct-car request", async () => {
  const raw = unresolvedInternalLeg(stop("palermo", 0, "Palermo", "Italy", [13.3615, 38.1157]), stop("naples", 1, "Naples", "Italy", [14.2681, 40.8518]), "historical-cross-water");
  const provider = new FixtureProvider(new RoadRoutingError("no_route"));
  const result = await resolveCanonicalRoadFallback(raw, { provider });
  assert.equal(directRoadPlausibilityConflict(raw), "land_separation");
  assert.equal(result.outcome, "unchanged");
  assert.equal(result.leg.mode, "unknown");
  assert.equal(result.leg.durationMinutes, null);
  assert.equal(provider.calls.length, 0);
});
