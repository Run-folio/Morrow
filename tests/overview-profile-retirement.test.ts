import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Overview never hydrates, writes or transmits a traveller profile, including on retry", () => {
  const hook = readFileSync("components/easyt/use-trip-prep-readiness.ts","utf8");
  assert.doesNotMatch(hook, /localStorage|travelReadinessStorageKey|initialProfile|residenceCountry|nationalities|passportExpiryMonth/);
  const request = hook.match(/fetch\("\/api\/journey-readiness"[\s\S]*?body: JSON.stringify\(\{([^}]+)\}\)/)?.[1];
  assert.ok(request);
  assert.doesNotMatch(request, /profile|\.\.\./i);
});
