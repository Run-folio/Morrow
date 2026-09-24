import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Builder's initial module graph keeps MapLibre behind a dynamic boundary", () => {
  const builder = read("app/journey/new/trip-builder.tsx");
  const steps = read("components/easyt/discovery-steps.tsx");
  assert.doesNotMatch(builder, /from ["']@\/components\/easyt\/discovery-map/);
  assert.match(steps, /import\("\.\/discovery-map"\)/);
  assert.doesNotMatch(steps, /from ["']\.\/discovery-map["']/);
});

test("Discovery imagery is lazy and modal marks first useful card timing", () => {
  assert.match(read("components/easyt/discovery-steps.tsx"), /loading="lazy" decoding="async"/);
  const modal = read("components/easyt/discovery-modal.tsx");
  assert.match(modal, /performance\.mark\(/);
  assert.match(modal, /performance\.measure\(/);
});
