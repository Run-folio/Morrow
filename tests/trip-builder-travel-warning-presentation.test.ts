import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../app/journey/new/trip-builder.tsx", import.meta.url), "utf8");

test("Builder consumes the canonical consequence rule while keeping factual transfer duration visible", () => {
  assert.match(source, /travelStayConsequence\(\{/);
  assert.match(source, /durationLabel\(transferMinutes\)/);
  assert.match(source, /Travel leaves less than a day/);
  assert.match(source, /Most of this stop would be spent travelling/);
  assert.doesNotMatch(source, /Long journey to/);
});
