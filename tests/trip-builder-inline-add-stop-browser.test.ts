import assert from "node:assert/strict";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

test("populated Builder keeps one labelled Add a stop field below the route", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ query: "?inspire=morocco-rail" });
  try {
    await view.page.setViewportSize({ width: 1440, height: 1100 });
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const label = section.getByText("Add a stop", { exact: true });

    assert.equal(await section.getByRole("button", { name: "Add stop", exact: true }).count(), 0);
    assert.equal(await section.getByRole("button", { name: "Done adding stops", exact: true }).count(), 0);
    assert.equal(await input.count(), 1);
    assert.equal(await label.count(), 1);
    assert.equal(await label.getAttribute("for"), await input.getAttribute("id"));
    assert.equal(await view.page.getByRole("button", { name: "Save changes", exact: true }).count(), 1);
    assert.equal(await view.page.getByRole("button", { name: "Cancel", exact: true }).count(), 1);

    const lastStop = await section.locator("[data-builder-stop-id]").last().boundingBox();
    const field = await input.boundingBox();
    assert.ok(lastStop && field);
    assert.ok(field.y >= lastStop.y + lastStop.height, "the add field follows the existing stop list");
    assert.deepEqual(view.errors, []);
  } finally {
    await view.close();
  }
});

test("the inline field adds successive cities and retains the saved route on reload", { skip: !builderBrowserTestsEnabled, timeout: 45_000 }, async () => {
  const candidate = (name: string, canonicalPlaceId: string, coordinates: [number, number]) => ({
    name,
    canonicalPlaceId,
    country: "Morocco",
    coordinates,
    placeType: "city",
    routability: "direct_destination",
  });
  const view = await renderBuilder({
    query: "?inspire=morocco-rail",
    geocodeCandidates: {
      Rabat: [candidate("Rabat", "rabat", [-6.8498, 34.0209])],
      Tangier: [candidate("Tangier", "tangier", [-5.834, 35.7595])],
    },
  });
  try {
    await view.page.setViewportSize({ width: 1440, height: 1100 });
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const routeNames = () => section.locator("[data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("span")?.textContent?.replace(/^\d+/, "") ?? ""));

    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen"]);
    await input.fill("Marrakech");
    await input.press("Enter");
    await view.page.getByRole("alert").filter({ hasText: "Marrakech is already in your route." }).waitFor();
    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen"], "an existing place remains subject to canonical duplicate prevention");

    await input.fill("Rabat");
    await view.page.getByRole("option", { name: /^Rabat/ }).waitFor();
    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen"], "typing is not an Add");
    await input.press("ArrowDown");
    await input.press("Enter");
    await view.page.waitForFunction(() => document.querySelectorAll("#builder-stops [data-builder-stop-id]").length === 4);
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.evaluate((element: Element) => document.activeElement === element), true,
      "the established autocomplete focus remains on the field after a successful addition");
    await input.fill("Tangier");
    await view.page.getByRole("option", { name: /^Tangier/ }).waitFor();
    await view.page.getByRole("option", { name: /^Tangier/ }).click();
    await view.page.waitForFunction(() => document.querySelectorAll("#builder-stops [data-builder-stop-id]").length === 5);
    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen", "Rabat", "Tangier"]);

    await view.page.getByRole("button", { name: "Save changes", exact: true }).click();
    const savedRoute = await view.page.waitForFunction(() => {
      const trips = Object.values(localStorage).flatMap((raw) => {
        try { const trip = JSON.parse(raw as string).trip; return trip ? [trip] : []; } catch { return []; }
      });
      return trips.find((trip: { stops?: Array<{ name: string }> }) =>
        trip.stops?.map((stop) => stop.name).join("|") === "Marrakech|Fes|Chefchaouen|Rabat|Tangier") ?? null;
    });
    const savedBeforeReload = await savedRoute.jsonValue() as {
      id: string;
      stops: Array<{ id: string; name: string; canonicalPlaceId?: string; nights: number | null }>;
      brief: { nightAllocations?: Record<string, number> };
    };
    assert.deepEqual(savedBeforeReload.stops.map(({ name }) => name), ["Marrakech", "Fes", "Chefchaouen", "Rabat", "Tangier"]);
    assert.ok(savedBeforeReload.brief.nightAllocations, "the canonical saved route retains its night allocations");

    await view.page.reload();
    await view.page.getByRole("combobox", { name: "Add a stop", exact: true }).waitFor();
    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen", "Rabat", "Tangier"]);
    const savedAfterReload = await view.page.evaluate((tripId: string) => Object.values(localStorage).flatMap((raw) => {
      try { const trip = JSON.parse(raw as string).trip; return trip?.id === tripId ? [trip] : []; } catch { return []; }
    })[0], savedBeforeReload.id) as typeof savedBeforeReload | undefined;
    assert.ok(savedAfterReload);
    assert.deepEqual(savedAfterReload.stops.map(({ id, name, canonicalPlaceId, nights }) => ({ id, name, canonicalPlaceId, nights })),
      savedBeforeReload.stops.map(({ id, name, canonicalPlaceId, nights }) => ({ id, name, canonicalPlaceId, nights })));
    assert.deepEqual(savedAfterReload.brief.nightAllocations, savedBeforeReload.brief.nightAllocations);
    assert.deepEqual(view.errors, []);
  } finally {
    await view.close();
  }
});

test("a broad country uses Discovery and never becomes a phantom route stop", { skip: !builderBrowserTestsEnabled, timeout: 40_000 }, async () => {
  const view = await renderBuilder({
    query: "?inspire=morocco-rail",
    geocodeCandidates: {
      Kyrgyzstan: [{
        name: "Kyrgyzstan",
        canonicalPlaceId: "open-world:fixture:kyrgyzstan",
        country: "Kyrgyzstan",
        coordinates: [74.5, 41.2],
        placeType: "country",
        routability: "planning_area",
      }],
    },
  });
  try {
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const initialNames = await section.locator("[data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("span")?.textContent?.replace(/^\d+/, "") ?? ""));
    await input.fill("Kyrgyzstan");
    await view.page.getByRole("option", { name: /^Kyrgyzstan/ }).first().click();

    const dialog = view.page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Explore places", exact: true }).waitFor();
    assert.deepEqual(await section.locator("[data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("span")?.textContent?.replace(/^\d+/, "") ?? "")), initialNames);
    assert.equal(await section.getByText("Kyrgyzstan", { exact: true }).count(), 0);
    await dialog.getByRole("button", { name: "Finish later", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await section.locator("[data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("span")?.textContent?.replace(/^\d+/, "") ?? "")), initialNames);
    assert.deepEqual(view.errors, []);
  } finally {
    await view.close();
  }
});

test("a direct city selected through country Discovery resolves the country intent", { skip: !builderBrowserTestsEnabled, timeout: 50_000 }, async () => {
  const view = await renderBuilder({
    query: "?inspire=morocco-rail",
    geocodeCandidates: {
      Kyrgyzstan: [{
        name: "Kyrgyzstan",
        canonicalPlaceId: "open-world:fixture:kyrgyzstan",
        country: "Kyrgyzstan",
        coordinates: [74.5, 41.2],
        placeType: "country",
        routability: "planning_area",
      }],
      "Bishkek City": [{
        name: "Bishkek City",
        canonicalPlaceId: "open-world:fixture:bishkek-city",
        country: "Kyrgyzstan",
        coordinates: [74.5698, 42.8746],
        placeType: "city",
        routability: "direct_destination",
      }],
    },
  });
  try {
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    await input.fill("Kyrgyzstan");
    await view.page.getByRole("option", { name: /^Kyrgyzstan/ }).first().click();
    const dialog = view.page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Explore places", exact: true }).waitFor();

    const search = dialog.locator('[role="combobox"]');
    await search.fill("Bishkek City");
    await dialog.getByRole("option", { name: /^Bishkek City/ }).waitFor();
    await dialog.getByRole("option", { name: /^Bishkek City/ }).click();
    await dialog.getByRole("button", { name: "Add 1 place", exact: true }).click();
    await dialog.waitFor({ state: "detached" });

    const routeNames = await section.locator("[data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("span")?.textContent?.replace(/^\d+/, "") ?? ""));
    assert.deepEqual(routeNames, ["Marrakech", "Fes", "Chefchaouen", "Bishkek City"]);
    assert.equal(routeNames.includes("Kyrgyzstan"), false);
    assert.deepEqual(view.errors, []);
  } finally {
    await view.close();
  }
});
