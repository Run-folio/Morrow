import assert from "node:assert/strict";
import test from "node:test";

import { touristEntryRequirementFor } from "../lib/easyt/visa-requirements.ts";

test("shows the reviewed UK to Greece tourist rule", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Greece");
  assert.equal(result.status, "visa-free");
  assert.match(result.visaAnswer, /Not required/);
  assert.match(result.permittedStay, /90 days in any 180-day period/);
  assert.match(result.sourceHref, /gov\.uk/);
});

test("uses free movement rather than a tourist visa for EU and EEA passports", () => {
  const result = touristEntryRequirementFor("Ireland", "Greece");
  assert.equal(result.status, "no-visa");
  assert.match(result.permittedStay, /3 months/);
});

test("does not guess unsupported passport and destination pairs", () => {
  const result = touristEntryRequirementFor("United Kingdom", "Thailand");
  assert.equal(result.status, "not-verified");
  assert.match(result.permittedStay, /official source/i);
});
