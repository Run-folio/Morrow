import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

function token(source: string, name: string) {
  const match = source.match(new RegExp(`${name}:\\s*(#[0-9a-f]{6})`, "i"));
  assert.ok(match, `${name} should be defined as a six-digit colour`);
  return match[1];
}

function luminance(hex: string) {
  const channels = hex.slice(1).match(/.{2}/g)?.map((value) => Number.parseInt(value, 16) / 255) ?? [];
  const [red, green, blue] = channels.map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return .2126 * red + .7152 * green + .0722 * blue;
}

function contrast(first: string, second: string) {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

test("compact semantic text colours retain WCAG AA contrast on their production surfaces", () => {
  const foundation = read("app/journey/journey-design.css");
  const paper = token(foundation, "--morrovia-paper");
  const lilac = token(foundation, "--morrovia-lilac");
  const signal = token(foundation, "--morrovia-signal");
  const muted = token(foundation, "--morrovia-muted");
  const success = token(foundation, "--morrovia-success");
  const warning = token(foundation, "--morrovia-warning");

  assert.ok(contrast(signal, paper) >= 4.5);
  assert.ok(contrast(signal, lilac) >= 4.5);
  assert.ok(contrast(muted, paper) >= 4.5);
  assert.ok(contrast(muted, lilac) >= 4.5);
  assert.ok(contrast(success, "#e0eeee") >= 4.5);
  assert.ok(contrast(warning, "#fff9e9") >= 4.5);
});

test("measured mobile controls keep a 44px minimum target", () => {
  const navigation = read("app/journey/easyt-navigation.module.css");
  const stamps = read("app/journey/stamped/stamped.module.css");

  assert.match(navigation, /\.compactMenu summary \{[\s\S]*?min-height: 44px/);
  assert.match(navigation, /\.compactMenu summary \{ width: 44px;/);
  assert.match(stamps, /\.mapControl \{ width: 44px !important; min-width: 44px !important; height: 44px !important; min-height: 44px !important; \}/);
});

test("workspace landmarks and tab panels keep valid, distinguishable semantics", () => {
  const itinerary = read("components/easyt/trip-itinerary-workspace.tsx");
  const map = read("components/journey-map-planner-workspace.tsx");
  const stamps = read("app/journey/stamped/stamped-client.tsx");
  const mapStory = read("components/easyt/trip-map-workspace.stories.tsx");

  assert.match(itinerary, /<div\s+className=\{styles\.dayPanel\}\s+role="tabpanel"/);
  assert.doesNotMatch(itinerary, /<article\s+className=\{styles\.dayPanel\}\s+role="tabpanel"/);
  assert.match(map, /aria-label="Selected map context" aria-live="polite"/);
  assert.match(stamps, /<h2>\{selectedCountry\.name\}<\/h2>/);
  assert.match(mapStory, /decorators: \[\(Story\) => <div className="morrovia-editorial-page"/);
});

test("the large closing illustration is lazy, low-priority and pre-optimized", () => {
  const footer = read("app/journey/home/home-footer.tsx");

  assert.match(footer, /src="\/journey\/illustrations\/home-closing-banner-v2\.webp"/);
  assert.match(footer, /width="1942"/);
  assert.match(footer, /height="809"/);
  assert.match(footer, /loading="lazy"/);
  assert.match(footer, /decoding="async"/);
  assert.match(footer, /fetchPriority="low"/);
});
