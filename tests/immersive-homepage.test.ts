import { routeEditorialImagery } from "../lib/easyt/route-editorial-imagery.ts";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { homepageRouteStopCards, homepageRouteStopIndexes, immersiveHomepageRoutes, initialImmersiveRouteIndex, nextHomepageRoute, responsivePhotoSource, routeScrollCorrection } from "../lib/easyt/immersive-homepage-routes.ts";
import { isPublishedPublicRouteKey, publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { createHomepageDemo, homepageDemoReducer, homepageDemoDay } from "../lib/easyt/homepage-demo.ts";
import { homepageAffiliateImage } from "../lib/easyt/homepage-affiliate-imagery.ts";
import { homepageRouteView } from "../lib/easyt/homepage-navigation.ts";
import { existsSync } from "node:fs";

test("canonical homepage renders the immersive composition without runtime selection", () => {
  const root = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
  const page = readFileSync(new URL("../components/easyt/morrovia-homepage.tsx", import.meta.url), "utf8");
  const legacy = readFileSync(new URL("../app/journey/home/page.tsx", import.meta.url), "utf8");
  const loading = readFileSync(new URL("../app/journey/home/loading.tsx", import.meta.url), "utf8");
  const layout = readFileSync(new URL("../app/journey/layout.tsx", import.meta.url), "utf8");
  assert.match(root, /<MorroviaHomepage \/>/);
  assert.match(page, /<ImmersiveHome routes=\{journeys\}/);
  assert.match(page, /initialIndex=\{initialImmersiveRouteIndex\(journeys\)\}/);
  assert.match(legacy, /permanentRedirect\("\/"\)/);
  assert.doesNotMatch(page, /process\.env|immersiveHomepageEnabled|HomeBenefits|InspirationExplorer/);
  assert.doesNotMatch(loading, /process\.env|immersiveHomepageEnabled/);
  assert.match(layout, /<MorroviaFooter omitOnImmersiveHome \/>/);
  assert.doesNotMatch(layout, /process\.env|immersiveHomepageEnabled/);
});

test("server-selected route index hydrates without client rerandomisation", () => {
  const page = readFileSync(new URL("../components/easyt/morrovia-homepage.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
  assert.match(page, /initialIndex=\{initialImmersiveRouteIndex\(journeys\)\}/);
  assert.match(client, /useState\(initialIndex\)/);
  assert.doesNotMatch(client, /Math\.random/);
});
test("route chapters cannot publish prototype data or silently change canonical Japan", () => {
  for (const route of immersiveHomepageRoutes()) {
    assert.equal(isPublishedPublicRouteKey(route.key), true);
    assert.deepEqual(route.stops, publicRouteDetailFor(route.key)!.stops);
    assert.equal(route.href, `/journey/routes/${route.key}`);
    assert.equal(route.minimumNights.length, route.stops.length);
  }
  assert.equal(immersiveHomepageRoutes().some((route) => route.key === "iceland-ring-road"), true);
});
test("random choice is injectable and stable, navigation wraps, scroll correction stays local", () => {
  const routes = immersiveHomepageRoutes();
  assert.equal(initialImmersiveRouteIndex(routes, () => .25), initialImmersiveRouteIndex(routes, () => .25));
  assert.equal(nextHomepageRoute(6, 1, 7), 0);
  assert.equal(nextHomepageRoute(0, -1, 7), 6);
  assert.equal(nextHomepageRoute(0, 1, 0), 0);
  assert.equal(routeScrollCorrection(-250, -220), 30);
  assert.equal(routeScrollCorrection(-250, -250.5), 0);
});
test("hero composes real capture and current handoff owners", () => {
  const hero = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
  const capture = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
  assert.match(hero, /<HomeTripStarter \/>/);
  assert.match(hero, /<EasyTNavigation current="home" landing logoTone="light" deferPrefetch \/>/);
  assert.match(capture, /<MorroviaTripCapture/);
  assert.match(capture, /progressiveDetails/);
  assert.match(capture, /<JourneyEndpointsEditor/);
  assert.match(capture, /router\.push\("\/journey\/new\?homeDraft=1"\)/);
  assert.doesNotMatch(hero, /capture-receipt|setSubmitted|Math\.random|Voice\.jsx/);
});

test("homepage trip capture progressively discloses canonical details without changing Builder defaults", () => {
  const capture = readFileSync(new URL("../components/easyt/morrovia-trip-capture.tsx", import.meta.url), "utf8");
  const homepage = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const stories = readFileSync(new URL("../components/easyt/morrovia-trip-capture.stories.tsx", import.meta.url), "utf8");
  assert.match(capture, /homepageLabel: "Start your plan"/);
  assert.match(capture, /homepagePlaceholder: "Where would you like to go, for how long\?"/);
  assert.match(capture, /showDetails: "Add trip details"/);
  assert.match(capture, /aria-expanded=\{detailsOpen\}/);
  assert.match(capture, /\(!progressiveDetails \|\| detailsOpen\)/);
  assert.match(capture, /compact=\{progressiveDetails\}/);
  assert.match(capture, /!progressiveDetails \? <MorroviaContextualDisclosure/);
  assert.match(homepage, /progressiveDetails/);
  assert.doesNotMatch(builder, /progressiveDetails/);
  assert.match(stories, /HomepageCollapsed/);
  assert.match(stories, /HomepageExpanded/);
  assert.match(stories, /Mobile390/);
});

test("one night decision persists between demo views without changing catalogue data", () => {
  const routes = immersiveHomepageRoutes();
  const route = routes[0];
  const original = structuredClone(route);
  let state = createHomepageDemo(routes);
  const before = homepageDemoDay(state.nights[route.key], 1);
  state = homepageDemoReducer(state, { type: "night", route, index: 0, value: route.stops[0].nights + 1 });
  for (const view of ["itinerary", "map", "builder"] as const) {
    state = homepageDemoReducer(state, { type: "view", view });
    assert.equal(state.view, view);
    assert.equal(homepageDemoDay(state.nights[route.key], 1), before + 1);
  }
  assert.deepEqual(route, original);
  assert.equal(homepageDemoReducer(state, { type: "night", route, index: 0, value: NaN }), state);
  state = homepageDemoReducer(state, { type: "night", route, index: 0, value: -1 });
  assert.equal(state.nights[route.key][0], route.minimumNights[0]);
  state = homepageDemoReducer(state, { type: "reset", route });
  assert.deepEqual(state.nights[route.key], route.stops.map((stop) => stop.nights));
});

test("demo has no account, storage, analytics or mutation dependency and lazy-loads the map", () => {
  for (const name of ["lib/easyt/homepage-demo.ts", "app/journey/home/immersive/product-demo.tsx", "app/journey/home/immersive/demo-map.tsx"]) {
    const source = readFileSync(new URL(`../${name}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /localStorage|sessionStorage|trackEvent|fetch\(|repository|TripDocument/);
  }
  const product = readFileSync(new URL("../app/journey/home/immersive/product-demo.tsx", import.meta.url), "utf8");
  assert.match(product, /dynamic\(\(\) => import\("\.\/demo-map"\)/);
  assert.ok(product.indexOf("styles.canvasNavigation") < product.indexOf("styles.productExamples"));
});

test("all sixteen affiliate states have provenance, distinct files and responsive variants", () => {
  const files = new Set<string>();
  for (const key of ["japan-slow", "balkans-overland", "vietnam-cambodia", "iceland-ring-road"]) for (const category of ["accommodation", "activities", "transport", "connectivity"] as const) {
    const image = homepageAffiliateImage(key, category);
    assert.ok(image);
    assert.equal(image.status, "generated-project-asset");
    assert.match(image.source, /OpenAI image generation/);
    assert.ok(image.alt && image.rights);
    assert.equal(files.has(image.file), false);
    files.add(image.file);
    for (const variant of image.variants) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
  }
  assert.equal(files.size, 16);
  assert.equal(homepageAffiliateImage("not-a-route", "transport"), null);
});

test("affiliate chapter delegates clicks to canonical owner without writing readiness state", () => {
  const source = readFileSync(new URL("../app/journey/home/immersive/affiliate-chapter.tsx", import.meta.url), "utf8");
  assert.match(source, /getCurrentPartnerAction\(need.category\)/);
  assert.match(source, /<MorroviaAffiliateLink/);
  assert.doesNotMatch(source, /trackEvent|localStorage|setBooked|repository|fetch\(/);
  assert.equal((source.match(/styles\.partnerDisclosure/g) ?? []).length, 1);
  assert.match(source, /affiliateDisclosure/);
});


test("destination imagery is matched to canonical places with explicit source rights", () => {
  for (const route of immersiveHomepageRoutes()) for (const [index, stop] of route.stops.entries()) {
    const photo = route.photos[index];
    if (!photo) continue;
    assert.equal(photo.country, stop.country);
    assert.ok(photo.author && photo.licenseUrl && photo.sourceUrl);
    for (const variant of photo.variants) {
      if (variant.src.startsWith("/")) assert.ok(existsSync(new URL(`../public${variant.src}`, import.meta.url)));
      else assert.match(variant.src, /^https:\/\/(?:images\.unsplash\.com|(?:upload|thumb)\.wikimedia\.org)\//);
    }
  }
  const korea = immersiveHomepageRoutes().find((route) => route.key === "japan-south-korea")!;
  assert.match(korea.photos[korea.stops.findIndex((stop) => stop.name === "Busan")]?.key ?? "", /O3i91C0vuY0$/);
});

test("reduced-motion handling stops scroll work and the final action focuses the original prompt", () => {
  const route = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/journey/home/immersive/immersive.module.css", import.meta.url), "utf8");
  const closing = readFileSync(new URL("../app/journey/home/immersive/closing-chapter.tsx", import.meta.url), "utf8");
  assert.match(route, /if \(quiet\) return/);
  assert.match(route, /desktop.addEventListener\("change", listen\)/);
  assert.match(css, /prefers-reduced-motion:reduce/);
  assert.match(closing, /#start-building textarea/);
  assert.match(closing, /focus\(\{ preventScroll: true \}\)/);
});

test("annotated homepage cleanup removes redundant copy and preserves functional actions", () => {
  const hero = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
  const product = readFileSync(new URL("../app/journey/home/immersive/product-demo.tsx", import.meta.url), "utf8");
  const closing = readFileSync(new URL("../app/journey/home/immersive/closing-chapter.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/journey/home/immersive/immersive.module.css", import.meta.url), "utf8");

  assert.doesNotMatch(hero, /Quiet view|Vista tranquila|Pause/);
  assert.match(hero, /href="#routes"/);
  assert.doesNotMatch(route, /Nights are a planning guide|Las noches son una guía/);
  assert.match(route, /Start with this route/);
  assert.match(route, /See whole journey/);
  assert.match(route, /className=\{styles\.alternatives\} aria-label=/);
  assert.match(route, /className=\{styles\.alternativeRoute\}/);
  assert.match(route, /className=\{styles\.alternativesAll\}/);
  assert.doesNotMatch(product, /The places\. The time between them|route\.stops\.length\} \{es \? "bases" : "overnight bases"\}|nights · interactive sample/);
  assert.match(product, /Product view/);
  assert.match(product, /: "Reset"/);
  assert.doesNotMatch(closing, /Complex trips, made simple|Viajes complejos, hechos sencillos/);
  assert.match(closing, /href="\/journey\/immersive\/credits\.html"/);
  assert.match(closing, /Image credits/);
  assert.match(css, /grid-template-columns: minmax\(0,1fr\) minmax\(300px,340px\)/);
  assert.match(css, /\.alternativeRoute \{[^}]*min-height: 48px/);
  assert.match(css, /\.alternatives \{ max-width: none; justify-self: stretch/);
});


test("route impressions are once per initial entry or changed selection, never effect replay", () => {
  let previous: string | null = null;
  const events: string[] = [];
  for (const key of ["japan-slow", "japan-slow", "balkans-overland", "balkans-overland", "japan-slow"]) {
    const selection = homepageRouteView(previous, key);
    if (selection) events.push(selection);
    previous = key;
  }
  assert.deepEqual(events, ["initial", "change", "change"]);
  assert.equal(homepageRouteView(null, "japan-slow"), "initial");
});

test("hero, story and sample consume the same selected route and rights-cleared hero image", () => {
  const source = readFileSync(new URL("../app/journey/home/immersive/immersive-home.tsx", import.meta.url), "utf8");
  assert.match(source, /useState\(initialIndex\)/);
  assert.match(source, /index=\{index\} onChange=\{setIndex\}/);
  assert.match(source, /heroPhoto = route.heroPhoto/);
  for (const route of immersiveHomepageRoutes()) {
    assert.ok(route.heroPhoto?.rights && route.heroPhoto.source);
    assert.match(route.heroPhoto.source, /^https:\/\//, `${route.key} must use reviewed photography, not a generated homepage asset`);
    assert.ok(route.countries.includes(route.heroPhoto.country));
  }
});

test("featured collection states that seven routes are editable, open-world starting points", () => {
  const source = readFileSync(new URL("../app/journey/home/immersive/route-chapters.tsx", import.meta.url), "utf8");
  assert.match(source, /Routes to get you started/);
  assert.match(source, /Seven ideas for complex trips\. Use one as a starting point, change anything, or plan somewhere completely different\./);
  assert.match(source, /Starting point/);
});

test("featured panels project five to seven representative cards without changing canonical routes", () => {
  for (const route of immersiveHomepageRoutes()) {
    const canonicalBefore = JSON.stringify(route.stops);
    const indexes = homepageRouteStopIndexes(route);
    const cards = homepageRouteStopCards(route);
    assert.ok(cards.length >= 5 && cards.length <= 7, `${route.key} has ${cards.length} visible cards`);
    assert.deepEqual(cards.map(card => card.index), indexes);
    assert.equal(cards.length + (route.stops.length - cards.length), route.stops.length);
    assert.equal(JSON.stringify(route.stops), canonicalBefore);
  }
});

test("Iceland visually omits the circular return while retaining all eight canonical places", () => {
  const route = immersiveHomepageRoutes().find(candidate => candidate.key === "iceland-ring-road")!;
  assert.equal(route.stops.length, 8);
  assert.deepEqual(homepageRouteStopCards(route).map(card => route.stops[card.index].name), [
    "Reykjavík", "Grundarfjörður", "Akureyri", "Reykjahlíð", "Höfn", "Vík",
  ]);
  assert.equal(route.stops.at(-1)?.name, "Reykjavík");
});

test("visible cards reserve credited sources across responsive variants and fall back safely", () => {
  for (const route of immersiveHomepageRoutes()) {
    const cards = homepageRouteStopCards(route);
    const sources = cards.flatMap(card => card.photo ? [responsivePhotoSource(card.photo)] : []);
    assert.equal(new Set(sources).size, sources.length, `${route.key} repeats a visible source`);
    cards.forEach(card => {
      if (!card.photo) return;
      assert.equal(new Set(card.photo.variants.map(() => responsivePhotoSource(card.photo!))).size, 1);
    });
  }
  const route = immersiveHomepageRoutes()[0];
  const withoutImages = { ...route, photoCandidates: route.photoCandidates.map(() => []) };
  assert.ok(homepageRouteStopCards(withoutImages).every(card => card.photo === null));
});

test("route hero imagery is used in the strip only when no unused alternative exists", () => {
  for (const route of immersiveHomepageRoutes()) {
    const heroSources = new Set([route.heroPhoto?.source, routeEditorialImagery[route.key]?.hero]
      .filter((source): source is string => Boolean(source)));
    const used = new Set<string>();
    for (const card of homepageRouteStopCards(route)) {
      if (!card.photo) continue;
      const source = responsivePhotoSource(card.photo);
      if (heroSources.has(source) || card.photo.key === routeEditorialImagery[route.key]?.hero) {
        const unusedNonHero = route.photoCandidates[card.index].filter(candidate => {
          const candidateSource = responsivePhotoSource(candidate);
          return !used.has(candidateSource) && !heroSources.has(candidateSource) && candidate.key !== routeEditorialImagery[route.key]?.hero;
        });
        assert.equal(unusedNonHero.length, 0, `${route.key} reused its hero unnecessarily`);
      }
      used.add(source);
    }
  }
});
