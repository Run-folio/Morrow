import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { transportBookingProgress } from "../lib/easyt/booking-readiness.ts";
import { tripHealth } from "../lib/easyt/review.ts";
import { deriveOverviewReadinessCategories } from "../lib/easyt/trip-overview-readiness.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import type { TripPrepTask } from "../lib/easyt/trip-prep.ts";
import { deriveOverviewPracticalTasks, setOverviewPrepChoice, deriveTripPrepTasks, groupTripPrepTasks } from "../lib/easyt/trip-prep.ts";
import type { TravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";
import { loadTripRecoveryFromStorage, saveTripRecoveryToStorage, tripDocumentsCanonicalEquivalent, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
import { preserveBuilderCanonicalState } from "../lib/easyt/trip-builder-preservation.ts";

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
  assert.deepEqual(categories.find((category) => category.id === "itinerary"), {
    id: "itinerary",
    label: "Days",
    detail: "Outline created for 2 days. Add activities or leave time free.",
    status: "in-progress",
    percent: 0,
  });
  assert.equal(categories.find((category) => category.id === "accommodation")?.detail, "1 of 2 overnight stays selected");
  assert.equal(categories.find((category) => category.id === "transport")?.status, "complete");
  assert.equal(categories.find((category) => category.id === "passport")?.status, "complete");
  assert.equal(categories.find((category) => category.id === "insurance")?.percent, null);
  assert.equal(categories.find((category) => category.id === "connectivity")?.status, "in-progress");
  assert.equal(categories.find((category) => category.id === "checklist")?.detail, "1 of 2 practicals complete");
  assert.deepEqual(source, before);
});

test("generated day containers do not become fully planned until canonical authored choices shape them", () => {
  const source = trip();
  source.brief.itineraryIdeas = [{
    id: "idea-paris-louvre",
    stopId: "paris",
    placeId: "louvre",
    title: "Louvre Museum",
    category: "activity",
    source: "destination-highlight",
    reasons: ["destination-significance"],
    dayId: "day-1",
  }];

  const partial = deriveOverviewReadinessCategories({ trip: source, prepTasks, providerStatus: "available" })
    .find((category) => category.id === "itinerary");
  assert.deepEqual(partial, {
    id: "itinerary",
    label: "Days",
    detail: "1 of 2 days shaped. Keep planning or leave time free.",
    status: "in-progress",
    percent: 50,
  });

  source.brief.customActivities = { 2: ["Evening walk"] };
  const complete = deriveOverviewReadinessCategories({ trip: source, prepTasks, providerStatus: "available" })
    .find((category) => category.id === "itinerary");
  assert.deepEqual(complete, {
    id: "itinerary",
    label: "Days",
    detail: "2 of 2 days shaped.",
    status: "complete",
    percent: 100,
  });
});

test("a trip with no overnight stops does not invent stay work", () => {
  const source = trip();
  source.stops = source.stops.map((stop) => ({ ...stop, nights: 0 }));
  source.brief.bookings = source.brief.bookings?.filter((booking) => booking.type !== "stay");
  const stays = deriveOverviewReadinessCategories({ trip: source, prepTasks, providerStatus: "available" })
    .find((category) => category.id === "accommodation");
  assert.deepEqual(stays, {
    id: "accommodation",
    label: "Stays",
    detail: "No overnight stays to arrange",
    status: "complete",
    percent: 100,
  });
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
  assert.equal(partial.find((category) => category.id === "itinerary")?.percent, 0);
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
    legs: [],
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
  assert.match(designSystem, /Trip workspace\*\* — Overview, Map, Itinerary, Explore and Stay/);
});

test("Overview preparation actions reuse one shared task UI and preserve accessible external handoffs", () => {
  const overview = readFileSync("components/easyt/trip-overview-workspace.tsx", "utf8");
  const preparation = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  assert.match(overview, /<TripPreparationCards/);
  assert.match(overview, /mutation\.mutateTrip\(\(current\) => setOverviewPrepChoice/);
  assert.match(preparation, /if \(action\.opensTravellerDetails\)/);
  assert.match(preparation, /aria-label=\{`\$\{action\.label\}: \$\{task\.title\}, opens \$\{action\.provider \?\? "provider"\} in a new tab`\}/);
  assert.match(preparation, /renderAsSurface/);
  assert.match(preparation, /placement: "overview_before_you_go"/);
  assert.doesNotMatch(preparation, /onClick=\{\(\) => undefined\}|taskSummary/);
});

const missingProfile = { nationalities: [], residenceCountry: "", passportExpiryMonth: "" };
function practical(source: EasyTTrip, profile: TravelReadinessProfile = missingProfile, tasks: TripPrepTask[] = [], language: "en" | "es" = "en") {
  return deriveOverviewPracticalTasks({ trip: source, tasks, profile, language });
}

test("Overview renders exactly four practical topics and never duplicates canonical Stay or Transport work", () => {
  const cards = practical(trip(), missingProfile, [...prepTasks,
    { id: "stay", title: "Accommodation", detail: "", category: "must", kind: "accommodation", status: "to-do" },
    { id: "transport", title: "Transport", detail: "", category: "good", kind: "transport", status: "to-do" },
  ]);
  assert.deepEqual(cards.map((card) => card.id), ["passport", "insurance", "connectivity", "activity"]);
  assert.equal(cards[3].action?.href, "/journey/overview-readiness/explore?stop=paris");
});

test("prep declarations are reversible, explicit and preserve every existing checklist item", () => {
  const source = trip();
  const originalChecklist = structuredClone(source.brief.checklist);
  let changed = setOverviewPrepChoice(source, "insurance", "sorted");
  assert.equal(practical(changed)[1].status, "sorted");
  changed = setOverviewPrepChoice(changed, "insurance", "not-needed");
  assert.equal(practical(changed)[1].status, "not-needed");
  const declaration = changed.brief.checklist?.find((item) => item.id === "overview-prep-insurance");
  assert.equal(declaration?.complete, false);
  assert.equal(declaration?.resolution, "not-needed");
  changed = setOverviewPrepChoice(changed, "insurance", "to-review");
  assert.equal(practical(changed)[1].status, "to-review");
  assert.equal(changed.brief.checklist?.find((item) => item.id === "overview-prep-insurance")?.resolution, undefined);
  assert.deepEqual(changed.brief.checklist?.slice(0, originalChecklist?.length), originalChecklist);
  assert.equal(changed.brief.checklist?.filter((item) => item.id === "overview-prep-insurance").length, 1);
  assert.deepEqual(source.brief.checklist, originalChecklist);
});

test("all four practical review checkboxes toggle through stable trip checklist IDs", () => {
  const kinds = ["passport", "insurance", "connectivity", "activity"] as const;
  const source = trip();
  let changed = source;
  for (const kind of kinds) {
    changed = setOverviewPrepChoice(changed, kind, "sorted");
    assert.equal(practical(changed).find((task) => task.id === kind)?.status, "sorted");
  }
  assert.deepEqual(
    changed.brief.checklist?.filter((item) => item.id.startsWith("overview-prep-")).map((item) => item.id),
    ["overview-prep-passport", "overview-prep-insurance", "overview-prep-connectivity", "overview-prep-activities"],
  );
  for (const kind of kinds) {
    changed = setOverviewPrepChoice(changed, kind, "to-review");
    assert.equal(practical(changed).find((task) => task.id === kind)?.status, "to-review");
  }
  assert.deepEqual(source.brief.checklist, trip().brief.checklist);
});

test("passport review is declared by the traveller, not inferred from profile or legacy entry completion", () => {
  const source = trip();
  source.brief.checklist?.push({ id: "legacy-passport", label: "Passport checked", complete: true });
  const profile = { nationalities: ["Spain"], residenceCountry: "Spain", passportExpiryMonth: "2028-12" };
  assert.equal(practical(source, profile)[0].status, "details-added");
  const reviewed = setOverviewPrepChoice(source, "passport", "sorted");
  assert.equal(practical(reviewed, profile)[0].status, "sorted");
  assert.equal(reviewed.brief.checklist?.find((item) => item.id === "legacy-passport")?.complete, true);
  const unchecked = setOverviewPrepChoice(reviewed, "passport", "to-review");
  assert.equal(practical(unchecked, profile)[0].status, "details-added");
  assert.equal(unchecked.brief.checklist?.find((item) => item.id === "overview-prep-passport")?.complete, false);
});

test("legacy completion stays visible and an explicit review choice can override it without deleting it", () => {
  const source = trip();
  source.brief.checklist?.push({ id: "insurance", label: "Travel insurance", complete: true });
  assert.equal(practical(source)[1].status, "sorted");
  const changed = setOverviewPrepChoice(source, "insurance", "to-review");
  assert.equal(practical(changed)[1].status, "to-review");
  assert.equal(changed.brief.checklist?.find((item) => item.id === "insurance")?.complete, true);
});

test("saved fields establish details added without claiming passport validity or entry eligibility", () => {
  assert.equal(practical(trip())[0].status, "to-review"); // Legacy completed passport checklist is not saved profile data.
  const added = practical(trip(), { nationalities: ["Spain"], residenceCountry: "Spain", passportExpiryMonth: "" })[0];
  assert.equal(added.status, "details-added");
  assert.doesNotMatch(JSON.stringify(added), /valid|approved|ready to travel/i);
  assert.equal(added.action?.opensTravellerDetails, true);
});

test("provider links remain exact and never count as completion; missing providers remain truthful", () => {
  const source = trip();
  source.brief.checklist = [];
  const tasks: TripPrepTask[] = [{ id: "insurance", title: "Insurance", detail: "", kind: "insurance", status: "to-do", category: "must", action: { label: "Quote", href: "https://approved.example/insurance?affiliate=123", external: true, affiliate: true, provider: "world-nomads" } }];
  const cards = practical(source, missingProfile, tasks);
  assert.equal(cards[1].action?.href, tasks[0].action?.href);
  assert.equal(cards[1].action?.affiliate, true);
  assert.equal(cards[1].status, "to-review");
  assert.equal(practical(source)[1].action, undefined);
  assert.equal(practical(source)[2].action, undefined);
  source.stops = [];
  assert.equal(practical(source)[3].action, undefined);
});

test("Stay dates and estimates do not create selected or booked progress, and unknown counts stay unknown", () => {
  const source = trip();
  source.brief.bookings = [];
  const categories = deriveOverviewReadinessCategories({ trip: source, prepTasks: [], providerStatus: "available" });
  assert.equal(categories.find((card) => card.id === "accommodation")?.status, "to-do");
  assert.equal(categories.find((card) => card.id === "accommodation")?.percent, 0);
  assert.equal(categories.find((card) => card.id === "transport")?.percent, 0);
  source.stops[0].nights = null;
  assert.equal(deriveOverviewReadinessCategories({ trip: source, prepTasks: [], providerStatus: "available" }).find((card) => card.id === "accommodation")?.percent, null);
  source.legs = [];
  assert.equal(deriveOverviewReadinessCategories({ trip: source, prepTasks: [], providerStatus: "available" }).find((card) => card.id === "transport")?.percent, null);
  source.startDate = ""; source.endDate = ""; source.planItems = [];
  assert.equal(deriveOverviewReadinessCategories({ trip: source, prepTasks: [], providerStatus: "available" }).find((card) => card.id === "itinerary")?.percent, null);
});

test("practical prep has English and Spanish copy with the same status and destination", () => {
  const source = setOverviewPrepChoice(trip(), "connectivity", "not-needed");
  const english = practical(source);
  const spanish = practical(source, missingProfile, [], "es");
  assert.equal(spanish[0].title, "Pasaporte y datos del viajero");
  assert.equal(spanish[3].title, "Actividades");
  assert.deepEqual(spanish.map((card) => card.status), english.map((card) => card.status));
  assert.equal(spanish[3].action?.href, english[3].action?.href);
});

test("declarations survive canonical recovery reload and Builder rebuild, isolated by trip and owner", () => {
  const values = new Map<string, string>();
  const storage: EasyTBrowserStorage = {
    get length() { return values.size; },
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => { values.set(key, value); },
    removeItem: (key) => { values.delete(key); },
    key: (index) => [...values.keys()][index] ?? null,
  };
  const source = trip();
  const changed = setOverviewPrepChoice(source, "insurance", "not-needed");
  assert.equal(tripDocumentsCanonicalEquivalent(source, changed), false);
  assert.equal(saveTripRecoveryToStorage(storage, changed).stored, true);
  const reloaded = loadTripRecoveryFromStorage(storage, changed.id, changed.ownerId)?.trip;
  assert.ok(reloaded);
  assert.equal(practical(reloaded)[1].status, "not-needed");
  assert.equal(loadTripRecoveryFromStorage(storage, "another-trip", changed.ownerId), null);
  assert.equal(loadTripRecoveryFromStorage(storage, changed.id, "another-owner"), null);
  const second = { ...trip(), id: "another-trip" };
  assert.equal(saveTripRecoveryToStorage(storage, second).stored, true);
  assert.equal(practical(loadTripRecoveryFromStorage(storage, second.id, second.ownerId)!.trip)[1].status, "to-review");
  const rebuilt = preserveBuilderCanonicalState(reloaded, source);
  assert.equal(practical(rebuilt)[1].status, "not-needed");
});


test("an empty trip does not imply stays or transfers are already sorted", () => {
  const empty = { ...trip(), stops: [], legs: [], planItems: [], startDate: "", endDate: "" };
  const categories = deriveOverviewReadinessCategories({ trip: empty, prepTasks: [], providerStatus: "available" });
  for (const id of ["accommodation", "transport"]) {
    const category = categories.find((item) => item.id === id);
    assert.equal(category?.percent, null);
    assert.equal(category?.status, "needs-review");
  }
});
