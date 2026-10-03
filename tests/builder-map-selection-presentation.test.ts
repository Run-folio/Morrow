import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { builderDestinationCards } from "../lib/easyt/builder-map-destination-cards.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const trip = tripFromBuilder({ id: "peru-map-card-test", origin: "Lima", startDate: "2026-10-01", endDate: "2026-10-15", picks: {}, mustDo: "", pace: "slow", hotels: "few", budget: "mid", draft: [],
  stops: [["Lima", 2], ["Cusco", 1], ["Aguas Calientes", 1], ["Cusco", 4], ["Arequipa", 2], ["Chivay", 1], ["Arequipa", 3]].map(([name, nights], index) => ({ id: `peru-${index}`, name: String(name), country: "Peru", coordinates: [-72 - index, -13] as [number, number] })),
  nightAllocations: Object.fromEntries([2, 1, 1, 4, 2, 1, 3].map((nights, index) => [`peru-${index}`, nights])),
});

test("Builder cards retain occurrence identity, order and nights for repeated names", () => {
  const cards = builderDestinationCards(trip);
  assert.deepEqual(cards.map((card) => card.stopId), trip.stops.map((stop) => stop.id));
  assert.deepEqual(cards.filter((card) => card.name === "Cusco").map((card) => card.dayLabel), ["Stop 2 · 1 night", "Stop 4 · 4 nights"]);
  assert.deepEqual(cards.filter((card) => card.name === "Arequipa").map((card) => card.dayLabel), ["Stop 5 · 2 nights", "Stop 7 · 3 nights"]);
  const reordered = { ...trip, stops: [trip.stops[3], ...trip.stops.slice(0, 3), ...trip.stops.slice(4)] };
  assert.equal(builderDestinationCards(reordered)[0].stopId, trip.stops[3].id);
  assert.equal(builderDestinationCards(reordered)[0].dayLabel, "Stop 1 · 4 nights");
});

test("only meaningful unresolved-base state appears on the card", () => {
  const stop = trip.stops[1];
  const regional = extractStructuredTripBrief("Damaraland");
  const destination = regional.destinations[0];
  assert.ok(destination?.placeMentionId);
  const withIssue = { ...trip, brief: { ...trip.brief, structuredBrief: {
    ...regional, destinations: [{ ...destination, id: stop.id, name: stop.name }],
    placeIssues: regional.placeIssues?.map((issue) => ({ ...issue, blocksRoute: true })),
  } } };
  assert.match(builderDestinationCards(withIssue)[1].dayLabel, /Base to confirm/);
  assert.doesNotMatch(builderDestinationCards({ ...withIssue, brief: { ...withIssue.brief, structuredBrief: {
    ...withIssue.brief.structuredBrief, placeIssues: withIssue.brief.structuredBrief.placeIssues?.map((issue) => ({ ...issue, blocksRoute: false })),
  } } })[1].dayLabel, /Base to confirm/);
});

test("Builder reuses shared destination cards and confines action tone to its destination pins", () => {
  const workspace = read("app/journey/new/trip-builder-route-workspace.tsx");
  const map = read("components/journey-planner-map.tsx");
  const presentation = read("components/easyt/morrovia-map-presentation.module.css");
  assert.match(workspace, /destinationCards=\{destinationCards\}/);
  assert.match(workspace, /featuredStopId=\{selectedStopId \?\? undefined\}/);
  assert.match(workspace, /selectedId=\{selectedStopId \?\? ""\}/);
  assert.match(workspace, /destinationSelectionTone="action"/);
  assert.match(map, /planner-map__destination-card/);
  assert.match(presentation, /data-destination-selection-tone="action"[^\n]*planner-map__stop\.is-active/);
  assert.match(presentation, /planner-map__stop:focus-visible/);
  assert.doesNotMatch(presentation, /data-destination-selection-tone="action"[^\n]*planner-map__place/);
});
