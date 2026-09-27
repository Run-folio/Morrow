import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("homepage route cards open the existing published route preview owner", () => {
  const homepage = read("components/easyt/morrovia-homepage.tsx");
  const immersive = read("app/journey/home/immersive/immersive-home.tsx");
  const inspiration = read("app/journey/home/immersive/homepage-route-inspiration.tsx");
  assert.match(homepage, /discoveryCatalogue\(/);
  assert.match(immersive, /previewRoutes/);
  assert.match(inspiration, /RoutePreview/);
  assert.match(inspiration, /<EasyTLinkButton href=\{route\.href\}/);
  assert.match(inspiration, /event\.preventDefault\(\);\s*setSelected\(preview\)/);
  assert.match(inspiration, /<RoutePreview route=\{selected\}/);
});

test("Routes listing reuses the same preview owner and its full-detail action", () => {
  const browser = read("app/journey/discover/discovery-browser.tsx");
  assert.match(browser, /import\("\.\/route-preview"\)/);
  assert.match(browser, /<RoutePreview route=\{selected\}/);
});

test("Route Detail uses the canonical direct Builder handoff without opening a preview", () => {
  const detail = read("app/journey/routes/[slug]/route-detail-view.tsx");
  assert.equal((detail.match(/<RoutePlanLink/g) ?? []).length, 2);
  assert.equal((detail.match(/>Use this route<\/RoutePlanLink>/g) ?? []).length, 2);
  assert.doesNotMatch(detail, /RoutePreview/);
  assert.match(read("app/journey/routes/[slug]/route-plan-link.tsx"), /\/journey\/new\?inspire=/);
});
