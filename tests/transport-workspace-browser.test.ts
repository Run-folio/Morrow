import assert from "node:assert/strict";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { japanTrip } from "./transport-mode-choice-browser.test.ts";

function twoLegTrip() {
  const trip = japanTrip();
  trip.stops.push({ id: "osaka", order: 2, name: "Osaka", country: "Japan", latitude: 34.6937, longitude: 135.5023, arrivalDate: "2027-04-08", departureDate: "2027-04-10", nights: 2 });
  const from = { kind: "stop" as const, id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const to = { kind: "stop" as const, id: "osaka", name: "Osaka", country: "Japan", coordinates: [135.5023, 34.6937] as [number, number] };
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

    await view.page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-mobile-open"), "false");
    await view.page.getByRole("button", { name: "Show route map" }).click();
    assert.equal(await view.page.locator("#transport-route-map").getAttribute("data-mobile-open"), "true");
    assert.equal(await view.page.locator('[data-transport-leg-id="trip-japan-choice-leg-2"]').getAttribute("data-selected"), "true");
    assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
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
