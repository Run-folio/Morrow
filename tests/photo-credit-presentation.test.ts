import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared disclosure owns the accessible photo-credit interaction", () => {
  const component = read("components/easyt/morrovia-photo-credit.tsx");
  const styles = read("components/easyt/morrovia-photo-credit.module.css");
  assert.match(component, /<details/);
  assert.match(component, /<summary aria-label=\{photoLabel \? `Photo credit:/);
  assert.match(component, /<Camera aria-hidden="true"/);
  assert.match(component, /sourceHref/);
  assert.match(component, /licenseHref/);
  assert.match(component, /fullCreditHref/);
  assert.match(styles, /width:44px; height:44px/);
  assert.match(styles, /summary:focus-visible/);
  assert.doesNotMatch(styles, /:hover/);
});

test("editorial route, homepage, discovery and dashboard surfaces reuse the shared owner", () => {
  const surfaces = [
    "app/journey/discover/discovery-photo.tsx",
    "app/journey/routes/[slug]/route-detail-photo.tsx",
    "app/journey/home/immersive/immersive-home.tsx",
    "app/journey/home/immersive/route-chapters.tsx",
    "app/journey/dashboard/dashboard-client.tsx",
    "app/journey/routes/[slug]/route-hero-image.tsx",
    "app/journey/routes/[slug]/route-stop-image.tsx",
    "app/journey/routes/[slug]/route-attraction-image.tsx",
  ];
  for (const surface of surfaces) assert.match(read(surface), /MorroviaPhotoCredit/, surface);
  assert.doesNotMatch(read("app/journey/home/immersive/route-chapters.tsx"), /className=\{styles\.photoCredit\}/);
  assert.doesNotMatch(read("app/journey/discover/discovery-photo.tsx"), /<details/);
  assert.doesNotMatch(read("app/journey/routes/[slug]/route-detail-photo.tsx"), /<details/);
  assert.doesNotMatch(read("app/journey/dashboard/dashboard-client.tsx"), /className=\{styles\.(photoCredit|cardCredit)\}/);
});

test("canonical image provenance still exposes original source, licence and full-credit links", () => {
  const routeImages = read("lib/easyt/route-images.ts");
  assert.match(routeImages, /sourceUrl: record\.sourceUrl/);
  assert.match(routeImages, /licenseUrl: record\.licenseUrl/);
  assert.match(routeImages, /fullCreditUrl:/);
  for (const surface of [
    "app/journey/discover/discovery-photo.tsx",
    "app/journey/routes/[slug]/route-detail-photo.tsx",
    "app/journey/home/immersive/route-chapters.tsx",
    "app/journey/dashboard/dashboard-client.tsx",
  ]) {
    const source = read(surface);
    assert.match(source, /sourceHref=/, surface);
    assert.match(source, /licenseHref=/, surface);
    assert.match(source, /fullCreditHref=/, surface);
  }
});
