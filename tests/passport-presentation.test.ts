import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { passportPresentationFor } from "../lib/easyt/passport-presentation.ts";
import { touristEntryRequirementFor } from "../lib/easyt/visa-requirements.ts";

test("snapshot-only Passport Index rows need confirmation while preserving provenance and reminders", () => {
  const requirement = touristEntryRequirementFor("United Kingdom", "Guatemala", "en");
  const presentation = passportPresentationFor({
    requirement,
    language: "en",
    sourceCoverage: "official",
    passportExpiryMonth: "2031-11",
  });

  assert.equal(presentation.verification, "needs-confirmation");
  assert.equal(presentation.informationState, "stale");
  assert.equal(presentation.source.official, true);
  assert.equal(presentation.source.label, requirement.sourceLabel);
  assert.equal(presentation.freshness, requirement.dataUpdatedAt);
  assert.match(presentation.passportValidityContext, /saved profile has expiry month 2031-11/i);
  assert.match(presentation.passportValidityContext, /confirm the required validity/i);
});

test("unknown combinations stay unknown and never acquire fabricated freshness or passport rules", () => {
  const requirement = touristEntryRequirementFor("United Kingdom", "Atlantis", "en");
  const presentation = passportPresentationFor({ requirement, language: "en", sourceCoverage: "needs-source" });

  assert.equal(requirement.status, "not-verified");
  assert.match(requirement.visaAnswer, /information unavailable/i);
  assert.equal(presentation.verification, "needs-confirmation");
  assert.equal(presentation.informationState, "unsupported");
  assert.equal(presentation.freshness, null);
  assert.equal(presentation.source.official, false);
  assert.equal(presentation.passportValidityContext, "");
  assert.equal(presentation.scopeContext, "");
});

test("Spanish presentation keeps saved profile context advisory", () => {
  const requirement = touristEntryRequirementFor("Canada", "Japan", "es");
  const presentation = passportPresentationFor({ requirement, language: "es", passportExpiryMonth: "2029-04" });
  assert.match(presentation.passportValidityContext, /2029-04/);
  assert.match(presentation.passportValidityContext, /Confirma/i);
  assert.match(presentation.scopeContext, /pasaporte ordinario/i);
});

test("stale intelligence remains distinct from unsupported coverage and provider failure", () => {
  const known = touristEntryRequirementFor("United Kingdom", "Japan", "en");
  const presentation = passportPresentationFor({ requirement: { ...known, informationState: "stale" }, language: "en" });

  assert.equal(presentation.informationState, "stale");
  assert.equal(presentation.verification, "needs-confirmation");
  assert.equal(presentation.freshness, known.dataUpdatedAt);
  assert.notEqual(presentation.passportValidityContext, "");
});

test("Passport intro promises source verification rather than a specific entry classification", () => {
  const client = readFileSync(new URL("../app/journey/passport/passport-destination-client.tsx", import.meta.url), "utf8");
  assert.match(client, /intro: "Choose your passport and destination to see what needs confirmation and open the official source\."/);
  assert.match(client, /intro: "Elige tu pasaporte y destino para ver qué debes confirmar y abrir la fuente oficial\."/);
  assert.doesNotMatch(client, /intro: "(?:See the tourist-entry position|Consulta la posición de entrada turística)/);
});
