import assert from "node:assert/strict";
import test from "node:test";

import { itineraryPresentationImages } from "../lib/easyt/itinerary-presentation-images.ts";
import { mediaImagesForExactDestination } from "../lib/easyt/itinerary-media.ts";
import { routeDestinationPhoto } from "../lib/easyt/route-images.ts";
import type { EasyTTrip, PlanItem, TripStop } from "../lib/easyt/trip.ts";

function stop(id: string, name: string, country: string, order: number): TripStop {
  return { id, name, country, order, latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 1 };
}

function day(id: string, stopId: string, dayNumber: number, image: string | null = null, sourceUrl: string | null = null): PlanItem {
  return { id, stopId, dayNumber, date: `2026-10-${String(dayNumber).padStart(2, "0")}`, type: "open", title: id, reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image, sourceUrl };
}

function trip(stops: TripStop[], planItems: PlanItem[]): EasyTTrip {
  return { schemaVersion: 1, id: "presentation", ownerId: null, title: "Presentation", status: "draft", startDate: "2026-10-01", endDate: "2026-10-12", travellers: 2, currency: "GBP", brief: { origin: "Home", mustDo: "", pace: "slow", hotelChanges: "some", budgetBand: "mid", selectedPlaces: {} }, stops, legs: [], planItems, recommendations: [], createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
}

test("explicit reviewed photo wins and carries its own licence and source", () => {
  const reviewed = routeDestinationPhoto("Tokyo", "Japan")!;
  const assigned = reviewed.variants.at(-1)!.src;
  const result = itineraryPresentationImages(trip([stop("tokyo", "Tokyo", "Japan", 0)], [day("day-1", "tokyo", 1, assigned)]));
  assert.equal(result.dayById["day-1"]?.src, assigned);
  assert.equal(result.stopById.tokyo?.src, assigned);
  assert.equal(result.dayById["day-1"]?.sourceUrl, reviewed.sourceUrl);
  assert.equal(result.dayById["day-1"]?.licenseUrl, reviewed.licenseUrl);
  assert.match(result.dayById["day-1"]?.fullCreditUrl ?? "", new RegExp(`#${reviewed.key}$`));
});

test("valid Tokyo alternatives precede duplicate stop and day imagery", () => {
  const input = trip([stop("tokyo-first", "Tokyo", "Japan", 0), stop("kyoto", "Kyoto", "Japan", 1), stop("tokyo-return", "Tokyo", "Japan", 2)], [day("day-1", "tokyo-first", 1), day("day-2", "tokyo-first", 2), day("day-3", "kyoto", 3), day("day-4", "tokyo-return", 4)]);
  const result = itineraryPresentationImages(input);
  assert.notEqual(result.stopById["tokyo-first"]?.src, result.stopById["tokyo-return"]?.src);
  assert.notEqual(result.dayById["day-1"]?.src, result.dayById["day-2"]?.src);
  assert.ok(result.dayById["day-4"]?.src);
  assert.deepEqual(Object.keys(result.stopById), ["tokyo-first", "kyoto", "tokyo-return"]);
  assert.deepEqual(Object.keys(result.dayById), ["day-1", "day-2", "day-3", "day-4"]);
});

test("one valid image may repeat rather than borrowing unrelated imagery", () => {
  const input = trip([stop("delhi-1", "Delhi", "India", 0), stop("delhi-2", "Delhi", "India", 1)], [day("day-1", "delhi-1", 1), day("day-2", "delhi-2", 2)]);
  const result = itineraryPresentationImages(input);
  assert.equal(result.stopById["delhi-1"]?.src, result.stopById["delhi-2"]?.src);
  assert.equal(result.stopById["delhi-1"]?.sourceUrl, routeDestinationPhoto("Delhi", "India")?.sourceUrl);
});

test("unknown destination and substring-only match have no photo", () => {
  const input = trip([stop("unknown", "Example Uncovered Base", "Example Country", 0), stop("almost", "Tokyo Metropolitan", "Japan", 1)], [day("day-1", "unknown", 1), day("day-2", "almost", 2)]);
  assert.equal(mediaImagesForExactDestination("Tokyo Metropolitan").length, 0);
  const result = itineraryPresentationImages(input);
  assert.equal(result.stopById.unknown, null);
  assert.equal(result.stopById.almost, null);
  assert.equal(result.dayById["day-1"], null);
  assert.equal(result.dayById["day-2"], null);
});

test("uncredited assigned photo falls back; selection is stable without trip mutation", () => {
  const input = trip([stop("tokyo", "Tokyo", "Japan", 0)], [day("day-1", "tokyo", 1, "/unreviewed.jpg")]);
  const before = JSON.stringify(input);
  const first = itineraryPresentationImages(input);
  assert.notEqual(first.dayById["day-1"]?.src, "/unreviewed.jpg");
  assert.ok(first.dayById["day-1"]?.sourceUrl);
  assert.deepEqual(itineraryPresentationImages(input), first);
  assert.equal(JSON.stringify(input), before);
});
