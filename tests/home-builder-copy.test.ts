import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the Home and Builder choice labels use the same terminology", () => {
  const home = source("app/journey/home/home-trip-starter.tsx");
  const builder = source("app/journey/new/trip-builder-top-controls.tsx");
  assert.match(home, /"Ida y vuelta" : "Return"/);
  assert.match(builder, /'Ida y vuelta':'Return'/);
  assert.match(builder, /'Destinos':'Destinations'/);
  assert.match(builder, /Check stop order/);
});

test("build without an unconfirmed place names its consequence and both choices", () => {
  const builder = source("app/journey/new/trip-builder.tsx");
  const dialog = builder.slice(builder.indexOf("open={buildAttentionReviewOpen"), builder.indexOf('open={Boolean(pendingTopRemoval)}'));
  assert.match(dialog, /Build without \$\{buildAttentionLabel\}\?/);
  assert.match(dialog, /You can add it to the route later/);
  assert.match(dialog, /Review \$\{buildAttentionLabel\}/);
  assert.doesNotMatch(dialog, /NEEDS ATTENTION|Morrovia will build using/);
});

test("Home names choice and removes filler while keeping attribution", () => {
  const home = source("app/journey/home/home-trip-starter.tsx");
  assert.match(home, /Keep current plan/);
  assert.match(home, /Use return trip/);
  assert.match(home, /Use one-way trip/);
  const closing = source("app/journey/home/immersive/closing-chapter.tsx");
  assert.doesNotMatch(closing, /The best part is still ahead|Go somewhere/);
  assert.match(closing, /Image credits/);
  assert.match(closing, /Plan my trip/);
});
