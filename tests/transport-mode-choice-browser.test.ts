import assert from "node:assert/strict";
import test from "node:test";

import { renderBuilder, builderBrowserTestsEnabled } from "./helpers/builder-render.ts";
import type { EasyTTrip, TransferSegment } from "../lib/easyt/trip.ts";

function japanTrip(): EasyTTrip {
  const from = { kind: "stop" as const, id: "tokyo", name: "Tokyo", country: "Japan", coordinates: [139.6917, 35.6895] as [number, number] };
  const to = { kind: "stop" as const, id: "kyoto", name: "Kyoto", country: "Japan", coordinates: [135.7681, 35.0116] as [number, number] };
  const rail: TransferSegment = { id: "tokyo:kyoto:train:0", mode: "train", fromEndpoint: from, toEndpoint: to, distanceKm: 365, durationMinutes: 135, provider: "Reviewed Tokaido rail evidence.", provenance: "canonical_schedule", confidence: "high", scheduleNeedsChecking: true };
  const road: TransferSegment = { id: "tokyo:kyoto:road:0", mode: "road", fromEndpoint: from, toEndpoint: to, distanceKm: 455, durationMinutes: 390, provider: "OpenRouteService routed road estimate.", provenance: "routing_engine", confidence: "medium", scheduleNeedsChecking: true };
  return {
    schemaVersion: 1, id: "trip-japan-choice", ownerId: null, title: "Japan", status: "planned", startDate: "2027-04-01", endDate: "2027-04-08", travellers: 2, currency: "GBP",
    brief: { origin: "Tokyo", originCountry: "Japan", originCoordinates: [139.6917, 35.6895], mustDo: "", pace: "slow", hotelChanges: "few", budgetBand: "mid", selectedPlaces: {}, decisionSelections: { transportByLeg: {} }, intent: { version: 1, travellers: 2, timing: { flexibility: "fixed", durationDays: 8 }, hardConstraints: { originRequired: true, mustSeeStopIds: [], optionalStopIds: [], fixedCommitments: [], avoidDriving: false }, preferences: { budgetSensitivity: "mid", transportModes: ["train"], pace: "balanced", interests: [], dislikes: [] } } },
    stops: [
      { id: "tokyo", order: 0, name: "Tokyo", country: "Japan", latitude: 35.6895, longitude: 139.6917, arrivalDate: "2027-04-01", departureDate: "2027-04-04", nights: 3 },
      { id: "kyoto", order: 1, name: "Kyoto", country: "Japan", latitude: 35.0116, longitude: 135.7681, arrivalDate: "2027-04-04", departureDate: "2027-04-08", nights: 4 },
    ],
    legs: [{ id: "trip-japan-choice-leg-1", fromStopId: "tokyo", toStopId: "kyoto", fromEndpoint: from, toEndpoint: to, classification: "intercity", mode: "train", distanceKm: 365, durationMinutes: 135, doorToDoorMinutes: 135, headlineMinutes: 135, provider: rail.provider, provenance: rail.provenance, confidence: rail.confidence, scheduleNeedsChecking: true, warnings: [], segments: [rail], routeMetadata: { source: "multimodal-resolver", planningEstimate: true, multimodalResolution: { version: 1, selected: "train", selectedCandidateId: "rail:network:tokaido", candidates: [
      { id: "rail:network:tokaido", summaryMode: "train", segments: [rail], totalDurationMinutes: 135, distanceKm: 365, confidence: "high", provenance: "canonical_schedule", evidence: "intercity_rail_network", connectionCount: 0, score: 90, reasons: ["Reviewed rail evidence supports this journey."] },
      { id: "road:routed", summaryMode: "road", segments: [road], totalDurationMinutes: 390, distanceKm: 455, confidence: "medium", provenance: "routing_engine", evidence: "routed_road", connectionCount: 0, score: 55, reasons: ["A road provider returned a plausible route."] },
    ], rejected: [] } } }],
    planItems: [{ id: "day-4", stopId: "kyoto", dayNumber: 4, date: "2027-04-04", type: "transport", title: "Tokyo to Kyoto", reason: "", notes: [], startsAt: null, endsAt: null, bookingUrl: null, latitude: null, longitude: null }],
    recommendations: [], createdAt: "2026-09-22T12:00:00.000Z", updatedAt: "2026-09-22T12:00:00.000Z",
  };
}

test("Transport changes one evidence-backed leg and restores Morrovia's recommendation after reload", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    const step = async (label: string, action: () => Promise<unknown>) => {
      try { await action(); } catch (error) {
        throw new Error(`${label} failed:\n${await view.page.locator("body").innerText()}`, { cause: error });
      }
    };
    await step("open choice control", () => view.page.getByRole("button", { name: "Change transport mode" }).click({ timeout: 5_000 }));
    await step("choose road", () => view.page.getByRole("button", { name: /Road.*6h 30m/ }).click({ timeout: 5_000 }));
    await step("show explicit choice", () => view.page.getByText("Your choice", { exact: true }).waitFor({ timeout: 5_000 }));
    assert.equal(await view.page.getByText(/Road.*6h 30m/).count() > 0, true);
    await view.page.reload();
    await step("reload explicit choice", () => view.page.getByText("Your choice", { exact: true }).waitFor({ timeout: 5_000 }));
    for (const width of [390, 1024]) {
      await view.page.setViewportSize({ width, height: 844 });
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await step("reopen choice control", () => view.page.getByRole("button", { name: "Change transport mode" }).click({ timeout: 5_000 }));
    await step("restore recommendation", () => view.page.getByRole("button", { name: "Use Morrovia recommendation" }).click({ timeout: 5_000 }));
    await step("show recommendation", () => view.page.getByText("Morrovia recommendation", { exact: true }).waitFor({ timeout: 5_000 }));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Builder changes the same canonical leg choice and projects its effective time after reload", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ query: `?trip=${trip.id}&recover=1`, initialTrip: trip });
  try {
    const step = async (label: string, action: () => Promise<unknown>) => {
      try { await action(); } catch (error) {
        throw new Error(`${label} failed:\n${await view.page.locator("body").innerText()}`, { cause: error });
      }
    };
    const route = view.page.locator("[data-builder-route-workspace]");
    await step("open Builder choice", () => route.getByRole("button", { name: "Change transport mode" }).click({ timeout: 5_000 }));
    await step("choose Builder road", () => route.getByRole("button", { name: /Road.*6h 30m/ }).click({ timeout: 5_000 }));
    await step("show Builder choice", () => route.getByText("Your choice", { exact: true }).waitFor({ timeout: 5_000 }));
    assert.match((await route.innerText()).replaceAll(/\s+/g, " "), /Road.*6h 30m/);
    await view.page.waitForTimeout(700);
    await view.page.reload();
    await step("reload Builder choice", () => route.getByText("Your choice", { exact: true }).waitFor({ timeout: 5_000 }));
    assert.match((await route.innerText()).replaceAll(/\s+/g, " "), /Road.*6h 30m/);
    for (const width of [390, 1024]) {
      await view.page.setViewportSize({ width, height: 844 });
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

export { japanTrip };
