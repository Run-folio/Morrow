import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the canonical surface foundation owns radius, focus and overlay roles", () => {
  const foundation = read("app/journey/journey-design.css");
  const catalogue = read("components/easyt/storybook/morrovia-storybook-catalogue.tsx");

  assert.match(foundation, /--morrovia-control-radius: 10px/);
  assert.match(foundation, /--morrovia-radius: 14px/);
  assert.match(foundation, /--morrovia-focus-shadow: 0 0 0 3px var\(--morrovia-focus-ring\)/);
  assert.match(foundation, /--morrovia-shadow-overlay:/);
  assert.match(catalogue, /var\(--morrovia-focus-shadow\)/);
  assert.match(catalogue, /Ordinary cards should borrow neither role/);
});

test("selected Builder and shared-owner families use semantic radii without flattening local shapes", () => {
  const builder = read("app/journey/new/trip-builder.module.css");
  const dashboard = read("app/journey/dashboard/dashboard.module.css");
  const datePicker = read("components/easyt/morrovia-date-picker.module.css");
  const copilot = read("components/easyt/easyt-trip-copilot.module.css");

  assert.match(builder, /\.routeStep \.filters\{[^}]*border-radius:var\(--morrovia-radius\)/);
  assert.match(builder, /\.routeTimePlanner \{[^}]*border-radius: var\(--morrovia-control-radius\)/);
  assert.match(dashboard, /\.cardReadiness \{[\s\S]*?border-radius: var\(--morrovia-control-radius\)/);
  assert.match(datePicker, /\.calendarGrid button \{[\s\S]*?border-radius: var\(--morrovia-control-radius\)/);
  assert.match(copilot, /\.copilot\{[^}]*border-radius:var\(--morrovia-radius\)/);

  assert.match(builder, /border-radius:999px/, "pill controls should remain pills");
  assert.match(dashboard, /\.continueImage \{[\s\S]*?border-radius: 14px/, "media curvature should remain product-owned");
});

test("Storybook scaffolds derive editorial gutters from the canonical page width", () => {
  for (const path of [
    "components/easyt/morrovia-feedback.stories.module.css",
    "components/easyt/morrovia-loading-states.stories.module.css",
  ]) {
    const styles = read(path);
    assert.match(styles, /var\(--morrovia-page\)/, `${path} should use the canonical editorial width`);
    assert.doesNotMatch(styles, /1180px/, `${path} should not copy the canonical maximum`);
  }

  const builder = read("app/journey/new/trip-builder.module.css");
  const dashboard = read("app/journey/dashboard/dashboard.module.css");
  assert.match(builder, /max-width:1180px/, "the documented Builder workflow boundary should remain local");
  assert.match(dashboard, /@media \(max-width: 1180px\)/, "the Dashboard breakpoint is not a page-width token consumer");
});
