import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("Viator Overview CTAs retain central link semantics and one nearby disclosure", () => {
  const prep = readFileSync("components/easyt/trip-preparation.tsx", "utf8");
  const booking = readFileSync("lib/easyt/booking-readiness.ts", "utf8");

  assert.match(booking, /activitiesUrl: "https:\/\/vi\.me\/IiuWB"/);
  assert.match(prep, /task\.action\?\.affiliate === true/);
  assert.match(prep, /target="_blank" rel=\{action\.affiliate \? "sponsored noopener noreferrer" : "noopener noreferrer"\}/);
  assert.match(prep, /partner: "viator",[\s\S]*placement: "overview_before_you_go",[\s\S]*tripId,[\s\S]*stopId: action\.stopId/);
  assert.equal((prep.match(/Partner link · Morrovia may earn a commission at no extra cost to you\./g) ?? []).length, 1);
  assert.match(prep, /showsAffiliateDisclosure \? <small className=\{styles\.affiliateDisclosure\}>\{affiliateDisclosure\}<\/small>/);
});
