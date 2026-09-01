import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { transportBookingProgress } from "../lib/easyt/booking-readiness.ts";
import { tripHealth } from "../lib/easyt/review.ts";
import { deriveOverviewReadinessCategories } from "../lib/easyt/trip-overview-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import type { TripPrepTask } from "../lib/easyt/trip-prep.ts";
import { deriveTripPrepTasks, groupTripPrepTasks } from "../lib/easyt/trip-prep.ts";
import type { TravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";

const trip = (): EasyTTrip => ({
  schemaVersion: 1,
  id: "overview-readiness",
  ownerId: "traveller",
  title: "Paris and Rome",
  status: "draft",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  travellers: 2,
  currency: "GBP",
  brief: {
    origin: "London",
    mustDo: "",
    pace: "slow",
    hotelChanges: "few",
    budgetBand: "mid",
    selectedPlaces: {},
    bookings: [
      { id: "stay-paris", type: "stay", title: "Paris stay", date: "2026-10-01", confirmation: "ABC", url: null },
      { id: "transport-leg", type: "transport", title: "Paris to Rome", date: "2026-10-02", confirmation: "XYZ", url: null },
    ],
    checklist: [
      { id: "passport", label: "Check passport", complete: true },
      { id: "offline", label: "Save offline maps", complete: false },
    ],
  },
  stops: [
    { id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-02", nights: 1 },
    { id: "rome", order: 1, name: "Rome", country: "Italy", latitude: 41.9, longitude: 12.49, arrivalDate: "2026-10-02", departureDate: "2026-10-03", nights: 1 },
  ],
  legs: [{ id: "leg", fromStopId: "paris", toStopId: "rome", mode: "flight", distanceKm: 1100, durationMinutes: 180, provider: null, routeMetadata: {} }],
  planItems: [
    { id: "day-1", stopId: "paris", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Paris", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
    { id: "day-2", stopId: "rome", dayNumber: 2, date: "2026-10-02", type: "activity", title: "Rome", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null },
  ],
  recommendations: [],
  createdAt: "2026-08-01",
  updatedAt: "2026-08-01",
});

const prepTasks: TripPrepTask[] = [
  { id: "passport", title: "Passport and traveller details", detail: "Traveller details saved", category: "must", status: "complete", kind: "passport" },
  { id: "insurance", title: "Travel insurance", detail: "Compare cover", category: "must", status: "to-do", kind: "insurance" },
  { id: "connectivity", title: "Connectivity", detail: "Compare data coverage", category: "good", status: "in-progress", kind: "connectivity" },
];

test("Overview readiness is a read-only projection over canonical trip and Prep state", () => {
  const source = trip();
  const before = structuredClone(source);
  const categories = deriveOverviewReadinessCategories({ trip: source, prepTasks, providerStatus: "available" });

  assert.deepEqual(categories.map((category) => category.id), ["itinerary", "accommodation", "transport", "passport", "insurance", "connectivity", "checklist"]);
  assert.equal(categories.find((category) => category.id === "itinerary")?.percent, 100);
  assert.equal(categories.find((category) => category.id === "accommodation")?.detail, "1 of 2 overnight stops sorted");
  assert.equal(categories.find((category) => category.id === "transport")?.status, "complete");
  assert.equal(categories.find((category) => category.id === "passport")?.status, "complete");
  assert.equal(categories.find((category) => category.id === "insurance")?.percent, null);
  assert.equal(categories.find((category) => category.id === "connectivity")?.status, "in-progress");
  assert.equal(categories.find((category) => category.id === "checklist")?.detail, "1 of 2 practicals complete");
  assert.deepEqual(source, before);
});

test("canonical preparation grouping preserves priority without mutating tasks", () => {
  const before = structuredClone(prepTasks);
  const groups = groupTripPrepTasks(prepTasks);
  assert.deepEqual(groups.must.map((task) => task.id), ["passport", "insurance"]);
  assert.deepEqual(groups.good.map((task) => task.id), ["connectivity"]);
  assert.deepEqual(groups.nice, []);
  assert.deepEqual(prepTasks, before);
});

test("transport progress only treats canonical saved bookings as sorted", () => {
  const source = trip();
  assert.deepEqual(transportBookingProgress(source), { total: 1, sortedCount: 1, complete: true });
  source.brief.bookings = source.brief.bookings?.filter((booking) => booking.type !== "transport");
  assert.deepEqual(transportBookingProgress(source), { total: 1, sortedCount: 0, complete: false });
});

test("Overview state gauntlet remains truthful across incomplete, complete and optional states", () => {
  const profileMissing: TravelReadinessProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
  const profileComplete: TravelReadinessProfile = { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-10" };
  const categoriesFor = (source: EasyTTrip, profile = profileMissing, providerStatus: "available" | "unavailable" = "available") => {
    const tasks = deriveTripPrepTasks({ trip: source, profile, bookingActions: [], readinessCards: [], now: new Date("2026-09-01T12:00:00Z") });
    return { tasks, categories: deriveOverviewReadinessCategories({ trip: source, prepTasks: tasks, providerStatus }) };
  };

  const allIncomplete = trip();
  allIncomplete.planItems = [];
  allIncomplete.brief.bookings = [];
  allIncomplete.brief.checklist = allIncomplete.brief.checklist?.map((item) => ({ ...item, complete: false }));
  const incomplete = categoriesFor(allIncomplete);
  assert.equal(incomplete.tasks.every((task) => task.status !== "complete"), true);
  assert.equal(incomplete.categories.find((category) => category.id === "itinerary")?.status, "to-do");

  const partial = categoriesFor(trip()).categories;
  assert.equal(partial.find((category) => category.id === "accommodation")?.percent, 50);
  assert.equal(partial.find((category) => category.id === "itinerary")?.percent, 100);
  assert.equal(partial.find((category) => category.id === "transport")?.status, "complete");

  const completeStays = trip();
  completeStays.brief.bookings = [
    ...(completeStays.brief.bookings ?? []),
    { id: "stay-rome", type: "stay", title: "Rome stay", date: "2026-10-02", confirmation: null, url: null },
  ];
  assert.equal(categoriesFor(completeStays).categories.find((category) => category.id === "accommodation")?.status, "complete");

  const unresolvedTransport = trip();
  unresolvedTransport.brief.bookings = unresolvedTransport.brief.bookings?.filter((booking) => booking.type !== "transport");
  assert.equal(categoriesFor(unresolvedTransport).categories.find((category) => category.id === "transport")?.status, "to-do");

  const travellerTrip = trip();
  travellerTrip.brief.checklist = travellerTrip.brief.checklist?.filter((item) => !/passport/i.test(item.id));
  assert.notEqual(categoriesFor(travellerTrip).categories.find((category) => category.id === "passport")?.status, "complete");
  assert.equal(categoriesFor(travellerTrip, profileComplete).categories.find((category) => category.id === "passport")?.status, "complete");

  const missingOptional = trip();
  missingOptional.brief.bookings = undefined;
  missingOptional.brief.checklist = undefined;
  const unavailable = categoriesFor(missingOptional, profileMissing, "unavailable").categories;
  assert.equal(unavailable.length, 7);
  assert.equal(unavailable.find((category) => category.id === "insurance")?.status, "needs-review");
  assert.equal(unavailable.some((category) => Number.isNaN(category.percent)), false);
});

test("Overview health gauntlet supports zero-warning and several-warning trips without fake state", () => {
  const noWarnings: EasyTTrip = {
    ...trip(),
    id: "overview-no-warnings",
    title: "Paris",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    brief: { ...trip().brief, origin: "Paris", originCoordinates: [2.35, 48.85], pace: "slow", bookings: [], checklist: [] },
    stops: [{ id: "paris", order: 0, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, arrivalDate: "2026-10-01", departureDate: "2026-10-01", nights: 0 }],
    legs: [{
      id: "arrival",
      fromStopId: "overview-no-warnings-origin",
      toStopId: "paris",
      fromEndpoint: { kind: "origin", id: "overview-no-warnings-origin", name: "Paris", country: "France", coordinates: [2.35, 48.85] },
      toEndpoint: { kind: "stop", id: "paris", name: "Paris", country: "France", coordinates: [2.35, 48.85] },
      classification: "arrival",
      mode: "road",
      distanceKm: 0,
      durationMinutes: 0,
      provider: "Saved route",
      provenance: "provider",
      confidence: "high",
      scheduleNeedsChecking: false,
      warnings: [],
      routeMetadata: { planningEstimate: false, decisionOption: "saved" },
    }],
    planItems: [{ id: "paris-day", stopId: "paris", dayNumber: 1, date: "2026-10-01", type: "activity", title: "Paris", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
  };
  assert.equal(tripHealth(noWarnings).openIssueCount, 0);

  const severalWarnings = trip();
  severalWarnings.planItems = severalWarnings.planItems.slice(0, 1);
  severalWarnings.legs = severalWarnings.legs.map((leg) => ({ ...leg, mode: "road", durationMinutes: 480, distanceKm: 700 }));
  assert.ok(tripHealth(severalWarnings).openIssueCount >= 2);
});

test("the shell omits Prep and the old trip URL redirects on the server", () => {
  const shell = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");
  const redirect = readFileSync("app/journey/[tripId]/prep/page.tsx", "utf8");
  const legacyRedirect = readFileSync("app/journey/prep/page.tsx", "utf8");
  const audit = readFileSync("scripts/ui-convergence-audit-lib.mjs", "utf8");
  const designSystem = readFileSync("docs/design-system.md", "utf8");
  assert.doesNotMatch(shell, /id: "prep"|label: "Prep"|suffix: "\/prep"/);
  assert.match(redirect, /import \{ redirect \} from "next\/navigation"/);
  assert.match(redirect, /redirect\(`\/journey\/\$\{encodeURIComponent\(tripId\)\}`\)/);
  assert.doesNotMatch(redirect, /"use client"|from "@\/components\/easyt\/trip-prep-workspace"|<TripPrepWorkspace/);
  assert.match(legacyRedirect, /redirect\(tripId \? `\/journey\/\$\{encodeURIComponent\(tripId\)\}` : "\/journey\/dashboard"\)/);
  assert.equal(existsSync("app/journey/prep/trip-prep-client.tsx"), false);
  assert.equal(existsSync("components/easyt/trip-prep-workspace.tsx"), false);
  assert.doesNotMatch(audit, /"MapWorkspace", "Prep", "Mobile320"/);
  assert.match(designSystem, /Trip workspace\*\* — Overview, Itinerary and Map/);
});

test("Overview preparation actions reuse one shared task UI and preserve accessible external handoffs", () => {
  const overview = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  const preparation = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  assert.match(overview, /<TripPreparationTaskSection id="overview-must" title="Must do"/);
  assert.match(overview, /groupTripPrepTasks\(prepReadiness\.tasks\.filter\(\(task\) => task\.status !== "complete"\)\)/);
  assert.match(preparation, /if \(action\.opensTravellerDetails\)/);
  assert.match(preparation, /aria-label=\{`\$\{action\.label\}, opens \$\{action\.provider \?\? "provider"\} in a new tab`\}/);
  assert.match(preparation, /placement: "overview_before_you_go"/);
  assert.doesNotMatch(preparation, /onClick=\{\(\) => undefined\}|taskSummary/);
});
