import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildTripCopilotOpenAIRequest,
  buildTripCopilotProjection,
  parseTripCopilotAnswer,
  TRIP_COPILOT_CONTEXT_VERSION,
  TRIP_COPILOT_RESPONSE_JSON_SCHEMA,
} from "../lib/easyt/trip-copilot.ts";
import { tripCopilotFixture } from "./fixtures/trip-copilot-trip.ts";

test("the co-pilot projection is compact, derived and free of private trip internals", () => {
  const trip = tripCopilotFixture();
  const projection = buildTripCopilotProjection(trip, { legId: "tokyo-kyoto" });
  assert.equal(projection.version, TRIP_COPILOT_CONTEXT_VERSION);
  assert.deepEqual(projection.trip.route.stops.map((stop) => ({ name: stop.name, nights: stop.nights })), [
    { name: "Tokyo", nights: 4 },
    { name: "Kyoto", nights: 3 },
    { name: "Hiroshima", nights: 2 },
  ]);
  assert.deepEqual(projection.trip.route.transfers[0], {
    order: 1,
    from: "Tokyo",
    to: "Kyoto",
    mode: "train",
    classification: null,
    distanceKm: 450,
    headlineMinutes: null,
    doorToDoorMinutes: 210,
    usableDayLoss: "unknown",
    provenance: "unknown",
    confidence: "unknown",
    warnings: [],
    scheduleNeedsChecking: true,
    selected: true,
  });
  assert.deepEqual(projection.selectedContext, { requestedScope: "leg", available: true, label: "Tokyo → Kyoto" });
  const serialized = JSON.stringify(projection);
  for (const privateValue of [
    trip.id,
    trip.ownerId!,
    "place:tokyo",
    "PRIVATE-CONFIRMATION",
    "https://private.invalid/booking",
    "PRIVATE PROVIDER NOTE",
    "DO-NOT-SEND",
    "PRIVATE CHANGE HISTORY",
  ]) assert.equal(serialized.includes(privateValue), false, privateValue);
  for (const forbiddenKey of ["ownerId", "routeMetadata", "canonicalPlaceId", "confirmation", "bookingUrl", "changeHistory", "rawPrompt", "latitude", "longitude"]) {
    assert.equal(serialized.includes(`\"${forbiddenKey}\"`), false, forbiddenKey);
  }
});

test("unknown nights and transport facts remain explicitly unknown", () => {
  const trip = tripCopilotFixture();
  trip.stops[1]!.nights = null;
  trip.legs[0] = { ...trip.legs[0]!, mode: "unknown", distanceKm: null, durationMinutes: null, routeMetadata: {} };
  const projection = buildTripCopilotProjection(trip, { stopId: "kyoto" });
  assert.equal(projection.trip.route.stops[1]?.nights, null);
  assert.deepEqual(projection.trip.route.transfers[0], {
    order: 1, from: "Tokyo", to: "Kyoto", mode: "unknown", classification: null, distanceKm: null,
    headlineMinutes: null, doorToDoorMinutes: null, usableDayLoss: "unknown", provenance: "unknown", confidence: "unknown", warnings: [], scheduleNeedsChecking: true, selected: false,
  });
});

test("the Responses API request uses Luna low reasoning, three strict tools and structured fallback output", () => {
  const projection = buildTripCopilotProjection(tripCopilotFixture());
  const request = buildTripCopilotOpenAIRequest(projection, "Does this itinerary feel rushed?");
  assert.equal(request.model, "gpt-5.6-luna");
  assert.deepEqual(request.reasoning, { effort: "low" });
  assert.equal(request.store, false);
  assert.equal(request.text.format.type, "json_schema");
  assert.equal(request.text.format.strict, true);
  assert.strictEqual(request.text.format.schema, TRIP_COPILOT_RESPONSE_JSON_SCHEMA);
  assert.deepEqual(request.tools.map((tool) => tool.name), ["change_stop_nights", "set_trip_preference", "change_transport_preference"]);
  assert.equal(request.tools.every((tool) => tool.strict && tool.parameters.additionalProperties === false), true);
  assert.equal(request.parallel_tool_calls, false);
  assert.equal(JSON.stringify(request).includes("OPENAI_API_KEY"), false);
});

test("the response parser accepts only the read-only answer contract", () => {
  assert.deepEqual(parseTripCopilotAnswer(JSON.stringify({ answer: "The route is coherent.", scope: "trip", proposedChange: null })), {
    answer: "The route is coherent.", scope: "trip", proposedChange: null,
  });
  assert.deepEqual(parseTripCopilotAnswer(JSON.stringify({ answer: "I would add one night, but nothing has changed.", scope: "stop", proposedChange: { type: "duration", summary: "Consider one extra night in Kyoto." } })), {
    answer: "I would add one night, but nothing has changed.", scope: "stop", proposedChange: { type: "duration", summary: "Consider one extra night in Kyoto." },
  });
  assert.equal(parseTripCopilotAnswer(JSON.stringify({ answer: "Changed it.", scope: "trip", proposedChange: { type: "mutation", summary: "Saved" } })), null);
  assert.equal(parseTripCopilotAnswer("not json"), null);
});

test("projection and request construction never mutate canonical trip state", () => {
  const trip = tripCopilotFixture();
  const before = structuredClone(trip);
  const projection = buildTripCopilotProjection(trip, { dayNumber: 6 });
  buildTripCopilotOpenAIRequest(projection, "Change Kyoto to 4 nights.");
  assert.deepEqual(trip, before);
});

test("the interpretation API remains owner-scoped and cannot save canonical state", () => {
  const route = readFileSync(new URL("../app/api/easyt/trips/[tripId]/copilot/route.ts", import.meta.url), "utf8");
  const client = readFileSync(new URL("../components/easyt/easyt-trip-copilot.tsx", import.meta.url), "utf8");
  assert.match(route, /requireEasyTOwner\(\)/);
  assert.match(route, /getTripForOwner\(owner\.id, tripId\)/);
  assert.doesNotMatch(route, /saveTripForOwner|promoteTripForOwner|archiveTripForOwner|updateEasyT/);
  assert.match(route, /Only a message and selected trip context are accepted/);
  assert.match(client, /JSON\.stringify\(\{[\s\S]*message: trimmed,[\s\S]*context:/);
  assert.doesNotMatch(client, /OPENAI_API_KEY|getOpenAIClient/);
  assert.doesNotMatch(client, /JSON\.stringify\(\{\s*trip:/);
});
