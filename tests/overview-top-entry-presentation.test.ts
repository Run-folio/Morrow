import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboard = readFileSync(new URL("../app/journey/dashboard/dashboard-client.tsx", import.meta.url), "utf8");
const shell = readFileSync(new URL("../components/easyt/trip-shell-client.tsx", import.meta.url), "utf8");
const page = readFileSync(new URL("../app/journey/[tripId]/page.tsx", import.meta.url), "utf8");

test("dashboard card, Continue and Overview entries use the canonical generic trip URL", () => {
  assert.match(dashboard, /href=\{tripWorkspaceHref\(featuredTrip\.id\)\}/);
  assert.match(dashboard, /const primaryHref = resolvedKind === "idea"[\s\S]*: tripWorkspaceHref\(trip\.id\)/);
  assert.ok((dashboard.match(/tripWorkspaceHref\(featuredTrip\.id\)/g) ?? []).length >= 2);
});

test("TripShell Overview navigation uses the same link owner on every viewport", () => {
  assert.match(shell, /view\.id === "overview" \? tripWorkspaceHref\(tripId\)/);
  assert.doesNotMatch(shell, /scroll=\{false\}/);
});

test("one page boundary owns generic top entry without disabling intentional hashes", () => {
  assert.match(page, /<TripOverviewEntryBoundary \/>/);
  assert.match(shell, /window\.addEventListener\("hashchange", resetGenericEntry\)/);
  assert.match(shell, /shouldResetOverviewEntry\(window\.location\.hash\)/);
  assert.equal((shell.match(/window\.scrollTo/g) ?? []).length, 1);
});
