import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop navigation protects the founder-approved hierarchy and one-dropdown model", () => {
  const navigation = read("app/journey/easyt-navigation.tsx");
  const tour = read("components/easyt/easyt-product-tour.tsx");

  assert.doesNotMatch(navigation, /href="\/journey\/home#how-it-works"/);
  assert.match(navigation, /const howItWorksLabel = language === "es" \? "Cómo funciona" : "How it works"/);
  assert.match(navigation, /const myTripsLabel = language === "es" \? "Mis viajes" : "My Trips"/);
  assert.equal((navigation.match(/href="\/journey\/about"/g) ?? []).length, 2, "desktop and compact navigation each include one About route");
  assert.equal((navigation.match(/<EasyTProductTour triggerLabel=\{howItWorksLabel\} dispatchOpen/g) ?? []).length, 2, "desktop and compact navigation each reuse the Tour action once");
  assert.doesNotMatch(navigation, /moreMenuRef|styles\.moreMenu|<span>\{moreLabel\}<\/span>[\s\S]*?<ChevronDown/);

  const desktopStart = navigation.indexOf('<nav className={styles.landingActions}');
  const compactStart = navigation.indexOf('<details ref={compactMenuRef}');
  const desktop = navigation.slice(desktopStart, compactStart);
  const newTrip = navigation.indexOf('href="/journey/new"');
  const routes = navigation.indexOf('href="/journey/discover"');
  const trips = navigation.indexOf('href="/journey/dashboard"');
  const separator = navigation.indexOf('className={styles.landingDivider}');
  const howItWorks = navigation.indexOf('<EasyTProductTour triggerLabel={howItWorksLabel} dispatchOpen />');
  const account = navigation.indexOf('<details ref={accountMenuRef}');
  const language = navigation.indexOf('className={styles.landingLanguage}');
  assert.ok(newTrip < routes && routes < trips && trips < separator && separator < howItWorks && howItWorks < account && account < language,
    "desktop order is New trip, Routes, My Trips, separator, How it works, Account, language");
  assert.match(desktop, /<summary aria-label=\{labels\.account\}/);
  assert.equal((desktop.match(/<details\b/g) ?? []).length, 1, "Account is the only desktop dropdown");

  const accountStart = desktop.indexOf('<details ref={accountMenuRef}');
  const accountEnd = desktop.indexOf('<label className={styles.landingLanguage}');
  const accountMenu = desktop.slice(accountStart, accountEnd);
  for (const href of ["stamped", "passport", "about", "help"]) assert.match(accountMenu, new RegExp(`href="/journey/${href}"`));
  assert.doesNotMatch(accountMenu, /EasyTProductTour|howItWorksLabel/);
  assert.match(accountMenu, /href="\/journey\/profile"/);
  assert.match(accountMenu, /href="\/journey\/privacy"/);
  assert.match(accountMenu, /href="\/journey\/dashboard"><UserRound[^>]*aria-hidden="true" \/><span>\{signInLabel\}/,
    "signed-out Account retains the existing authenticated dashboard entry");

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
  assert.match(navigation, /<span className=\{styles\.compactSectionLabel\}>\{moreLabel\}<\/span>/,
    "the approved compact mobile hierarchy remains intact");
});

test("the navigation Storybook fixture exercises the App Router and compact mobile state", () => {
  const story = read("app/journey/easyt-navigation.stories.tsx");

  assert.match(story, /appDirectory: true/);
  assert.match(story, /pathname: "\/journey\/about"/);
  assert.match(story, /export const AboutActive: Story = \{ args: \{ current: "about" \} \}/);
  assert.match(story, /export const MobileCompactMenu/);
  assert.match(story, /export const SignedOutAccountMenu/);
  assert.match(story, /export const SignedInAccountMenu/);
});
