import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";

const require = createRequire(import.meta.url);
const typescript = require("typescript");

const shell = readFileSync("components/easyt/trip-shell.tsx", "utf8");
const client = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");
const css = readFileSync("components/easyt/trip-shell.module.css", "utf8");
const resolver = readFileSync("components/easyt/trip-shell-resolver.tsx", "utf8");
const dashboard = readFileSync("app/journey/dashboard/dashboard-client.tsx", "utf8");

test("shared shell keeps one action and navigation owner without repeating the trip cover", () => {
  assert.match(shell, /<TripShellIdentityAndActions\s*\/>/);
  assert.doesNotMatch(shell, /<TripShellImage\s*\/>/);
  assert.match(shell, /<TripShellNavigation tripId=\{trip\.id\}/);
  assert.doesNotMatch(shell, /itineraryPresentationImages/);
  assert.match(client, /export function TripShellImage/);
  assert.match(dashboard, /dashboardTripPhoto\(trip\)/);
  assert.match(dashboard, /ResilientImage src=\{photo\?\.src\}/);
  assert.match(dashboard, /dashboardTripCoverPlace\(trip\)/);
  assert.match(client, /const \{ trip \} = useTripShellMutation\(\);[\s\S]*tripCoverImage\(trip, new Set\(excluded\)\)/);
  assert.doesNotMatch(client, /personalRouteHref\(|View my route/);
  assert.match(client, /tripBuilderHref\(trip\.id, trip\.ownerId\)/);
  assert.match(client, /<WorkspaceOrientationLauncher onRenameTrip=\{openRename\}/);
  assert.match(client, /aria-current=\{active \? "page" : undefined\}/);
});

test("whole-trip cover has one responsive image owner, visible-image attribution and a neutral fallback", () => {
  const imageOwner = client.slice(client.indexOf("export function TripShellImage"));
  assert.equal((imageOwner.match(/<ResilientImage\s/g) ?? []).length, 1);
  assert.doesNotMatch(imageOwner, /stopCount|routeLabel|<small>|mobilePhoto/);
  assert.match(imageOwner, /displayedSrc === photo\.src \? <MorroviaPhotoCredit/);
  assert.match(imageOwner, /licenseHref=\{photo\.licenseUrl\}/);
  assert.match(imageOwner, /fullCreditHref=\{photo\.fullCreditUrl\}/);
  assert.match(client, /export function TripShellImage/);
});

test("ordinary device promotion is one shared shell row while recovery remains prominent", () => {
  assert.match(resolver, /tripSaveSignInHref\(tripId\)/);
  assert.match(resolver, /deviceOnlyNotice=/);
  assert.doesNotMatch(resolver, /\{!ownerId \? <MorroviaStatusBanner className=\{styles\.resolverNotice\}/);
  assert.match(resolver, /\{syncIssue \? <MorroviaStatusBanner/);
  assert.match(shell, /\{deviceOnlyNotice \? <div className=\{styles\.deviceOnlyNotice\}>/);
  assert.match(css, /\.deviceOnlyNotice/);
});

test("slim trip identity retains status, truncated title disclosure, all stats, save feedback and actions", () => {
  const identity = client.slice(client.indexOf('<div className={styles.tripIdentity}>'), client.indexOf('<div className={styles.headerActions}>'));
  assert.match(identity, /<p className=\{styles\.eyebrow\}>\{status\}<\/p>[\s\S]*<h1 id="trip-shell-title">[\s\S]*<span className=\{styles\.tripTitleDisclosure\}>[\s\S]*<EasyTButton[\s\S]*aria-describedby="trip-title-edit-hint"[\s\S]*onPointerEnter=\{\(\) => dispatchTitleDisclosure\("pointer-enter"\)\}[\s\S]*onPointerLeave=\{\(\) => dispatchTitleDisclosure\("pointer-leave"\)\}[\s\S]*onFocus=\{\(\) => dispatchTitleDisclosure\("focus"\)\}[\s\S]*onBlur=\{\(\) => dispatchTitleDisclosure\("blur"\)\}[\s\S]*onClick=\{openRename\}[\s\S]*<span>\{displayTitle\}<\/span>[\s\S]*<\/EasyTButton>[\s\S]*<span className=\{styles\.tripTitleFull\} aria-hidden="true" style=\{\{ display: \(titleHovered \|\| titleFocused\) && !titlePreviewDismissed \? "block" : "none" \}\}>\{displayTitle\}<\/span>[\s\S]*<\/span>[\s\S]*<\/h1>[\s\S]*\{metadata\}/);
  const metadata = client.slice(client.indexOf("const metadata = ("), client.indexOf("const leadingActions ="));
  assert.match(metadata, /<dl className=\{styles\.metadata\}>/);
  assert.match(metadata, /<dd>\{dateFacts\.rangeLabel\}<\/dd>/);
  assert.match(metadata, /<dd>\{duration \? `\$\{duration\}[\s\S]*"Duration to confirm"\}<\/dd>/);
  assert.match(metadata, /overnightPlaceCount/);
  assert.match(metadata, /mutation\.trip\.legs\.length/);
  assert.match(client, /<MorroviaSaveStatus state=\{mutation\.saveState\}/);
  assert.match(client, />Explore map<\/EasyTLinkButton>[\s\S]*>Edit<\/EasyTLinkButton>[\s\S]*<TripOverviewLibraryActions/);
  assert.match(css, /\.tripHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\) auto[^}]*min-height:\s*0/);
  assert.match(css, /\.tripTitleToggle\s*>\s*span\s*\{[^}]*text-overflow:\s*ellipsis[^}]*white-space:\s*nowrap/);
  assert.match(css, /\.tripTitleToggle:focus-visible/);
  assert.match(css, /\.metadata dt\s*\{[^}]*color:\s*var\(--morrovia-signal\)/);
  assert.match(css, /\.metadata\s*\{[^}]*flex-wrap:\s*wrap/);
});

test("mobile identity keeps the title on one line and wraps metadata without hiding status or facts", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /\.tripHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(mobile, /\.tripImage\s*\{/);
  assert.doesNotMatch(mobile, /\.eyebrow\s*\{\s*display:\s*none/);
  assert.doesNotMatch(mobile, /\.metadata div:nth-child\(n\s*\+\s*3\)/);
  assert.doesNotMatch(mobile, /\.metadata dt\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.headerActions\s*\{[^}]*grid-column:\s*1/);
  assert.match(mobile, /\.headerActions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(mobile, /\.headerActions\s*\{[^}]*width:\s*100%/);
  assert.match(mobile, /\.tripIdentity h1\s*\{[^}]*font-size:/);
  assert.match(css, /\.editAction\s*\{[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.subnav a\s*\{[^}]*min-height:\s*44px/);
});

test("constrained tablet header gives the title a full identity line and actions a second row", () => {
  const tablet = css.slice(css.indexOf("@media (min-width: 761px) and (max-width: 980px)"));
  assert.match(tablet, /\.tripHeader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(tablet, /\.headerActions\s*\{[^}]*grid-column:\s*1/);
  assert.match(tablet, /\.headerActions\s*\{[^}]*flex-wrap:\s*wrap/);
});

test("workspace tabs move Transport after Overview with their existing routes and active state", () => {
  assert.match(client, /const views = \[\s*\{ id: "overview", label: "Overview", icon: House, suffix: "" \},\s*\{ id: "transport", label: "Transport", icon: Route, suffix: "\/transport" \},\s*\{ id: "itinerary", label: "Itinerary", icon: CalendarDays, suffix: "\/itinerary" \},\s*\{ id: "explore", label: "Explore", icon: Sparkles, suffix: "\/explore" \},\s*\{ id: "stay", label: "Stay", icon: BedDouble, suffix: "\/stay" \},\s*\] as const/);
  assert.match(client, /className=\{active \? styles\.subnavActive : undefined\}/);
  assert.match(client, /aria-current=\{active \? "page" : undefined\}/);
  assert.match(client, /view\.id === "overview" \? tripWorkspaceHref\(tripId\) : `\$\{baseHref\}\$\{view\.suffix\}`/);
  assert.match(css, /\.editAction:focus-visible,\s*\.subnav a:focus-visible\s*\{/);
});

test("long multi-country title has desktop and mobile presentation fixtures", () => {
  const stories = readFileSync("components/easyt/trip-shell.stories.tsx", "utf8");
  assert.match(stories, /const longMultiCountryTitle = "[^"]{100,}"/);
  assert.match(stories, /export const LongMultiCountryTitleDesktop1440:[\s\S]*?morrovia1440/);
  assert.match(stories, /export const LongMultiCountryTitleMobile390:[\s\S]*?morrovia390/);
});

test("full-title preview follows hover/focus, supports Escape dismissal, and resets after blur", () => {
  const reducerSource = client.match(/(function reduceTripTitleDisclosure\([\s\S]*?\n\})/);
  assert.ok(reducerSource, "production disclosure reducer is present");
  const reducerJavascript = typescript.transpileModule(reducerSource[1], { compilerOptions: { target: typescript.ScriptTarget.ES2020 } }).outputText;
  const reduce = new Function(`${reducerJavascript}; return reduceTripTitleDisclosure;`)();
  const closed = { dismissed: false, hovered: false, focused: false };
  const focused = reduce(closed, "focus");
  assert.deepEqual(focused, { ...closed, focused: true }, "keyboard focus previews the title");
  assert.deepEqual(reduce(focused, "pointer-leave"), focused, "pointer leave retains a focused preview");
  const dismissed = reduce(focused, "dismiss");
  assert.deepEqual(dismissed, { ...focused, dismissed: true }, "Escape dismisses the preview while focused");
  assert.deepEqual(reduce(dismissed, "blur"), closed, "leaving focus resets dismissal");
  assert.deepEqual(reduce(closed, "pointer-enter"), {...closed, hovered:true}, "pointer hover previews full text");
});
