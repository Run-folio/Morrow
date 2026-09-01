import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage hero keeps one central prompt inside a blended four-destination frame", () => {
  const hero = readFileSync(new URL("../app/journey/home/home-hero-tools.tsx", import.meta.url), "utf8");
  const frame = readFileSync(new URL("../app/journey/home/home-journey-frame.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/home/home.module.css", import.meta.url), "utf8");

  const prompt = hero.indexOf("<HomeTripStarter />");

  assert.notEqual(prompt, -1, "the homepage prompt should remain in the hero");
  assert.doesNotMatch(hero, /styles\.heroRoute(?:Strip)?/,
    "the illustrative sample route should not compete with the primary trip prompt");
  assert.doesNotMatch(hero, /text\.(?:bangkok|siemReap|phnomPenh|hoChiMinh)/,
    "the removed sample route should not leave destination copy in the hero");
  assert.match(hero, /<HomeJourneyFrame \/>/,
    "the destination artwork should frame the existing planner");
  assert.match(frame, /homepage-frame\/japan\.webp[\s\S]*homepage-frame\/angkor\.webp[\s\S]*homepage-frame\/rome\.webp[\s\S]*homepage-frame\/sydney\.webp/,
    "all four approved destination scenes should be present");
  assert.match(frame, /<svg[\s\S]*journeyRoute/,
    "the scene frame should include its decorative route overlay");
  assert.match(frame, /aria-hidden="true"/,
    "decorative artwork should stay out of the accessibility tree");
  assert.match(styles, /\.heroCenter\{[^}]*justify-items:center/,
    "wide screens should keep the live planner centered in the composition");
  assert.match(styles, /\.journeySceneJapan\{[^}]*mask-image:radial-gradient/,
    "the destination scenes should dissolve into the page instead of reading as image tiles");
  assert.match(styles, /@media\(max-width:760px\)[\s\S]*\.journeySceneAngkor\{[^}]*display:block|@media\(max-width:760px\)[\s\S]*\.journeyScene\{display:block/,
    "all four destination scenes should remain part of the responsive composition");
});

test("homepage process-card artwork keeps the square triptych panels intact", () => {
  const proof = readFileSync(new URL("../app/journey/home/home-proof.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/home/home.module.css", import.meta.url), "utf8");
  const fidelity = readFileSync(new URL("../app/journey/home/home-fidelity.module.css", import.meta.url), "utf8");

  assert.match(proof, /styles\.proofArtwork/);
  assert.match(styles, /decision-triptych\.png/);
  assert.match(fidelity, /width: min\(100%, 362px\) !important/);
  assert.match(fidelity, /aspect-ratio: 1 !important/);
  assert.match(fidelity, /height: auto !important/);
  assert.match(fidelity, /background-size: 300% auto !important/);
  assert.doesNotMatch(fidelity, /background-size: 300% 100% !important/);
});
