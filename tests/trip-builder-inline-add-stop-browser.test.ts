import assert from "node:assert/strict";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

test("populated Builder opens one labelled existing Add a stop field from its top action", { skip: !builderBrowserTestsEnabled, timeout: 30_000 }, async () => {
  const view = await renderBuilder({ query: "?inspire=morocco-rail" });
  try {
    await view.page.setViewportSize({ width: 1440, height: 1100 });
    await view.page.getByRole("button", { name: "Add destination", exact: true }).click();
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const label = section.getByText("Add a stop", { exact: true });

    assert.equal(await section.getByRole("button", { name: "Add stop", exact: true }).count(), 0);
    assert.equal(await section.getByRole("button", { name: "Done adding stops", exact: true }).count(), 0);
    assert.equal(await input.count(), 1);
    assert.equal(await label.count(), 1);
    assert.equal(await label.getAttribute("for"), await input.getAttribute("id"));
    assert.equal(await view.page.getByRole("button", { name: "Save changes", exact: true }).count(), 0);
    assert.equal(await view.page.getByRole("button", { name: "Cancel", exact: true }).count(), 0);

    const lastStop = await view.page.locator("[data-builder-top-controls]").boundingBox();
    const field = await input.boundingBox();
    assert.ok(lastStop && field);
    assert.ok(field.y >= lastStop.y + lastStop.height, "the existing intake opens below its top action");
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
    await view.page.getByRole("button", { name: "Add destination", exact: true }).click();
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const routeNames = () => view.page.locator("[data-builder-route-workspace] [data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("strong")?.textContent?.trim() ?? ""));

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
    await view.page.waitForFunction(() => document.querySelectorAll("[data-builder-route-workspace] [data-builder-stop-id]").length === 4);
    assert.equal(await input.inputValue(), "");
    assert.equal(await input.evaluate((element: Element) => document.activeElement === element), true,
      "the established autocomplete focus remains on the field after a successful addition");
    await input.fill("Tangier");
    await view.page.getByRole("option", { name: /^Tangier/ }).waitFor();
    await view.page.getByRole("option", { name: /^Tangier/ }).click();
    await view.page.waitForFunction(() => document.querySelectorAll("[data-builder-route-workspace] [data-builder-stop-id]").length === 5);
    assert.deepEqual(await routeNames(), ["Marrakech", "Fes", "Chefchaouen", "Rabat", "Tangier"]);

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
    await view.page.getByRole("button", { name: "Add destination", exact: true }).click();
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

test("clarification search resolves each original stop occurrence in prompt order with its fixed nights", { skip: !builderBrowserTestsEnabled, timeout: 60_000 }, async () => {
  const suggestion = (name: string, canonicalPlaceId: string, coordinates: [number, number]) => ({
    name, canonicalPlaceId, country: "Morocco", region: "Drâa-Tafilalet", coordinates,
    placeType: "town", routability: "direct_destination",
    provenance: [{ id: `fixture:${canonicalPlaceId}`, label: "Test place provider", kind: "provider", supports: "Fixture identity for Builder regression." }],
  });
  const view = await renderBuilder({ geocodeCandidates: {
    "Aït Benhaddou": [suggestion("Aït Benhaddou", "open-world:nominatim:node:365060850", [-7.13, 31.05])],
    Merzouga: [suggestion("Merzouga", "open-world:nominatim:node:3901504169", [-4.01, 31.1])],
  } });
  const page = view.page;
  page.setDefaultTimeout(5000);
  try {
    await page.getByRole("tab", { name: "Describe my trip" }).click();
    await page.getByRole("textbox", { name: "Start your plan" }).fill("10 nights: Marrakech 3, Aït Benhaddou 1, Merzouga 2, Fes 4.");
    await page.getByRole("button", { name: "Plan my trip", exact: true }).click();
    await page.locator("[data-builder-stop-index]").nth(1).waitFor({ timeout: 15_000 });

    for (const place of ["Aït Benhaddou", "Merzouga"]) {
      const choose = page.getByRole("button", { name: `Choose place ${place}`, exact: true });
      assert.ok(await choose.count()<=1,"each unresolved mention has one clarification action owner");
      if (await choose.isVisible().catch(() => false)) await choose.click();
      const dialog = page.getByRole("dialog");
      await dialog.getByRole("heading", { name: "Explore places", exact: true }).waitFor();
      const search = dialog.getByRole("combobox");
      await search.fill(place);
      const option = dialog.getByRole("option", { name: new RegExp(`^${place}.*Morocco.*Town`, "i") });
      await option.waitFor({ timeout: 10_000 });
      await option.click();
      await dialog.waitFor({ state: "hidden", timeout: 15_000 }).catch(() => {});
    }

    const result: Array<{ name: string; nights: number | null }> = await page.locator("[data-builder-stop-index]").evaluateAll((rows: Element[]) => rows.map((row: Element) => {
      const name = row.querySelector("strong")?.textContent?.trim() ?? "";
      const controls = [...row.querySelectorAll("button[aria-label]")].map((button) => button.getAttribute("aria-label") ?? "");
      const nightsLabel = controls.find((label) => /\d+ nights?/.test(label)) ?? "";
      const nights = nightsLabel.match(/;\s*(\d+)\s+nights?/i)?.[1] ?? nightsLabel.match(/(\d+)\s+nights?/i)?.[1] ?? null;
      return { name, nights: nights === null ? null : Number(nights) };
    }));
    assert.deepEqual(result.map(({ name }: { name: string; nights: number | null }) => name), ["Marrakech", "Aït Benhaddou", "Merzouga", "Fes"]);
    assert.deepEqual(result.map(({ nights }: { name: string; nights: number | null }) => nights), [3, 1, 2, 4]);
    assert.equal(await page.getByText("Confirm which place you mean by Aït Benhaddou.", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Confirm which place you mean by Merzouga.", { exact: true }).count(), 0);

    const savedBeforeReload = await page.waitForFunction(() => Object.values(localStorage).flatMap((raw) => {
      try { const trip = JSON.parse(raw as string).trip; return trip?.stops ? [trip] : []; } catch { return []; }
    }).find((trip: { stops: Array<{ name: string }> }) =>
      trip.stops.map((stop) => stop.name).join("|") === "Marrakech|Aït Benhaddou|Merzouga|Fes") ?? null, undefined, { timeout: 15_000 });
    const before = await savedBeforeReload.jsonValue() as {
      id: string;
      stops: Array<{ id: string; name: string; canonicalPlaceId?: string; nights?: number | null }>;
      brief: { structuredBrief?: { hardConstraints?: Array<{ type: string; fixedNights?: number; place?: { name?: string } }> } };
    };
    assert.deepEqual(before.stops.map(({ canonicalPlaceId }) => canonicalPlaceId), [
      "marrakech", "open-world:nominatim:node:365060850", "open-world:nominatim:node:3901504169", "fes",
    ]);
    assert.equal(new Set(before.stops.map(({ id }) => id)).size, 4, "the original occurrences keep distinct stable stop IDs");
    assert.deepEqual(before.stops.map(({ nights }) => nights), [3, 1, 2, 4]);
    assert.deepEqual(before.brief.structuredBrief?.hardConstraints?.filter((constraint) => constraint.type === "fixed-commitment")
      .map((constraint) => [constraint.place?.name, constraint.fixedNights])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0]))), [
      ["Aït Benhaddou", 1], ["Fes", 4], ["Marrakech", 3], ["Merzouga", 2],
    ]);
    await page.reload();
    await page.locator("[data-builder-stop-index]").nth(3).waitFor();
    assert.deepEqual(await page.locator("[data-builder-stop-index]").evaluateAll((rows: Element[]) => rows.map((row: Element) => row.querySelector("strong")?.textContent?.trim() ?? "")),
      ["Marrakech", "Aït Benhaddou", "Merzouga", "Fes"]);
    assert.equal(await page.getByText("Confirm which place you mean by Aït Benhaddou.", { exact: true }).count(), 0);
    assert.equal(await page.getByText("Confirm which place you mean by Merzouga.", { exact: true }).count(), 0);
    const savedAfterReload = await page.evaluate((tripId: string) => Object.values(localStorage).flatMap((raw) => {
      try { const trip = JSON.parse(raw as string).trip; return trip?.id === tripId ? [trip] : []; } catch { return []; }
    })[0], before.id) as typeof before | undefined;
    assert.ok(savedAfterReload);
    assert.deepEqual(savedAfterReload.stops.map(({ id, canonicalPlaceId, nights }) => ({ id, canonicalPlaceId, nights })),
      before.stops.map(({ id, canonicalPlaceId, nights }) => ({ id, canonicalPlaceId, nights })));
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
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
    await view.page.getByRole("button", { name: "Add destination", exact: true }).click();
    const section = view.page.locator("#builder-stops");
    const input = section.getByRole("combobox", { name: "Add a stop", exact: true });
    const initialNames = await view.page.locator("[data-builder-route-workspace] [data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("strong")?.textContent?.trim() ?? ""));
    await input.fill("Kyrgyzstan");
    await view.page.getByRole("option", { name: /^Kyrgyzstan/ }).first().click();

    const dialog = view.page.getByRole("dialog");
    await dialog.getByRole("heading", { name: "Explore places", exact: true }).waitFor();
    assert.deepEqual(await view.page.locator("[data-builder-route-workspace] [data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("strong")?.textContent?.trim() ?? "")), initialNames);
    assert.equal(await section.getByText("Kyrgyzstan", { exact: true }).count(), 0);
    await dialog.getByRole("button", { name: "Finish later", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    assert.deepEqual(await view.page.locator("[data-builder-route-workspace] [data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("strong")?.textContent?.trim() ?? "")), initialNames);
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
    await view.page.getByRole("button", { name: "Add destination", exact: true }).click();
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

    const routeNames = await view.page.locator("[data-builder-route-workspace] [data-builder-stop-id]").evaluateAll((rows: Element[]) =>
      rows.map((row) => row.querySelector("strong")?.textContent?.trim() ?? ""));
    assert.deepEqual(routeNames, ["Marrakech", "Fes", "Chefchaouen", "Bishkek City"]);
    assert.equal(routeNames.includes("Kyrgyzstan"), false);
    assert.deepEqual(view.errors, []);
  } finally {
    await view.close();
  }
});
