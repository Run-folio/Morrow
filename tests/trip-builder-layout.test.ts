import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the shared Step 1 intro stays ahead of the fresh-trip prompt panel", () => {
  const builder = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/new/trip-builder.module.css", import.meta.url), "utf8");
  const intro = builder.indexOf('<header className={styles.stepHero}>');
  const freshPrompt = builder.indexOf("{!hasPromptContext && hydrated && <div className={`${styles.card} ${styles.tripBriefCard}`}");

  assert.notEqual(intro, -1, "Step 1 intro should remain in the shared builder stack");
  assert.notEqual(freshPrompt, -1, "fresh trips should retain the prompt panel");
  assert.ok(intro < freshPrompt, "Step 1 intro should precede the prompt panel in the shared render order");
  assert.doesNotMatch(styles, /\.stack\s*>\s*\.tripBriefCard\s*\{[^}]*\border\s*:/,
    "CSS must not move the prompt panel ahead of the shared Step 1 intro");

  assert.equal(builder.match(/STEP 1 OF 2/g)?.length, 1,
    "the English Step 1 lockup should render from one shared source");
  assert.equal(builder.match(/Tell us the shape/g)?.length, 1,
    "the Step 1 title should not be duplicated for fresh and contextual entry states");

  const homepageHandoffHydration = builder.slice(
    builder.indexOf('if (params.get("homeDraft") === "1")'),
    builder.indexOf("} else {\n          const seed ="),
  );
  assert.match(homepageHandoffHydration, /setHasPromptContext\(true\)/,
    "homepage handoff should reuse the shared prompt-context Step 1 layout");

  const returningDraftHydration = builder.slice(
    builder.indexOf("const applySaved ="),
    builder.indexOf("const hydrate ="),
  );
  assert.match(returningDraftHydration, /setHasPromptContext\(true\)/,
    "returning drafts should reuse the prompt-context Step 1 layout");

  const stepTwo = builder.indexOf("{step === 1 && (");
  assert.ok(stepTwo > freshPrompt, "Step 2 should remain a separate builder branch after Step 1");
  assert.equal(builder.match(/STEP 2 OF 2/g)?.length, 1,
    "the Step 2 title should remain unchanged and unique");
});
