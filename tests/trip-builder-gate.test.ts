import assert from "node:assert/strict";
import test from "node:test";
import { canBuildTrip, type CanBuildTripInput } from "../lib/easyt/can-build-trip.ts";
import type { NightAllocationResult } from "../lib/easyt/night-allocation.ts";
import { createPlanningConfidence } from "../lib/easyt/planning-confidence.ts";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { generateRouteCandidates } from "../lib/easyt/route-candidates.ts";
import { extractStructuredTripBrief, mergeStructuredTripBrief, routeConstraintsFromStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";
import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

const endpointDraft = {
  origin: "London", originCanonicalPlaceId: "london", originCountry: "United Kingdom",
  originCoordinates: [-0.1276, 51.5072],
  destinations: [
    { id: "seoul-stay", name: "Seoul", country: "South Korea", canonicalPlaceId: "seoul", coordinates: [126.978, 37.5665] },
    { id: "busan-stay", name: "Busan", country: "South Korea", canonicalPlaceId: "busan", coordinates: [129.0756, 35.1796] },
  ],
  startDate: "2027-04-02", endDate: "2027-04-12", datesExplicit: true,
};

test("populated Builder exposes explicit, Same as start and unknown journey ends through Edit trip", { skip: !builderBrowserTestsEnabled }, async () => {
  for (const [journeyEnd, expectedEnd] of [
    [{ mode: "explicit", place: endpointDraft.destinations[1] }, "Busan"],
    [{ mode: "same_as_start" }, "Same as start · London"],
    [{ mode: "unknown" }, "Not sure yet"],
  ] as const) {
    const view = await renderBuilder({ query: "?homeDraft=1", draft: { ...endpointDraft, journeyEnd } });
    try {
      const details = view.page.getByRole("region", { name: "Journey details", exact: true });
      await details.waitFor({ timeout: 3000 });
      assert.match(await details.innerText(), new RegExp(expectedEnd));
      assert.equal(await details.getByRole("combobox").count(), 0);
      await details.getByRole("button", { name: "Edit trip", exact: true }).click();
      assert.equal(await details.getByRole("combobox", { name: "Ending at" }).inputValue(), journeyEnd.mode === "explicit" ? "Busan" : journeyEnd.mode === "same_as_start" ? "London" : "");
      assert.equal(await view.page.getByRole("heading", { name: "Nights per stop" }).count(), 1);
      assert.equal(await view.page.getByRole("textbox", { name: "TELL US ABOUT YOUR TRIP" }).count(), 0);
      await details.getByRole("button", { name: "Cancel", exact: true }).click();
      assert.equal(await details.getByRole("button", { name: "Edit trip", exact: true }).getAttribute("aria-expanded"), "false");
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  }
});

test("editing Builder end modes commits atomically and Cancel leaves canonical recovery unchanged", { skip: !builderBrowserTestsEnabled }, async () => {
  const view = await renderBuilder({ query: "?homeDraft=1", draft: { ...endpointDraft, journeyEnd: { mode: "unknown" } } });
  const storedTrip = async (mode: string) => {
    await view.page.waitForFunction((expected: string) => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief.journeyEnd?.mode === expected), mode);
    return await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!)).find((record) => record.trip)?.trip) as EasyTTrip;
  };
  try {
    await view.page.route("**/api/journey-geocode?place=Busan*", async (route: { fulfill: (response: unknown) => Promise<void> }) => {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ candidates: [{
          name: "Busan", country: "South Korea", canonicalPlaceId: "busan", providerId: "fixture:busan",
          coordinates: [129.0756, 35.1796], placeType: "city", routability: "direct_destination", matchQuality: "exact",
        }] }),
      });
    });
    const details = view.page.getByRole("region", { name: "Journey details", exact: true });
    await details.waitFor({ timeout: 3000 });
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    const before = await storedTrip("unknown");
    const stopIds = before.stops.map((stop) => stop.id);
    await details.getByRole("combobox", { name: "Ending at" }).fill("Busan");
    await details.getByRole("option").filter({ hasText: "Busan" }).first().click();
    await details.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await storedTrip("unknown")).brief.journeyEnd?.mode, "unknown");
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("combobox", { name: "Ending at" }).fill("Busan");
    await details.getByRole("option").filter({ hasText: "Busan" }).first().click();
    await details.getByRole("button", { name: "Save changes", exact: true }).click();
    const explicit = await storedTrip("explicit");
    assert.equal(explicit.brief.journeyEnd?.mode === "explicit" && explicit.brief.journeyEnd.place.canonicalPlaceId, "busan");
    assert.deepEqual(explicit.stops.map((stop) => stop.id), stopIds);
    assert.equal(explicit.stops.find((stop) => stop.canonicalPlaceId === "busan")?.nights, before.stops.find((stop) => stop.canonicalPlaceId === "busan")?.nights);
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("button", { name: "Same as start", exact: true }).click();
    await details.getByRole("button", { name: "Save changes", exact: true }).click();
    const roundTrip = await storedTrip("same_as_start");
    assert.deepEqual(roundTrip.stops.map((stop) => stop.id), stopIds);
    assert.equal(roundTrip.legs.at(-1)?.classification, "departure");
    assert.equal(roundTrip.legs.at(-1)?.toEndpoint?.canonicalPlaceId, "london");
    assert.equal(roundTrip.stops.some((stop) => stop.canonicalPlaceId === "london"), false);
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("button", { name: "Clear journey end", exact: true }).click();
    await details.getByRole("button", { name: "Save changes", exact: true }).click();
    const unknown = await storedTrip("unknown");
    assert.deepEqual(unknown.stops.map((stop) => stop.id), stopIds);
    assert.equal(unknown.legs.some((leg) => leg.classification === "departure"), false);
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("button", { name: /Increase travellers/ }).click();
    await details.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal((await storedTrip("unknown")).travellers, 2);
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("button", { name: /Increase travellers/ }).click();
    await details.getByRole("button", { name: "Save changes", exact: true }).click();
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.travellers === 3));
    assert.equal((await storedTrip("unknown")).travellers, 3);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("canonical published handoff stays ready while optional enrichment is pending in Chromium and WebKit", { skip: !builderBrowserTestsEnabled }, async () => {
  for (const browserName of ["chromium", "webkit"] as const) {
    const view = await renderBuilder({
      query: "?inspire=japan-south-korea",
      browserName,
      geocodeDelayMs: 2_000,
    });
    try {
      const build = view.page.getByRole("button", { name: "Build trip", exact: false });
      await build.waitFor({ timeout: 3_000 });
      assert.equal(await build.isDisabled(), false, `${browserName} must use the canonical handoff instead of pending enrichment`);
      assert.equal(await view.page.getByText("Finish checking your places before continuing.", { exact: true }).count(), 0);
      await build.evaluate((element: HTMLButtonElement) => element.click());
      await view.page.waitForFunction(() => location.pathname !== "/journey/new", undefined, { timeout: 10_000 });
      assert.match(new URL(view.page.url()).pathname, /^\/journey\/(?:trip-[^/]+|trips\/sync\/sign-in)/);
    } finally {
      await view.close();
    }
  }
});

function allocatedNightResult(allocations: Record<string, number>, state: "allocated" | "compromised" = "allocated"): NightAllocationResult {
  const total = Object.values(allocations).reduce((sum, nights) => sum + nights, 0);
  return {
    version: 1,
    configVersion: "builder-gate-fixture",
    state,
    totalAvailableNights: total,
    totalAllocatedNights: total,
    allocations,
    stops: [],
    conflicts: [],
    notices: [],
  };
}

function document(stopIds = ["tokyo", "kyoto"], planStopIds = ["tokyo", "kyoto", "kyoto"]) {
  return {
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    stops: stopIds.map((id) => ({ id })),
    planItems: planStopIds.map((stopId, index) => ({ stopId, dayNumber: index + 1, date: `2026-10-0${index + 1}` })),
  } as Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate">;
}

function validInput(): CanBuildTripInput {
  const allocations = { tokyo: 1, kyoto: 1 };
  return {
    origin: "London",
    originCoordinates: [-0.1276, 51.5072],
    stops: [
      { id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] },
      { id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] },
    ],
    placeIssues: [],
    routeConstraintIssues: [],
    requiredStopIds: ["tokyo", "kyoto"],
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    durationDays: 3,
    expectedDurationDays: 3,
    structuredBriefIssues: [],
    nightAllocation: allocatedNightResult(allocations),
    allocations,
    document: document(),
  };
}

function krugerAttentionDraft() {
  const route = publicRouteDetailFor("morocco-rail");
  assert.ok(route);
  const draft = routePlannerPayload(route.planDraft);
  const provenance = [{
    id: "fixture:kruger-national-park",
    label: "Controlled place fixture",
    kind: "provider" as const,
    supports: "Provider-confirmed Kruger National Park identity and coordinates.",
  }];
  const mention = {
    mentionId: "place-kruger-national-park",
    sourceText: "Kruger National Park",
    sourceTexts: ["Kruger National Park"],
    normalizedPhrase: "kruger national park",
    canonicalName: "Kruger National Park",
    canonicalPlaceId: "fixture:kruger-national-park",
    aliases: [],
    placeType: "natural_area" as const,
    status: "resolved" as const,
    confidence: createPlanningConfidence({
      state: "inferred",
      level: "high",
      freshness: "current",
      scope: "general-route",
      sources: [],
      reason: "Provider-confirmed protected area.",
    }),
    provenance,
    parentCountries: ["South Africa"],
    parentRegionId: "Mpumalanga",
    coordinates: [31.485, -24.994] as [number, number],
    routability: "needs_base_selection" as const,
    directlyRoutable: false,
    requiresBaseSelection: true,
    isAnchor: true,
    role: "preferred" as const,
    order: 99,
    candidates: [],
  };
  const issue = {
    code: "region_requires_base" as const,
    mentionId: mention.mentionId,
    canonicalPlaceId: mention.canonicalPlaceId,
    sourceText: mention.sourceText,
    reason: "The requested protected area needs an overnight base before it can become a route stop.",
    message: "Choose where to stay for Kruger National Park before Morrovia adds it to the route.",
    severity: "error" as const,
    blocksRoute: true,
    options: [],
    provenance,
    confidence: mention.confidence,
  };
  return {
    ...draft,
    structuredBrief: {
      ...draft.structuredBrief,
      placeMentions: [...(draft.structuredBrief.placeMentions ?? []), mention],
      placeIssues: [...(draft.structuredBrief.placeIssues ?? []), issue],
    },
  };
}

function krugerAttentionDraftWithUnverifiedModelBase() {
  const draft = krugerAttentionDraft();
  return {
    ...draft,
    planningSuggestions: [{
      mentionId: "place-kruger-national-park",
      regionCanonicalPlaceId: "fixture:kruger-national-park",
      canonicalPlaceId: "open-world:fixture:hoedspruit",
      name: "Hoedspruit",
      country: "South Africa",
      placeType: "town" as const,
      coordinates: [30.9547, -24.351] as [number, number],
      reason: "Possible overnight base candidate for the park region.",
      provenance: [{
        id: "planning-model:place-kruger-national-park:hoedspruit",
        label: "Morrovia planning suggestion",
        kind: "context" as const,
        supports: "A planning model proposed this optional candidate.",
      }],
      anchorMatched: true,
    }],
  };
}

function multipleAttentionDraft() {
  const draft = krugerAttentionDraft();
  const kruger = draft.structuredBrief.placeMentions!.find((mention) => mention.mentionId === "place-kruger-national-park")!;
  const krugerIssue = draft.structuredBrief.placeIssues!.find((issue) => issue.mentionId === kruger.mentionId)!;
  const serengeti = {
    ...kruger,
    mentionId: "place-serengeti-national-park",
    sourceText: "Serengeti National Park",
    sourceTexts: ["Serengeti National Park"],
    normalizedPhrase: "serengeti national park",
    canonicalName: "Serengeti National Park",
    canonicalPlaceId: "fixture:serengeti-national-park",
    parentCountries: ["Tanzania"],
    parentRegionId: "Mara",
    coordinates: [34.8333, -2.3333] as [number, number],
    order: kruger.order + 1,
  };
  const serengetiIssue = {
    ...krugerIssue,
    mentionId: serengeti.mentionId,
    canonicalPlaceId: serengeti.canonicalPlaceId,
    sourceText: serengeti.sourceText,
    message: "Choose where to stay for Serengeti National Park before Morrovia adds it to the route.",
  };
  return {
    ...draft,
    structuredBrief: {
      ...draft.structuredBrief,
      placeMentions: [...draft.structuredBrief.placeMentions!, serengeti],
      placeIssues: [...draft.structuredBrief.placeIssues!, serengetiIssue],
    },
  };
}

test("valid builder document passes the authoritative invariant", () => {
  const result = canBuildTrip(validInput());
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.canBuildTrip, true);
  assert.deepEqual(result.conflicts, []);
  assert.equal(result.qualityClassification, "reasonable");
});

test("a canonical coordinate-less stop can advance while enrichment remains unknown", () => {
  const input = validInput();
  input.stops[1] = {
    id: "kyoto",
    name: "Kyoto",
    country: "Japan",
    canonicalPlaceId: "kyoto",
  };

  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "route-input-invalid"), false);
});

test("a coordinate-less stop without canonical identity still requires review", () => {
  const input = validInput();
  input.stops[1] = { id: "kyoto", name: "Kyoto", country: "Japan" };

  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "route-input-invalid"), true);
});

test("the exact Cancún endpoint and opening-stay trip can advance to dates and nights", () => {
  const prompt = "Start in Cancún, stay overnight in Cancún, Tulum, Antigua Guatemala, Caye Caulker, Belize City and Flores, then return to Cancún for 22 days";
  const stops = [
    { id: "cancun-stay", name: "Cancún", country: "Mexico", coordinates: [-86.8515, 21.1619] as [number, number] },
    { id: "tulum", name: "Tulum", country: "Mexico", coordinates: [-87.4654, 20.2114] as [number, number] },
    { id: "antigua", name: "Antigua Guatemala", country: "Guatemala", coordinates: [-90.734, 14.557] as [number, number] },
    { id: "caye-caulker", name: "Caye Caulker", country: "Belize", coordinates: [-88.0329, 17.7425] as [number, number] },
    { id: "belize-city", name: "Belize City", country: "Belize", coordinates: [-88.1962, 17.5046] as [number, number] },
    { id: "flores", name: "Flores", country: "Guatemala", coordinates: [-89.897, 16.9294] as [number, number] },
  ];
  const brief = mergeStructuredTripBrief(extractStructuredTripBrief(prompt), {
    destinations: [
      { name: "Cancún", role: "arrival-gateway", priority: "required" },
      ...stops.map((stop) => ({ id: stop.id, name: stop.name, role: "preferred" as const, priority: "normal" as const })),
      { name: "Cancún", role: "departure-gateway", priority: "required" },
    ],
    mustVisit: stops.map((stop) => stop.name),
  });
  const constraints = routeConstraintsFromStructuredTripBrief(brief, stops.map((stop) => stop.id));
  const route = generateRouteCandidates({
    origin: { name: "Cancún", coordinates: [-86.8515, 21.1619] },
    stops,
    constraints,
    estimateLeg: () => ({ mode: "road", distanceKm: 100, durationMinutes: 120, label: "Test transfer", note: "Fixture.", confidence: "medium" }),
  });
  const input = validInput();
  input.origin = "Cancún";
  input.originCoordinates = [-86.8515, 21.1619];
  input.stops = stops;
  input.placeIssues = [];
  input.routeConstraintIssues = route.constraintIssues;
  input.requiredStopIds = constraints.requiredStopIds;
  input.expectedDurationDays = 22;

  assert.equal(constraints.fixedStartStopId, undefined);
  assert.equal(constraints.fixedEndStopId, undefined);
  assert.equal(route.constraintIssues.some((issue) => issue.code === "fixed-endpoint-conflict"), false);
  assert.equal(canBuildTrip(input).canAdvanceToTime, true);
});

test("a viable itinerary is not rejected across the exploratory duration range", () => {
  for (const durationDays of [7, 14, 28, 42, 56, 84]) {
    const input = validInput();
    const startDate = "2026-10-01";
    const start = new Date(`${startDate}T00:00:00Z`);
    const dateFor = (offset: number) => new Date(start.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
    const endDate = dateFor(durationDays - 1);
    const allocations = { tokyo: 1, kyoto: durationDays - 2 };
    input.startDate = startDate;
    input.endDate = endDate;
    input.durationDays = durationDays;
    input.expectedDurationDays = durationDays;
    input.allocations = allocations;
    input.nightAllocation = allocatedNightResult(allocations);
    input.document = {
      startDate,
      endDate,
      stops: [{ id: "tokyo" }, { id: "kyoto" }],
      planItems: Array.from({ length: durationDays }, (_, index) => ({
        stopId: index === 0 ? "tokyo" : "kyoto",
        dayNumber: index + 1,
        date: dateFor(index),
      })),
    } as Pick<EasyTTrip, "stops" | "planItems" | "startDate" | "endDate">;

    const result = canBuildTrip(input);
    assert.equal(result.canBuildTrip, true, `${durationDays}-day itinerary should not fail on duration alone`);
    assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates" || conflict.code === "duration-conflict"), false);
  }
});

test("progress tab cannot bypass unresolved place review", () => {
  const input = validInput();
  input.placeIssues = [{ mentionId: "mystery", blocksRoute: true, message: "Confirm Mystery Coast before building the route." }];
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.qualityClassification, "impossible");
  assert.equal(result.firstConflict?.code, "place-review-required");
});

test("non-critical unresolved traveller intent needs attention without blocking a valid canonical route", () => {
  const input = validInput();
  input.placeIssues = [{
    code: "region_requires_base",
    mentionId: "kruger",
    sourceText: "Kruger National Park",
    blocksRoute: true,
    message: "Choose where to stay for Kruger National Park before Morrovia adds it to the route.",
  }];
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.canBuildTrip, true);
  assert.deepEqual(result.needsAttention, [{
    code: "unresolved-place-intent",
    mentionId: "kruger",
    sourceText: "Kruger National Park",
    message: "Choose where to stay for Kruger National Park before Morrovia adds it to the route.",
    source: "place-intelligence",
  }]);
});

test("a conflicting traveller place role remains a hard readiness conflict", () => {
  const input = validInput();
  input.placeIssues = [{
    code: "conflicting_place_roles",
    mentionId: "kyoto-conflict",
    sourceText: "Kyoto",
    blocksRoute: true,
    message: "Confirm whether Kyoto belongs in the trip.",
  }];
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.firstConflict?.code, "place-review-required");
  assert.deepEqual(result.needsAttention, []);
});

test("Build requires explicit continuation without adding unresolved intent and recovery preserves it", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ query: "?homeDraft=1", draft: krugerAttentionDraft() });
  const recoveryTrip = async () => view.page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
    .map((key) => JSON.parse(localStorage.getItem(key)!))
    .find((record) => record.trip)?.trip) as Promise<EasyTTrip>;
  try {
    await view.page.setViewportSize({ width: 390, height: 844 });
    await view.page.getByRole("button", { name: "Finish later", exact: true }).click();
    const build = view.page.getByRole("button", { name: /Build trip/ });
    assert.equal(await build.isDisabled(), false, await view.page.locator("body").innerText());
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief?.structuredBrief?.placeIssues
        ?.some((issue: { mentionId: string }) => issue.mentionId === "place-kruger-national-park")));

    await build.click();
    await view.page.getByRole("heading", { name: "Build this trip before adding Kruger National Park?" }).waitFor();
    await view.page.getByRole("button", { name: "Go back and fix it", exact: true }).click();
    await view.page.getByRole("dialog").getByText("Kruger National Park", { exact: true }).first().waitFor();
    await view.page.getByRole("button", { name: "Finish later", exact: true }).click();

    await build.click();
    await view.page.getByRole("button", { name: "Continue without adding Kruger National Park", exact: true }).click();
    await view.page.waitForFunction(() => location.pathname !== "/journey/new", undefined, { timeout: 10_000 });
    const unresolvedRow = view.page.getByLabel("Places not included in this route");
    await unresolvedRow.getByText("Not included yet", { exact: true }).waitFor();
    assert.equal(await unresolvedRow.getByText("Kruger National Park", { exact: true }).count(), 1);
    assert.equal(await unresolvedRow.getByRole("link", { name: "Choose a nearby base", exact: true }).count(), 1);
    assert.equal(await view.page.getByText("Choose where to stay for Kruger National Park before Morrovia adds it to the route.", { exact: true }).count(), 0);
    const saved = await recoveryTrip();
    assert.equal(saved.brief.structuredBrief?.placeIssues?.some((issue) => issue.mentionId === "place-kruger-national-park"), true);
    assert.equal(saved.stops.some((stop) => stop.canonicalPlaceId === "fixture:kruger-national-park"), false);
    await view.page.reload();
    const reloadedRow = view.page.getByLabel("Places not included in this route");
    await reloadedRow.getByText("Kruger National Park", { exact: true }).waitFor();
    await reloadedRow.getByRole("button", { name: "Dismiss", exact: true }).click();
    await reloadedRow.waitFor({ state: "detached" });
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => JSON.parse(localStorage.getItem(key)!).trip?.brief?.structuredBrief?.removedPlaceMentionIds
        ?.includes("place-kruger-national-park")));
    await view.page.reload();
    assert.equal(await view.page.getByLabel("Places not included in this route").count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Overview recovery deep-link opens the exact retained Builder mention", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({
    query: "?homeDraft=1&placeIntent=place-serengeti-national-park",
    draft: multipleAttentionDraft(),
  });
  try {
    const dialog = view.page.getByRole("dialog");
    await dialog.getByText("Serengeti National Park", { exact: true }).first().waitFor({ timeout: 5_000 });
    assert.equal(await dialog.getByText("Kruger National Park", { exact: true }).count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("post-Build Kruger recovery adds a canonical base before the Overview reminder disappears", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({
    query: "?homeDraft=1",
    draft: krugerAttentionDraft(),
    nearbyCandidates: [{
      canonicalPlaceId: "open-world:fixture:hazyview",
      name: "Hazyview",
      label: "Hazyview · Mpumalanga, South Africa",
      country: "South Africa",
      region: "Mpumalanga",
      placeType: "town",
      coordinates: [31.131, -25.043],
      routability: "direct_destination",
      provenance: [{ id: "fixture:hazyview", label: "Controlled global place provider", kind: "provider", supports: "Provider-confirmed settlement near Kruger National Park." }],
      distanceKm: 37,
      reason: "37 km from Kruger National Park · Verified town",
      confidence: createPlanningConfidence({ state: "inferred", level: "high", freshness: "current", scope: "general-route", sources: [], reason: "Provider-confirmed nearby settlement." }),
    }],
  });
  try {
    await view.page.getByRole("button", { name: "Finish later", exact: true }).click();
    await view.page.getByRole("button", { name: /Build trip/ }).click();
    await view.page.getByRole("button", { name: "Continue without adding Kruger National Park", exact: true }).click();
    const recoveryLink = view.page.getByRole("link", { name: "Choose a nearby base", exact: true });
    await recoveryLink.waitFor({ timeout: 10_000 });
    await recoveryLink.click();
    const suggestion = view.page.getByRole("dialog").getByRole("button", { name: /Hazyview/ }).first();
    try { await suggestion.waitFor({ timeout: 5_000 }); } catch (error) {
      throw new Error(`Post-Build recovery did not render the retained mention's nearby base:\n${await view.page.locator("body").innerText()}`, { cause: error });
    }
    await suggestion.click();
    await view.page.getByRole("button", { name: /Finish shaping route|Done with Kruger National Park/ }).click();
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .some((record) => record.trip?.stops?.some((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === "open-world:fixture:hazyview")));
    const savedTripId = await view.page.evaluate(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .find((record) => record.trip?.stops?.some((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === "open-world:fixture:hazyview"))?.trip?.id) as string;
    assert.ok(savedTripId);
    await view.page.goto(new URL(`/journey/${encodeURIComponent(savedTripId)}`, view.page.url()).href);
    await view.page.getByLabel("Trip overview").waitFor();
    assert.equal(await view.page.getByLabel("Places not included in this route").count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("choosing a provider-backed Kruger base creates the canonical stop through the existing flow", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({
    query: "?homeDraft=1",
    draft: krugerAttentionDraft(),
    nearbyCandidates: [{
      canonicalPlaceId: "open-world:fixture:hazyview",
      name: "Hazyview",
      label: "Hazyview · Mpumalanga, South Africa",
      country: "South Africa",
      region: "Mpumalanga",
      placeType: "town",
      coordinates: [31.131, -25.043],
      routability: "direct_destination",
      provenance: [{ id: "fixture:hazyview", label: "Controlled global place provider", kind: "provider", supports: "Provider-confirmed settlement near Kruger National Park." }],
      distanceKm: 37,
      reason: "37 km from Kruger National Park · Verified town",
      confidence: createPlanningConfidence({ state: "inferred", level: "high", freshness: "current", scope: "general-route", sources: [], reason: "Provider-confirmed nearby settlement." }),
    }],
  });
  try {
    const suggestion = view.page.getByRole("button", { name: /Hazyview/ });
    try { await suggestion.waitFor({ timeout: 5_000 }); } catch (error) {
      throw new Error(`Nearby suggestion did not render:\n${await view.page.locator("body").innerText()}`, { cause: error });
    }
    await suggestion.click({ timeout: 5_000 });
    const finish = view.page.getByRole("button", { name: "Finish shaping route", exact: true });
    try { await finish.waitFor({ timeout: 5_000 }); } catch (error) {
      throw new Error(`Base selection did not become completable:\n${await view.page.locator("body").innerText()}`, { cause: error });
    }
    await finish.click({ timeout: 5_000 });
    await view.page.waitForFunction(() => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .some((key) => {
        const trip = JSON.parse(localStorage.getItem(key)!).trip;
        return trip?.stops?.some((stop: { canonicalPlaceId?: string }) => stop.canonicalPlaceId === "open-world:fixture:hazyview")
          && trip?.brief?.structuredBrief?.placeSelections?.some((selection: { mentionId: string; selectedCanonicalPlaceId: string }) => selection.mentionId === "place-kruger-national-park"
            && selection.selectedCanonicalPlaceId === "open-world:fixture:hazyview");
      }), undefined, { timeout: 5_000 });
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("provider unavailability never makes an unverified model base actionable", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({
    query: "?homeDraft=1",
    draft: krugerAttentionDraftWithUnverifiedModelBase(),
    nearbyStatus: "unavailable",
  });
  try {
    await view.page.getByText(/Nearby place discovery is temporarily unavailable/).waitFor({ timeout: 5_000 });
    assert.equal(await view.page.getByRole("button", { name: /Hoedspruit/ }).count(), 0);
    assert.equal(await view.page.getByRole("combobox", { name: "Have somewhere else in mind?" }).count(), 1);
    await view.page.getByRole("button", { name: "Finish later", exact: true }).click();
    const build = view.page.getByRole("button", { name: /Build trip/ });
    assert.equal(await build.isDisabled(), false);
    await build.click();
    assert.equal(await view.page.getByRole("button", { name: "Continue without adding Kruger National Park", exact: true }).count(), 1);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Builder only presents route-stop search results whose selected evidence can be added canonically", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const providerPlaces = {
    Almaty: {
      canonicalPlaceId: "open-world:fixture:almaty",
      providerId: "fixture:almaty",
      providerSourceLabel: "Controlled global place provider",
      name: "Almaty",
      country: "Kazakhstan",
      coordinates: [76.886, 43.2389],
      placeType: "city",
      routability: "direct_destination",
    },
    Samarkand: {
      canonicalPlaceId: "open-world:fixture:samarkand",
      providerId: "fixture:samarkand",
      providerSourceLabel: "Controlled global place provider",
      name: "Samarkand",
      country: "Uzbekistan",
      coordinates: [66.9597, 39.6542],
      placeType: "city",
      routability: "direct_destination",
    },
    Tokyo: {
      canonicalPlaceId: "open-world:fixture:tokyo",
      providerId: "fixture:tokyo",
      providerSourceLabel: "Controlled global place provider",
      name: "Tokyo",
      country: "Japan",
      coordinates: [139.6917, 35.6895],
      placeType: "city",
      routability: "direct_destination",
    },
  };
  for (const place of Object.values(providerPlaces)) {
    const view = await renderBuilder({ geocodeCandidates: { [place.name]: [place] } });
    try {
      const search = view.page.getByRole("combobox", { name: "Add your first place" });
      await search.fill(place.name);
      const option = view.page.getByRole("option", { name: new RegExp(`^${place.name}`) });
      await option.waitFor({ timeout: 5_000 });
      await option.click();
      await view.page.getByText(place.name, { exact: true }).first().waitFor({ timeout: 5_000 });
      assert.equal(await view.page.getByText(new RegExp(`We couldn't verify.*${place.name}`)).count(), 0);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  }

  for (const weakCatalogPlace of ["Almaty", "Samarkand"]) {
    const view = await renderBuilder();
    try {
      await view.page.getByRole("combobox", { name: "Add your first place" }).fill(weakCatalogPlace);
      await view.page.waitForTimeout(350);
      assert.equal(await view.page.getByRole("option", { name: new RegExp(`^${weakCatalogPlace}`) }).count(), 0,
        `${weakCatalogPlace} must not be actionable without coordinates from canonical evidence`);
    } finally { await view.close(); }
  }
});

test("Add stop remains ready for consecutive canonical additions on mobile and closes explicitly", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const places = [
    { canonicalPlaceId: "open-world:fixture:almaty", providerId: "fixture:almaty", name: "Almaty", country: "Kazakhstan", coordinates: [76.886, 43.2389], placeType: "city", routability: "direct_destination" },
    { canonicalPlaceId: "open-world:fixture:samarkand", providerId: "fixture:samarkand", name: "Samarkand", country: "Uzbekistan", coordinates: [66.9597, 39.6542], placeType: "city", routability: "direct_destination" },
    { canonicalPlaceId: "open-world:fixture:tokyo", providerId: "fixture:tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895], placeType: "city", routability: "direct_destination" },
    { canonicalPlaceId: "open-world:fixture:osaka", providerId: "fixture:osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937], placeType: "city", routability: "direct_destination" },
  ];
  const desktopPlace = { canonicalPlaceId: "open-world:fixture:seoul", providerId: "fixture:seoul", name: "Seoul", country: "South Korea", coordinates: [126.978, 37.5665], placeType: "city", routability: "direct_destination" };
  const geocodeCandidates = Object.fromEntries([...places, desktopPlace].map((place) => [place.name, [{
    ...place,
    providerSourceLabel: "Controlled global place provider",
  }]]));
  const view = await renderBuilder({ geocodeCandidates });
  try {
    await view.page.setViewportSize({ width: 390, height: 844 });
    for (const place of places) {
      const search = view.page.getByRole("combobox", { name: /Add your first place|Add a destination/ });
      await search.fill(place.name);
      await view.page.getByRole("option", { name: new RegExp(`^${place.name}`) }).click();
      await view.page.getByText(place.name, { exact: true }).first().waitFor({ timeout: 5_000 });
      assert.equal(await search.count(), 1, "the same Add stop flow should remain mounted");
      assert.equal(await search.inputValue(), "");
      assert.equal(await search.evaluate((element: HTMLElement) => globalThis.document.activeElement === element), true,
        "focus should return to the cleared search after a successful add");
    }

    const stopOrder = await view.page.locator('[aria-label="Confirmed stops"] > div > button').allTextContents();
    assert.deepEqual(stopOrder.map((label: string) => label.replace(/\s+/g, " ").trim()), ["1. Almaty", "2. Samarkand", "3. Tokyo", "4. Osaka"]);

    const search = view.page.getByRole("combobox", { name: "Add a destination" });
    await search.fill("Almaty");
    await view.page.waitForTimeout(350);
    assert.equal(await view.page.getByRole("option", { name: /^Almaty/ }).count(), 0);
    assert.equal(await view.page.getByText("Almaty", { exact: true }).count() > 0, true);

    await view.page.getByRole("button", { name: "Done adding stops" }).click();
    assert.equal(await view.page.getByRole("combobox", { name: "Add a destination" }).count(), 0);
    assert.equal(await view.page.getByRole("button", { name: "Add stop", exact: true }).count(), 1);

    await view.page.setViewportSize({ width: 1280, height: 900 });
    await view.page.getByRole("button", { name: "Add stop", exact: true }).click();
    const desktopSearch = view.page.getByRole("combobox", { name: "Add a destination" });
    await desktopSearch.fill(desktopPlace.name);
    await view.page.getByRole("option", { name: new RegExp(`^${desktopPlace.name}`) }).click();
    await view.page.getByText(desktopPlace.name, { exact: true }).first().waitFor();
    assert.equal(await desktopSearch.inputValue(), "");
    assert.equal(await desktopSearch.evaluate((element: HTMLElement) => globalThis.document.activeElement === element), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("mobile Builder keeps the canonical stop summary visible beside Add stop", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const places = [
    { canonicalPlaceId: "open-world:fixture:almaty", providerId: "fixture:almaty", name: "Almaty", country: "Kazakhstan", coordinates: [76.886, 43.2389], placeType: "city", routability: "direct_destination" },
    { canonicalPlaceId: "open-world:fixture:samarkand", providerId: "fixture:samarkand", name: "Samarkand", country: "Uzbekistan", coordinates: [66.9597, 39.6542], placeType: "city", routability: "direct_destination" },
    { canonicalPlaceId: "open-world:fixture:tokyo", providerId: "fixture:tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895], placeType: "city", routability: "direct_destination" },
  ];
  const geocodeCandidates = Object.fromEntries(places.map((place) => [place.name, [{ ...place, providerSourceLabel: "Controlled global place provider" }]]));
  const view = await renderBuilder({ geocodeCandidates });
  try {
    const summary = view.page.locator('[aria-label="Confirmed stops"]');
    const routeWorkspace = view.page.locator("[data-builder-route-workspace]");
    const summaryNames = async () => (await summary.locator(":scope > div > button").allTextContents())
      .map((label: string) => label.replace(/^\s*\d+\.\s*/, "").trim());
    await view.page.setViewportSize({ width: 390, height: 844 });
    for (const place of places.slice(0, 3)) {
      const search = view.page.getByRole("combobox", { name: /Add your first place|Add a destination/ });
      await search.fill(place.name);
      await view.page.getByRole("option", { name: new RegExp(`^${place.name}`) }).click();
    }
    await view.page.getByRole("button", { name: "Done adding stops" }).click();

    for (const width of [390, 430]) {
      await view.page.setViewportSize({ width, height: 844 });
      assert.equal(await summary.isVisible(), true, `${width}px should keep the current route beside Add stop`);
      assert.equal(await summary.evaluate((node: HTMLElement) => {
        const workspace = globalThis.document.querySelector("[data-builder-route-workspace]");
        return Boolean(workspace && (node.compareDocumentPosition(workspace) & globalThis.Node.DOCUMENT_POSITION_FOLLOWING));
      }), true);
      assert.equal(await view.page.evaluate(() => globalThis.document.documentElement.scrollWidth <= globalThis.innerWidth), true);
    }

    assert.equal(await view.page.getByRole("button", { name: "Add stop", exact: true }).count(), 1,
      "the compact summary should hand off to the existing route-workspace action instead of duplicating it");
    assert.deepEqual(await summaryNames(), ["Almaty", "Samarkand", "Tokyo"]);

    await routeWorkspace.locator('summary[aria-label="Actions for Samarkand"]').click();
    await routeWorkspace.getByRole("button", { name: "Earlier" }).click();
    assert.deepEqual(await summaryNames(), ["Samarkand", "Almaty", "Tokyo"]);

    await summary.getByRole("button", { name: "Remove Tokyo" }).click();
    assert.deepEqual(await summaryNames(), ["Samarkand", "Almaty"]);
    assert.equal(await summary.isVisible(), true);
    assert.equal(await view.page.getByRole("combobox", { name: "Add a destination" }).count(), 0);

    await view.page.setViewportSize({ width: 1280, height: 900 });
    assert.equal(await routeWorkspace.isVisible(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("an entered origin may reach validation but cannot build while unverified", () => {
  const input = validInput();
  input.originCoordinates = undefined;
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, true);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.find((conflict) => conflict.code === "origin-unverified")?.stage, "time");
});

test("unreviewed geography blocks an otherwise authored itinerary", () => {
  const input = validInput();
  input.placeReviewPending = true;
  assert.equal(input.document.planItems.length > 0, true);
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "place-review-required"), true);
});

test("empty trip cannot advance, build, persist or navigate", () => {
  const input = validInput();
  input.origin = "";
  input.stops = [];
  input.requiredStopIds = [];
  input.allocations = {};
  input.nightAllocation = allocatedNightResult({});
  input.document = document([], []);
  const result = canBuildTrip(input);
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "origin-required"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "route-empty"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "itinerary-empty"), true);
});

test("three required stops under a hard maximum of two surfaces the structured conflict", () => {
  const input = validInput();
  input.stops.push({ id: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] });
  input.requiredStopIds = ["tokyo", "kyoto", "osaka"];
  input.maximumStops = 2;
  const result = canBuildTrip(input);
  const conflict = result.conflicts.find((item) => item.code === "required-stops-exceed-maximum");
  assert.equal(result.canAdvanceToTime, false);
  assert.equal(conflict?.source, "structured-brief");
  assert.match(conflict?.message ?? "", /3 required stops.*maximum of 2/);
});

test("eight retained stops in three days fail on zero-night stops and coverage", () => {
  const input = validInput();
  const stopIds = Array.from({ length: 8 }, (_, index) => `stop-${index + 1}`);
  input.stops = stopIds.map((id, index) => ({ id, name: `Stop ${index + 1}`, country: "Exampleland", coordinates: [index, index] }));
  input.requiredStopIds = stopIds;
  input.allocations = Object.fromEntries(stopIds.map((id, index) => [id, index < 2 ? 1 : 0]));
  input.nightAllocation = allocatedNightResult(input.allocations, "compromised");
  input.document = document(stopIds, [stopIds[0], stopIds[1], stopIds[1]]);
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.deepEqual(result.conflicts.find((conflict) => conflict.code === "zero-night-stop")?.stopIds, stopIds.slice(2));
  assert.equal(result.conflicts.some((conflict) => conflict.code === "itinerary-stop-uncovered"), true);
});

test("invalid document persistence is rejected for missing itinerary coverage", () => {
  const input = validInput();
  input.document = document(["tokyo", "kyoto"], ["tokyo", "tokyo", "tokyo"]);
  input.document.endDate = "2026-10-04";
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates"), true);
  assert.deepEqual(result.conflicts.find((conflict) => conflict.code === "itinerary-stop-uncovered")?.stopIds, ["kyoto"]);
});

test("date and night-allocation contradictions block final persistence", () => {
  const input = validInput();
  input.endDate = "2026-09-30";
  input.nightAllocation = {
    version: 1,
    configVersion: "builder-gate-fixture",
    state: "conflict",
    totalAvailableNights: 0,
    totalAllocatedNights: null,
    allocations: null,
    stops: [],
    conflicts: [{ code: "fixed-nights-exceed-total", severity: "error", message: "Fixed stays exceed the available trip nights.", stopIds: [], requiredNights: 4, allocatedNights: 0 }],
    notices: [],
  };
  const result = canBuildTrip(input);
  assert.equal(result.canBuildTrip, false);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "invalid-dates"), true);
  assert.equal(result.conflicts.some((conflict) => conflict.code === "night-allocation-conflict"), true);
});

test("the final validator blocks build, persistence and navigation through the same gate", () => {
  const input = validInput();
  input.planValidation = {
    issues: [{
      id: "plan-issue-fixed-date",
      code: "fixed-date-conflict",
      severity: "error",
      message: "A protected booking conflicts with the final calendar.",
      stopIds: ["kyoto"],
      legIndexes: [],
      hardConstraint: true,
      repairability: "manual",
      evidence: {},
      sources: ["final-plan"],
      relatedTripHealthFindingIds: [],
    }],
  };
  const result = canBuildTrip(input);

  assert.equal(result.canBuildTrip, false);
  assert.equal(result.outcome, "impossible");
  assert.equal(result.conflicts.some((conflict) => conflict.code === "final-plan-invalid" && conflict.source === "validator"), true);
});

test("the builder gate preserves distinct feasible and unknown realism outcomes", () => {
  const compressed = validInput();
  compressed.planValidation = {
    issues: [{
      id: "plan-issue-extreme-pacing", code: "extreme-pacing", severity: "warning",
      message: "Repeated one-night stops make this route unusually compressed.", stopIds: ["tokyo", "kyoto"], legIndexes: [],
      hardConstraint: false, repairability: "automatic", evidence: { oneNightStopCount: 2 }, sources: ["final-plan"], relatedTripHealthFindingIds: [],
    }],
  };
  assert.equal(canBuildTrip(compressed).qualityClassification, "exhausting but feasible");

  const unsupported = validInput();
  unsupported.planValidation = {
    issues: [{
      id: "plan-issue-unsupported-transfer", code: "unsupported-transfer", severity: "warning",
      message: "The ferry connection lacks enough supported data.", stopIds: ["tokyo", "kyoto"], legIndexes: [1],
      hardConstraint: false, repairability: "manual", evidence: { unconfirmedLegs: 1 }, sources: ["transfer-impact"], relatedTripHealthFindingIds: [],
    }],
  };
  assert.equal(canBuildTrip(unsupported).qualityClassification, "unknown due to insufficient transport evidence");
});
