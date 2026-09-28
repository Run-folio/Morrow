import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync("components/easyt/trip-shell.tsx", "utf8");
const client = readFileSync("components/easyt/trip-shell-client.tsx", "utf8");
const css = readFileSync("components/easyt/trip-shell.module.css", "utf8");
const resolver = readFileSync("components/easyt/trip-shell-resolver.tsx", "utf8");

test("shared shell keeps one action and navigation owner with valid mobile imagery", () => {
  assert.match(shell, /<TripShellIdentityAndActions mobilePhoto=\{sharedPhoto\}\s*\/>/);
  assert.match(shell, /<TripShellNavigation tripId=\{trip\.id\}/);
  assert.doesNotMatch(shell, /itineraryPresentationImages/);
  assert.match(shell, /routeImageCredit|overviewStopImage/);
  assert.match(client, /personalRouteHref\(trip\.id\)/);
  assert.match(client, /tripBuilderHref\(trip\.id, trip\.ownerId\)/);
  assert.match(client, /<WorkspaceOrientationLauncher onRenameTrip=\{openRename\}/);
  assert.match(client, /aria-current=\{active \? "page" : undefined\}/);
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
  assert.match(css, /\.editAction\s*\{[^}]*min-height:\s*44px/);
  assert.match(mobile, /\.subnav a\s*\{[^}]*min-height:\s*44px/);
});
