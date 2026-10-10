import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("components/easyt/trip-shell.tsx", "utf8");
const client = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");
const css = readFileSync("components/easyt/trip-shell.module.css", "utf8");
const resolver = readFileSync("components/easyt/trip-shell-resolver.tsx", "utf8");

test("shared shell keeps one action and navigation owner with valid mobile imagery", () => {
  assert.match(shell, /<TripShellIdentityAndActions\s*\/>/);
  assert.match(shell, /<TripShellImage\s*\/>/);
  assert.match(shell, /<TripShellNavigation tripId=\{trip\.id\}/);
  assert.doesNotMatch(shell, /itineraryPresentationImages/);
  assert.match(client, /const \{ trip \} = useTripShellMutation\(\);[\s\S]*tripCoverImage\(trip, new Set\(excluded\)\)/);
  assert.match(client, /personalRouteHref\(trip\.id\)/);
  assert.match(client, /tripBuilderHref\(trip\.id, trip\.ownerId\)/);
  assert.match(client, /<WorkspaceOrientationLauncher onRenameTrip=\{openRename\}/);
  assert.match(client, /aria-current=\{active \? "page" : undefined\}/);
});

test("whole-trip cover has one responsive image owner, visible-image attribution and a neutral fallback", () => {
  const imageOwner = client.slice(client.indexOf("export function TripShellImage"));
  assert.equal((imageOwner.match(/<ResilientImage\s/g) ?? []).length, 1);
  assert.doesNotMatch(imageOwner, /stopCount|routeLabel|<small>|mobilePhoto/);
  assert.match(imageOwner, /role="img" aria-label=\{`\$\{tripDisplayTitle\(trip\)\} trip image unavailable`\}/);
  assert.match(imageOwner, /displayedSrc === photo\.src \? <MorroviaPhotoCredit/);
  assert.match(imageOwner, /licenseHref=\{photo\.licenseUrl\}/);
  assert.match(imageOwner, /fullCreditHref=\{photo\.fullCreditUrl\}/);
  assert.match(client, /<h1 id="trip-shell-title">\{tripDisplayTitle\(mutation\.trip\)\}/);
  assert.match(client, /<p className=\{styles\.routeSummary\}>\{routeLabel\}/);
});

test("ordinary device promotion is one shared shell row while recovery remains prominent", () => {
  assert.match(resolver, /tripSaveSignInHref\(tripId\)/);
  assert.match(resolver, /deviceOnlyNotice=/);
  assert.doesNotMatch(resolver, /\{!ownerId \? <MorroviaStatusBanner className=\{styles\.resolverNotice\}/);
  assert.match(resolver, /\{syncIssue \? <MorroviaStatusBanner/);
  assert.match(shell, /\{deviceOnlyNotice \? <div className=\{styles\.deviceOnlyNotice\}>/);
  assert.match(css, /\.deviceOnlyNotice/);
});

test("mobile identity is compact and its actions remain full-size", () => {
  const mobile = css.slice(css.indexOf("@media (max-width: 760px)"));
  assert.match(mobile, /\.tripHeader\s*\{[^}]*grid-template-columns:\s*4[0-8]px minmax\(0,\s*1fr\)/);
  assert.match(mobile, /\.eyebrow,\s*\.routeSummary\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.metadata div:nth-child\(n\s*\+\s*3\)\s*\{\s*display:\s*none/);
  assert.match(mobile, /\.headerActions\s*\{[^}]*grid-column:\s*2/);
  assert.match(mobile, /\.headerActions\s*\{[^}]*flex-wrap:\s*wrap/);
  assert.match(css, /\.editAction\s*\{[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.subnav a\s*\{[^}]*min-height:\s*44px/);
});

test("constrained tablet header gives the title a full identity column and actions a second row", () => {
  const tablet = css.slice(css.indexOf("@media (min-width: 761px) and (max-width: 980px)"));
  assert.match(tablet, /\.tripHeader\s*\{[^}]*grid-template-columns:\s*138px minmax\(0,\s*1fr\)/);
  assert.match(tablet, /\.headerActions\s*\{[^}]*grid-column:\s*2/);
  assert.match(tablet, /\.headerActions\s*\{[^}]*flex-wrap:\s*wrap/);
});
