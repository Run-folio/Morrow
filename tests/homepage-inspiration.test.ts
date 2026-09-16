import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage inspiration cards browse canonical Route Detail pages without changing homepage route state", () => {
  const source = read("app/journey/home/immersive/homepage-route-inspiration.tsx");

  assert.match(source, /href=\{route\.href\}/);
  assert.match(source, /route\.title/);
  assert.match(source, /route\.dayRange\.min/);
  assert.match(source, /route\.dayRange\.max/);
  assert.match(source, /route\.stops\.length/);
  assert.match(source, /href="\/journey\/discover"/);
  assert.doesNotMatch(source, /RoutePlanLink|routePlannerPayload|localStorage|setIndex|onChange/);
});

test("homepage inspiration reuses reviewed route photos with resilient fallback and sibling credits", () => {
  const source = read("app/journey/home/immersive/homepage-route-inspiration.tsx");

  assert.match(source, /ResilientImage/);
  assert.match(source, /MorroviaPhotoCredit/);
  assert.match(source, /photo\.variants/);
  assert.match(source, /photoFallback/);
  assert.match(source, /route\.heroPhoto/);
  assert.match(source, /route\.heroPhoto\?\.fallback/);
  assert.match(source, /route\.photos\.find/);
  assert.match(source, /focalPosition/);
  assert.match(source, /placement="top-right"/);
  assert.doesNotMatch(source, /homepageRouteStopCards/);
  const card = source.match(/function HomepageRouteCard[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(card.indexOf("</Link>") < card.indexOf("<MorroviaPhotoCredit"), "photo credit must be a sibling after the card link");
});

test("homepage how it works uses the approved three steps and opens the existing product tour", () => {
  const source = read("app/journey/home/immersive/homepage-how-it-works.tsx");

  assert.match(source, /Tell us where\./);
  assert.match(source, /We build your plan\./);
  assert.match(source, /Make it yours\./);
  const englishSteps = source.match(/en:\s*\[([\s\S]*?)\],\s*es:/)?.[1] ?? "";
  assert.equal((englishSteps.match(/title:/g) ?? []).length, 3);
  assert.match(source, /PRODUCT_TOUR_OPEN_EVENT/);
  assert.match(source, /window\.dispatchEvent\(new Event\(PRODUCT_TOUR_OPEN_EVENT\)\)/);
  assert.doesNotMatch(source, /<video|PlayCircle|CirclePlay/);
});

test("homepage inspiration grid preserves readable cards and responsive wrapping", () => {
  const styles = read("app/journey/home/immersive/immersive.module.css");
  assert.match(styles, /repeat\(auto-fit,minmax\(min\(100%,180px\),1fr\)\)/);
  assert.match(styles, /\.inspirationGrid/);
  assert.match(styles, /\.howSteps/);
});

test("homepage inspiration stories cover full, fewer, empty, mobile and interaction states", () => {
  const stories = read("app/journey/home/immersive/homepage-inspiration.stories.tsx");
  for (const state of ["SevenRoutes", "FewerRoutes", "NoRoutes", "Mobile320", "InteractionBoundary", "TourFocusReturn"]) {
    assert.match(stories, new RegExp(`export const ${state}`), state);
  }
});

test("the rendered interaction play verifies canonical card content and ordinary click behavior", () => {
  const stories = read("app/journey/home/immersive/homepage-inspiration.stories.tsx");

  assert.match(stories, /card\.textContent\?\.includes\(route\.title\)/);
  assert.match(stories, /route\.dayRange\.min === route\.dayRange\.max/);
  assert.match(stories, /route\.stops\.length/);
  assert.match(stories, /new MouseEvent\("click", \{ bubbles: true, cancelable: true, button: 0 \}\)/);
  assert.match(stories, /ordinaryClickWasUnprevented/);
  assert.match(stories, /event\.defaultPrevented/);
  assert.match(stories, /Card click changed the selected Route Story/);
});
