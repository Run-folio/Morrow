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
import { resolveCanonicalRoadFallback, resolveCanonicalRoadFallbacks } from "../lib/easyt/road-transfer-resolution.ts";
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
      coordinates: from.longitude !== null && from.latitude !== null ? [from.longitude, from.latitude] : null,
    },
    stops: [from, to],
  }).find((leg) => leg.fromStopId === from.id && leg.toStopId === to.id)!;
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
  const huacachina = stop("huacachina", 0, "Huacachina", "Peru", [-75.768, -14.088]);
  const lima = stop("lima", 1, "Lima", "Peru", [-77.043, -12.046]);
  const unresolved = unresolvedInternalLeg(huacachina, lima, "huacachina-lima");
  assert.equal(unresolved.mode, "unknown");
  assert.equal(unresolved.routeMetadata.roadFallbackEligible, true);

  const provider = new FixtureProvider(routedResult);
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider });
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
  const hiroshima = stop("hiroshima", 0, "Hiroshima", "Japan", [132.4553, 34.3853]);
  const kyoto = stop("kyoto", 1, "Kyoto", "Japan", [135.7681, 35.0116]);
  const unresolved = unresolvedInternalLeg(hiroshima, kyoto, "hiroshima-kyoto");
  const result = normalizeOpenRouteServiceRoute({
    features: [{ properties: { summary: { distance: 361_000, duration: 15_600 } }, geometry: { type: "LineString", coordinates: [[132.4553, 34.3853], [134.1, 34.7], [135.7681, 35.0116]] } }],
  }, "2026-09-01T12:00:00.000Z", "driving-car");
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider: new FixtureProvider(result) });
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 255);
});

test("a legacy planner-owned unsupported-rail leg can be healed without touching authored unknowns", async () => {
  const from = stop("legacy-from", 0, "Legacy From", "Peru", [-75.768, -14.088]);
  const to = stop("legacy-to", 1, "Legacy To", "Peru", [-77.043, -12.046]);
  const current = unresolvedInternalLeg(from, to, "legacy-road");
  const legacy = { ...current, routeMetadata: { ...current.routeMetadata } };
  delete legacy.routeMetadata.roadFallbackEligible;
  const provider = new FixtureProvider(routedResult);
  assert.equal((await resolveCanonicalRoadFallback(legacy, { provider })).leg.mode, "road");

  const authored = { ...legacy, provider: "Traveller left this transfer open.", routeMetadata: { source: "traveller-authored" } };
  assert.equal((await resolveCanonicalRoadFallback(authored, { provider })).leg.mode, "unknown");
  assert.equal(provider.calls.length, 1);
});

test("a cross-water no-route response retains the honest unresolved fallback", async () => {
  const palermo = stop("palermo", 0, "Palermo", "Italy", [13.3615, 38.1157]);
  const naples = stop("naples", 1, "Naples", "Italy", [14.2681, 40.8518]);
  const unresolved = unresolvedInternalLeg(palermo, naples, "cross-water");
  const provider = new FixtureProvider(new RoadRoutingError("no_route"));
  const resolved = await resolveCanonicalRoadFallback(unresolved, { provider });
  assert.equal(resolved.outcome, "unchanged");
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(resolved.leg.durationMinutes, null);
  assert.equal(provider.calls.length, 1);
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
  assert.equal(resolved.reason, "missing_coordinates");
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
  const from = stop("safe-from", 0, "Safe From", "Peru", [-75.768, -14.088]);
  const to = stop("safe-to", 1, "Safe To", "Peru", [-77.043, -12.046]);
  const unresolved = unresolvedInternalLeg(from, to, "implausible-road");
  const implausible = { ...routedResult, distanceKm: 1_700, durationMinutes: 255 };
  const provider = new FixtureProvider(implausible);
  const rejected = await resolveCanonicalRoadFallback(unresolved, { provider });
  assert.equal(rejected.reason, "implausible_route");
  assert.equal(rejected.leg.mode, "unknown");

  const crossBorder: TripLeg = {
    ...unresolved,
    toEndpoint: { ...unresolved.toEndpoint!, country: "Chile" },
  };
  const blocked = await resolveCanonicalRoadFallback(crossBorder, { provider });
  assert.equal(blocked.reason, "cross_border");
  assert.equal(provider.calls.length, 1);
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
  assert.match(source, /road: CarFront/);
  assert.match(source, /mixed: Route/);
  assert.match(source, /unknown: CircleHelp/);
  assert.match(source, /segment\.routeGeometry\?\.length \? segment\.routeGeometry/);
});
