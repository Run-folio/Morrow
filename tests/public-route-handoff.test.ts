import assert from "node:assert/strict";
import test from "node:test";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";

test("Plan this route carries identity, order, duration, nights and structured intent", () => {
  const detail = publicRouteDetailFor("andean-highlands");
  assert.ok(detail);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 4, 10, 12));
  assert.equal(payload.sourceRouteKey, "andean-highlands");
  assert.equal(payload.startDate, "2026-05-10");
  assert.equal(payload.endDate, "2026-05-18");
  assert.equal(payload.datesExplicit, false);
  assert.deepEqual(payload.decisionSelections, { routeOrder: "entered", transportByLeg: {} });
  assert.deepEqual(payload.destinations.map((stop) => stop.name), ["Cusco", "Sacred Valley", "Arequipa"]);
  assert.equal(Object.values(payload.nightAllocations).reduce((sum, value) => sum + value, 0), 8);
  assert.equal(payload.structuredBrief.duration?.value, 9);
  assert.deepEqual(payload.structuredBrief.destinations.map((stop) => stop.id), payload.destinations.map((stop) => stop.id));
  const storedPayload = JSON.parse(JSON.stringify(payload)) as typeof payload;
  assert.equal(storedPayload.sourceRouteKey, payload.sourceRouteKey);
  assert.deepEqual(storedPayload.destinations.map((stop) => stop.id), payload.destinations.map((stop) => stop.id));
  assert.deepEqual(storedPayload.nightAllocations, payload.nightAllocations);
  assert.deepEqual(storedPayload.decisionSelections, payload.decisionSelections);
});

test("the reviewed Morocco route reaches Builder with canonical stops and no false Chefchaouen review", () => {
  const detail = publicRouteDetailFor("morocco-rail");
  assert.ok(detail);
  const payload = routePlannerPayload(detail.planDraft, new Date(2026, 7, 27, 12));
  assert.deepEqual(payload.destinations.map((stop) => stop.canonicalPlaceId), ["marrakech", "fes", "chefchaouen"]);
  assert.equal(payload.originCanonicalPlaceId, "marrakech");
  assert.equal(payload.structuredBrief.placeMentions?.find((mention) => mention.canonicalPlaceId === "chefchaouen")?.status, "resolved");
  assert.equal(payload.structuredBrief.placeIssues?.some((issue) => issue.sourceText.toLocaleLowerCase().includes("chefchaouen")), false);

  const stored = JSON.parse(JSON.stringify(payload)) as typeof payload;
  assert.deepEqual(stored.destinations.map((stop) => stop.canonicalPlaceId), payload.destinations.map((stop) => stop.canonicalPlaceId));
});

test('approved route handoffs carry a resolved ending base through JSON reload into Builder', async () => {
  const { normalizeJourneyEnd, journeyEndpointIdentityIsCoherent } = await import('../lib/easyt/journey-endpoints.ts');
  for (const key of ['japan-slow','balkans-overland','vietnam-cambodia','iceland-ring-road']) {
    const detail = publicRouteDetailFor(key)!;
    const payload = JSON.parse(JSON.stringify(routePlannerPayload(detail.planDraft)));
    const end = normalizeJourneyEnd(payload.journeyEnd);
    assert.equal(end.mode, 'explicit');
    assert.ok(end.mode === 'explicit');
    assert.equal(end.place.name, detail.stops.at(-1)!.name);
    assert.equal(end.place.canonicalPlaceId, payload.destinations.at(-1).canonicalPlaceId);
    assert.ok(journeyEndpointIdentityIsCoherent(end.place));
    assert.deepEqual(end.place.coordinates, payload.destinations.at(-1).coordinates);
    assert.equal(payload.datesExplicit, false);
  }
});
