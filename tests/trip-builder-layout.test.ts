import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { builderBrowserTestsEnabled, renderBuilder } from "./helpers/builder-render.ts";
import { hasUsefulRouteSkeleton } from "../app/journey/new/trip-builder-entry.ts";
import { publicRouteDetailFor } from "../lib/easyt/public-route.ts";
import { routePlannerPayload } from "../lib/easyt/public-route-handoff.ts";
import { extractStructuredTripBrief } from "../lib/easyt/structured-trip-brief.ts";

const browserTest = (name: string, run: () => Promise<void>) => test(name, { skip: !builderBrowserTestsEnabled }, run);

test("a useful route requires a valid stop occurrence, independently of endpoint context", () => {
  assert.equal(hasUsefulRouteSkeleton([]), false);
  const stop = { id: "tokyo-first", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo" };
  assert.equal(hasUsefulRouteSkeleton([stop]), true);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, canonicalPlaceId: undefined }]), false);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, id: "" }]), false);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, name: "" }]), false);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, country: "" }]), false);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, coordinates: [NaN, 35.6] }]), false);
  assert.equal(hasUsefulRouteSkeleton([{ ...stop, canonicalPlaceId: undefined, coordinates: [139.6917, 35.6895] }]), true);
  assert.equal(hasUsefulRouteSkeleton([stop, { ...stop, id: "tokyo-return" }]), true);
});

browserTest("direct Builder entry offers capture, first place and import without mandatory steps or empty route", async () => {
  const view = await renderBuilder();
  try {
    const text = await view.page.locator("body").innerText();
    assert.doesNotMatch(text, /STEP 1 OF 2|STEP 2 OF 2|Set dates & nights/);
    assert.match(text, /Describe your trip/);
    assert.equal(await view.page.getByRole("combobox", { name: "Add your first place", exact: true }).count(), 1);
    assert.equal(await view.page.getByRole("link", { name: "Import existing trip" }).getAttribute("href"), "/journey/new/import");
    assert.doesNotMatch(text, /Nights per stop|Trip at a glance/);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

browserTest("useful homepage and template handoffs show route timing immediately", async () => {
  const draft = routePlannerPayload(publicRouteDetailFor("morocco-rail")!.planDraft);
  for (const entry of [{ query: "?homeDraft=1", draft }, { query: "?inspire=morocco-rail" }]) {
    const view = await renderBuilder(entry);
    try {
      const text = await view.page.locator("body").innerText();
      assert.match(text, /Nights per stop/);
      assert.match(text, /Marrakech/);
      assert.doesNotMatch(text, /Make the time|Budget \(optional\)/,
        "the unified workspace should not retain duplicate legacy timing controls");
      assert.equal(await view.page.getByRole("heading", { name: "Shape the route." }).count(), 1);
      assert.doesNotMatch(text, /STEP 1 OF 2|STEP 2 OF 2|Describe your trip|Set dates & nights/);
    } finally { await view.close(); }
  }
});

browserTest("area-only handoff stays in clarification without an empty route or retired intake", async () => {
  const brief = "Two weeks in Thailand";
  const view = await renderBuilder({ query: "?homeDraft=1", draft: { brief, structuredBrief: extractStructuredTripBrief(brief) } });
  try {
    const text = await view.page.locator("body").innerText();
    assert.match(text, /Thailand/);
    assert.doesNotMatch(text, /STEP 1 OF 2|Nights per stop|Describe your trip/);
  } finally { await view.close(); }
});

browserTest("legacy step query cannot switch an empty Builder into timing and preserves other parameters", async () => {
  const view = await renderBuilder({ query: "?step=1&recover=1&view=brief&campaign=test" });
  try {
    assert.match(await view.page.locator("body").innerText(), /Describe your trip/);
    const url = new URL(view.page.url());
    assert.equal(url.searchParams.has("step"), false);
    assert.equal(url.searchParams.get("recover"), "1");
    assert.equal(url.searchParams.get("view"), "brief");
    assert.equal(url.searchParams.get("campaign"), "test");
  } finally { await view.close(); }
});

test("Builder workspace height and capture width remain content-driven", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const handoffShell = styles.slice(styles.indexOf(".homepageHandoff {"), styles.indexOf(".homepageHandoff .steps"));

  assert.match(styles, /@media \(min-width: 1025px\)[\s\S]*\.initialCapture \{[\s\S]*max-width: none;[\s\S]*margin: 0;/,
    "the fresh capture should use the full elevated desktop task column");
  assert.match(styles, /\.initialCapture>form\{[^}]*max-width:none/,
    "the local wrapper should release the Homepage component's compact max width");

  assert.doesNotMatch(handoffShell, /100(?:s|d|l|v)vh/,
    "the bordered handoff shell must not force itself to viewport height");
  assert.match(handoffShell, /min-height:\s*0/,
    "short Builder states should use their natural content height");
  assert.doesNotMatch(styles, /\.pane\s*\{[^}]*min-height:\s*520px/,
    "the content pane must not retain the previous fixed minimum workspace height");

  assert.match(styles, /\.wizardBody \{[^}]*border-top:\s*0/,
    "the adjacent workspace must not stack a second border against the step header");
  assert.match(styles, /\.wizardBody:has\(\.placesSummaryRail\) \{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--builder-rail-width\)/,
    "the right summary rail must remain a separate grid column");
});

test("desktop Builder uses the approved wide workspace without changing tablet and mobile breakpoints", () => {
  const pageStyles = readFileSync(new URL("../app/journey/new/new-trip.module.css", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const desktopStart = styles.lastIndexOf("@media (min-width: 1025px)");
  const desktop = styles.slice(desktopStart, styles.indexOf("/* Primary Builder moments", desktopStart));

  assert.match(pageStyles, /@media\(min-width:1025px\)\{\.page\{padding-inline:0\}\}/,
    "the desktop page should let the Builder canvas own its measured gutters");
  assert.match(desktop, /width: calc\(100% - 96px\)/,
    "desktop should keep approximately 48px gutters");
  assert.match(desktop, /max-width: 1700px/,
    "wide displays should retain a useful maximum line length");
  assert.match(desktop, /grid-template-columns: minmax\(0, 1fr\) var\(--builder-rail-width\)/,
    "the main task and context rail should share one wide workspace grid");
  assert.match(desktop, /column-gap: clamp\(16px, calc\(10vw - 124px\), 68px\)/,
    "wide desktop should give the task area most of the additional width");
  assert.match(desktop, /grid-template-columns: minmax\(150px, 1fr\) minmax\(200px, 1\.3fr\) minmax\(110px, \.55fr\) minmax\(130px, \.7fr\)/,
    "the nights table should allocate useful width to transfer and usable-time details");
  assert.doesNotMatch(desktop, /@media\s*\(max-width:/,
    "the visual elevation must not rewrite the existing tablet or mobile rules");
});

test("the unified route workspace projects canonical occurrences beside the map", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(builder, /<TripBuilderRouteWorkspace[\s\S]*canonicalTrip=\{activeTripDocument\}/,
    "TripBuilderDocument must remain the canonical route-workspace owner");
  assert.match(workspace, /buildBuilderRoutePreview\(canonicalTrip, previewStopIds\)/,
    "drag preview must be an immutable presentation projection");
  assert.match(workspace, /mapRouteLegsFromTrip\(presentedTrip\)/,
    "the map and rows must consume the same presented trip");
  assert.match(workspace, /key=\{stop\.id\}/);
  assert.match(workspace, /<b>\{index \+ 1\}<\/b>/,
    "row ordinals must be derived from occurrence order, matching map markers");
  assert.match(styles, /\.builderRouteGrid\{[^}]*grid-template-columns:minmax\(0,1\.05fr\) minmax\(320px,\.95fr\)/,
    "desktop route rows and map should have approximately equal visual weight");
  assert.match(styles, /@media\(max-width:1024px\)\{\.builderRouteGrid\{[^}]*grid-template-areas:"map" "rows"/,
    "narrow layouts must place the route projection before the rows");
  assert.match(workspace, /mapCollapsed \? "Show map" : "Collapse map"/,
    "mobile route editing should expose an explicit map collapse control");
  assert.match(styles, /\.builderRouteMapToggle\{display:none/,
    "the compact map control should not compete with the desktop workspace");
  assert.match(styles, /@media\(max-width:700px\)[\s\S]*\.builderRouteMapToggle\{display:/,
    "the map collapse control should appear at the established mobile breakpoint");
  assert.match(styles, /\.builderRouteMapBody\[hidden\]\{display:none/,
    "collapsed mobile maps should release their layout height without hiding route rows");
  assert.doesNotMatch(styles, /\.builderRoute(?:Workspace|Header|Grid|Rows|Map|Check)[^{]*\{[^}]*(?:width|min-width):\s*[4-9]\d\dpx/,
    "the unified workspace should not impose a fixed width that can overflow narrow fixtures");
});

test("a fatal initial map failure leaves the route workspace usable", () => {
  const workspace = readFileSync(new URL("../app/journey/new/trip-builder-route-workspace.tsx", import.meta.url), "utf8");
  const map = readFileSync(new URL("../components/journey-planner-map.tsx", import.meta.url), "utf8");

  assert.match(map, /onLifecycleChange\?: \(state: "ready" \| "unavailable"\) => void/);
  assert.match(map, /onLifecycleChangeRef\.current\?\.\("ready"\)/,
    "the map should report ready after its initial style is usable");
  assert.match(map, /onLifecycleChangeRef\.current\?\.\("unavailable"\)/,
    "fatal initial setup should be reported to the scoped owner");
  assert.match(map, /if \(lifecycleState === "ready"\) return/,
    "late resource and teardown errors must not replace a healthy map");
  assert.match(workspace, /Route map unavailable/);
  assert.match(workspace, /The route list still works, and you can continue building your trip\./);
  assert.match(workspace, /<JourneyPlannerMap[\s\S]*onLifecycleChange=\{setMapLifecycle\}/,
    "only this Builder map owner should decide whether to show its fallback");
});

test("Builder spacing and healthy route copy use the focused production treatment", () => {
  const page = readFileSync(new URL("../app/journey/new/page.tsx", import.meta.url), "utf8");
  const pageStyles = readFileSync(new URL("../app/journey/new/new-trip.module.css", import.meta.url), "utf8");
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const builderStyles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");

  assert.match(page, /className=\{styles\.builderBoundary\}[\s\S]*<TripBuilder \/>/,
    "the page boundary, rather than the Builder header, should own navigation spacing");
  assert.match(builder, /data-builder-root="true"/,
    "all Builder states should expose the page-boundary hook");
  assert.match(pageStyles, /\.builderBoundary\{[^}]*padding-top:32px/,
    "desktop should use a 32px navigation-to-Builder gap");
  assert.match(pageStyles, /@media\(max-width:1024px\)\{\.builderBoundary\{padding-top:28px\}\}/,
    "tablet should use a 28px navigation-to-Builder gap");
  assert.match(pageStyles, /@media\(max-width:700px\)\{\.builderBoundary\{padding-top:22px\}\}/,
    "mobile should use a 22px navigation-to-Builder gap");

  assert.match(builderStyles, /\.placesSection \.confirmedStops\{[^}]*padding:9px 10px/,
    "the Stops field should keep compact internal breathing room");
  assert.match(builderStyles, /\.placesSection \.confirmedStops>div\{gap:8px;min-width:0\}/,
    "wrapped stop chips should retain a consistent gap without overflow");
  assert.match(builderStyles, /\.placesSection \.confirmedStops button\{[^}]*max-width:100%[^}]*white-space:normal/,
    "long stop names should wrap within the field at narrow widths");

  assert.doesNotMatch(builder, /REVIEWED ROUTE FACTS/);
  assert.doesNotMatch(builder, /You can still change the order in the route on the right whenever you like\./);
  assert.doesNotMatch(builder, /Reviewed \{currentCuratedRoute\.reviewedAt\}/);
  assert.match(builder, /ROUTE COVERAGE CHANGED/,
    "a genuine curated-route coverage change should remain visible");
  assert.match(builder, /Avoid driving is active: compare rail or flight/,
    "an actionable transport constraint warning should remain visible");
});

test("the Journey shell and immersive closing share one production footer owner", () => {
  const layout = readFileSync(new URL("../app/journey/layout.tsx", import.meta.url), "utf8");
  const shellStyles = readFileSync(new URL("../app/journey/journey-design.css", import.meta.url), "utf8");
  const closing = readFileSync(new URL("../app/journey/home/immersive/closing-chapter.tsx", import.meta.url), "utf8");
  const story = readFileSync(new URL("../components/morrovia-footer.stories.tsx", import.meta.url), "utf8");

  assert.equal(layout.match(/<MorroviaFooter omitOnImmersiveHome \/>/g)?.length, 1,
    "the shared Journey layout should mount the canonical footer for non-home routes");
  assert.match(shellStyles, /\.morroviaProductShell\s*\{[\s\S]*?display:\s*flex[\s\S]*?min-height:\s*100svh[\s\S]*?flex-direction:\s*column/,
    "the production page shell should push short-page footers to the viewport bottom");
  assert.match(shellStyles, /\.morroviaProductContent\s*\{[\s\S]*?flex:\s*1 0 auto/,
    "long page content should keep its natural scroll height");
  assert.equal(closing.match(/<MorroviaFooter overImage \/>/g)?.length, 1,
    "the immersive closing chapter should reuse the canonical footer exactly once");
  assert.match(story, /import MorroviaFooter from "\.\/morrovia-footer"/);
  assert.match(story, /component: MorroviaFooter/,
    "Storybook should render the exact production footer component");
});

test("clarification presentation separates action-required geography from confirmed stay bases", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const dialog = readFileSync(new URL("../components/easyt/builder-clarification-dialog.tsx", import.meta.url), "utf8");

  assert.match(builder, /pendingReviewPlaceMentions = useMemo/);
  assert.match(builder, /geographyReviewPlaceMentions = useMemo/,
    "an in-place Add Stop clarification should not be duplicated below in Geography to review");
  assert.match(builder, /resolvedPlaceMentions = useMemo/);
  assert.match(builder, /pendingClarificationIds\.length > 0 && <BuilderClarificationResume/,
    "the compact resume action must disappear when no item still needs action");
  assert.match(builder, /<BuilderClarificationDialog/);
  assert.doesNotMatch(builder, /geographyReviewPlaceMentions\.map\(/,
    "the normal Builder layout must not render every broad area at once");
  assert.match(dialog, /SELECTED PLACES/);
  assert.match(builder, /STAY BASES CONFIRMED/);
  assert.match(builder, /staying in \$\{selection\.selectedName\}/,
    "confirmed anchors should explain where the traveller will stay");
  assert.match(builder, /placeDisplayName\(mention\)/,
    "presentation should use canonical names without mutating source text");
  assert.match(builder, /aria-label=\{`\$\{placeDisplayName\(mention\)\},/,
    "resolved relationships should have a complete screen-reader label");
  assert.match(styles, /\.resolvedPlaces article > button:focus-visible/);
  assert.match(styles, /@media \(max-width: 520px\)[\s\S]*\.resolvedPlaces > div \{ grid-template-columns: 1fr;/,
    "confirmed base cards should stack at narrow widths");
});

test("night allocation reads canonical arrival and departure transfer impacts", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

  assert.match(builder, /transferImpactFromMetadata\(builderCanonicalLegs\.find\(\(leg\) => leg\.toStopId === stop\.id\)\?\.routeMetadata\.transferImpact\)/,
    "arrival allocation must decode the transfer-impact payload rather than its route-metadata wrapper");
  assert.match(builder, /transferImpactFromMetadata\(builderCanonicalLegs\.find\(\(leg\) => leg\.fromStopId === stop\.id\)\?\.routeMetadata\.transferImpact\)/,
    "departure allocation must use the canonical leg leaving this stop even after endpoint deduplication");
  assert.match(builder, /departureImpact: departureImpact \?\? undefined/,
    "both sides of each stay must reach the shared night allocator");
  assert.doesNotMatch(builder, /transferImpactFromMetadata\(builderCanonicalLegs\[index\]\?\.routeMetadata\)/,
    "the route-metadata wrapper is not itself a transfer impact");
});

test("manual night edits use canonical rebalance, durable stop intent and shared feedback", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const trip = readFileSync(new URL("../lib/easyt/trip.ts", import.meta.url), "utf8");
  const storage = readFileSync(new URL("../lib/easyt/storage.ts", import.meta.url), "utf8");

  assert.match(builder, /rebalanceTripNights\(\{/,
    "manual Builder edits must use the canonical night-allocation owner");
  assert.match(builder, /manualStopIds: nextManualStopIds/,
    "the edited stop must become authoritative for the pass");
  assert.match(builder, /<MorroviaStatusBanner className=\{styles\.nightBalanceNotice\}/,
    "automatic consequences and unresolved balance must reuse canonical status feedback");
  assert.doesNotMatch(builder, /sort\(\(a, b\) => nextAllocation\[b\.id\] - nextAllocation\[a\.id\]\)/,
    "the removed largest-stay donor shortcut must not return");
  assert.match(trip, /manualNightStopIds\?: string\[\]/,
    "manual stop identities must be part of the durable trip document");
  assert.match(storage, /manualNightStopIds: brief\.manualNightStopIds/,
    "device/cloud equivalence must compare manual night intent");
});

browserTest("first-place selection creates route timing without requiring endpoint context", async () => {
  const view = await renderBuilder();
  try {
    await view.page.getByRole("combobox", { name: "Add your first place", exact: true }).fill("Tokyo");
    await view.page.getByRole("option").filter({ hasText: "Tokyo" }).first().click();
    await view.page.getByRole("heading", { name: "Nights per stop" }).waitFor();
    assert.equal(await view.page.getByRole("heading", { name: "Describe your trip" }).count(), 0);
    assert.match(await view.page.locator("body").innerText(), /Tokyo/);
    assert.equal(await view.page.getByRole("button", { name: /Build trip/ }).isDisabled(), true);
  } finally { await view.close(); }
});

browserTest("passive validation preserves Starting from focus while typing after the first place", async () => {
  const view = await renderBuilder();
  try {
    await view.page.getByRole("combobox", { name: "Add your first place", exact: true }).fill("Tokyo");
    await view.page.getByRole("option").filter({ hasText: "Tokyo" }).first().click();
    await view.page.getByRole("heading", { name: "Nights per stop" }).waitFor();
    const origin = view.page.getByRole("combobox", { name: "Starting from", exact: true });
    await origin.focus();
    await origin.pressSequentially("London", { delay: 100 });
    assert.equal(await origin.inputValue(), "London");
    assert.equal(await origin.evaluate((input: HTMLInputElement) => input === document.activeElement), true);
    assert.equal(await view.page.getByRole("button", { name: /Build trip/ }).isDisabled(), true);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

browserTest("first-place resolution keeps the pending selection visible and prevents competing capture", async () => {
  const view = await renderBuilder();
  let release!: () => void;
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started!: () => void;
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  try {
    await view.page.route("**/api/journey-geocode?place=Tokyo&country=Japan", async (route: { fulfill: (response: unknown) => Promise<void> }) => {
      started();
      await pending;
      await route.fulfill({ contentType: "application/json", body: JSON.stringify({ result: { name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo", coordinates: [139.6917, 35.6895], kind: "city" } }) });
    });
    const input = view.page.getByRole("combobox", { name: "Add your first place", exact: true });
    await input.fill("Tokyo");
    await view.page.getByRole("option").filter({ hasText: "Tokyo" }).first().click();
    await requestStarted;
    assert.equal(await input.isDisabled(), true);
    assert.equal(await view.page.getByRole("button", { name: "Plan my trip" }).isDisabled(), true);
    release();
    await view.page.getByRole("heading", { name: "Nights per stop" }).waitFor();
  } finally { release(); await view.close(); }
});

browserTest("endpoint-only handoff does not create an overnight route or timing table", async () => {
  const view = await renderBuilder({ query: "?homeDraft=1", draft: { origin: "London", originCoordinates: [-0.1276, 51.5072], originCountry: "United Kingdom", journeyEnd: { mode: "same-as-start" } } });
  try {
    assert.equal(await view.page.getByRole("heading", { name: "Nights per stop" }).count(), 0);
    assert.equal(await view.page.getByRole("complementary", { name: "Trip at a glance" }).count(), 0);
  } finally { await view.close(); }
});

browserTest("direct text capture uses the existing parser then replaces capture with the populated route", async () => {
  const view = await renderBuilder();
  try {
    await view.page.getByRole("textbox", { name: "TELL US ABOUT YOUR TRIP" }).fill("Tokyo for one week");
    await view.page.getByRole("button", { name: "Plan my trip" }).click();
    await view.page.getByRole("heading", { name: "Nights per stop" }).waitFor();
    assert.match(await view.page.locator("body").innerText(), /Tokyo/);
    assert.equal(await view.page.getByRole("heading", { name: "Describe your trip" }).count(), 0);
    assert.deepEqual(view.errors, []);
  } finally { await view.close(); }
});

browserTest("legacy populated links focus summary or timing once while the whole route stays mounted", async () => {
  for (const [legacy, target] of [["0", "builder-summary"], ["1", "builder-timing"], ["2", "builder-timing"]]) {
    const view = await renderBuilder({ query: `?inspire=morocco-rail&step=${legacy}` });
    try {
      await view.page.waitForFunction((id: string) => document.activeElement?.id === id, target);
      assert.equal(await view.page.getByRole("heading", { name: "Nights per stop" }).count(), 1);
      assert.equal(new URL(view.page.url()).searchParams.has("step"), false);
      await view.page.getByRole("button", { name: "Add stop", exact: true }).click();
      assert.equal(await view.page.getByRole("heading", { name: "Nights per stop" }).count(), 1);
    } finally { await view.close(); }
  }
});
