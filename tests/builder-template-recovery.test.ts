import assert from "node:assert/strict";
import test from "node:test";

import type { EasyTTrip } from "../lib/easyt/trip.ts";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

test("published route edits, nights and order survive durable reload and remain buildable", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ query: "?inspire=japan-south-korea&campaign=beta" });
  const recoveryTrip = async () => view.page.evaluate(() => Object.keys(localStorage)
    .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
    .map((key) => JSON.parse(localStorage.getItem(key)!))
    .find((record) => record.trip)?.trip) as Promise<EasyTTrip>;
  const routeNames = async () => view.page.locator("[data-builder-stop-index]").evaluateAll((rows: Element[]) => rows.map((row) => row.querySelector('[role="cell"] strong')?.textContent ?? ""));
  try {
    await view.page.waitForFunction(() => Boolean(new URL(location.href).searchParams.get("trip")));
    const durableUrl = new URL(view.page.url());
    assert.equal(durableUrl.searchParams.has("inspire"), false);
    assert.equal(durableUrl.searchParams.get("recover"), "1");
    assert.equal(durableUrl.searchParams.get("campaign"), "beta");

    const details = view.page.getByRole("region", { name: "Journey details", exact: true });
    await details.getByRole("button", { name: "Edit trip", exact: true }).click();
    await details.getByRole("button", { name: "Same as start", exact: true }).click();
    await details.getByRole("button", { name: "Save changes", exact: true }).click();

    const beforeNights = await recoveryTrip();
    const nightTarget = beforeNights.stops[0]!;
    await view.page.getByRole("button", { name: new RegExp(`Remove one night from ${nightTarget.name}`) }).click();
    await view.page.getByRole("button", { name: new RegExp(`Add one night to ${beforeNights.stops[1]!.name}`) }).click();

    const initialOrder = await routeNames();
    const moved = initialOrder[1]!;
    await view.page.locator(`summary[aria-label="Actions for ${moved}"]`).click();
    await view.page.getByRole("button", { name: "Later" }).click();
    const editedOrder = await routeNames();
    assert.notDeepEqual(editedOrder, initialOrder);

    await view.page.waitForFunction(({ movedId, nightTargetId, originalNights }: { movedId: string; nightTargetId: string; originalNights: number }) => Object.keys(localStorage)
      .filter((key) => key.startsWith("easyt:trip-recovery:v2:"))
      .map((key) => JSON.parse(localStorage.getItem(key)!))
      .some((record) => record.trip?.brief.journeyEnd?.mode === "same_as_start"
        && record.trip?.stops?.[2]?.id === movedId
        && record.trip?.stops?.find((stop: { id: string }) => stop.id === nightTargetId)?.nights !== originalNights), {
      movedId: beforeNights.stops[1]!.id,
      nightTargetId: beforeNights.stops[0]!.id,
      originalNights: beforeNights.stops[0]!.nights,
    });
    const edited = await recoveryTrip();
    assert.equal(edited.brief.sourceRouteKey, "japan-south-korea");
    assert.equal(edited.brief.journeyEnd?.mode, "same_as_start");
    assert.equal(await view.page.getByText("Changes saved on this device", { exact: true }).count(), 1);

    await view.page.reload();
    await view.page.getByRole("heading", { name: "Nights per stop" }).waitFor();
    assert.deepEqual(await routeNames(), editedOrder);
    const restored = await recoveryTrip();
    assert.equal(restored.brief.journeyEnd?.mode, "same_as_start");
    assert.deepEqual(restored.stops.map((stop) => [stop.id, stop.nights]), edited.stops.map((stop) => [stop.id, stop.nights]));
    const build = view.page.getByRole("button", { name: /Build trip/ });
    assert.equal(await build.isDisabled(), false, await view.page.locator("body").innerText());
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
