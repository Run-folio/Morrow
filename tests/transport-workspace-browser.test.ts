import assert from "node:assert/strict";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
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
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getAttribute("data-selected"), "true");
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-2");

    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').getByRole("button", { name: "View details" }).click();
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-1");
    assert.match(await view.page.locator('[aria-live="polite"] h3').innerText(), /Tokyo[\s\S]*Kyoto/);
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    assert.match(await view.page.locator('[aria-live="polite"] h3').innerText(), /Kyoto[\s\S]*Osaka/);

    await view.page.reload();
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]').waitFor();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");

    await view.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-mobile-open"), "false");
    await view.page.getByRole("button", { name: "Show route map" }).click();
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-mobile-open"), "true");
    await view.page.getByRole("button", { name: "Map leg Kyoto to Osaka" }).click();
    await view.page.getByRole("button", { name: "Hide route map" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    await view.page.getByRole("button", { name: "Show route map" }).click();
    assert.equal(await view.page.locator('[aria-label="Whole-trip route map preview"]').getAttribute("data-selected-leg-id"), "trip-japan-choice-leg-2");
    assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
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
    for (const width of [390, 430, 768, 1440]) {
      await transport.page.setViewportSize({ width, height: 900 });
      const card = transport.page.locator('[data-transport-leg-id="trip-japan-choice-leg-1"]');
      assert.match(await card.innerText(), /Transfer needs checking/);
      assert.match(await card.innerText(), /Road estimate only.*455 km.*6h 30m driving/);
      assert.match(await card.innerText(), /no passenger service/i);
      assert.equal(await transport.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await transport.page.getByRole("button", { name: "Change transport mode" }).first().click();
    assert.equal(await transport.page.getByRole("button", { name: /Road · ~6h 30m/ }).count(), 0);
    assert.equal(await transport.page.getByText("No other evidence-backed mode is currently supported for this leg.", { exact: true }).count(), 1);
    assert.deepEqual(transport.errors, []);
  } finally { await transport.close(); }

  const builder = await renderBuilder({ path: `/journey/new?trip=${trip.id}&recover=1`, initialTrip: trip });
  try {
    const row = builder.page.locator('[data-builder-route-workspace] [data-builder-stop-index="1"]');
    await row.waitFor();
    assert.match((await row.innerText()).replaceAll(/\s+/g, " "), /Transfer needs checking\s*To confirm\s*Road estimate only · 455 km · about 6h 30m driving/);
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
    await view.page.locator(`[data-transport-leg-id="${first}"]`).getByRole("button", { name: "View details" }).click();
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
    await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getByRole("button", { name: "View details" }).click();
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
