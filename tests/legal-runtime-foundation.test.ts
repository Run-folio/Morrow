import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { morroviaLegalIdentity } from "../lib/morrovia-legal-identity.ts";

test("the canonical legal identity contains verified values and omits unknown registration facts", () => {
  assert.deepEqual(morroviaLegalIdentity, {
    productName: "Morrovia",
    legalOperator: "Shaun Whiting Limited",
    tradingName: "Morrovia",
    operatorTradingAs: "Shaun Whiting Limited, trading as Morrovia",
    registrationJurisdiction: null,
    companyNumber: null,
    registeredOffice: null,
    generalContact: "sw@shaunwhiting.com",
    supportContact: "sw@shaunwhiting.com",
    privacyContact: "sw@shaunwhiting.com",
    copyrightYear: 2026,
  });
});

test("public identity and contact surfaces use the canonical owner", () => {
  const footer = readFileSync("components/morrovia-footer.tsx", "utf8");
  const privacy = readFileSync("app/journey/privacy/privacy-notice.tsx", "utf8");
  const help = readFileSync("app/journey/help/help-client.tsx", "utf8");
  const cookies = readFileSync("app/journey/cookies/page.tsx", "utf8");
  const affiliate = readFileSync("app/journey/affiliate-disclosure/page.tsx", "utf8");
  const terms = readFileSync("app/journey/terms/page.tsx", "utf8");
  const login = readFileSync("app/journey/login/login-form.tsx", "utf8");

  assert.match(footer, /morroviaLegalIdentity\.legalOperator/);
  assert.match(footer, /morroviaLegalIdentity\.generalContact/);
  assert.doesNotMatch(footer, /Morrovia Ltd/);
  assert.match(privacy, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(privacy, /morroviaLegalIdentity\.privacyContact/);
  assert.match(help, /morroviaLegalIdentity\.supportContact/);
  assert.match(cookies, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(affiliate, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(terms, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(terms, /morroviaLegalIdentity\.supportContact/);
  assert.match(login, /href="\/journey\/privacy"/);
  assert.equal([footer, privacy, help, cookies, affiliate, terms, login].some((source) => source.includes("sw@shaunwhiting.com")), false);
});

test("footer legal links target existing routes", () => {
  const footer = readFileSync("components/morrovia-footer.tsx", "utf8");
  for (const route of ["about", "help", "affiliate-disclosure", "terms", "privacy", "cookies"]) {
    assert.equal(existsSync(`app/journey/${route}/page.tsx`), true, `${route} route should exist`);
    assert.match(footer, new RegExp(`href=\"/journey/${route}`));
  }
});

function productionSources(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name);
    if (entry.isDirectory()) return productionSources(path);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

test("the verified operator literal has one production owner and stale company names are absent", () => {
  const files = [
    ...productionSources("app/journey"),
    ...productionSources("components"),
    ...productionSources("lib"),
  ];
  const operatorOwners = files.filter((path) => readFileSync(path, "utf8").includes("Shaun Whiting Limited"));
  const staleOwners = files.filter((path) => /Morrovia Ltd\.?/i.test(readFileSync(path, "utf8")));

  assert.deepEqual(operatorOwners, ["lib/morrovia-legal-identity.ts"]);
  assert.deepEqual(staleOwners, []);
});

test("public legal and contact pages are discoverable without dead routes", () => {
  const sitemap = readFileSync("app/sitemap.ts", "utf8");
  for (const route of ["about", "help", "privacy", "cookies", "affiliate-disclosure", "terms"]) {
    assert.match(sitemap, new RegExp(`/journey/${route}`));
    assert.equal(existsSync(`app/journey/${route}/page.tsx`), true);
  }
  assert.match(morroviaLegalIdentity.generalContact, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  assert.match(morroviaLegalIdentity.supportContact, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  assert.match(morroviaLegalIdentity.privacyContact, /^[^\s@]+@[^\s@]+\.[^\s@]+$/);
});
