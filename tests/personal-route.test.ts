import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { personalRouteBackHref, personalRouteHref, personalRoutePresentation } from "../lib/easyt/personal-route.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { hostileTripFixture, hostileUnknownTransportTrip } from "./fixtures/hostile-trip-facts.ts";

const read = (path: string) => readFileSync(path, "utf8");

function personalFixture(): EasyTTrip {
  const seed = hostileTripFixture();
  const trip = hostileTripFixture({
    id: "trip with/slash",
    ownerId: "owner-a",
    title: "Aegean loop",
    startDate: "2027-09-14",
    endDate: "2027-10-24",
    createdAt: "2026-09-15T00:00:00.000Z",
    updatedAt: "canonical-revision-a",
    brief: {
      ...seed.brief,
      customTitle: "Aegean loop",
      itineraryIdeas: [{
        id: "idea-temple",
        stopId: "athens-outbound",
        placeId: "temple",
        title: "Temple walk",
        category: "activity",
        image: "/journey/immersive/route-italy-greece-768.webp",
        sourceUrl: "https://example.test/temple",
        source: "personalised-recommendation",
        reasons: ["interest-relevance"],
        dayId: "day-a",
      }],
    },
  });
  trip.stops = [
    { id: "athens-outbound", order: 0, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2027-09-14", departureDate: "2027-09-20", nights: 6 },
    { id: "naxos", order: 1, name: "Naxos", country: "Greece", latitude: 37.1036, longitude: 25.3764, arrivalDate: "2027-09-20", departureDate: "2027-10-10", nights: 20 },
    { id: "athens-return", order: 2, name: "Athens", country: "Greece", latitude: 37.9838, longitude: 23.7275, arrivalDate: "2027-10-10", departureDate: "2027-10-25", nights: 15 },
  ];
  trip.legs = [
    { id: "out-ferry", fromStopId: "athens-outbound", toStopId: "naxos", mode: "ferry", distanceKm: 180, durationMinutes: 240, provider: null, routeMetadata: {}, confidence: "medium", provenance: "planning_estimate", scheduleNeedsChecking: true },
    { id: "return-ferry", fromStopId: "naxos", toStopId: "athens-return", mode: "ferry", distanceKm: 180, durationMinutes: 240, provider: null, routeMetadata: {}, confidence: "medium", provenance: "planning_estimate", scheduleNeedsChecking: true },
  ];
  trip.planItems = [
    { id: "day-a", stopId: "athens-outbound", dayNumber: 1, date: "2027-09-14", type: "activity", title: "Athens arrival walk", reason: "Settle into the first Athens visit.", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, image: "/journey/immersive/route-italy-greece-768.webp", sourceUrl: null },
    { id: "day-n", stopId: "naxos", dayNumber: 7, date: "2027-09-20", type: "activity", title: "Naxos coast", reason: "Slow down by the sea.", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, sourceUrl: null },
    { id: "day-return", stopId: "athens-return", dayNumber: 27, date: "2027-10-10", type: "activity", title: "Athens return", reason: "Finish with a distinct second stay.", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null, sourceUrl: null },
  ];
  return trip;
}

test("personal route projection is pure and reflects canonical updates without a second model", () => {
  const trip = personalFixture();
  const before = structuredClone(trip);
  const first = personalRoutePresentation(trip);
  assert.deepEqual(trip, before, "projection must not mutate the canonical trip");
  assert.equal(first.title, "Aegean loop");
  assert.equal(first.durationDays, 41);
  assert.equal(first.totalNights, 41);
  assert.equal(first.highlights.filter((item) => item.title === "Temple walk").length, 1);

  const updated = { ...trip, brief: { ...trip.brief, customTitle: "Our island return" }, updatedAt: "canonical-revision-b" };
  assert.equal(personalRoutePresentation(updated).title, "Our island return");
  assert.equal(first.title, "Aegean loop", "the prior projection remains an immutable view value");
});

test("repeated city visits retain stable visit identity, order and exact legs", () => {
  const view = personalRoutePresentation(personalFixture());
  assert.deepEqual(view.stops.map((stop) => [stop.id, stop.name]), [
    ["athens-outbound", "Athens"],
    ["naxos", "Naxos"],
    ["athens-return", "Athens"],
  ]);
  assert.equal(view.stops[0]?.onward?.to, "Naxos");
  assert.equal(view.stops[1]?.onward?.to, "Athens");
  assert.equal(view.stops[0]?.onward?.id, "out-ferry");
  assert.equal(view.stops[1]?.onward?.id, "return-ferry");
});

test("connections without a canonical leg use adjacent occurrence ids", () => {
  const trip = personalFixture();
  trip.legs = trip.legs.slice(0, 1);
  assert.equal(personalRoutePresentation(trip).stops[1]?.onward?.id, "connection:naxos:athens-return");
});

test("personal Journey stories expose the shared desktop navigator and compact mobile strip", () => {
  const stories = read("app/journey/my-routes/[tripId]/personal-route-view.stories.tsx");
  assert.match(stories, /DesktopJourneyNavigator/);
  assert.match(stories, /MobileJourneyStrip/);
  assert.match(stories, /RepeatedCityLoop/);
});

test("missing nights, coordinates, imagery and transport remain explicit unknowns", () => {
  const trip = hostileUnknownTransportTrip();
  trip.stops[1] = { ...trip.stops[1], nights: null, latitude: null, longitude: null, arrivalDate: null, departureDate: null };
  trip.planItems[1] = { ...trip.planItems[1], image: null };
  const view = personalRoutePresentation(trip);
  assert.equal(view.totalNights, null);
  assert.equal(view.stops[1]?.dayLabel, "Dates to confirm");
  assert.equal(view.stops[1]?.coordinates, null);
  assert.equal(view.stops[0]?.onward?.mode, null);
  assert.equal(view.stops[0]?.onward?.durationLabel, "Timing to confirm");
  assert.match(view.missingFacts.join(" "), /nights are still to confirm/i);
  assert.match(view.missingFacts.join(" "), /transport details are still to confirm/i);
});

test("private URL helpers encode opaque trip ids and return to the existing workspace", () => {
  assert.equal(personalRouteHref("trip with/slash"), "/journey/my-routes/trip%20with%2Fslash");
  assert.equal(personalRouteBackHref("trip with/slash"), "/journey/trip%20with%2Fslash");
});

test("personal route access is owner-scoped, no-store, noindex and read-only for device recovery", () => {
  const page = read("app/journey/my-routes/[tripId]/page.tsx");
  const access = read("app/journey/my-routes/[tripId]/personal-route-access.tsx");
  const sitemap = read("app/sitemap.ts");
  assert.match(page, /getTripForOwner\(session\.user\.id, tripId\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /fetchCache = "force-no-store"/);
  assert.match(page, /revalidate = 0/);
  assert.match(page, /index: false/);
  assert.match(page, /openGraph: null/);
  assert.match(page, /twitter: null/);
  assert.match(access, /loadTripRecovery\(tripId, ownerId\)/);
  assert.doesNotMatch(access, /saveTripToEasyT|saveTripRecoveryToEasyT|cacheCanonicalTrip|claimGuestTripRecoveryForOwner|discardTripRecovery/);
  assert.doesNotMatch(sitemap, /my-routes/);
});

test("Overview exposes one secondary personal-route action and public Route Detail keeps its planning handoff", () => {
  const overview = read("components/easyt/trip-overview-workspace.tsx");
  const publicDetail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  assert.equal(overview.match(/View my route/g)?.length, 1);
  assert.match(overview, /personalRouteHref\(trip\.id\)/);
  assert.match(publicDetail, />Start with this route</);
  assert.match(publicDetail, /RoutePlanLink/);
});
