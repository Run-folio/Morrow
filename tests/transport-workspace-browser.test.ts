import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { affiliatePartners } from "../lib/easyt/booking-readiness.ts";
import { markTransportLegBooked } from "../lib/easyt/transport-booking.ts";
import { japanTrip } from "./transport-mode-choice-browser.test.ts";

function twoLegTrip() {
  const trip = japanTrip();
  trip.stops.push({ id: "osaka", canonicalPlaceId: "osaka", order: 2, name: "Osaka", country: "Japan", latitude: 34.6937, longitude: 135.5023, arrivalDate: "2027-04-08", departureDate: "2027-04-10", nights: 2 });
  const from = { kind: "stop" as const, id: "kyoto", canonicalPlaceId: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const to = { kind: "stop" as const, id: "osaka", canonicalPlaceId: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] as [number, number] };
  trip.legs.push({
    id: "trip-japan-choice-leg-2", fromStopId: "kyoto", toStopId: "osaka", fromEndpoint: from, toEndpoint: to,
    classification: "intercity", mode: "train", distanceKm: 56, durationMinutes: 45, doorToDoorMinutes: 45, headlineMinutes: 45,
    provider: "Reviewed regional rail evidence.", provenance: "canonical_schedule", confidence: "high", scheduleNeedsChecking: false,
    warnings: [], routeMetadata: {},
  });
  trip.planItems.push({ id: "day-8", stopId: "osaka", dayNumber: 8, date: "2027-04-08", type: "transport", title: "Kyoto to Osaka", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null });
  trip.endDate = "2027-04-10";
  return trip;
}

test("Transport keeps selected journey, card and map leg synchronized at desktop and mobile widths", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = twoLegTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    await view.page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await view.page.locator("[data-transport-leg-id]").count(), 2);
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"] [aria-expanded="true"]').count(), 0, "the compact list starts collapsed");
    const recoveryBefore = await view.page.evaluate((tripId: string) => {
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .find((candidate) => candidate?.startsWith("easyt:trip-recovery:v2:") && candidate.includes(encodeURIComponent(tripId)));
      return key ? [key, localStorage.getItem(key)] : null;
    }, trip.id);
    assert.ok(recoveryBefore, "the isolated browser fixture has a canonical recovery record");
    const firstDetailsControl = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"] button[aria-expanded="false"]');
    const detailsTarget = await firstDetailsControl.getAttribute("aria-controls");
    assert.ok(detailsTarget);
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"] [data-transport-summary] svg.lucide-chevron-down').count(), 1);
    assert.equal(await view.page.locator(`#${detailsTarget}`).count(), 1, "collapsed detail controls keep a valid DOM target");
    const artifacts = process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
    if (artifacts) {
      mkdirSync(artifacts, { recursive: true });
      await view.page.screenshot({ path: `${artifacts}/transport-desktop-1440.png`, fullPage: true });
    }
    await view.page.getByRole("button", { name: "Show map" }).click();
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-2");

    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getByRole("button", { name: /View details: Tokyo to Kyoto/ }).click();
    const firstCard = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
    assert.equal(await firstCard.locator("[data-transport-summary] svg.lucide-chevron-up").count(), 1);
    const compactText = await firstCard.innerText();
    assert.equal((compactText.match(/2h 15m/g) ?? []).length, 1, "the compact row shows the estimated duration once");
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-1");
    assert.equal(await firstCard.getAttribute("data-selected"), "true");
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");

    await view.page.reload();
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').waitFor();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");

    await view.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-open"), "false", "the optional map resets closed after refresh");
    if (artifacts) await view.page.screenshot({ path: `${artifacts}/transport-mobile-390.png`, fullPage: true });
    await view.page.getByRole("button", { name: "Show map" }).click();
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-open"), "true");
    await view.page.getByRole("button", { name: "Hide map" }).click();
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-open"), "false");
    await view.page.getByRole("button", { name: "Show map" }).click();
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-open"), "true");
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    await view.page.getByRole("button", { name: "Hide map" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-open"), "false", "expanding a leg must not reopen the optional map");
    const secondCard = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]');
    assert.equal(await secondCard.getByRole("button", { name: /Hide details: Kyoto to Osaka/ }).getAttribute("aria-expanded"), "true");
    await secondCard.getByRole("button", { name: /Hide details: Kyoto to Osaka/ }).click();
    assert.equal(await secondCard.getByRole("button", { name: /View details: Kyoto to Osaka/ }).getAttribute("aria-expanded"), "false");
    assert.equal(await secondCard.locator("[data-transport-summary] svg.lucide-chevron-down").count(), 1);
    const secondDetails = secondCard.getByRole("button", { name: /View details: Kyoto to Osaka/ });
    await secondDetails.focus();
    await view.page.keyboard.press("Enter");
    assert.equal(await secondCard.getByRole("button", { name: /Hide details: Kyoto to Osaka/ }).getAttribute("aria-expanded"), "true", "native keyboard activation expands the leg");
    await view.page.getByRole("button", { name: "Show map" }).click();
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-2");
    assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    const recoveryAfter = await view.page.evaluate((tripId: string) => {
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .find((candidate) => candidate?.startsWith("easyt:trip-recovery:v2:") && candidate.includes(encodeURIComponent(tripId)));
      return key ? [key, localStorage.getItem(key)] : null;
    }, trip.id);
    assert.deepEqual(recoveryAfter, recoveryBefore, "expansion, map controls, URL orientation and reload do not mutate the canonical trip recovery record");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("manual booking marks and optional details survive guest save, reload, edit and explicit undo", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  const leg = trip.legs[0];
  const view = await renderBuilder({ initialTrip: trip, path: `/journey/${trip.id}/transport` });
  try {
    await view.page.locator(`[data-transport-leg-id="${leg.id}"]`).waitFor();
    const card = view.page.locator(`[data-transport-leg-id="${leg.id}"]`);
    await card.getByRole("button", { name: /View details/ }).click();
    await view.page.getByRole("button", { name: "Mark as booked" }).click();
    await view.page.locator(`[data-booked-by-traveller="true"][data-booking-leg-id="${leg.id}"]`).waitFor();
    assert.equal(await view.page.getByText("This reflects your confirmation; Morrovia does not verify or change external bookings.", { exact: true }).count(), 0);

    await view.page.getByRole("button", { name: "Edit details" }).click();
    await view.page.getByLabel("Booking reference").fill("CANCEL-ME");
    await view.page.getByRole("button", { name: "Cancel" }).click();
    await view.page.getByRole("button", { name: "Edit details" }).click();
    assert.equal(await view.page.getByLabel("Booking reference").inputValue(), "", "cancel discards the unsaved draft");
    await view.page.getByLabel("Booking reference").fill("SYNTHETIC-42");
    await view.page.getByLabel("Booking link").fill("https://rail.example/synthetic");
    await view.page.getByLabel("Note").fill("Test fixture only");
    await view.page.getByRole("button", { name: "Save details" }).click();
    await view.page.getByText("Booking reference: SYNTHETIC-42", { exact: true }).waitFor();
    assert.equal(await card.getByRole("link", { name: "Open booking", exact: true }).count(), 1);
    assert.equal(await card.locator("h3").count(), 1, "the expansion does not duplicate the route heading");
    assert.equal(await card.locator("time").count(), 1, "the expansion does not duplicate the date");
    const artifacts = process.env.MORROVIA_BROWSER_ARTIFACT_DIR;
    if (artifacts) {
      mkdirSync(artifacts, { recursive: true });
      await view.page.setViewportSize({ width: 1440, height: 1000 });
      await view.page.screenshot({ path: `${artifacts}/transport-booking-desktop.png`, fullPage: true });
      await view.page.setViewportSize({ width: 390, height: 844 });
      await view.page.screenshot({ path: `${artifacts}/transport-booking-mobile.png`, fullPage: true });
    }
    await view.page.reload();
    const reopened = view.page.locator(`[data-booking-leg-id="${leg.id}"]`);
    await reopened.waitFor();
    assert.equal(await reopened.getAttribute("data-booked-by-traveller"), "true");
    assert.equal(await view.page.getByText("Booking reference: SYNTHETIC-42", { exact: true }).count(), 1);
    assert.equal(await view.page.getByText("Test fixture only", { exact: true }).count(), 1);

    await view.page.getByRole("button", { name: "Undo booked mark" }).click();
    await view.page.locator(`[data-booked-by-traveller="false"][data-booking-leg-id="${leg.id}"]`).waitFor();
    assert.equal(await view.page.getByText("Booking reference: SYNTHETIC-42", { exact: true }).count(), 1, "undo keeps optional details");
    await view.page.reload();
    assert.equal(await view.page.locator(`[data-booked-by-traveller="false"][data-booking-leg-id="${leg.id}"]`).count(), 1, "explicit undo is persisted in guest recovery");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("routed road evidence stays a separate reference across Builder and Transport at narrow and desktop widths", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  trip.legs[0] = {
    ...trip.legs[0]!,
    mode: "unknown",
    distanceKm: null,
    durationMinutes: null,
    headlineMinutes: null,
    doorToDoorMinutes: null,
    routeGeometry: undefined,
    segments: undefined,
    provider: "No supported service fact for this exact leg.",
    provenance: "unknown",
    confidence: "unknown",
    warnings: [
      "Road estimate only; no passenger service or private-driver availability is confirmed.",
      "Border crossing eligibility, waits and stops are not included in this road estimate.",
    ],
    roadEstimate: {
      provider: "openrouteservice",
      profile: "driving-car",
      provenance: "routed",
      checkedAt: "2026-10-05T12:00:00.000Z",
      distanceKm: 455,
      durationMinutes: 390,
      confidence: "medium",
      routeGeometry: [[139.6917, 35.6895], [137.4, 35.2], [135.7681, 35.0116]],
      attribution: "OpenRouteService road route reference",
      warnings: [
        "Road estimate only; no passenger service or private-driver availability is confirmed.",
        "Border crossing eligibility, waits and stops are not included in this road estimate.",
      ],
    },
    routeMetadata: { source: "multimodal-resolver", planningEstimate: true, multimodalResolution: { version: 1, selected: "unresolved", candidates: [], rejected: [] } },
  };

  const transport = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    await transport.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getByRole("button", { name: /View details:/ }).click();
    await transport.page.getByRole("button", { name: "Journey details", exact: true }).click();
    for (const width of [390, 430, 768, 1440]) {
      await transport.page.setViewportSize({ width, height: 900 });
      const card = transport.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
      assert.match(await card.innerText(), /Transfer needs checking/);
      assert.match(await card.innerText(), /Road estimate only.*455 km.*6h 30m driving/);
      assert.equal(await transport.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.match(await transport.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').innerText(), /no passenger service/i);
    await transport.page.getByRole("button", { name: "Change transport mode" }).first().click();
    assert.equal(await transport.page.getByRole("button", { name: /Road · ~6h 30m/ }).count(), 0);
    assert.equal(await transport.page.getByText("No other evidence-backed mode is currently supported for this leg.", { exact: true }).count(), 1);
    assert.deepEqual(transport.errors, []);
  } finally { await transport.close(); }

  const builder = await renderBuilder({ path: `/journey/new?trip=${trip.id}&recover=1`, initialTrip: trip });
  try {
    const row = builder.page.locator('[data-builder-route-workspace] [data-builder-stop-index="1"]');
    await row.waitFor();
    assert.match((await row.innerText()).replaceAll(/\s+/g, " "), /Transfer needs checking\s*Timing to confirm\s*Road estimate only · 455 km · about 6h 30m driving/);
    assert.doesNotMatch(await row.innerText(), /Transport needs checking\./);
    assert.deepEqual(builder.errors, []);
  } finally { await builder.close(); }
});

test("Transport deep link selects canonical leg, marks the review set, and follows browser history", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = twoLegTrip();
  const second = "trip-japan-choice-leg-2";
  const first = "trip-japan-choice-leg-1";
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport?leg=${second}&review=${first}&review=${second}`, initialTrip: trip });
  try {
    assert.equal(await view.page.locator(`[data-transport-leg-id="${second}"]`).getAttribute("data-selected"), "true");
    assert.equal(await view.page.locator("[data-review-target=true]").count(), 2);
    await view.page.locator(`[data-transport-leg-id="${first}"]`).getByRole("button", { name: /View details: Tokyo to Kyoto/ }).click();
    assert.match(view.page.url(), /leg=trip-japan-choice-leg-1/);
    await view.page.goBack();
    assert.equal(await view.page.locator(`[data-transport-leg-id="${second}"]`).getAttribute("data-selected"), "true");
    await view.page.goForward();
    assert.equal(await view.page.locator(`[data-transport-leg-id="${first}"]`).getAttribute("data-selected"), "true");
    await view.page.reload();
    assert.equal(await view.page.locator(`[data-transport-leg-id="${first}"]`).getAttribute("data-selected"), "true");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Overview Review transfers opens Transport on the affected canonical leg", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  trip.legs[0] = { ...trip.legs[0]!, mode: "unknown", distanceKm: null, durationMinutes: null, doorToDoorMinutes: null, headlineMinutes: null, segments: undefined };
  const view = await renderBuilder({ path: `/journey/${trip.id}`, initialTrip: trip });
  try {
    const review = view.page.getByRole("link", { name: "Review transfers" });
    await review.waitFor();
    assert.match(await review.getAttribute("href") ?? "", /\/transport\?leg=trip-japan-choice-leg-1/);
    await review.click();
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').waitFor();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getAttribute("data-selected"), "true");
    assert.match(view.page.url(), /\/transport\?leg=trip-japan-choice-leg-1/);
    await view.page.goBack();
    await view.page.getByRole("link", { name: "Review transfers" }).waitFor();
    assert.equal(new URL(view.page.url()).pathname, `/journey/${trip.id}`);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Transport selection keeps repeated place occurrences distinct by canonical leg ID", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = twoLegTrip();
  trip.stops.push({ id: "tokyo-return", order: 3, name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-04-10", departureDate: "2027-04-12", nights: 2 });
  trip.legs.push({
    id: "trip-japan-choice-leg-3", fromStopId: "osaka", toStopId: "tokyo-return",
    fromEndpoint: { kind: "stop", id: "osaka", name: "Osaka", country: "Japan", canonicalPlaceId: "osaka", coordinates: [135.5023, 34.6937] },
    toEndpoint: { kind: "stop", id: "tokyo-return", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895] },
    classification: "intercity", mode: "train", distanceKm: 515, durationMinutes: 180, doorToDoorMinutes: 180, headlineMinutes: 180,
    provider: "Reviewed rail evidence.", provenance: "canonical_schedule", confidence: "high", scheduleNeedsChecking: true, warnings: [], routeMetadata: {},
  });
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    await view.page.getByRole("button", { name: "Map leg Osaka to Tokyo" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-3"]').getAttribute("data-selected"), "true");
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getAttribute("data-selected"), null);
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-3");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Transport leaves the chronological list usable when the map provider is unavailable", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = twoLegTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip, mapUnavailable: true });
  try {
    await view.page.getByText(/route map is unavailable/i).waitFor();
    assert.equal(await view.page.locator("[data-transport-leg-id]").count(), 2);
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getByRole("button", { name: /View details: Kyoto to Osaka/ }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Transport hides Omio link-outs for unknown modes and missing or past leg dates", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const cases = [
    { name: "unknown mode", mutate: (trip: ReturnType<typeof japanTrip>) => { trip.legs[0] = { ...trip.legs[0]!, mode: "unknown", durationMinutes: null, doorToDoorMinutes: null }; } },
    { name: "missing date", mutate: (trip: ReturnType<typeof japanTrip>) => { trip.planItems = []; trip.stops[1]!.arrivalDate = "invalid"; } },
    { name: "past date", mutate: (trip: ReturnType<typeof japanTrip>) => { trip.planItems = []; trip.stops[1]!.arrivalDate = "2025-04-04"; } },
  ];
  for (const scenario of cases) {
    const trip = japanTrip();
    scenario.mutate(trip);
    const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
    try {
      const card = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
      await card.getByRole("button", { name: /View details:/ }).click();
      assert.equal(await card.getByRole("link", { name: /Omio/ }).count(), 0, scenario.name);
      assert.deepEqual(view.errors, []);
    } finally { await view.close(); }
  }
});

test("Transport builds a guarded route-specific Omio flight handoff from canonical route and date", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  trip.legs[0] = { ...trip.legs[0]!, mode: "flight", provider: "Flight planning estimate." };
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    const card = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
    await card.getByRole("button", { name: /View details:/ }).click();
    const link = card.getByRole("link", { name: /Find flights/ });
    const tracked = new URL((await link.getAttribute("href"))!);
    const search = new URL(tracked.searchParams.get("u")!);
    assert.equal(search.searchParams.get("departurePosTerm"), "Tokyo, Japan");
    assert.equal(search.searchParams.get("arrivalPosTerm"), "Kyoto, Japan");
    assert.equal(search.searchParams.get("departureDate"), "2027-04-04");
    assert.equal(search.searchParams.get("travelMode"), "FLIGHT");
    await card.getByRole("button", { name: "Journey details", exact: true }).click();
    assert.equal(await card.getByText(/Opens a flight search with this route and date/).isVisible(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Transport builds a guarded route-specific Omio train handoff for the verified Paris to Berlin route", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  const origin = { ...trip.stops[0]!, canonicalPlaceId: "paris", name: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522 };
  const destination = { ...trip.stops[1]!, canonicalPlaceId: "berlin", name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
  trip.stops[0] = origin;
  trip.stops[1] = destination;
  trip.brief.origin = "Paris";
  trip.brief.originCountry = "France";
  trip.brief.originCanonicalPlaceId = "paris";
  trip.brief.originCoordinates = [48.8566, 2.3522];
  const from = { kind: "stop" as const, id: origin.id, canonicalPlaceId: "paris", name: "Paris", country: "France", coordinates: [2.3522, 48.8566] as [number, number] };
  const to = { kind: "stop" as const, id: destination.id, canonicalPlaceId: "berlin", name: "Berlin", country: "Germany", coordinates: [13.405, 52.52] as [number, number] };
  trip.legs[0] = { ...trip.legs[0]!, fromEndpoint: from, toEndpoint: to, segments: trip.legs[0]!.segments?.map((segment) => ({ ...segment, fromEndpoint: from, toEndpoint: to })) };
  trip.planItems[0] = { ...trip.planItems[0]!, title: "Paris to Berlin" };
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    const card = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
    await card.getByRole("button", { name: /View details:/ }).click();
    const link = card.getByRole("link", { name: /Find trains/ });
    const tracked = new URL((await link.getAttribute("href"))!);
    const search = new URL(tracked.searchParams.get("u")!);
    assert.equal(search.searchParams.get("departurePosTerm"), "Paris, France");
    assert.equal(search.searchParams.get("arrivalPosTerm"), "Berlin, Germany");
    assert.equal(search.searchParams.get("departureDate"), "2027-04-04");
    assert.equal(search.searchParams.get("travelMode"), "TRAIN");
    await card.getByRole("button", { name: "Journey details", exact: true }).click();
    assert.equal(await card.getByText(/Opens a train search with this route and date/).isVisible(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Omio click-out opens a separate tab and returning or reloading leaves canonical trip state unchanged", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  trip.legs[0] = { ...trip.legs[0]!, mode: "ferry", provider: "Ferry planning estimate." };
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    await view.page.context().route("https://omio.sjv.io/**", async (route: { fulfill: (options: { status: number; contentType: string; body: string }) => Promise<void> }) => {
      await route.fulfill({ status: 200, contentType: "text/html", body: "<title>Synthetic Omio destination</title>" });
    });
    const recoveryBefore = await view.page.evaluate((tripId: string) => {
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .find((candidate) => candidate?.startsWith("easyt:trip-recovery:v2:") && candidate.includes(encodeURIComponent(tripId)));
      return key ? [key, localStorage.getItem(key)] : null;
    }, trip.id);
    assert.ok(recoveryBefore);
    const card = view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
    const presentationStateBefore = await card.getAttribute("data-presentation-state");
    await card.getByRole("button", { name: /View details:/ }).click();
    const link = card.getByRole("link", { name: /find transport, opens Omio in a new tab/i });
    assert.equal(await link.getAttribute("href"), affiliatePartners.omio.transportUrl);
    await card.getByRole("button", { name: "Journey details", exact: true }).click();
    assert.equal(await card.getByText("Opens a general Omio search. Your route, date and traveller count aren't carried over.", { exact: true }).isVisible(), true);
    const popupPromise = view.page.waitForEvent("popup");
    await link.click();
    const popup = await popupPromise;
    await popup.waitForLoadState("domcontentloaded");
    assert.equal(popup.url(), affiliatePartners.omio.transportUrl, "synthetic interception verifies the current tracked shortlink target without contacting Omio");
    assert.equal(await card.getAttribute("data-presentation-state"), presentationStateBefore, "the click-out leaves the leg's planned state unchanged");
    await popup.goBack();
    await popup.close();
    await view.page.reload();
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').waitFor();
    const recoveryAfter = await view.page.evaluate((tripId: string) => {
      const key = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
        .find((candidate) => candidate?.startsWith("easyt:trip-recovery:v2:") && candidate.includes(encodeURIComponent(tripId)));
      return key ? [key, localStorage.getItem(key)] : null;
    }, trip.id);
    assert.deepEqual(recoveryAfter, recoveryBefore, "the synthetic click-out, return, and reload do not persist a booking or mutate the trip");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});


test("applying a different mode keeps a traveller booking as a visible mismatch without reassigning its details", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const base = japanTrip();
  const trip = markTransportLegBooked(base, base.legs[0].id, { confirmation: "KEEP-BOOKED-TRAIN" });
  const view = await renderBuilder({ initialTrip: trip, path: `/journey/${trip.id}/transport` });
  try {
    const card = view.page.locator(`[data-transport-leg-id="${trip.legs[0].id}"]`);
    await card.getByRole("button", { name: /View details:/ }).click();
    await view.page.getByRole("button", { name: "Change transport mode" }).click();
    const dialog = view.page.getByRole("dialog", { name: "Change transport", exact: true });
    await dialog.getByRole("radio", { name: /Road/ }).click();
    await dialog.getByRole("button", { name: "Use road", exact: true }).click();
    await view.page.getByText("The route or mode changed. These booking details were kept for you to review.", { exact: true }).waitFor();
    const saved = await view.page.evaluate((tripId: string) => {
      const key = Object.keys(localStorage).find((key) => key.startsWith("easyt:trip-recovery:v2:") && key.includes(encodeURIComponent(tripId)));
      return key ? JSON.parse(localStorage.getItem(key)!).trip.brief.bookings : null;
    }, trip.id);
    assert.equal(saved?.[0]?.confirmation, "KEEP-BOOKED-TRAIN");
    assert.equal(saved?.[0]?.transportLegBinding?.mode, "train");
    assert.equal(saved?.[0]?.travellerMarkedBooked, true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
