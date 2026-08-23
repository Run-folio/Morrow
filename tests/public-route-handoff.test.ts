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
