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
    await dialog.getByRole("button", { name: /Continue with [1-9] places/ }).click();
    await view.page.waitForFunction(() => Object.values(localStorage).some((raw) => {
      try { return JSON.parse(raw).trip?.stops?.some((stop: { countryCode?: string }) => stop.countryCode === "TJ"); } catch { return false; }
    }));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
