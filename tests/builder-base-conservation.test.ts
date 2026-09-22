import assert from "node:assert/strict";
import test from "node:test";
import { canBuildTrip } from "../lib/easyt/can-build-trip.ts";
import { createHomeTripDraft, handoffRouteStops } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { calendarDayAllocationsFromNights } from "../lib/easyt/night-allocation.ts";
import { buildCredibleItinerary } from "../lib/easyt/planner.ts";
import { tripFromBuilder } from "../lib/easyt/trip.ts";
import { isSameCanonicalPlace } from "../lib/easyt/journey-endpoints.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

test("a provider base attaches Taj Mahal to the existing Agra occurrence", { skip: !builderBrowserTestsEnabled }, async () => {
  const capture = captureJourneyBrief("Starting from Paris, Jaipur, Agra, Taj Mahal and Delhi");
  // The hosted failure used a provider landmark without the catalogue's Agra
  // parent hint, so the traveller had to choose its nearby overnight base.
  const mentions = capture.mentions.map((mention) => mention.canonicalPlaceId === "taj-mahal"
    ? { ...mention, parentRegionId: undefined, accessPlaceName: undefined }
    : mention);
  const draft = createHomeTripDraft({
    capture: { ...capture, mentions, structuredBrief: { ...capture.structuredBrief, placeMentions: mentions } },
    handoffId: "taj-base-conservation", datesExplicit: true,
    startDate: "2026-10-06", endDate: "2026-10-27", travellers: 2, travellersExplicit: true, interests: [],
    origin: { name: "Paris", country: "France", canonicalPlaceId: "paris", coordinates: [2.3522, 48.8566] },
  });
  draft.destinations = handoffRouteStops(mentions, capture.journeyEnd);
  const view = await renderBuilder({ query: "?homeDraft=1", draft, nearbyCandidates: [{
    canonicalPlaceId: "open-world:node:agra", name: "Agra", country: "India", placeType: "city",
    coordinates: [78.0098161, 27.1752554], routability: "direct_destination",
    provenance: [{ id: "node:agra", label: "Provider", kind: "provider", supports: "Verified Agra" }],
  }] });
  try {
    const initial = draft.destinations.map((stop) => stop.id);
    assert.deepEqual(initial, ["jaipur-1", "agra-2", "delhi-4"]);
    await view.page.getByRole("dialog").getByRole("button", { name: /^Agra/ }).first().click();
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0")));
    const persisted = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!).trip)
      .find((trip) => trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0")));
    assert.deepEqual(persisted.stops.map((stop: { id: string }) => stop.id), initial);
    const visit = persisted.brief.structuredBrief.placeSelections.find((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0");
    assert.equal(visit.kind, "visit");
    assert.equal(visit.routeStopId, "agra-2");
    assert.equal(visit.selectedCanonicalPlaceId, "open-world:node:agra");
    assert.equal(persisted.brief.structuredBrief.placeMentions.some((mention: { canonicalPlaceId: string }) => mention.canonicalPlaceId === "taj-mahal"), true);
    assert.deepEqual([...new Set(persisted.planItems.map((item: { stopId: string }) => item.stopId))].sort(), initial.slice().sort());
    await view.page.getByRole("dialog").getByRole("button", { name: /Done with Taj Mahal|Finish shaping route/ }).click();
    assert.equal(await view.page.getByRole("button", { name: /^Build trip/ }).isEnabled(), true);
    assert.deepEqual(view.errors, []);
    await view.page.reload();
    await view.page.waitForFunction(() => Boolean(document.querySelector('[data-builder-root="true"]:not([aria-busy="true"])')));
    const recovered = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!).trip)
      .find((trip) => trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0")));
    assert.deepEqual(recovered.stops.map((stop: { id: string }) => stop.id), initial);
    assert.equal(recovered.brief.structuredBrief.placeSelections.find((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0").routeStopId, "agra-2");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("resolving India through existing Delhi does not append a second Delhi", { skip: !builderBrowserTestsEnabled }, async () => {
  const capture = captureJourneyBrief("Starting from Paris, Jaipur, Agra, Taj Mahal, Delhi and India");
  const mentions = capture.mentions.map((mention) => mention.canonicalPlaceId === "taj-mahal"
    ? { ...mention, parentRegionId: undefined, accessPlaceName: undefined }
    : mention);
  const draft = createHomeTripDraft({ capture: { ...capture, mentions, structuredBrief: { ...capture.structuredBrief, placeMentions: mentions } },
    handoffId: "india-base-conservation", datesExplicit: true, startDate: "2026-10-06", endDate: "2026-10-27",
    travellers: 2, travellersExplicit: true, interests: [],
    origin: { name: "Paris", country: "France", canonicalPlaceId: "paris", coordinates: [2.3522, 48.8566] } });
  draft.destinations = handoffRouteStops(mentions, capture.journeyEnd);
  const view = await renderBuilder({ query: "?homeDraft=1", draft, geocodeCandidates: { Delhi: [{
    canonicalPlaceId: "open-world:node:delhi", name: "Delhi", country: "India", placeType: "city",
    coordinates: [77.209, 28.6139], routability: "direct_destination",
    provenance: [{ id: "node:delhi", label: "Provider", kind: "provider", supports: "Verified Delhi" }],
  }] }, nearbyCandidates: [
    { canonicalPlaceId: "open-world:node:agra", name: "Agra", country: "India", placeType: "city",
      coordinates: [78.0098161, 27.1752554], routability: "direct_destination",
      provenance: [{ id: "node:agra", label: "Provider", kind: "provider", supports: "Verified Agra" }] },
    { canonicalPlaceId: "open-world:node:delhi", name: "Delhi", country: "India", placeType: "city",
      coordinates: [77.209, 28.6139], routability: "direct_destination",
      provenance: [{ id: "node:delhi", label: "Provider", kind: "provider", supports: "Verified Delhi" }] },
  ] });
  try {
    const initial = draft.destinations.map((stop) => stop.id);
    await view.page.getByRole("dialog").getByRole("button", { name: /^Agra/ }).first().click();
    await view.page.getByRole("dialog").getByRole("button", { name: /Done with Taj Mahal/ }).click();
    assert.match(await view.page.getByRole("dialog").innerText(), /Choose places in India/);
    await view.page.getByRole("dialog").getByRole("combobox", { name: /Search within India/ }).fill("Delhi");
    await view.page.getByRole("dialog").getByRole("option", { name: /^Delhi/ }).first().click();
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string; routeStopId: string }) => selection.mentionId === "place-india-0" && selection.routeStopId === "delhi-4")));
    const persisted = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!).trip)
      .find((trip) => trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-india-0")));
    assert.deepEqual(persisted.stops.map((stop: { id: string }) => stop.id), initial);
    assert.equal(persisted.brief.structuredBrief.placeSelections.find((selection: { mentionId: string }) => selection.mentionId === "place-india-0").routeStopId, "delhi-4");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("a provider Mumbai base is the same occurrence for Taj Mahal Palace, but Agra is not", () => {
  const mumbai = { id: "mumbai-1", name: "Mumbai", country: "India", canonicalPlaceId: "mumbai", coordinates: [72.8692035, 19.054999] as [number, number] };
  const providerMumbai = { name: "Mumbai", country: "India", canonicalPlaceId: "open-world:node:mumbai", coordinates: [72.8692035, 19.054999] as [number, number] };
  const agra = { name: "Agra", country: "India", canonicalPlaceId: "agra", coordinates: [78.0098161, 27.1752554] as [number, number] };
  assert.equal(isSameCanonicalPlace(mumbai, providerMumbai), true);
  assert.equal(isSameCanonicalPlace(agra, providerMumbai), false);
});

test("Taj Mahal Palace visit attaches to one existing Mumbai base", { skip: !builderBrowserTestsEnabled }, async () => {
  const capture = captureJourneyBrief("Starting from Paris, Mumbai and Taj Mahal Palace");
  const mentions = capture.mentions.map((mention) => mention.canonicalPlaceId === "taj-mahal"
    ? { ...mention, canonicalName: "Taj Mahal Palace", sourceText: "Taj Mahal Palace",
      aliases: ["Taj Mahal Palace"], canonicalPlaceId: "open-world:photon:W:28846517",
      coordinates: [72.8332848, 18.921778] as [number, number], parentRegionId: "Maharashtra", accessPlaceName: undefined }
    : mention);
  const draft = createHomeTripDraft({ capture: { ...capture, mentions, structuredBrief: { ...capture.structuredBrief, placeMentions: mentions } },
    handoffId: "palace-base-conservation", datesExplicit: true, startDate: "2026-10-06", endDate: "2026-10-16",
    travellers: 2, travellersExplicit: true, interests: [],
    origin: { name: "Paris", country: "France", canonicalPlaceId: "paris", coordinates: [2.3522, 48.8566] } });
  draft.destinations = handoffRouteStops(mentions, capture.journeyEnd);
  const view = await renderBuilder({ query: "?homeDraft=1", draft, nearbyCandidates: [{
    canonicalPlaceId: "open-world:node:mumbai", name: "Mumbai", country: "India", placeType: "city",
    coordinates: [72.8692035, 19.054999], routability: "direct_destination",
    provenance: [{ id: "node:mumbai", label: "Provider", kind: "provider", supports: "Verified Mumbai" }],
  }] });
  try {
    assert.deepEqual(draft.destinations.map((stop) => stop.id), ["mumbai-1"]);
    await view.page.getByRole("dialog").getByRole("button", { name: /^Mumbai/ }).first().click();
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0")));
    const persisted = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!).trip)
      .find((trip) => trip?.brief.structuredBrief?.placeSelections
        ?.some((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0")));
    assert.deepEqual(persisted.stops.map((stop: { id: string }) => stop.id), ["mumbai-1"]);
    assert.equal(persisted.brief.structuredBrief.placeSelections.find((selection: { mentionId: string }) => selection.mentionId === "place-taj-mahal-0").routeStopId, "mumbai-1");
    assert.equal(persisted.brief.structuredBrief.placeMentions.some((mention: { canonicalPlaceId: string }) => mention.canonicalPlaceId === "open-world:photon:W:28846517"), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("a deliberate Tokyo return keeps both occurrences covered by their own days", () => {
  const stops = [
    { id: "tokyo-first", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] as [number, number] },
    { id: "kyoto", name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto", coordinates: [135.7681, 35.0116] as [number, number] },
    { id: "tokyo-return", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] as [number, number] },
  ];
  const allocations = { "tokyo-first": 1, kyoto: 1, "tokyo-return": 1 };
  const draft = buildCredibleItinerary({ origin: "London", stops, startDate: "2026-10-01",
    allocations: calendarDayAllocationsFromNights(stops.map((stop) => stop.id), allocations), picks: {}, places: {} });
  const trip = tripFromBuilder({ id: "tokyo-return-trip", origin: "London", originCoordinates: [-0.1276, 51.5072],
    stops, startDate: "2026-10-01", endDate: "2026-10-04", picks: {}, mustDo: "Tokyo, Kyoto, Tokyo",
    pace: "slow", hotels: "few", budget: "mid", nightAllocations: allocations, draft });
  assert.deepEqual(trip.planItems.map((item) => item.stopId), ["tokyo-first", "kyoto", "tokyo-return", "tokyo-return"]);
  const nightAllocation = { version: 1 as const, configVersion: "test", state: "allocated" as const,
    totalAvailableNights: 3, totalAllocatedNights: 3, allocations, stops: [], conflicts: [], notices: [] };
  const gate = canBuildTrip({ origin: "London", originCoordinates: [-0.1276, 51.5072], stops,
    startDate: "2026-10-01", endDate: "2026-10-04", durationDays: 4, nightAllocation, allocations,
    document: trip });
  assert.equal(gate.canBuildTrip, true);
  const missingFirstOccurrence = { ...trip, planItems: trip.planItems.filter((item) => item.stopId !== "tokyo-first") };
  const invalid = canBuildTrip({ origin: "London", originCoordinates: [-0.1276, 51.5072], stops,
    startDate: "2026-10-01", endDate: "2026-10-04", durationDays: 4, nightAllocation, allocations,
    document: missingFirstOccurrence });
  assert.equal(invalid.canBuildTrip, false);
  assert.equal(invalid.conflicts.some((item) => item.code === "itinerary-stop-uncovered"), true);
});
