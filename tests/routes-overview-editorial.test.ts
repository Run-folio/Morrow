import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { discoveryCatalogue, publicDiscoveryDraft } from "../lib/easyt/discovery-catalogue.ts";
import { catalogueWithEditorialImages, preferUnusedPhotograph, routesOverviewChapters, routesOverviewEditorial } from "../lib/easyt/routes-overview-editorial.ts";

test("editorial chapters retain canonical eligibility, route facts and Start drafts", () => {
  const routes = discoveryCatalogue();
  const before = structuredClone(routes);
  const editorial = routesOverviewEditorial(routes);
  assert.equal(editorial.chapters.length, 7, "all seven approved route chapters are published");
  assert.deepEqual(editorial.chapters.map(chapter => chapter.route.key), routesOverviewChapters.filter(spec => routes.some(route => route.key === spec.key)).map(spec => spec.key));
  for (const chapter of editorial.chapters) {
    assert.deepEqual(chapter.draft, publicDiscoveryDraft(chapter.route.key, routes));
    assert.deepEqual(chapter.route, routes.find(route => route.key === chapter.route.key));
  }
  assert.deepEqual(routes, before);
  assert.equal(routesOverviewEditorial([]).chapters.length, 0);
});

test("overview hero and chapters use distinct local licensed photographs", () => {
  const editorial = routesOverviewEditorial(discoveryCatalogue());
  const images = [editorial.hero, ...editorial.chapters.map(chapter => chapter.image)];
  assert.equal(new Set(images.map(image => image?.sourceUrl)).size, images.length);
  for (const image of images) {
    assert.ok(image?.license && image.credit && image.licenseUrl);
    assert.match(image.sourceUrl, /^https:\/\//);
    for (const variant of image.variants) {
      assert.match(variant.src, /\.webp$/);
      assert.doesNotMatch(variant.src, /hero-japan|screenshot|map|illustration/i);
      assert.ok(existsSync(`public${variant.src}`), variant.src);
    }
  }
});

test("no-repeat preference handles responsive variants, exhausted alternatives and empty coverage", () => {
  const routes = discoveryCatalogue();
  const photo = routes.find(route => route.image)!.image!;
  const alternate = routes.find(route => route.image?.sourceUrl !== photo.sourceUrl)!.image!;
  const used = new Set<string>([photo.sourceUrl]);
  assert.equal(preferUnusedPhotograph([{ ...photo, variants: photo.variants.slice(0, 1) }, alternate], used), alternate);
  assert.equal(preferUnusedPhotograph([photo], used), photo);
  assert.equal(preferUnusedPhotograph([null, undefined], used), null);
});

test("catalogue image preference preserves every route and Gallery/Map identity", () => {
  const routes = discoveryCatalogue();
  const result = catalogueWithEditorialImages(routes, routesOverviewEditorial(routes));
  assert.deepEqual(result.map(({ image, ...route }) => route), routes.map(({ image, ...route }) => route));
});

test("overview hero is independent of route ordering and is not the first catalogue or feature image", () => {
  const routes = discoveryCatalogue();
  const editorial = routesOverviewEditorial(routes);
  assert.deepEqual(routesOverviewEditorial([...routes].reverse()).hero, editorial.hero);
  assert.notEqual(catalogueWithEditorialImages(routes, editorial)[0].image?.sourceUrl, editorial.hero?.sourceUrl);
  assert.notEqual(editorial.chapters[0].image?.sourceUrl, editorial.hero?.sourceUrl);
});
