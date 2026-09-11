import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import {
  CONTACT_MESSAGE_MAX_LENGTH,
  contactDelivery,
  contactEmail,
  contactTopic,
  parseContactMessage,
} from "../lib/easyt/contact-message.ts";
import { createContactRateLimiter } from "../lib/easyt/contact-rate-limit.server.ts";

const read = (path: string) => readFileSync(path, "utf8");

test("contact validation requires bounded name, email and message fields", () => {
  const empty = parseContactMessage({});
  assert.deepEqual(Object.keys(empty.errors).sort(), ["email", "message", "name"]);

  const invalid = parseContactMessage({ name: "A", email: "not-an-email", message: "too short", website: "", topic: "general" });
  assert.match(invalid.errors.name ?? "", /at least 2/);
  assert.match(invalid.errors.email ?? "", /valid email/);
  assert.match(invalid.errors.message ?? "", /at least 20/);

  const oversized = parseContactMessage({ name: "N".repeat(101), email: "a@example.com", message: "M".repeat(CONTACT_MESSAGE_MAX_LENGTH + 1) });
  assert.match(oversized.errors.name ?? "", /100/);
  assert.match(oversized.errors.message ?? "", /4,000/);
});

test("contact input is normalised and cannot inject a subject or reply address", () => {
  const parsed = parseContactMessage({
    name: "  Alex\u0000  Traveller  ",
    email: " ALEX@EXAMPLE.COM ",
    message: "Hello there.\r\nI need help with my route.\u0007",
    topic: "privacy\r\nBcc: attacker@example.com",
    website: "",
  });
  assert.deepEqual(parsed.errors, {});
  assert.equal(parsed.input.name, "Alex Traveller");
  assert.equal(parsed.input.email, "alex@example.com");
  assert.equal(parsed.input.topic, "general");
  assert.doesNotMatch(parsed.input.message, /\r|\u0007/);
  const email = contactEmail(parsed.input);
  assert.equal(email.subject, "Morrovia contact: General enquiry");
  assert.match(email.text, /Reply email: alex@example\.com/);
  assert.deepEqual(contactDelivery(parsed.input, "private@example.test"), {
    to: "private@example.test",
    replyTo: "alex@example.com",
    recordEvent: false,
    ...email,
  });
});

test("honeypot submissions are rejected before delivery", () => {
  const parsed = parseContactMessage({ name: "Alex", email: "alex@example.com", message: "Please help with this journey.", website: "https://spam.example" });
  assert.equal(parsed.spam, true);
});

test("contact rate limiting is bounded per requester and resets after the window", () => {
  const allows = createContactRateLimiter();
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(allows("203.0.113.8", 1_000), true);
  assert.equal(allows("203.0.113.8", 1_000), false);
  assert.equal(allows("198.51.100.4", 1_000), true);
  assert.equal(allows("203.0.113.8", 1_000 + 10 * 60 * 1_000), true);
});

test("contact is a public, canonical form route with resilient client states", () => {
  const page = read("app/journey/contact/page.tsx");
  const form = read("app/journey/contact/contact-form.tsx");
  const api = read("app/api/easyt/contact/route.ts");
  const email = read("lib/easyt/email.ts");
  assert.equal(existsSync("app/journey/contact/page.tsx"), true);
  assert.match(page, /EasyTNavigation/);
  assert.match(form, /EasyTField/);
  assert.match(form, /EasyTTextArea/);
  assert.match(form, /MorroviaStatusBanner/);
  assert.match(form, /submittingRef/);
  assert.match(form, /Your message is still here/);
  assert.match(form, /setMessage\(""\)/);
  assert.match(api, /CONTACT_TO_EMAIL/);
  assert.match(api, /contactDelivery\(parsed\.input, recipient\)/);
  assert.match(api, /contactRateLimitAllows/);
  assert.match(api, /parsed\.spam/);
  assert.match(email, /reply_to/);
  assert.match(email, /escapeHtml\(email\.text\)/);
});

test("public Morrovia contact surfaces do not expose a mailbox or destination config", () => {
  const sources = [
    "components/morrovia-footer.tsx",
    "app/journey/help/help-client.tsx",
    "app/journey/privacy/privacy-notice.tsx",
    "app/journey/terms/page.tsx",
    "lib/morrovia-legal-identity.ts",
    "app/journey/contact/contact-form.tsx",
  ].map(read).join("\n");
  assert.doesNotMatch(sources, /mailto:|sw@shaunwhiting\.com|CONTACT_TO_EMAIL/);
  assert.match(read("components/morrovia-footer.tsx"), /href="\/journey\/contact"/);
  assert.match(read("app/journey/help/help-client.tsx"), /\/journey\/contact\?topic=support/);
  assert.equal(contactTopic("privacy"), "privacy");
  assert.equal(contactTopic("unknown"), "general");
});
