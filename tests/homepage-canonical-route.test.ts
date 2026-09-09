import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("the root route owns the single shared homepage implementation", () => {
  const root = read("app/page.tsx");
  const owner = read("components/easyt/morrovia-homepage.tsx");

  assert.match(root, /<MorroviaHomepage \/>/);
  assert.match(root, /canonical: "\/"/);
  assert.match(root, /url: "\/"/);
  assert.doesNotMatch(root, /redirect|permanentRedirect/);
  assert.match(owner, /<ImmersiveHome routes=\{journeys\}/);
  assert.doesNotMatch(`${root}\n${owner}`, /getSession|auth\(|safeJourneyReturnTarget/);
  assert.equal(existsSync(new URL("../app/page.tsx", import.meta.url)), true);
});

test("the legacy homepage performs one permanent redirect to the root", () => {
  const legacy = read("app/journey/home/page.tsx");
  const root = read("app/page.tsx");
  const config = read("next.config.ts");

  assert.match(legacy, /permanentRedirect\("\/"\)/);
  assert.match(config, /source: "\/journey\/home"/);
  assert.match(config, /destination: "\/"/);
  assert.match(config, /permanent: true/);
  assert.doesNotMatch(legacy, /redirect\("\/journey\/home"\)/);
  assert.doesNotMatch(root, /journey\/home/);
});

test("home navigation, install metadata, and indexing use the canonical root", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const footer = read("components/morrovia-footer.tsx");
  const sitemap = read("app/sitemap.ts");
  const manifest = read("app/manifest.ts");
  const register = read("components/easyt-pwa-register.tsx");
  const worker = read("public/easyt-sw.js");

  assert.doesNotMatch(navigation, /href="\/journey\/home/);
  assert.doesNotMatch(footer, /href="\/journey\/home/);
  assert.doesNotMatch(sitemap, /siteUrl\}\/journey\/home/);
  assert.match(manifest, /start_url: "\/"/);
  assert.match(manifest, /scope: "\/"/);
  assert.match(register, /scope: "\/"/);
  assert.match(worker, /PUBLIC_SHELL = \[\s*"\/"/);
  assert.match(worker, /cache\.match\("\/"\)/);
});

test("existing journey product route owners remain available", () => {
  for (const path of [
    "app/journey/new/page.tsx",
    "app/journey/discover/page.tsx",
    "app/journey/[tripId]/page.tsx",
  ]) {
    assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), true, path);
    assert.doesNotMatch(read(path), /permanentRedirect\("\/"\)/);
  }
});
