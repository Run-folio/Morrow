import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { morroviaLegalIdentity } from "../lib/morrovia-legal-identity.ts";

test("the canonical legal identity contains verified values and omits unknown registration facts", () => {
  assert.deepEqual(morroviaLegalIdentity, {
    productName: "Morrovia",
    legalOperator: "Shaun Whiting Limited",
    tradingName: "Morrovia",
    registrationJurisdiction: null,
    companyNumber: null,
    registeredOffice: null,
    supportContact: "sw@shaunwhiting.com",
    privacyContact: "sw@shaunwhiting.com",
    copyrightYear: 2026,
  });
});

test("public identity and contact surfaces use the canonical owner", () => {
  const footer = readFileSync("components/morrovia-footer.tsx", "utf8");
  const privacy = readFileSync("app/journey/privacy/privacy-notice.tsx", "utf8");
  const help = readFileSync("app/journey/help/help-client.tsx", "utf8");

  assert.match(footer, /morroviaLegalIdentity\.legalOperator/);
  assert.doesNotMatch(footer, /Morrovia Ltd/);
  assert.match(privacy, /morroviaLegalIdentity\.privacyContact/);
  assert.match(help, /morroviaLegalIdentity\.supportContact/);
  assert.equal([footer, privacy, help].some((source) => source.includes("sw@shaunwhiting.com")), false);
});

test("footer legal links target existing routes and unavailable legal routes remain non-links", () => {
  const footer = readFileSync("components/morrovia-footer.tsx", "utf8");
  for (const route of ["about", "help", "affiliate-disclosure", "privacy", "cookies"]) {
    assert.equal(existsSync(`app/journey/${route}/page.tsx`), true, `${route} route should exist`);
    assert.match(footer, new RegExp(`href=\"/journey/${route}`));
  }
  assert.equal(existsSync("app/journey/terms/page.tsx"), false);
  assert.doesNotMatch(footer, /href="\/journey\/terms/);
});
