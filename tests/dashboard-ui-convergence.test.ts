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

test("trip and continuation cards use an independent accessible stretched link", () => {
  assert.match(dashboard, /className=\{styles\.cardOverlay\}[\s\S]*?aria-label=\{`\$\{language === "es" \? "Abrir viaje" : "Open trip"\}: \$\{title\}`\}/);
  assert.match(dashboard, /className=\{styles\.cardOverlay\}[\s\S]*?href=\{tripWorkspaceHref\(featuredTrip\.id\)\}/);
  assert.match(dashboard, /<EasyTLinkButton className=\{styles\.editAction\}[\s\S]*?href=\{`\/journey\/new\?trip=/);
  assert.match(dashboard, /<details className=\{styles\.tripMenu\}>/);
  assert.match(dashboardStyles, /\.cardOverlay \{[\s\S]*?position: absolute;[\s\S]*?z-index: 1;[\s\S]*?inset: 0;/);
  assert.match(dashboardStyles, /\.tripCardActions,[\s\S]*?\.stampsAction \{ position: relative; z-index: 2; \}/);
  assert.match(dashboardStyles, /\.cardOverlay:focus-visible[\s\S]*?var\(--morrovia-focus-ring\)/);
  assert.equal([...dashboard.matchAll(/<Link\s+className=\{styles\.cardOverlay\}[\s\S]*?\/>/g)].length, 3, "all full-card links are self-closing siblings rather than wrappers around actions");
});

test("dashboard filters and compact fields use canonical controls", () => {
  assert.match(dashboard, /EasyTSegmentedControl<TripStatus>/);
  assert.match(dashboard, /controls: "dashboard-trip-grid"/);
  assert.match(dashboard, /<EasyTSelect fieldClassName=\{styles\.sortControl\}/);
  assert.match(dashboard, /<EasyTField fieldClassName=\{styles\.searchControl\}/);
  assert.doesNotMatch(dashboardStyles, /\.statusFilters/);
  assert.doesNotMatch(dashboardStyles, /\.sortControl select/);
  assert.doesNotMatch(dashboardStyles, /\.searchControl input/);
});

test("lifecycle chips are non-danger while blocked route truth remains danger", () => {
  assert.match(dashboard, /styles\.lifecycleActive/);
  assert.match(dashboard, /styles\.lifecyclePlanned/);
  assert.match(dashboard, /styles\.lifecycleArchived/);
  assert.match(dashboardStyles, /\.lifecycleActive[^\n]*var\(--morrovia-action\)/);
  assert.match(dashboardStyles, /\.lifecyclePlanned[^\n]*var\(--morrovia-ink-soft\)/);
  assert.match(dashboardStyles, /\.lifecycleArchived[^\n]*var\(--morrovia-muted\)/);
  assert.match(dashboard, /signal\.blocked \? styles\.blockedStage/);
  assert.match(dashboardStyles, /\.blockedStage > span[^\n]*var\(--morrovia-danger\)/);
});

test("continue and Stamped summaries expose truthful labelled metadata", () => {
  assert.match(dashboard, /<b>\{featuredTrip\.stops\.length\}<\/b>\{isSpanish \? "paradas" : "stops"\}/);
  assert.match(dashboard, /const stampSummary = summarizeStampRows\(stamps\)/);
  assert.match(dashboard, /<Globe2 aria-hidden="true" \/>/);
  assert.match(dashboard, /<MapPin aria-hidden="true" \/>/);
  assert.match(dashboard, /Countries seen/);
  assert.match(dashboard, /Want to visit/);
  assert.match(dashboard, /\/journey\/illustrations\/global-route-confirm\.png/);
});

test("Storybook covers lifecycle, long-content, missing-image, Stamped and mobile states", () => {
  for (const story of [
    "ZeroTrips",
    "ActiveTrips",
    "PlannedTrips",
    "ArchivedTrips",
    "StampedEmptySummary",
    "ActiveCardsDesktop",
    "ActiveCardsTablet768",
    "ActiveCardsMobile390",
    "ClickableCardKeyboardFocus",
  ]) assert.match(dashboardStories, new RegExp(`export const ${story}`));
  assert.match(dashboardStories, /Gatwick, Santiago, Easter Island, Puerto de Punta Arenas & Tierra del Fuego/);
  assert.match(dashboardStories, /cardTrip\("storybook-trip-3", "Lisbon, Seville & Barcelona", null\)/);
  assert.match(dashboardStories, /morrovia390/);
  assert.match(controlStories, /export const SegmentedMobile390/);
  assert.match(controlStyles, /@media \(max-width: 520px\)[\s\S]*?\.segment \{[\s\S]*?min-height: 44px/);
  assert.match(storybookConfig, /find: "@\/lib\/auth-client"/);
  assert.match(dashboardStories, /setStorybookAuthOwner\("storybook-first-traveller"\)/);
  assert.match(storybookAuth, /useSession: \(\) => \(\{ data: session\(\), isPending: false/);
  assert.match(storybookPreview, /resetStorybookAuthOwner\(\)/);
});
