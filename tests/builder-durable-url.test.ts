import assert from "node:assert/strict";
import test from "node:test";

import { durableBuilderRecoveryUrl } from "../lib/easyt/builder-durable-url.ts";

test("published route identity is replaced by the durable trip recovery URL", () => {
  const result = durableBuilderRecoveryUrl(
    "https://morrovia.test/journey/new?inspire=morocco-rail&campaign=beta",
    "trip-published-edit",
  );

  assert.equal(result?.toString(), "https://morrovia.test/journey/new?campaign=beta&trip=trip-published-edit&recover=1");
});

test("homepage handoff identity is replaced without disturbing unrelated query context", () => {
  const result = durableBuilderRecoveryUrl(
    "https://morrovia.test/journey/new?homeDraft=1&view=brief",
    "trip-homepage-handoff",
  );

  assert.equal(result?.toString(), "https://morrovia.test/journey/new?view=brief&trip=trip-homepage-handoff&recover=1");
});

test("canonical and direct Builder URLs are not repeatedly promoted", () => {
  assert.equal(durableBuilderRecoveryUrl(
    "https://morrovia.test/journey/new?trip=trip-existing&recover=1",
    "trip-existing",
  ), null);
  assert.equal(durableBuilderRecoveryUrl(
    "https://morrovia.test/journey/new?campaign=beta",
    "trip-direct",
  ), null);
});
