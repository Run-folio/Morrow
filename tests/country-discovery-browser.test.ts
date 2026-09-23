import assert from "node:assert/strict";
import test from "node:test";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { createHomeTripDraft, handoffRouteStops } from "../lib/easyt/home-trip-handoff.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

test("Tajikistan discovery keeps deselection through reload and commits canonical choices only on Continue", { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const capture = captureJourneyBrief("Starting from Madrid, 10 days in Tajikistan");
  const draft = createHomeTripDraft({
    capture, handoffId: "tajikistan-discovery", datesExplicit: true,
    startDate: "2026-10-06", endDate: "2026-10-16", travellers: 2, travellersExplicit: true, interests: ["nature"],
    origin: { name: "Madrid", country: "Spain", canonicalPlaceId: "madrid", coordinates: [-3.7038, 40.4168] },
  });
  draft.destinations = handoffRouteStops(capture.mentions, capture.journeyEnd);
  const view = await renderBuilder({ query: "?homeDraft=1", draft });
  try {
    const dialog = view.page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Where should you go in Tajikistan?" }).waitFor();
    assert.equal(await dialog.getByRole("combobox", { name: /Search within Tajikistan/ }).count(), 0);
    const selected = dialog.locator('button[aria-pressed="true"]').first();
    const removedName = (await selected.getAttribute("aria-label"))!.split(":")[0];
    await selected.click();
    await view.page.waitForFunction(() => Object.values(localStorage).some((raw) => {
      try { return Boolean(JSON.parse(raw).trip?.brief?.structuredBrief?.countryDiscoveryChoices); } catch { return false; }
    }));
    await view.page.reload();
    await view.page.getByRole("button", { name: "Continue shaping your route" }).click();
    await dialog.getByRole("heading", { name: "Where should you go in Tajikistan?" }).waitFor();
    assert.equal(await dialog.getByRole("button", { name: `${removedName}: not selected, add` }).getAttribute("aria-pressed"), "false");
    // A rapid double activation must not commit the same draft twice.
    await view.page.evaluate(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>('button')]
        .find((item) => item.textContent?.startsWith("Continue with"));
      button?.click(); button?.click();
    });
    await view.page.waitForFunction(() => Object.values(localStorage).some((raw) => {
      try { return JSON.parse(raw).trip?.stops?.some((stop: { countryCode?: string }) => stop.countryCode === "TJ"); } catch { return false; }
    }));
    await view.page.reload();
    const committedIds = await view.page.evaluate(() => Object.values(localStorage)
      .map((raw) => { try { return JSON.parse(raw).trip; } catch { return null; } })
      .find((trip) => trip?.stops?.some((stop: { countryCode?: string }) => stop.countryCode === "TJ"))
      .stops.filter((stop: { countryCode?: string }) => stop.countryCode === "TJ")
      .map((stop: { canonicalPlaceId: string }) => stop.canonicalPlaceId) as string[]);
    assert.equal(new Set(committedIds).size, committedIds.length);
    const firstStop = await view.page.evaluate(() => Object.values(localStorage)
      .map((raw) => { try { return JSON.parse(raw).trip; } catch { return null; } })
      .find((trip) => trip?.stops?.some((stop: { countryCode?: string }) => stop.countryCode === "TJ"))
      .stops.find((stop: { countryCode?: string }) => stop.countryCode === "TJ") as { id: string; name: string; canonicalPlaceId: string });
    await view.page.getByRole("button", { name: `Remove ${firstStop.name}` }).first().click();
    await view.page.getByRole("dialog", { name: `Remove ${firstStop.name} and its plan?` })
      .getByRole("button", { name: `Remove ${firstStop.name}` }).click();
    await view.page.waitForFunction(({ removedId, removedName }: { removedId: string; removedName: string }) => Object.values(localStorage).some((raw) => {
      try { const trip = JSON.parse(raw).trip; return trip?.stops && !trip.stops.some((stop: { id: string }) => stop.id === removedId)
        && !trip.brief.structuredBrief?.placeSelections?.some((selection: { routeStopId?: string }) => selection.routeStopId === removedId)
        && !trip.brief.structuredBrief?.destinations?.some((destination: { id?: string }) => destination.id === removedId)
        && !trip.brief.structuredBrief?.mustVisit?.some((destination: { name: string }) => destination.name === removedName)
        && trip.brief.structuredBrief?.placeMentions?.some((mention: { canonicalName: string }) => mention.canonicalName === "Tajikistan"); } catch { return false; }
    }), { removedId: firstStop.id, removedName: firstStop.name }, { timeout: 5000 });
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

test("Africa and Serengeti keep the park as an anchor with a reviewed nearby overnight locality", { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const capture = captureJourneyBrief("Starting from Madrid, 14 days in Africa and Serengeti");
  const draft = createHomeTripDraft({
    capture, handoffId: "serengeti-discovery", datesExplicit: true,
    startDate: "2026-10-06", endDate: "2026-10-20", travellers: 2, travellersExplicit: true, interests: ["nature"],
    origin: { name: "Madrid", country: "Spain", canonicalPlaceId: "madrid", coordinates: [-3.7038, 40.4168] },
  });
  draft.destinations = handoffRouteStops(capture.mentions, capture.journeyEnd);
  const view = await renderBuilder({ query: "?homeDraft=1", draft });
  try {
    const dialog = view.page.getByRole("dialog");
    await dialog.getByRole("heading", { name: /Where should you go in Africa/ }).waitFor();
    assert.equal(await dialog.getByText("Arusha").count() > 0, true);
    await dialog.getByRole("button", { name: /Continue with [1-9] places/ }).click();
    await dialog.getByRole("heading", { name: "Serengeti National Park" }).waitFor();
    const base = dialog.getByRole("button", { name: /Seronera.*Already in route; use as base/ });
    assert.equal(await base.count(), 1);
    assert.equal(await dialog.getByText(/could not confidently identify a nearby base/).count(), 0);
    await base.click();
    assert.equal(await view.page.getByRole("button", { name: "Remove Seronera" })
      .evaluateAll((buttons: Element[]) => buttons.filter((button: Element) => !button.closest('[role="dialog"]')).length), 1,
      "resolving the park uses the existing canonical Seronera stop");
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
