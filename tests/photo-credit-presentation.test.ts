import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("one shared disclosure owns the accessible photo-credit interaction", () => {
  const component = read("components/easyt/morrovia-photo-credit.tsx");
  const styles = read("components/easyt/morrovia-photo-credit.module.css");
  assert.match(component, /<details/);
  assert.match(component, /const ariaLabel = authorLabel[\s\S]*Photo credit/);
  assert.match(component, /<summary aria-label=\{ariaLabel\}/);
  assert.match(component, /<Camera aria-hidden="true"/);
  assert.match(component, /placement = "bottom-left"/);
  assert.match(component, /sourceHref/);
  assert.match(component, /licenseHref/);
  assert.match(component, /fullCreditHref/);
  assert.match(styles, /width:44px; height:44px/);
  assert.match(styles, /\.root\[data-placement="bottom-left"\] summary \{ margin-left:0; \}/);
  assert.match(styles, /summary:focus-visible/);
  assert.match(component, /event\.key !== "Escape"/);
  assert.match(component, /event\.currentTarget\.open = false[\s\S]*querySelector\("summary"\)\?\.focus/);
  assert.match(component, /onClick=\{\(event\) => event\.stopPropagation\(\)\}/);
  assert.match(component, /onBlur=\{\(event\) => \{[\s\S]*currentTarget\.contains\(nextTarget\)[\s\S]*currentTarget\.open = false/);
  assert.match(styles, /summary:hover/);
  assert.match(styles, /\.inline/);
});

test("editorial route, homepage, discovery and dashboard surfaces reuse the shared owner", () => {
  const surfaces = [
    "app/journey/discover/discovery-photo.tsx",
    "app/journey/routes/[slug]/route-detail-photo.tsx",
    "app/journey/home/immersive/immersive-home.tsx",
    "app/journey/home/immersive/route-chapters.tsx",
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
  assert.match(read("app/journey/dashboard/dashboard-client.tsx"), /<MorroviaPhotoCredit placement="bottom-left"[\s\S]*photoLabel=\{photo\.alt\}/);
  assert.match(read("app/journey/home/immersive/homepage-route-inspiration.tsx"), /MorroviaPhotoCredit[^>]*placement="bottom-left"/);
  assert.match(read("components/easyt/trip-overview-workspace.tsx"), /MorroviaPhotoCredit placement="bottom-left"/);
  assert.match(read("app/journey/dashboard/dashboard.module.css"), /\.cardMediaFrame \{ position: relative; --photo-credit-inline:8px; --photo-credit-block:8px; \}/);
  assert.match(read("app/journey/dashboard/dashboard.module.css"), /\.tripMenu summary \{[\s\S]*width: 44px;[\s\S]*height: 44px;/);
  assert.match(read("components/easyt/trip-shell-client.tsx"), /Photo by \{photoAttribution\.photographer\}[\s\S]*Unsplash/);
});

test("large editorial images use the shared visible source line", () => {
  for (const surface of [
    "app/journey/home/immersive/immersive-home.tsx",
    "app/journey/routes/[slug]/route-hero-image.tsx",
    "app/journey/routes/[slug]/route-detail-photo.tsx",
    "app/journey/discover/discovery-photo.tsx",
    "app/journey/discover/routes-overview-hero.tsx",
    "components/easyt/trip-itinerary-workspace.tsx",
    "app/journey/dashboard/dashboard-client.tsx",
  ]) {
    assert.match(read(surface), /MorroviaPhotoCredit[^>]*presentation="inline"|<MorroviaPhotoCredit[^>]*presentation="inline"/, surface);
  }
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

test("responsive image variants retain photographer and source identity separately from rendered src", () => {
  const routeImages = read("lib/easyt/route-images.ts");
  const dashboardImages = read("lib/easyt/dashboard-trip-image.ts");
  const routeDetail = read("app/journey/routes/[slug]/route-detail-photo.tsx");
  const publishedInventory = JSON.parse(read("public/journey/immersive/published-route-stop-image-inventory.generated.json")) as Array<{ provider?: string; authorUrl?: string; sourceUrl?: string; variants?: Array<{ src: string }> }>;
  const unsplash = publishedInventory.find((photo) => photo.provider === "unsplash" && photo.authorUrl && photo.sourceUrl && photo.variants?.length);
  assert.ok(unsplash, "a reviewed Unsplash image provides independent author, source and delivered-image URLs");
  assert.match(routeImages, /authorUrl: record\.authorUrl/);
  assert.match(dashboardImages, /authorHref: credit\.authorUrl/);
  assert.match(routeDetail, /authorHref=\{photo\.authorUrl\}[\s\S]*sourceHref=\{photo\.sourceUrl\}/);
  assert.notEqual(unsplash.authorUrl, unsplash.sourceUrl);
  assert.notEqual(unsplash.sourceUrl, unsplash.variants?.[0]?.src);
});

test("compact shell, route strip and selected-day hero disclose their own displayed sources", () => {
  const shell = read("components/easyt/trip-shell.tsx");
  const shellClient = read("components/easyt/trip-shell-client.tsx");
  const itinerary = read("components/easyt/trip-itinerary-workspace.tsx");
  const shellStyles = read("components/easyt/trip-shell.module.css");
  const itineraryStyles = read("components/easyt/trip-itinerary-workspace.module.css");
  assert.match(shell, /<TripShellIdentityAndActions mobilePhoto=\{sharedPhoto\}/);
  assert.doesNotMatch(shell, /<TripShellNavigation[\s\S]*mobilePhotoSources/);
  assert.match(shellClient, /function TripShellIdentityAndActions\(\{ mobilePhoto \}/);
  assert.match(shellClient, /mobilePhoto\.sourceUrl[\s\S]*mobilePhoto\.licenseUrl[\s\S]*mobilePhoto\.fullCreditUrl/);
  assert.match(shellStyles, /\.mobilePhotoSources summary \{[^}]*min-height: 44px/);
  assert.match(itinerary, /<JourneyRouteStopTrack[\s\S]*<\/div>\s*\{workspaceView === "calendar"/);
  assert.match(itinerary, /className=\{styles\.contextRailBody\}[\s\S]*className=\{`\$\{styles\.contextSection\} \$\{styles\.routePhotoSources\}`\}/);
  assert.match(itinerary, /photo\.sourceUrl[\s\S]*photo\.licenseUrl[\s\S]*photo\.fullCreditUrl/);
  assert.match(itinerary, /<MorroviaPhotoCredit className=\{styles\.dayHeroCredit\}/);
  assert.match(itineraryStyles, /\.routePhotoSources summary \{[^}]*min-height: 44px/);
});
