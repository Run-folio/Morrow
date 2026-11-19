import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { homepageInspirationTitle } from "../app/journey/home/immersive/homepage-inspiration-title.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage inspiration cards retain canonical Route Detail links for pre-hydration navigation", () => {
  const source = read("app/journey/home/immersive/homepage-route-inspiration.tsx");

  assert.match(source, /href=\{route\.href\}/);
  assert.match(source, /homepageInspirationTitle/);
  assert.doesNotMatch(source, /route\.dayRange|route\.stops|inspirationMeta/);
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
  assert.match(source, /placement="bottom-right"/);
  assert.doesNotMatch(source, /homepageRouteStopCards/);
  const card = source.match(/function HomepageRouteCard[\s\S]*?\n}/)?.[0] ?? "";
  assert.ok(card.includes("</EasyTLinkButton>") && card.indexOf("</EasyTLinkButton>") < card.indexOf("<MorroviaPhotoCredit"), "photo credit must be a sibling after the card link");
});

test("homepage how it works uses the approved three steps and opens its inline disclosure", () => {
  const source = read("app/journey/home/immersive/homepage-how-it-works.tsx");

  assert.match(source, /Tell us where\./);
  assert.match(source, /We build your plan\./);
  assert.match(source, /Make it yours\./);
  const englishSteps = source.match(/en:\s*\[([\s\S]*?)\],\s*es:/)?.[1] ?? "";
  assert.equal((englishSteps.match(/title:/g) ?? []).length, 3);
  assert.match(source, /aria-expanded=\{expanded\}/);
  assert.match(source, /aria-controls=\{panelId\}/);
  assert.match(source, /hidden=\{!expanded\}/);
  assert.match(source, /event.key === "Escape"/);
  assert.match(source, /triggerRef.current\?\.focus\(\)/);
  assert.doesNotMatch(source, /PRODUCT_TOUR_OPEN_EVENT/);
  assert.doesNotMatch(source, /<video|PlayCircle|CirclePlay/);
});

test("homepage inspiration grid keeps seven readable cards on desktop and scrolls horizontally on mobile", () => {
  const styles = read("app/journey/home/immersive/immersive.module.css");
  assert.match(styles, /grid-template-columns:repeat\(7,minmax\(0,1fr\)\)/);
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*grid-auto-columns:47%[\s\S]*scroll-snap-type:x proximity/);
  assert.match(styles, /\.inspirationGrid/);
  assert.match(styles, /\.howSteps/);
});

test("homepage inspiration stories cover full, fewer, empty, mobile and interaction states", () => {
  const stories = read("app/journey/home/immersive/homepage-inspiration.stories.tsx");
  for (const state of ["SevenRoutes", "FewerRoutes", "NoRoutes", "Mobile320", "InteractionBoundary", "HowItWorksFocusReturn"]) {
    assert.match(stories, new RegExp(`export const ${state}`), state);
  }
});

test("the rendered interaction play verifies canonical card content and ordinary click behavior", () => {
  const stories = read("app/journey/home/immersive/homepage-inspiration.stories.tsx");

  assert.match(stories, /homepageInspirationTitle\(route, false\)/);
  assert.match(stories, /route\.dayRange\.min === route\.dayRange\.max/);
  assert.match(stories, /route\.stops\.length/);
  assert.match(stories, /await userEvent\.click\(cards\[0\]\)/);
  assert.match(stories, /observed\.event\?\.defaultPrevented/);
  assert.match(stories, /Hydrated card click must intercept native navigation/);
  assert.match(stories, /Card click changed the selected Route Story/);
});

test("homepage titles shorten the route name without mutating its countries", () => {
  const route = { key: "namibia-self-drive", title: "Namibia Self-Drive", countries: ["Namibia"] };
  assert.equal(homepageInspirationTitle(route, false), "Namibia");
  assert.equal(homepageInspirationTitle({ ...route, countries: ["Japan", "South Korea"] }, true), "Japón + Corea del Sur");
  const countries = ["Croatia", "Montenegro", "Albania", "North Macedonia"];
  assert.equal(homepageInspirationTitle({ ...route, key: "balkans-overland", countries }, false), "The Balkans");
  assert.deepEqual(countries, ["Croatia", "Montenegro", "Albania", "North Macedonia"]);
});

test("homepage caption shading is local and leaves room for photo attribution", () => {
  const css = read("app/journey/home/immersive/immersive.module.css");
  assert.doesNotMatch(css, /\.inspirationPhoto::after/);
  assert.match(css, /\.inspirationTitle \{[^}]*width:max-content;[^}]*background:color-mix\(in srgb,var\(--morrovia-photo-ink\) 66%,transparent\)/);
  assert.match(css, /\.inspirationCard:has\(\.inspirationCredit\) \.inspirationTitle \{ max-width:calc\(100% - 44px\)/);
  const linear = (value: number) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const paperLuminance = 0.2126 * linear(251 / 255) + 0.7152 * linear(250 / 255) + 0.0722;
  const brightestBackdropLuminance = linear(1 - 0.66);
  assert.ok((paperLuminance + 0.05) / (brightestBackdropLuminance + 0.05) > 6);
});
