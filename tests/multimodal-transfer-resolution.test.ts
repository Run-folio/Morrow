import { selectedTransferPlace } from './fixtures/accepted-transfer-place.ts';
import assert from "node:assert/strict";
import test from "node:test";

import {
  createDestinationKnowledgeStore,
  knownKnowledgeFact,
  unknownKnowledgeFact,
  type DestinationTransferKnowledge,
  type KnowledgeSource,
} from "../lib/easyt/destination-knowledge.ts";
import { mapRouteLegsFromTrip } from "../lib/easyt/map-spatial-context.ts";
import {
  resolveCanonicalTransferJourney,
  resolveTripTransferJourneys,
} from "../lib/easyt/multimodal-transfer-resolution.ts";
import {
  canonicalTransferSegments,
  transferJourneyModeLabel,
  transferJourneySegmentSummary,
} from "../lib/easyt/transfer-journey.ts";
import { RoadRoutingError, type RoadRouteRequest, type RoadRouteResult, type RoadRoutingProvider } from "../lib/easyt/road-routing.ts";
import { buildCanonicalTripLegs } from "../lib/easyt/trip-legs.ts";
import { isEasyTTrip, type EasyTTrip, type TripLeg, type TripStop } from "../lib/easyt/trip.ts";
import { a17TripFixture } from './fixtures/batch14-a17-trip.ts';
import { prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';

test('trip save preserves the exact pending necessary prefix while the explicit worker can resolve it',async()=>{
 const initial=a17TripFixture();const removal=prepareBuilderHandlerEdit(initial,{kind:'remove-destination',intentId:'intent:hue'},builderDocumentFingerprint(initial));assert.ok(removal.ok);
 const prefix=removal.trip;const pending=prefix.legs.filter(leg=>leg.routeMetadata.source==='necessary-reconciliation');assert.ok(pending.length);
 const provider=new FixtureRoadProvider();const saved=await resolveTripTransferJourneys(prefix,{provider});
 for(const leg of pending)assert.deepEqual(saved.legs.find(item=>item.id===leg.id),leg);
 assert.equal(provider.calls.length,0,'saving a pending prefix must not request its provider');
 const direct=await resolveCanonicalTransferJourney(pending.at(-1)!);assert.equal(direct.outcome,'unresolved','the worker assesses the raw fixture without promoting unverified geography');assert.equal(direct.leg.mode,'unknown');
 for(const control of ['source-only','pending-only'] as const){
  const leg=structuredClone(pending.at(-1)!);if(control==='source-only')delete leg.routeMetadata.pending;else leg.routeMetadata.source='morrovia-planner';
  const result=await resolveTripTransferJourneys({...prefix,legs:[leg]});assert.equal(result.legs[0].mode,'unknown',control);assert.equal(result.legs[0].routeMetadata.source,'unverified-geography');
 }
 const eligible=structuredClone(baseline(laPaz,lima));eligible.id='eligible-eighth';eligible.routeMetadata.source='morrovia-planner';delete eligible.routeMetadata.pending;
 const ninth={...structuredClone(eligible),id:'eligible-ninth'};
 const ordered=[...Array.from({length:7},(_,index)=>({...structuredClone(pending[0]),id:`held-${index}`})),eligible,ninth];
 const mixed=await resolveTripTransferJourneys({...prefix,legs:ordered});assert.deepEqual(mixed.legs.map(leg=>leg.id),ordered.map(leg=>leg.id));
 assert.notEqual(mixed.legs[7].mode,'unknown');assert.deepEqual(mixed.legs[8],ninth,'pending preservation must not compress the first-eight resolution limit');
});

const checkedAt = "2026-09-01T12:00:00.000Z";

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

function baseline(from: TripStop, to: TripStop, tripId = `${from.id}-${to.id}`) {
  return buildCanonicalTripLegs({
    tripId,
    origin: { name: from.name, country: from.country, canonicalPlaceId: from.canonicalPlaceId, providerId:from.providerId,geographicBinding:from.geographicBinding, coordinates: from.longitude !== null && from.latitude !== null ? [from.longitude, from.latitude] : null },
    stops: [to],
  })[0];
}

function roadResult(input: RoadRouteRequest, distanceKm = 305, durationMinutes = 255): RoadRouteResult {
  return {
    mode: "road",
    distanceKm,
    durationMinutes,
    confidence: "medium",
    provenance: "routed",
    provider: "openrouteservice",
    providerCheckedAt: checkedAt,
    profile: "driving-car",
    routeGeometry: [input.origin.coordinates, input.destination.coordinates],
    attribution: "Test OpenRouteService attribution",
  };
}

class FixtureRoadProvider implements RoadRoutingProvider {
  readonly provider = "openrouteservice" as const;
  calls: RoadRouteRequest[] = [];
  private readonly handler: (input: RoadRouteRequest) => RoadRouteResult | Error;
  constructor(handler: (input: RoadRouteRequest) => RoadRouteResult | Error = (input) => roadResult(input)) { this.handler = handler; }
  async route(input: RoadRouteRequest) {
    this.calls.push(input);
    const result = this.handler(input);
    if (result instanceof Error) throw result;
    return structuredClone(result);
  }
}

const huacachina = stop("huacachina", 0, "Huacachina", "Peru", [-75.7642, -14.0875]);
const lima = stop("lima", 1, "Lima", "Peru", [-77.0428, -12.0464]);
const hiroshima = stop("hiroshima", 0, "Hiroshima", "Japan", [132.4553, 34.3853]);
const kyoto = stop("kyoto", 1, "Kyoto", "Japan", [135.7681, 35.0116]);
const laPaz = stop("la-paz", 0, "La Paz", "Bolivia", [-68.1193, -16.4897]);
const athens = stop("athens", 0, "Athens", "Greece", [23.7275, 37.9838]);
const naxos = stop("naxos", 1, "Naxos", "Greece", [25.376, 37.1036]);
const paros = stop("paros", 1, "Paros", "Greece", [25.1503, 37.085]);

test("Huacachina to Lima selects routed road when the traveller prefers driving", async () => {
  const provider = new FixtureRoadProvider();
  const leg = baseline(huacachina, lima);
  leg.routeMetadata.transportConstraints = { preferredModes: ["road"] };
  const resolved = await resolveCanonicalTransferJourney(leg, { provider });
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 255);
  assert.equal(resolved.leg.distanceKm, 305);
  assert.equal(resolved.leg.segments?.length, 1);
  assert.equal(resolved.leg.segments?.[0]?.mode, "road");
  assert.equal(transferJourneyModeLabel(resolved.leg), "Road");
  assert.equal(provider.calls.length, 1);
});

test("Hiroshima to Kyoto selects reviewed sub-six-hour rail without redundant road routing", async () => {
  const provider = new FixtureRoadProvider();
  const first = await resolveCanonicalTransferJourney(baseline(hiroshima, kyoto), { provider });
  const second = await resolveCanonicalTransferJourney(baseline(hiroshima, kyoto), { provider });
  assert.equal(first.leg.mode, "train");
  assert.equal(first.leg.durationMinutes, 165);
  assert.equal(first.leg.confidence, "medium");
  assert.equal(first.diagnostic.selectedCandidateId, "rail:network:japan-high-speed-intercity");
  assert.deepEqual(first.diagnostic, second.diagnostic);
  assert.equal(provider.calls.length, 0);
});

test("hard transport constraints filter candidates before provider work", async () => {
  const provider = new FixtureRoadProvider();
  const leg = baseline(hiroshima, kyoto);
  leg.routeMetadata.transportConstraints = { avoidDriving: true, excludedModes: ["train"], preferredModes: [] };
  const result = await resolveCanonicalTransferJourney(leg, { provider });
  assert.equal(result.leg.mode, "unknown");
  assert.equal(provider.calls.length, 0);
});

test("La Paz to Huacachina composes flight to Lima plus provider-routed ground access", async () => {
  const provider = new FixtureRoadProvider();
  const original = baseline(laPaz, huacachina);
  assert.equal(original.mode, "flight");
  const resolved = await resolveCanonicalTransferJourney(original, { provider });
  assert.equal(resolved.leg.mode, "mixed");
  assert.deepEqual(resolved.leg.segments?.map((item) => item.mode), ["flight", "road"]);
  assert.equal(resolved.leg.segments?.[0]?.toEndpoint.name, "Lima");
  assert.equal(resolved.leg.segments?.[1]?.toEndpoint.name, "Huacachina");
  assert.equal(resolved.leg.toEndpoint?.name, "Huacachina");
  assert.equal(resolved.leg.durationMinutes, 525);
  assert.equal(transferJourneyModeLabel(resolved.leg), "Flight + road");
  assert.equal(transferJourneySegmentSummary(resolved.leg), "Flight to Lima · Ground transfer to Huacachina");
  assert.equal(provider.calls.length, 1);

  const trip = { id: "mixed-trip", brief: { origin: "La Paz" }, stops: [huacachina], legs: [resolved.leg] } as Pick<EasyTTrip, "id" | "brief" | "stops" | "legs">;
  const mapped = mapRouteLegsFromTrip(trip)[0];
  assert.equal(mapped.mode, "mixed");
  assert.equal(mapped.modeLabel, "Flight + road");
  assert.deepEqual(mapped.routeSegments?.map((item) => item.mode), ["flight", "road"]);
});

test("a normal direct-air journey remains flight", async () => {
  const resolved = await resolveCanonicalTransferJourney(baseline(laPaz, lima), { provider: new FixtureRoadProvider() });
  assert.equal(resolved.leg.mode, "flight");
  assert.equal(resolved.leg.segments?.[0]?.toEndpoint.name, "Lima");
});

test("a short land journey selects routed road when driving is preferred", async () => {
  const from = stop("short-a", 0, "Short A", "Testland", [0, 0]);
  const to = stop("short-b", 1, "Short B", "Testland", [0.25, 0]);
  const provider = new FixtureRoadProvider((input) => roadResult(input, 32, 45));
  const leg = baseline(from, to);
  leg.routeMetadata.transportConstraints = { preferredModes: ["road"] };
  const resolved = await resolveCanonicalTransferJourney(leg, { provider });
  assert.equal(resolved.leg.mode, "road");
  assert.equal(resolved.leg.durationMinutes, 45);
});

test("catalogued island endpoints cannot become direct road legs without crossing evidence", async () => {
  const provider = new FixtureRoadProvider((input) => roadResult(input, 175, 210));
  const mainlandToIsland = await resolveCanonicalTransferJourney(baseline(athens, naxos), { provider });
  const islandToMainland = await resolveCanonicalTransferJourney(baseline(naxos, athens), { provider });
  const islandToIsland = await resolveCanonicalTransferJourney(baseline(naxos, paros), { provider });

  for (const resolved of [mainlandToIsland, islandToMainland, islandToIsland]) {
    assert.equal(resolved.leg.mode, "unknown");
    assert.equal(resolved.leg.durationMinutes, null);
    assert.match(resolved.leg.provider ?? "", /plausible road route could not be established/i);
  }
  assert.equal(provider.calls.length, 0, "semantic land separation should reject the car-only candidate before provider work");
});

test("exact supported ferry evidence can resolve without inventing a service", async () => {
  const source: KnowledgeSource = { id: "test:ferry", label: "Test ferry evidence", kind: "curated", supports: "Exact fixture ferry." };
  const transfer: DestinationTransferKnowledge = {
    fromCanonicalId: "reference:geonames:1716834",
    toCanonicalId: "reference:geonames:1716397",
    mode: knownKnowledgeFact("ferry", "static", source),
    planningMinutes: knownKnowledgeFact(120, "estimated", source),
    durationBasis: knownKnowledgeFact("door-to-door", "static", source),
    realisticRangeMinutes: unknownKnowledgeFact("Not needed for fixture."),
    borderFriction: unknownKnowledgeFact("Not needed for fixture."),
    note: knownKnowledgeFact("Supported ferry planning allowance; verify sailing.", "static", source),
  };
  const knowledge = createDestinationKnowledgeStore({
    destinations: [],
    destinationOverrides: [
      { canonicalId: "reference:geonames:1716834", name: "Coron" },
      { canonicalId: "reference:geonames:1716397", name: "Cuyo" },
    ],
    transfers: [transfer],
  });
  const a=selectedTransferPlace('Coron','Philippines','reference:geonames:1716834','endpoint'),b=selectedTransferPlace('Cuyo','Philippines','reference:geonames:1716397','stop');
  const islandA={...stop(a.canonicalPlaceId!,0,a.name,a.country!,a.coordinates!),providerId:a.providerId,geographicBinding:a.geographicBinding};
  const islandB={...stop(b.canonicalPlaceId!,1,b.name,b.country!,b.coordinates!),providerId:b.providerId,geographicBinding:b.geographicBinding};
  const resolved = await resolveCanonicalTransferJourney(baseline(islandA, islandB), { knowledge });
  assert.equal(resolved.leg.mode, "ferry");
  assert.equal(resolved.leg.durationMinutes, 120);
});
test('test-only ferry facts cannot qualify invented island geography',async()=>{
  const a=stop('island-a',0,'Island A','Archipelago',[0,0]),b=stop('island-b',1,'Island B','Archipelago',[0.5,0]);
  const source:KnowledgeSource={id:'test:raw-islands',label:'Synthetic transfer fact',kind:'curated',supports:'A transport fixture is not endpoint evidence.'};
  const knowledge=createDestinationKnowledgeStore({destinations:[],destinationOverrides:[{canonicalId:'island-a',name:'Island A'},{canonicalId:'island-b',name:'Island B'}],transfers:[{fromCanonicalId:'island-a',toCanonicalId:'island-b',mode:knownKnowledgeFact('ferry','static',source),planningMinutes:knownKnowledgeFact(120,'estimated',source),durationBasis:knownKnowledgeFact('door-to-door','static',source),realisticRangeMinutes:unknownKnowledgeFact('fixture'),borderFriction:unknownKnowledgeFact('fixture'),note:unknownKnowledgeFact('fixture')}]});
  const provider=new FixtureRoadProvider();const result=await resolveCanonicalTransferJourney(baseline(a,b),{knowledge,provider});
  assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);assert.equal(result.leg.segments,undefined);assert.equal(provider.calls.length,0);
});

test("island/no-route stays unresolved while reviewed gateway access survives an unavailable provider", async () => {
  const noRoute = new FixtureRoadProvider(() => new RoadRoutingError("no_route"));
  const islandA = stop("unsupported-island-a", 0, "Unsupported Island A", "Archipelago", [0, 0]);
  const islandB = stop("unsupported-island-b", 1, "Unsupported Island B", "Archipelago", [0.5, 0]);
  const unresolvedIsland = await resolveCanonicalTransferJourney(baseline(islandA, islandB), { provider: noRoute });
  assert.equal(unresolvedIsland.leg.mode, "unknown");
  assert.equal(unresolvedIsland.leg.durationMinutes, null);

  const resolvedGateway = await resolveCanonicalTransferJourney(baseline(laPaz, huacachina));
  assert.equal(resolvedGateway.leg.mode, "mixed");
  assert.equal(resolvedGateway.leg.toEndpoint?.name, "Huacachina");
  assert.deepEqual(resolvedGateway.leg.segments?.map((segment) => segment.mode), ["flight", "road"]);
});

test("explicit confirmed transport is preserved and legacy persisted legs remain readable", async () => {
  const explicit: TripLeg = {
    ...baseline(huacachina, lima),
    mode: "road",
    durationMinutes: 300,
    provider: "Traveller confirmed private transfer.",
    routeMetadata: { source: "traveller-authored", userConfirmed: true },
  };
  const provider = new FixtureRoadProvider();
  const result = await resolveCanonicalTransferJourney(explicit, { provider });
  assert.equal(result.outcome, "preserved");
  assert.equal(result.leg.durationMinutes, 300);
  assert.equal(provider.calls.length, 0);
  assert.deepEqual(canonicalTransferSegments(explicit).map((item) => item.mode), ["road"]);
  assert.equal(isEasyTTrip({ schemaVersion: 1, id: "legacy", startDate: "2026-09-01", endDate: "2026-09-02", stops: [huacachina, lima], legs: [explicit], planItems: [] }), true);
});

test("missing coordinates remain unresolved without a provider call", async () => {
  const provider = new FixtureRoadProvider();
  const missing = stop("missing", 0, "Missing", "Testland");
  const resolved = await resolveCanonicalTransferJourney(baseline(missing, lima), { provider });
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(provider.calls.length, 0);
});

test("an unsupported planner flight records the resolver-owned unresolved normalization", async () => {
  const from = stop("regional-a", 0, "Regional A", "Country A", [0, 0]);
  const to = stop("regional-b", 1, "Regional B", "Country B", [4, 0]);
  const plannerFlight: TripLeg = {
    ...baseline(from, to),
    mode: "flight",
    durationMinutes: 240,
    headlineMinutes: 240,
    doorToDoorMinutes: 240,
    provenance: "planning_estimate",
    routeMetadata: { source: "morrovia-planner" },
  };

  const resolved = await resolveCanonicalTransferJourney(plannerFlight, {
    provider: new FixtureRoadProvider(() => new RoadRoutingError("no_route")),
  });

  assert.equal(resolved.outcome, "unresolved");
  assert.equal(resolved.leg.mode, "unknown");
  assert.equal(resolved.leg.durationMinutes, null);
  assert.equal(resolved.leg.routeMetadata.source, "unverified-geography");
  assert.equal(resolved.diagnostic.selected,'unresolved');
});
