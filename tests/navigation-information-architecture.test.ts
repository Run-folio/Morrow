import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("global desktop and compact navigation share one planning-first hierarchy", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const tour = read("components/easyt/easyt-product-tour.tsx");

  assert.doesNotMatch(navigation, /href="\/journey\/home#how-it-works"/);
  assert.match(navigation, /const howItWorksLabel = language === "es" \? "Cómo funciona" : "How it works"/);
  assert.equal((navigation.match(/href="\/journey\/about"/g) ?? []).length, 2, "desktop and compact navigation each include one About route");
  assert.equal((navigation.match(/<EasyTProductTour triggerLabel=\{howItWorksLabel\} dispatchOpen/g) ?? []).length, 2, "desktop and compact navigation each reuse the Tour action once");

  const newTrip = navigation.indexOf('href="/journey/new"');
  const trips = navigation.indexOf('href="/journey/dashboard"');
  const routes = navigation.indexOf('href="/journey/discover"');
  const stamps = navigation.indexOf('href="/journey/stamped"');
  const passport = navigation.indexOf('href="/journey/passport"');
  const about = navigation.indexOf('href="/journey/about"');
  const help = navigation.indexOf('href="/journey/help"');
  const howItWorks = navigation.indexOf('<EasyTProductTour triggerLabel={howItWorksLabel} dispatchOpen />');
  assert.ok(newTrip < trips && trips < routes, "planning and trip management lead the primary hierarchy");
  assert.ok(routes < stamps && stamps < passport && passport < about && about < help && help < howItWorks,
    "secondary destinations stay ordered together in More");

  assert.match(tour, /PRODUCT_TOUR_OPEN_EVENT/);
  assert.match(tour, /returnFocusRef/);
  assert.match(tour, /dispatchOpen\) \{ window\.dispatchEvent\(new Event\(PRODUCT_TOUR_OPEN_EVENT\)\); return; \}/);
});

test("the canonical homepage route story and global home links remain intact", () => {
  const routes = read("app/journey/home/immersive/route-chapters.tsx");
  const navigation = read("app/journey/easyt-navigation.tsx");

  assert.match(routes, /id="routes"/);
  assert.match(routes, /href="\/journey\/discover"/);
  assert.equal((navigation.match(/href="\/"/g) ?? []).length, 1, "the shared brand remains the single canonical Home link");
  assert.doesNotMatch(navigation, /href="\/journey\/home/);
});

test("mobile uses only the compact header menu and retains safe-area-aware workspace offsets", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const styles = read("app/journey/easyt-navigation.module.css");
  const foundation = read("app/journey/journey-design.css");
  const globals = read("app/globals.css");

  assert.doesNotMatch(navigation, /mobileDock|Morrovia mobile navigation/);
  assert.doesNotMatch(styles, /\.mobileDock|dockPrimary|dockCurrent/);
  assert.doesNotMatch(globals, /easyt-mobile-shell/);
  assert.match(foundation, /--morrovia-mobile-dock-offset:\s*env\(safe-area-inset-bottom, 0px\)/);
  assert.match(navigation, /document\.addEventListener\("pointerdown", onPointerDown\)/);
  assert.match(navigation, /event\.key !== "Escape"/);
});

test("the navigation Storybook fixture exercises the App Router and compact mobile state", () => {
  const story = read("app/journey/easyt-navigation.stories.tsx");

  assert.match(story, /appDirectory: true/);
  assert.match(story, /pathname: "\/journey\/about"/);
  assert.match(story, /export const AboutActive: Story = \{ args: \{ current: "about" \} \}/);
  assert.match(story, /export const MobileCompactMenu/);
});
