import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";

const stories = readFileSync(new URL("../app/journey/new/trip-builder-review.stories.tsx", import.meta.url), "utf8");
const capture = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");

test("production Builder stories cover both New trip modes, restored input, import return and populated control", () => {
  assert.match(stories, /<TripBuilder\s*\/>/);
  for (const name of ["FreshStops", "FreshDescribe", "RestoredRepeatedStops", "RestoredAfterImport", "FreshSpanish", "PopulatedHandoff"]) {
    assert.match(stories, new RegExp(`export const ${name}: Story`));
  }
  for (const width of [390, 430, 768, 1024, 1440]) assert.match(stories, new RegExp(`FreshStopsAt${width}`));
});

test("shared capture keeps accessible tabs, validation and deliberate submission", () => {
  assert.match(capture, /role="tablist"/);
  assert.match(capture, /aria-selected=\{homepageEntry\.mode === "stops"\}/);
  assert.match(capture, /event\.key === "ArrowRight"/);
  assert.match(capture, /aria-invalid=\{promptError \? true : undefined\}/);
  assert.match(capture, /type="submit"/);
});

test("real fresh Builder has one mode selector, submit and import entry", { skip: !builderBrowserTestsEnabled }, async () => {
  const view = await renderBuilder();
  try {
    await view.page.getByRole("heading", { name: "New trip" }).waitFor();
    assert.equal(await view.page.getByRole("tablist", { name: "How to start your trip" }).count(), 1);
    assert.equal(await view.page.getByRole("button", { name: "Plan my trip" }).count(), 1);
    assert.equal(await view.page.getByRole("link", { name: "Import existing trip" }).count(), 1);
    assert.equal(await view.page.getByRole("combobox", { name: "Add your first place" }).count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});
