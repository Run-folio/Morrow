import assert from "node:assert/strict";
import test from "node:test";

import { buildTripReadiness, defaultTravelReadinessProfile } from "../lib/easyt/travel-readiness.ts";

test("builds a privacy-safe international trip readiness checklist", () => {
  const cards = buildTripReadiness({
    countries: ["Japan", "Thailand"],
    profile: { nationalities: ["United Kingdom"], residenceCountry: "United Kingdom", passportExpiryMonth: "2028-11" },
    sailyHref: "https://example.test/saily",
  });
  assert.deepEqual(cards.map((card) => card.id), ["entry", "passport", "esim", "insurance", "driving"]);
  assert.equal(cards.find((card) => card.id === "entry")?.href, "https://www.gov.uk/foreign-travel-advice");
  assert.equal(cards.find((card) => card.id === "esim")?.partner, "saily");
  assert.match(cards.find((card) => card.id === "passport")?.note ?? "", /Never add a passport number/i);
});

test("adds neutral mainland China connectivity guidance without promoting a VPN", () => {
  const cards = buildTripReadiness({ countries: ["China"], profile: defaultTravelReadinessProfile });
  const chinaCard = cards.find((card) => card.id === "china-internet");
  assert.ok(chinaCard);
  assert.equal(chinaCard?.href, undefined);
  assert.doesNotMatch(`${chinaCard?.title} ${chinaCard?.detail}`, /NordVPN/i);
});
