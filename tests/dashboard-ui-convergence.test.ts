import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const dashboard = read("app/journey/dashboard/dashboard-client.tsx");
const dashboardStyles = read("app/journey/dashboard/dashboard.module.css");
const dashboardStories = read("app/journey/dashboard/dashboard-client.stories.tsx");
const controlStyles = read("components/easyt/easyt-controls.module.css");
const controlStories = read("components/easyt/easyt-controls.stories.tsx");
const storybookConfig = read(".storybook/main.ts");
const storybookAuth = read(".storybook/auth-client.mock.ts");
const storybookPreview = read(".storybook/preview.ts");

test("trip cards keep navigation separate from their action menus", () => {
  assert.match(dashboard, /<Link className=\{styles\.cardMedia\} href=\{primaryHref\}/);
  assert.match(dashboard, /<h3><Link href=\{primaryHref\}/);
  assert.match(dashboard, /<EasyTLinkButton className=\{styles\.openAction\}[\s\S]*?href=\{primaryHref\}/);
  assert.match(dashboard, /<details className=\{styles\.tripMenu\}>/);
  assert.match(dashboardStyles, /\.tripMenu summary:focus-visible[^}]*var\(--morrovia-focus-shadow\)/);
  assert.match(dashboard, /tabIndex=\{working \? -1 : undefined\}/);
});

test("dashboard filters and compact fields use canonical controls", () => {
  assert.match(dashboard, /EasyTSegmentedControl<LibraryView>/);
  assert.match(dashboard, /controls: "dashboard-trip-grid"/);
  assert.match(dashboard, /<EasyTSelect fieldClassName=\{styles\.sortControl\}/);
  assert.match(dashboard, /<EasyTField fieldClassName=\{styles\.searchControl\}/);
  assert.doesNotMatch(dashboardStyles, /\.statusFilters/);
});

test("lifecycle state selects truthful journey sections and readiness copy", () => {
  assert.match(dashboard, /trip\.status === "draft" \? "idea" : trip\.status === "archived" \? "past" : "upcoming"/);
  assert.match(dashboard, /const upcomingTrips = useMemo/);
  assert.match(dashboard, /const ideaTrips = useMemo/);
  assert.match(dashboard, /const pastTrips = useMemo/);
  assert.match(dashboard, /staySignal && resolvedKind !== "past"/);
  assert.match(dashboardStyles, /\.readinessLine \{[\s\S]*?var\(--morrovia-muted\)/);
});

test("continue and Stamped summaries expose truthful labelled metadata", () => {
  assert.match(dashboard, /<span>\{featuredTrip\.stops\.length\} \{isSpanish \? "paradas" : "stops"\}<\/span>/);
  assert.match(dashboard, /const stampSummary = summarizeStampRows\(stamps\)/);
  assert.match(dashboard, /\{visitedCount\} \{isSpanish \? "visitados" : "visited"\}/);
  assert.match(dashboard, /\{wantCount\} \{isSpanish \? "deseados" : "want to go"\}/);
  assert.match(dashboard, /<TripRoutePreview trip=\{featuredTrip\}/);
});

test("mobile current journeys bound long titles and reject non-photographic hero media", () => {
  assert.match(dashboard, /if \(!credit\) return null/,
    "unknown itinerary media must fall through instead of becoming a Trips hero");
  assert.match(dashboardStyles, /@media \(max-width: 520px\)[\s\S]*?\.currentIdentity h2 \{[\s\S]*?-webkit-line-clamp: 4/,
    "the mobile editorial title must have a bounded line count");
  assert.match(dashboardStyles, /\.currentMedia \{ height: auto; overflow: visible; margin-bottom: 0/,
    "the card should reserve the title's actual flow height rather than a fixed spacer");
  assert.match(dashboardStories, /LongCurrentJourneyMobile390/);
  assert.match(dashboardStories, /InvalidHeroMediaMobile390/);
  assert.match(dashboardStories, /map-workspace-mobile\.png/,
    "the invalid-media story should exercise rejection of a product screenshot");
});

test("Storybook covers trip volume, card breakpoints and keyboard focus", () => {
  for (const story of [
    "ZeroTrips",
    "ActiveTrips",
    "OneTrip",
    "SixPlusPastJourneys",
    "Mobile390",
    "UpcomingCardsDesktop",
    "UpcomingCardsTablet768",
    "UpcomingCardsMobile390",
    "LongCurrentJourneyMobile390",
    "InvalidHeroMediaMobile390",
    "ClickableCardKeyboardFocus",
  ]) assert.match(dashboardStories, new RegExp(`export const ${story}`));
  assert.match(dashboardStories, /title: "Portugal \+ Spain"/);
  assert.match(dashboardStories, /image\?: string \| null/);
  assert.match(dashboardStories, /morrovia390/);
  assert.match(controlStories, /export const SegmentedMobile390/);
  assert.match(controlStyles, /@media \(max-width: 520px\)[\s\S]*?\.segment \{[\s\S]*?min-height: 44px/);
  assert.match(storybookConfig, /find: "@\/lib\/auth-client"/);
  assert.match(dashboardStories, /setStorybookAuthOwner\("storybook-first-traveller"\)/);
  assert.match(storybookAuth, /useSession: \(\) => \(\{ data: session\(\), isPending: false/);
  assert.match(storybookPreview, /resetStorybookAuthOwner\(\)/);
});
