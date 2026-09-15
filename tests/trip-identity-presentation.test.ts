import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");

test("Rename trip lives under More and uses the shared accessible form dialog", () => {
  const launcher = read("components/easyt/workspace-orientation.tsx");
  const shell = read("components/easyt/trip-shell-client.tsx");
  const dialog = read("components/easyt/morrovia-feedback.tsx");
  assert.match(launcher, /role="menuitem"[\s\S]*Rename trip/);
  assert.match(launcher, /buttonRef\.current\?\.focus\(\); setOpen\(false\); onRenameTrip\(\)/);
  assert.match(shell, /Edit trip brief[\s\S]*WorkspaceOrientationLauncher onRenameTrip/);
  assert.match(shell, /MorroviaFormDialog[\s\S]*EasyTField/);
  assert.match(shell, /Array\.from\(normalizedTitle\)\.length > 80/);
  assert.match(shell, /renameTripIdentity\(current, normalizedTitle\)/);
  assert.doesNotMatch(shell, /dangerouslySetInnerHTML/);
  assert.match(dialog, /aria-labelledby=\{titleId\}/);
  assert.match(dialog, /aria-describedby=\{detailId\}/);
  assert.match(dialog, /onCancel=\{\(event\) => \{ event\.preventDefault\(\); onCancel\(\); \}\}/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus\(\)/);
});

test("rename persistence reuses the guest recovery and authenticated CAS owner", () => {
  const shell = read("components/easyt/trip-shell-client.tsx");
  const persistence = read("components/easyt/use-trip-mutation-persistence.ts");
  const storage = read("lib/easyt/storage.ts");
  assert.match(shell, /TripShellCanonicalMutationProvider[\s\S]*useTripMutationPersistence\(trip, true\)/);
  assert.match(shell, /TripShellIdentityAndActions[\s\S]*useTripShellMutation\(\)/);
  assert.match(persistence, /saveTripRecovery\(next/);
  assert.match(persistence, /queueRef\.current!\.enqueue\(next, recovery\.handle\)/);
  assert.match(storage, /customTitle: brief\.customTitle/);
});

test("Storybook covers generated, custom, Unicode, long, mobile and dialog title states", () => {
  const shellStories = read("components/easyt/trip-shell.stories.tsx");
  const feedbackStories = read("components/easyt/morrovia-feedback.stories.tsx");
  for (const story of ["GeneratedOneCountry", "GeneratedTwoCountries", "GeneratedLongMultiCountry", "CustomUnicodeTitle", "LongCustomTitle", "Mobile390LongGeneratedTitle"]) assert.match(shellStories, new RegExp(`export const ${story}`));
  for (const story of ["RenameTripUnicode", "Mobile390RenameTrip"]) assert.match(feedbackStories, new RegExp(`export const ${story}`));
});
