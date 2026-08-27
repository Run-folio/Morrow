import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("the homepage hero keeps its prompt and illustrated route together", () => {
  const hero = readFileSync(new URL("../app/journey/home/home-hero-tools.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/journey/home/home.module.css", import.meta.url), "utf8");

  const prompt = hero.indexOf("<HomeTripStarter />");
  const route = hero.indexOf("<div className={styles.heroRoute}");

  assert.notEqual(prompt, -1, "the homepage prompt should remain in the hero");
  assert.ok(route > prompt, "the route preview should render alongside the prompt, not replace it");
  assert.match(hero, /southeast-asia-route-hero-v3\.png/,
    "the approved four-stop watercolor artwork should remain visible");
  assert.match(hero, /text\.bangkok[\s\S]*text\.siemReap[\s\S]*text\.phnomPenh[\s\S]*text\.hoChiMinh/,
    "the route summary should keep all four stops in order");
  assert.match(hero, /text\.totalNights[\s\S]*text\.transfers[\s\S]*text\.countries[\s\S]*text\.stops/,
    "the practical route totals should remain attached to the illustration");

  assert.match(styles, /\.hero\{display:grid;grid-template-columns:minmax\(500px,37fr\) minmax\(0,63fr\)/,
    "wide screens should retain the two-sided hero hierarchy");
  assert.match(styles, /@media\(max-width:1100px\)[\s\S]*\.hero\{grid-template-columns:1fr/,
    "narrow screens should stack both hero sides instead of hiding the route");
  assert.match(styles, /@media\(max-width:560px\)[\s\S]*\.heroRouteStrip\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    "the four-stop summary should remain readable on phones");
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
