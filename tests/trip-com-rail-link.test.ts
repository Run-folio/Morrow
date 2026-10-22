import assert from "node:assert/strict";
import test from "node:test";
import * as links from "../lib/easyt/trip-com-rail-link.ts";

const china = { name: "Zhangjiajie", country: "China" };
const hongKong = { name: "Hong Kong", country: "Hong Kong" };

test("only verified city pairs get fixed directional rail route pages", () => {
  assert.equal(links.tripComRailRouteUrl(china, hongKong, "train"), "https://www.trip.com/trains/china/route/zhangjiajie-to-hong-kong/");
  assert.equal(links.tripComRailRouteUrl(hongKong, china, "train"), "https://www.trip.com/trains/china/route/hong-kong-to-zhangjiajie/");
  assert.equal(links.tripComRailRouteUrl(china, { ...hongKong, country: "China" }, "train"), links.tripComRailRouteUrl(china, hongKong, "train"));
});

test("unsupported places, modes, countries and station names are omitted", () => {
  for (const endpoint of [null, { name: "Zhangjiajie" }, { name: "Shanghai", country: "China" }, { name: "Zhangjiajie West", country: "China" }, { name: "Zhangjiajie", country: "France" }, { name: "Zhangjiajie", country: "" }, { name: "Zhangjiajie?x=1&next=https://evil.test", country: "China" }]) {
    assert.equal(links.tripComRailRouteUrl(endpoint, hongKong, "train"), null);
  }
  assert.equal(links.tripComRailRouteUrl(china, { ...hongKong, name: "Hong Kong West Kowloon" }, "train"), null);
  for (const mode of ["flight", "road", "mixed", "unknown", "walk"]) assert.equal(links.tripComRailRouteUrl(china, hongKong, mode), null);
  assert.equal(links.tripComRailRouteUrl(china, china, "train"), null);
});

test("normalization cannot introduce query parameters, fragments or credentials", () => {
  const href = links.tripComRailRouteUrl({ ...china, name: " ZHANGJIAJIE " }, hongKong, "train");
  const url = new URL(href!);
  assert.equal(url.origin, "https://www.trip.com");
  assert.equal(url.search + url.hash + url.username + url.password, "");
});

// Exercise the real Omio gate that owns the secondary itinerary action.
import { omioBookingActionForLeg } from "../lib/easyt/booking-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
const trip = (): EasyTTrip => ({
  schemaVersion: 1, id: "bookable", ownerId: null, title: "Bookable", status: "draft", startDate: "2026-10-01", endDate: "2026-10-06", travellers: 2, currency: "GBP",
  brief: { origin: "London, United Kingdom", originCountry: "United Kingdom", originCoordinates: [-0.1276, 51.5072], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: { paris: ["Louvre"] }, decisionSelections: { routeOrder: "entered", transportByLeg: { arrival: "fastest", leg: "fastest" } } },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-04", nights: 3 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-04", departureDate: "2026-10-07", nights: 2 },
  ],
  legs: [
    { id: "arrival", fromStopId: "bookable-origin", toStopId: "paris", fromEndpoint: { kind: "origin", id: "bookable-origin", name: "London, United Kingdom", country: "United Kingdom", coordinates: [-0.1276, 51.5072] }, toEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] }, classification: "arrival", mode: "train", distanceKm: 344, durationMinutes: 270, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } },
    { id: "leg", fromStopId: "paris", toStopId: "rome", fromEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] }, toEndpoint: { kind: "stop", id: "rome", name: "Rome", country: "Italy", coordinates: [12.49, 41.9] }, classification: "international", mode: "flight", distanceKm: 1100, durationMinutes: 330, provider: "Estimate", routeMetadata: { planningEstimate: true, decisionOption: "fastest" } },
  ],
  planItems: Array.from({ length: 6 }, (_, index) => ({ id: `day-${index + 1}`, stopId: index < 3 ? "paris" : "rome", dayNumber: index + 1, date: `2026-10-0${index + 1}`, type: index === 0 || index === 3 ? "arrival" as const : "activity" as const, title: "Plan", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null })),
  recommendations: [], createdAt: "2026-08-01", updatedAt: "2026-08-01",
});


test("itinerary eligibility keeps missing, stale and booked dates out while allowing future sales-window dates", () => {
  const source = trip();
  source.startDate = "2027-03-01";
  source.endDate = "2027-03-07";
  Object.assign(source.stops[0], { name: "Zhangjiajie", country: "China", arrivalDate: "2027-03-01", departureDate: "2027-03-04" });
  Object.assign(source.stops[1], { name: "Hong Kong", country: "Hong Kong", arrivalDate: "2027-03-04", departureDate: "2027-03-07" });
  source.planItems = [];
  const leg = source.legs[1]!;
  leg.mode = "train";
  const now = new Date("2026-10-22T12:00:00Z");
  assert.ok(omioBookingActionForLeg(source, leg, now));
  const href = links.tripComRailRouteUrl(source.stops[0]!, source.stops[1]!, leg.mode);
  assert.ok(href);
  for (const travellers of [1, 2, 4]) {
    source.travellers = travellers;
    assert.equal(links.tripComRailRouteUrl(source.stops[0]!, source.stops[1]!, leg.mode), href);
  }
  source.brief.bookings = [{ id: "transport-leg", type: "transport", title: "Zhangjiajie to Hong Kong train", date: "2027-03-04", confirmation: "ABC", url: null }];
  assert.equal(omioBookingActionForLeg(source, leg, now), null);
  source.brief.bookings = [];
  assert.equal(omioBookingActionForLeg(source, leg, now, null), null);
  assert.equal(omioBookingActionForLeg(source, leg, now, "2026-01-01"), null);
  source.startDate = "";
  assert.equal(omioBookingActionForLeg(source, leg, now), null);
  source.startDate = "2026-01-01"; source.endDate = "2026-01-07";
  assert.equal(omioBookingActionForLeg(source, leg, now), null);
});

test("secondary UI uses the guarded URL with new-tab protection and explicit handoff copy", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const action = source.slice(source.indexOf("function OmioTransportAction("), source.indexOf("function ItineraryDaySuggestions("));
  assert.match(action, /tripComRailRouteUrl\(routeEndpointForLeg\(trip, leg, "from"\), routeEndpointForLeg\(trip, leg, "to"\), leg.mode\)/);
  assert.match(action, /tripComUrl \? <>/);
  assert.match(action, /href=\{tripComUrl\} target="_blank" rel="noopener noreferrer"/);
  assert.match(action, /Route page · enter dates and travellers on Trip.com/);
  assert.doesNotMatch(action, /sponsored.*Try Trip.com|availability|searchParams/);
});
