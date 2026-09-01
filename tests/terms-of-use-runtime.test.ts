import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const terms = source("app/journey/terms/page.tsx");

test("Terms are public, versioned and owned by the canonical contracting party", () => {
  assert.equal(existsSync("app/journey/terms/page.tsx"), true);
  assert.match(terms, /Effective 1 September 2026 · Version 1\.0/);
  assert.match(terms, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(terms, /is your contracting party/);
  assert.doesNotMatch(terms, /Morrovia Ltd/);
});

test("Terms describe the current software scope without claiming a travel-sale role", () => {
  for (const fact of [
    "travel-planning software",
    "deterministic planning checks",
    "AI-assisted recommendations",
    "does not currently sell flights, accommodation, activities",
    "take payment for them",
    "one combined price or checkout",
  ]) assert.match(terms, new RegExp(fact));
  assert.doesNotMatch(terms, /Morrovia is (?:an|the) (?:OTA|travel agent|travel merchant)/i);
});

test("travel facts and confidence states retain provider and official verification", () => {
  for (const fact of [
    "route will remain feasible",
    "Schedules, fares, inventory",
    "passports, visas, entry approval",
    "border conditions, weather, safety conditions",
    "booking provider, transport operator",
    "government or official authority",
    "Confidence, provenance, warning and unknown states",
  ]) assert.match(terms, new RegExp(fact));
});

test("external handoff is not represented as a Morrovia booking", () => {
  assert.match(terms, /A link is not a booking/);
  assert.match(terms, /does not complete a booking in Morrovia/);
  assert.match(terms, /Payment and booking take place with the named third party/);
  assert.match(terms, /provider's terms, privacy notice, cancellation and refund rules apply/);
  assert.match(terms, /may earn an affiliate commission where this is disclosed/);
  assert.match(terms, /does not become the travel merchant, organiser, retailer, agent or service provider merely because/);
});

test("AI wording preserves errors, verification and explicit review/apply authority", () => {
  assert.match(terms, /automated rules or AI systems/);
  assert.match(terms, /inaccurate, incomplete, outdated or unsuitable/);
  assert.match(terms, /do not replace provider or official verification/);
  assert.match(terms, /deterministic preview and requires you to review and apply it/);
  assert.match(terms, /does not claim that an autonomous agent books or changes travel for you/);
});

test("content, account, acceptable-use, IP and suspension terms are bounded", () => {
  assert.match(terms, /You retain your rights in trip prompts, notes, photos/);
  assert.match(terms, /non-exclusive, royalty-free licence/);
  assert.match(terms, /only as reasonably necessary to provide, secure and support/);
  assert.match(terms, /must be at least 18 years old/);
  assert.match(terms, /Morrovia and its licensors own the software/);
  assert.match(terms, /restrict or suspend access where reasonably necessary/);
  assert.match(terms, /Permanent termination will be proportionate/);
});

test("consumer liability wording preserves mandatory rights and avoids a blanket waiver", () => {
  assert.match(terms, /Nothing in these Terms excludes or limits liability where doing so would be unlawful/);
  assert.match(terms, /death or personal injury caused by negligence/);
  assert.match(terms, /fraud or fraudulent misrepresentation/);
  assert.match(terms, /statutory consumer rights/);
  assert.match(terms, /foreseeable result of its breach/);
  assert.match(terms, /reasonable care and skill/);
  assert.match(terms, /requires solicitor review before formal approval/);
  assert.doesNotMatch(terms, /as is|all liability|under no circumstances|sole risk/i);
});

test("complaints, governing law and related legal links remain executable", () => {
  assert.match(terms, /morroviaLegalIdentity\.supportContact/);
  assert.match(terms, /mailto:/);
  assert.match(terms, /laws of England and Wales/);
  assert.match(terms, /non-exclusive jurisdiction/);
  assert.match(terms, /mandatory protections/);
  for (const href of ["/journey/privacy", "/journey/cookies#cookie-settings", "/journey/affiliate-disclosure"]) {
    assert.match(terms, new RegExp(href.replace("/", "\\/")));
  }
  assert.match(terms, /have not received formal legal approval/);
});

test("signup, footer and sitemap expose durable Terms links", () => {
  const login = source("app/journey/login/login-form.tsx");
  const footer = source("components/morrovia-footer.tsx");
  const sitemap = source("app/sitemap.ts");
  assert.match(login, /By creating an account, you agree to the/);
  assert.match(login, /href="\/journey\/terms">Terms of Use/);
  assert.match(login, /and acknowledge the <a href="\/journey\/privacy">Privacy Notice/);
  assert.doesNotMatch(login, /consent to (?:the )?Privacy|agree to (?:the )?Privacy/i);
  assert.match(footer, /href="\/journey\/terms"/);
  assert.match(sitemap, /\/journey\/terms/);
});

test("the internal legal gate covers travel-commerce and subscription model changes", () => {
  const audit = source("docs/legal-runtime-audit.md");
  for (const trigger of [
    "takes or controls payment",
    "one Morrovia travel checkout",
    "combined, inclusive or total price",
    "traveller identity, contact or payment details are transferred",
    "travel merchant, organiser, retailer, agent or linked-travel-arrangement facilitator",
    "flight-inclusive sales",
    "paid Morrovia software subscription",
    "Package Travel and Linked Travel Arrangements Regulations 2018",
  ]) assert.match(audit, new RegExp(trigger));
  assert.match(audit, /not a conclusion that the present or future model falls outside regulation/);
});

test("Terms and signup contain no em dash regressions", () => {
  assert.doesNotMatch(terms, /—/);
  assert.doesNotMatch(source("app/journey/login/login-form.tsx"), /—/);
});
