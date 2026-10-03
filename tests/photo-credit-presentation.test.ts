import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared camera disclosure owns compact, keyboard-accessible photo credits", () => {
  const component = read("components/easyt/morrovia-photo-credit.tsx");
  const styles = read("components/easyt/morrovia-photo-credit.module.css");
  assert.match(component, /ownership\?: "morrovia" \| "third-party" \| "unknown"/);
  assert.match(component, /ownership === "morrovia"/);
  assert.match(component, /<Camera className=\{styles\.cameraGlyph\} aria-hidden="true"/);
  assert.match(component, /aria-expanded/);
  assert.match(component, /createPortal/);
  assert.match(component, /pointerdown/i);
  assert.match(component, /event\.key !== "Escape"/);
  assert.match(component, /focus\(\)/);
  assert.match(component, /sourceHref/);
  assert.match(component, /licenseHref/);
  assert.match(component, /fullCreditHref/);
  assert.match(component, /authorLabel\?: string/);
  assert.match(component, /licenseLabel\?: string/);
  assert.match(component, /sourceLabel\?: string/);
  assert.match(component, /Photo by \{structuredAuthorLabel\}/);
  assert.match(component, /licenseLabel \? <>[\s\S]*<a href=\{licenseHref\}/);
  assert.match(styles, /width:\s*44px;\s*height:\s*44px/);
  assert.match(styles, /\.cameraGlyph[^{]*\{[^}]*width:\s*16px/);
  assert.match(component, /size\?: "compact" \| "default"/);
  assert.doesNotMatch(component, /anchorRef|positionCamera|scroll", positionCamera/);
  assert.match(styles, /\.compact \.cameraGlyph[^{]*\{[^}]*width:\s*14px/);
  assert.match(styles, /\.compact \.cameraGlyph[^{]*\{[^}]*opacity:\s*\.56/);
  assert.match(styles, /position:\s*fixed/); // popover only
  assert.match(styles, /overflow-wrap:\s*anywhere/);
  assert.doesNotMatch(component, /presentation\?:/);
  assert.doesNotMatch(styles, /\.inline/);
});

test("verified owned assets suppress the control and third-party fallback attribution follows the displayed image", () => {
  const home = read("app/journey/home/immersive/immersive-home.tsx");
  const homeCards = read("app/journey/home/immersive/homepage-route-inspiration.tsx");
  const routes = read("lib/easyt/immersive-homepage-routes.ts");
  assert.match(routes, /firstParty: true[\s\S]*fallback/);
  assert.match(home, /visibleHeroPhoto[\s\S]*firstParty/);
  assert.match(home, /visibleHeroPhoto\s*&&\s*!visibleHeroPhoto\.firstParty/);
  assert.match(home, /ownership="third-party"/);
  assert.match(homeCards, /cloudinaryOwned:\s*candidate\.firstParty/);
  assert.match(homeCards, /ownership: candidate\.firstParty/);
  assert.match(homeCards, /photo\.ownership !== "morrovia"/);
  assert.match(homeCards, /ownership=\{photo\.ownership\}/);
});

test("homepage route-card camera is outside navigation and rendered in the image frame", () => {
  const source = read("app/journey/home/immersive/homepage-route-inspiration.tsx");
  const css = read("app/journey/home/immersive/immersive.module.css");
  assert.doesNotMatch(source, /photoAnchorRef|anchorRef/);
  assert.match(source, /inspirationPhotoFrame[\s\S]*?MorroviaPhotoCredit/);
  assert.match(source, /size="compact"/);
  assert.match(source, /imageDisplayed[\s\S]*MorroviaPhotoCredit/);
  assert.match(css, /\.inspirationPhoto[^{]*\{[^}]*aspect-ratio:3\/2/);
});

test("small route catalogue thumbnails use the compact camera target", () => {
  const catalogue = read("app/journey/discover/discovery-browser.tsx");
  const photo = read("app/journey/discover/discovery-photo.tsx");
  assert.match(catalogue, /creditSize="compact"/);
  assert.match(catalogue, /creditPlacement="bottom-right"/);
  assert.match(photo, /size=\{creditSize\}/);
});

test("editorial catalogue, detail, dashboard, overview and itinerary use closed camera disclosures", () => {
  for (const surface of [
    "app/journey/discover/discovery-photo.tsx",
    "app/journey/discover/routes-overview-hero.tsx",
    "app/journey/routes/[slug]/route-detail-photo.tsx",
    "app/journey/routes/[slug]/route-hero-image.tsx",
    "app/journey/home/immersive/route-chapters.tsx",
    "app/journey/dashboard/dashboard-client.tsx",
    "components/easyt/trip-overview-workspace.tsx",
    "components/easyt/trip-itinerary-workspace.tsx",
  ]) {
    const source = read(surface);
    assert.match(source, /MorroviaPhotoCredit/, surface);
    assert.doesNotMatch(source, /presentation="inline"/, surface);
  }
});

test("fallback image display state controls credit eligibility rather than attempted source", () => {
  const resilient = read("components/easyt/resilient-image.tsx");
  const routeDetail = read("app/journey/routes/[slug]/route-detail-photo.tsx");
  const discovery = read("app/journey/discover/discovery-photo.tsx");
  assert.match(resilient, /onDisplayState\?/);
  assert.match(resilient, /onDisplayState\?\.\(false\)/);
  assert.match(resilient, /onDisplayState\?\.\(true\)/);
  assert.match(routeDetail, /imageDisplayed/);
  assert.match(routeDetail, /imageDisplayed[\s\S]*MorroviaPhotoCredit/);
  assert.match(discovery, /imageDisplayed/);
  assert.match(discovery, /imageDisplayed[\s\S]*MorroviaPhotoCredit/);
});

test("route stop and highlight camera remains inside the photograph bounds", () => {
  const stop = read("app/journey/routes/[slug]/route-stop-image.tsx");
  const attraction = read("app/journey/routes/[slug]/route-attraction-image.tsx");
  const detail = read("app/journey/routes/[slug]/route-detail-photo.tsx");
  assert.match(stop, /fallbackImage[\s\S]*routeImageCredit/);
  assert.match(attraction, /fallbackImage[\s\S]*routeImageCredit/);
  assert.match(stop, /imageDisplayed[\s\S]*displayedCredit/);
  assert.match(attraction, /imageDisplayed[\s\S]*displayedCredit/);
  assert.match(stop, /ref=\{containerRef\}[\s\S]*MorroviaPhotoCredit/);
  assert.match(attraction, /ref=\{containerRef\}[\s\S]*MorroviaPhotoCredit/);
  assert.match(detail, /MorroviaPhotoCredit[\s\S]*\/\s*figure/);
});

test("Overview route-card photo credits anchor bottom-right on the photo and keep structured metadata", () => {
  const overview = read("components/easyt/trip-overview-workspace.tsx");
  const imagery = read("lib/easyt/trip-overview-imagery.ts");
  const credit = read("components/easyt/morrovia-photo-credit.tsx");
  assert.match(overview, /className=\{styles\.stopPhoto\}/);
  assert.match(overview, /placement="bottom-right"/);
  assert.match(overview, /size="compact"/);
  assert.match(overview, /authorLabel=\{image\.author\}/);
  assert.match(overview, /licenseLabel=\{image\.license\}/);
  assert.match(imagery, /author: photo\.author/);
  assert.match(imagery, /license: photo\.license/);
  assert.doesNotMatch(credit, /anchorRef|positionCamera|window\.addEventListener\("scroll", positionCamera/);
  assert.match(credit, /ownership === "morrovia" \|\| !attribution/);
});

test("photo attribution keeps canonical author, source, licence and full-credit identity", () => {
  const routeImages = read("lib/easyt/route-images.ts");
  const dashboard = read("lib/easyt/dashboard-trip-image.ts");
  assert.match(routeImages, /sourceUrl: record\.sourceUrl/);
  assert.match(routeImages, /licenseUrl: record\.licenseUrl/);
  assert.match(routeImages, /provenance: record\.provenance/);
  assert.match(routeImages, /fullCreditUrl:/);
  assert.match(dashboard, /provenance/);
  const publishedInventory = JSON.parse(read("public/journey/immersive/published-route-stop-image-inventory.generated.json")) as Array<{ provider?: string; authorUrl?: string; sourceUrl?: string; variants?: Array<{ src: string }> }>;
  const unsplash = publishedInventory.find((photo) => photo.provider === "unsplash" && photo.authorUrl && photo.sourceUrl && photo.variants?.length);
  assert.ok(unsplash);
  assert.notEqual(unsplash.authorUrl, unsplash.sourceUrl);
  assert.notEqual(unsplash.sourceUrl, unsplash.variants?.[0]?.src);
});
