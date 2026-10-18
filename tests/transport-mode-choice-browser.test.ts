import assert from "node:assert/strict";
import test from "node:test";

import { renderBuilder, builderBrowserTestsEnabled } from "./helpers/builder-render.ts";
import { japanTrip } from "./fixtures/transport-choice.ts";
import { geographicallyReady, stopGeographicPlace } from "../lib/easyt/geographic-binding.ts";

test("transport fixture owns canonical geography; coordinates without identity remain unverified", () => {
  const trip = japanTrip();
  for (const stop of trip.stops) assert.equal(geographicallyReady(stopGeographicPlace(stop)), true);
  assert.equal(geographicallyReady({ name: trip.brief.origin, country: trip.brief.originCountry,
    canonicalPlaceId: trip.brief.originCanonicalPlaceId, coordinates: trip.brief.originCoordinates ?? undefined }, "endpoint"), true);
  const stop = stopGeographicPlace(trip.stops[0]);
  assert.equal(geographicallyReady({ ...stop, canonicalPlaceId: undefined }), false);
});


test("Transport modal keeps choices as drafts until Apply and restores the recommendation after reload", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const trip = japanTrip();
  const view = await renderBuilder({ path: `/journey/${trip.id}/transport`, initialTrip: trip });
  try {
    const card = view.page.locator("[data-transport-leg-id]").first();
    await card.getByRole("button", { name: /View details:/ }).click();
    const snapshot = () => view.page.evaluate((tripId: string) => Object.fromEntries(Object.entries(localStorage).filter(([key]) => key.includes(encodeURIComponent(tripId)))), trip.id);
    const before = await snapshot();
    const trigger = view.page.getByRole("button", { name: "Change transport mode" });
    const dialog = view.page.getByRole("dialog", { name: "Change transport", exact: true });
    await trigger.click();
    await dialog.getByRole("radio", { name: /Road.*6h 30m/ }).click();
    assert.deepEqual(await snapshot(), before, "selecting a radio does not save");
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.deepEqual(await snapshot(), before, "Cancel does not save");
    await view.page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Change transport mode");
    await trigger.focus();
    await trigger.click();
    await dialog.getByRole("radio", { name: /Train/ }).focus();
    await view.page.keyboard.press("ArrowDown");
    assert.equal(await dialog.getByRole("radio", { name: /Road/ }).getAttribute("aria-checked"), "true");
    for (let i = 0; i < 8; i++) await view.page.keyboard.press("Tab");
    assert.equal(await dialog.evaluate((element: HTMLElement) => element.contains(document.activeElement)), true, "keyboard focus stays in the modal");
    await view.page.keyboard.press("Escape");
    assert.deepEqual(await snapshot(), before, "Escape does not save");
    await trigger.click();
    await dialog.getByRole("radio", { name: /Road/ }).click();
    await view.page.mouse.click(2, 2);
    await dialog.waitFor({ state: "hidden" });
    assert.deepEqual(await snapshot(), before, "backdrop close does not save");
    await trigger.click();
    await dialog.getByRole("radio", { name: /Road/ }).click();
    await dialog.getByRole("button", { name: "Use road", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await card.getByText(/Road.*6h 30m/).first().waitFor();
    await view.page.reload();
    await card.getByText(/Road.*6h 30m/).first().waitFor();
    for (const width of [390, 1024]) {
      await view.page.setViewportSize({ width, height: 844 });
      assert.equal(await view.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    }
    await trigger.click();
    await dialog.getByRole("radio", { name: /Train/ }).click();
    await dialog.getByRole("button", { name: "Use train", exact: true }).click();
    await card.getByText(/Rail.*2h 15m/).first().waitFor();
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
