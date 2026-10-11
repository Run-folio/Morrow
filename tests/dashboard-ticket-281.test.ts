import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { dashboardLibraryTrips } from "../lib/easyt/dashboard-library.ts";
import { dashboardTripPhoto, dashboardTripPhotosForCards, dashboardTripCoverPlace } from "../lib/easyt/dashboard-trip-image.ts";
import { countryFor } from "../lib/easyt/country-registry.ts";
import { routeImageCredit } from "../lib/easyt/route-images.ts";
import { nextTripUpdatedAt } from "../lib/easyt/trip-continuity.ts";
import type { EasyTTrip, TripStatus } from "../lib/easyt/trip.ts";

function trip(id: string, status: TripStatus = "planned", updatedAt = "2026-09-01T12:00:00.000Z"): EasyTTrip {
  return {
    schemaVersion: 1,
    id,
    ownerId: "ticket-281-owner",
    title: id,
    status,
    startDate: "2027-05-01",
    endDate: "2027-05-10",
    travellers: 2,
    currency: "GBP",
    brief: { origin: "London", mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {} },
    stops: [],
    legs: [],
    planItems: [],
    recommendations: [],
    createdAt: "2026-09-01T10:00:00.000Z",
    updatedAt,
  };
}

function stop(name: string, country: string, order: number) {
  return { id: `stop-${order}`, order, name, country, latitude: null, longitude: null, arrivalDate: null, departureDate: null, nights: 2 };
}

test("route and night saves advance the canonical revision and survive reload ordering", () => {
  const older = trip("older", "planned", "2026-09-01T12:00:00.000Z");
  const created = trip("created", "draft", "2026-09-02T12:00:00.000Z");
  const routeEdit = { ...created, stops: [stop("Paris", "France", 0)], updatedAt: nextTripUpdatedAt(created.updatedAt, new Date("2026-09-02T12:01:00.000Z")) };
  const nightEdit = { ...routeEdit, stops: [{ ...routeEdit.stops[0]!, nights: 4 }], updatedAt: nextTripUpdatedAt(routeEdit.updatedAt, new Date("2026-09-02T12:02:00.000Z")) };
  const reloaded = JSON.parse(JSON.stringify(nightEdit)) as EasyTTrip;
  const secondEdit = { ...reloaded, title: "created again", updatedAt: nextTripUpdatedAt(reloaded.updatedAt, new Date("2026-09-02T12:03:00.000Z")) };

  assert.ok(routeEdit.updatedAt > created.updatedAt);
  assert.ok(nightEdit.updatedAt > routeEdit.updatedAt);
  assert.equal(reloaded.updatedAt, nightEdit.updatedAt);
  assert.ok(secondEdit.updatedAt > reloaded.updatedAt);
  assert.deepEqual(dashboardLibraryTrips([older, reloaded], { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["created", "older"]);
  assert.deepEqual(dashboardLibraryTrips([older, secondEdit], { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["created", "older"]);
});

test("recent ordering is descending, deterministic on ties, and consistent for every status view", () => {
  const planned = trip("planned", "planned", "2026-09-03T12:00:00.000Z");
  const active = trip("active", "draft", "2026-09-04T12:00:00.000Z");
  const archived = trip("archived", "archived", "2026-09-02T12:00:00.000Z");
  const tieLaterCreated = { ...trip("tie-z", "planned", active.updatedAt), createdAt: "2026-09-02T10:00:00.000Z" };
  const tieEarlierCreatedB = { ...trip("tie-b", "planned", active.updatedAt), createdAt: "2026-09-01T10:00:00.000Z" };
  const tieEarlierCreatedA = { ...trip("tie-a", "planned", active.updatedAt), createdAt: "2026-09-01T10:00:00.000Z" };
  const trips = [archived, planned, tieEarlierCreatedB, active, tieEarlierCreatedA, tieLaterCreated];

  assert.deepEqual(dashboardLibraryTrips(trips, { view: "all", sort: "updated", query: "" }).map((item) => item.id), ["tie-z", "active", "tie-a", "tie-b", "planned", "archived"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "planned", sort: "updated", query: "" }).map((item) => item.id), ["tie-z", "tie-a", "tie-b", "planned"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "draft", sort: "updated", query: "" }).map((item) => item.id), ["active"]);
  assert.deepEqual(dashboardLibraryTrips(trips, { view: "archived", sort: "updated", query: "" }).map((item) => item.id), ["archived"]);
});

test("dashboard cards prefer reviewed destination photography and reject unknown media", () => {
  const europe = { ...trip("europe"), stops: [stop("Paris", "France", 0), stop("Amsterdam", "Netherlands", 1)] };
  const asia = { ...trip("asia"), stops: [stop("Tokyo", "Japan", 0), stop("Beijing", "China", 1)] };
  const established = { ...trip("established"), stops: [stop("Lisbon", "Portugal", 0)] };
  const noPhoto = {
    ...trip("fallback"),
    stops: [stop("Unreviewed place", "Nowhere", 0)],
    planItems: [{ id: "map", stopId: "stop-0", dayNumber: 1, date: "", type: "activity" as const, title: "Map", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: "/journey/product-shots/tour/map-workspace-mobile.png" }],
  };

  assert.equal(dashboardTripPhoto(europe)?.place, "Paris");
  assert.match(dashboardTripPhoto(europe)?.src ?? "", /\/1920px-Paris_/);
  assert.equal(dashboardTripPhoto(asia)?.place, "Tokyo");
  assert.equal(dashboardTripPhoto(established)?.place, "Lisbon");
  assert.equal(dashboardTripPhoto(noPhoto), null);
});

test("trip cards keep maps off photography and place photo credit within the media frame", () => {
  const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(dashboard, /styles\.cardMapInset/);
  assert.match(dashboard, /className=\{styles\.cardMediaFrame\}/);
});

test("normal trip cards keep a two-column desktop and one-column mobile footprint across lifecycles", () => {
  const css = readFileSync(new URL("../app/journey/dashboard/dashboard.module.css", import.meta.url), "utf8");
  assert.match(css, /\.sectionGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  assert.doesNotMatch(css, /\.pastSection \.sectionGrid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,/);
  assert.doesNotMatch(css, /\.ideaCard\s*\{[\s\S]*?grid-column:\s*1\s*\/\s*-1/);
  assert.doesNotMatch(css, /\.ideaCard \.cardMedia\s*\{[\s\S]*?height:/);
  assert.doesNotMatch(css, /\.pastCard \.cardMedia\s*\{[\s\S]*?height:/);
  assert.match(css, /@media \(max-width: 700px\)\s*\{[\s\S]*?\.sectionGrid\s*\{[\s\S]*?grid-template-columns:\s*1fr/);
});

test("idea route sketches do not mount a live map in ordinary cards", () => {
  const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
  const card = dashboard.split("export function TripCard(")[1] ?? "";
  assert.doesNotMatch(card, /TripRoutePreview/);
});

test("visible cards keep first-destination covers distinct and retain selected photo rights", () => {
  const tokyoA = { ...trip("tokyo-a"), stops: [stop("Tokyo", "Japan", 0), stop("Kyoto", "Japan", 1)] };
  const tokyoB = { ...trip("tokyo-b"), stops: [stop("Tokyo", "Japan", 0), stop("Takayama", "Japan", 1)] };
  const londonA = { ...trip("london-a"), stops: [stop("London", "United Kingdom", 0), stop("Paris", "France", 1)] };
  const londonB = { ...trip("london-b"), stops: [stop("London", "United Kingdom", 0), stop("Lisbon", "Portugal", 1)] };
  const londonC = { ...trip("london-c"), stops: [stop("London", "United Kingdom", 0), stop("Tokyo", "Japan", 1), stop("Takayama", "Japan", 2)] };
  const cards = [tokyoA, tokyoB, londonA, londonB, londonC];
  assert.equal(dashboardTripPhoto(tokyoA)?.src, dashboardTripPhoto(tokyoB)?.src);
  const result = dashboardTripPhotosForCards(cards);
  const sources = [...result.values()].map(photo => photo.src);
  assert.equal(new Set(sources).size, sources.length);
  assert.deepEqual(result, dashboardTripPhotosForCards(cards));
  assert.ok(result.has(tokyoA.id));
  assert.equal(result.has(tokyoB.id),false,'a duplicate first-place asset waits for a live alternative rather than using Takayama');
  for (const card of cards) {
    const selected = result.get(card.id);
    if (!selected) {
      const place=dashboardTripCoverPlace(card);
      assert.equal(place?.name,card.stops[0]!.name,'unresolved cover still belongs to its first destination');
      assert.ok(countryFor(place?.country)?.flag,'verified country retains a flag while a distinct photo is unresolved');
      continue;
    }
    assert.equal(selected.place,card.stops[0]!.name,'diversity never substitutes a later destination');
    assert.ok(selected?.creditHref);
    assert.ok(selected?.licenseHref);
    assert.equal(selected.creditHref, routeImageCredit(selected.src)?.sourceUrl);
    assert.equal(selected.licenseHref, routeImageCredit(selected.src)?.licenseUrl);
  }
});

test("single-photo duplicates remain unresolved with first-country fallback across lifecycle states", () => {
  const one = { ...trip("one", "planned"), stops: [stop("Tokyo", "Japan", 0)] };
  const two = { ...trip("two", "archived"), stops: [stop("Tokyo", "Japan", 0)] };
  const idea = { ...trip("idea", "draft"), stops: [stop("Tokyo", "Japan", 0)] };
  const none = { ...trip("none", "planned"), stops: [stop("Unknown", "Nowhere", 0)] };
  const result = dashboardTripPhotosForCards([one, two, idea, none]);
  assert.ok(result.get(one.id)?.src);
  assert.equal(result.get(two.id),undefined,'archived duplicate seeks an alternate instead of reusing the same asset');
  assert.equal(dashboardTripCoverPlace(two)?.name,'Tokyo');
  assert.equal(countryFor(dashboardTripCoverPlace(two)?.country)?.flag,'🇯🇵');
  assert.equal(result.get(idea.id), undefined);
  assert.equal(result.get(none.id), undefined);
  assert.equal(countryFor(dashboardTripCoverPlace(none)?.country),null,'unknown country has no fabricated flag');
});
