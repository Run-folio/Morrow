import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getMorroviaApplicationUrl } from "../lib/easyt/auth-environment.ts";
import { deliverMorroviaEmail, MorroviaEmailDeliveryError } from "../lib/easyt/email-delivery.ts";
import { emailDeliveryDecision, isMorroviaEmailDeliveryConfigured, morroviaSender } from "../lib/easyt/email-policy.ts";
import {
  contactSupportEmail,
  passwordResetEmail,
  safeEmailActionUrl,
  tripGiftEmail,
  verificationEmail,
  type MorroviaEmail,
} from "../lib/easyt/email-template.ts";

const supportUrl = "https://morrovia.com/journey/contact?topic=support";
const deliveryEnvironment = {
  NODE_ENV: "development",
  EMAIL_DELIVERY_MODE: "allowlist",
  EMAIL_ALLOWED_RECIPIENTS: "traveller@example.test,support@example.test",
  RESEND_API_KEY: "test-provider-key",
  EMAIL_FROM: "Legacy Robot <mail@morrovia.test>",
};

function messages() {
  return [
    verificationEmail("https://morrovia.com/api/auth/verify-email?token=secret-token", supportUrl),
    passwordResetEmail("https://morrovia.com/journey/reset-password?token=secret-token", supportUrl),
    tripGiftEmail({
      giftId: "gift-123",
      inviterName: "Shaun",
      title: "Japan by rail",
      note: "I kept Kyoto unhurried.",
      url: "https://morrovia.com/journey/gift/secret-token",
      supportUrl,
    }),
    contactSupportEmail({
      recipient: "support@example.test",
      name: "Alex",
      replyEmail: "alex@example.test",
      topicLabel: "Support request",
      message: "Please help with this route.",
    }),
  ];
}

test("all repository-owned templates render Morrovia-branded HTML and meaningful plaintext", () => {
  for (const email of messages()) {
    const rendered = [email.subject, email.preheader, email.html, email.text].join("\n");
    assert.match(rendered, /Morrovia/);
    assert.doesNotMatch(rendered, /EasyT|easyt|Morrow/);
    assert.match(email.html, /<!doctype html>/i);
    assert.match(email.html, /role="presentation"/);
    assert.match(email.html, /@media only screen and \(max-width:600px\)/);
    assert.match(email.html, /prefers-color-scheme:dark/);
    assert.match(email.text, /Morrovia · Complex trips, made simple\./);
    assert.ok(email.preheader.length > 10);
    assert.ok(email.idempotencyKey.length <= 256);
    assert.doesNotMatch(email.idempotencyKey, /secret-token/);
  }
});

test("transactional subjects are concise and trip invitations keep private details out of the subject", () => {
  const gift = tripGiftEmail({
    giftId: "gift-private",
    inviterName: "Shaun",
    title: "Private anniversary route",
    url: "https://morrovia.com/journey/gift/token",
  });
  assert.equal(gift.subject, "You’ve been invited to a trip");
  assert.doesNotMatch(gift.subject, /Shaun|anniversary/);
  assert.match(gift.html, /Shaun invited you to a trip/);
  assert.match(gift.text, /Trip: Private anniversary route/);
});

test("traveller-authored content is escaped while Unicode and long content remain intact", () => {
  const attack = `<svg onload=alert(1)><script>alert("x")</script> & '`;
  const title = `京都 ${"旅".repeat(500)} ${attack}`;
  const gift = tripGiftEmail({
    giftId: "gift-unicode",
    inviterName: attack,
    title,
    note: attack,
    url: "https://morrovia.com/journey/gift/token?a=1&b=2",
  });
  assert.doesNotMatch(gift.html, /<svg|<script/);
  assert.match(gift.html, /&lt;svg onload=alert\(1\)&gt;/);
  assert.match(gift.html, /京都/);
  assert.match(gift.text, /<svg onload=alert\(1\)>/);
  assert.match(gift.html, /a=1&amp;b=2/);
  assert.doesNotMatch(gift.html, /<img/);
});

test("action URLs reject unsafe schemes and preserve secure token links exactly in plaintext", () => {
  assert.throws(() => safeEmailActionUrl("javascript:alert(1)"), /absolute HTTP\(S\)/);
  assert.throws(() => safeEmailActionUrl("https://user:secret@example.com/path"), /absolute HTTP\(S\)/);
  const url = "https://morrovia.com/journey/reset-password?token=a%2Bb%2Fc&next=%2Fjourney";
  const email = passwordResetEmail(url);
  assert.match(email.text, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("canonical application links use configured current origins and reject cross-origin input", () => {
  const environment = { NEXT_PUBLIC_APP_URL: "https://staging.morrovia.com", BETTER_AUTH_URL: "https://staging.morrovia.com" };
  assert.equal(getMorroviaApplicationUrl("/journey/gift/a%2Fb", environment), "https://staging.morrovia.com/journey/gift/a%2Fb");
  assert.throws(() => getMorroviaApplicationUrl("https://attacker.test", environment), /application path/);
  assert.throws(() => getMorroviaApplicationUrl("//attacker.test", environment), /application path/);
});

test("email delivery is disabled in tests and non-production by default, with an exact staging allowlist", () => {
  assert.equal(emailDeliveryDecision({ NODE_ENV: "test", EMAIL_DELIVERY_MODE: "live" }, "traveller@example.test").allowed, false);
  assert.equal(emailDeliveryDecision({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://staging.morrovia.com" }, "traveller@example.test").allowed, false);
  assert.equal(emailDeliveryDecision(deliveryEnvironment, "traveller@example.test").allowed, true);
  assert.deepEqual(emailDeliveryDecision(deliveryEnvironment, "other@example.test"), { allowed: false, mode: "allowlist", reason: "recipient_not_allowed" });
  assert.equal(isMorroviaEmailDeliveryConfigured(deliveryEnvironment), true);
  assert.equal(isMorroviaEmailDeliveryConfigured({ ...deliveryEnvironment, EMAIL_ALLOWED_RECIPIENTS: "" }), false);
  assert.deepEqual(emailDeliveryDecision({ NODE_ENV: "production", NEXT_PUBLIC_APP_URL: "https://morrovia.com", CONTEXT: "production" }, "traveller@example.test"), { allowed: true, mode: "live" });
});

test("the provider boundary enforces the Morrovia sender, plaintext, reply-to and Resend idempotency header", async () => {
  const template = verificationEmail("https://morrovia.com/api/auth/verify-email?token=secret", supportUrl);
  const email: MorroviaEmail = { to: "Traveller@Example.Test", replyTo: "support@example.test", ...template };
  let request: { url: string; init?: RequestInit } | undefined;
  const result = await deliverMorroviaEmail(email, {
    environment: deliveryEnvironment,
    fetcher: (async (url: string | URL | Request, init?: RequestInit) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({ id: "provider-123" }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  assert.deepEqual(result, { id: "provider-123", deduplicated: false });
  assert.equal(request?.url, "https://api.resend.com/emails");
  const headers = request?.init?.headers as Record<string, string>;
  assert.equal(headers["Idempotency-Key"], template.idempotencyKey);
  const body = JSON.parse(String(request?.init?.body));
  assert.equal(body.from, "Morrovia <mail@morrovia.test>");
  assert.equal(body.to, "traveller@example.test");
  assert.equal(body.reply_to, "support@example.test");
  assert.equal(body.text, template.text);
  assert.equal(body.html, template.html);
  assert.doesNotMatch(JSON.stringify(body), /Legacy Robot/);
});

test("a durable duplicate reservation prevents a second provider request", async () => {
  const email: MorroviaEmail = { to: "traveller@example.test", ...verificationEmail("https://morrovia.com/verify?token=same") };
  let providerCalls = 0;
  const result = await deliverMorroviaEmail(email, {
    environment: deliveryEnvironment,
    fetcher: (async () => { providerCalls += 1; return new Response(null, { status: 500 }); }) as typeof fetch,
    reserveDelivery: async () => ({ eventId: "event-1", providerId: "provider-1", duplicate: true }),
  });
  assert.deepEqual(result, { id: "provider-1", deduplicated: true });
  assert.equal(providerCalls, 0);
});

test("provider failures expose only a bounded error code and categorical event detail", async () => {
  const email: MorroviaEmail = { to: "traveller@example.test", ...passwordResetEmail("https://morrovia.com/reset?token=private-token") };
  const finished: Array<Record<string, unknown>> = [];
  await assert.rejects(
    deliverMorroviaEmail(email, {
      environment: deliveryEnvironment,
      fetcher: (async () => new Response("provider secret response", { status: 503 })) as typeof fetch,
      reserveDelivery: async () => ({ eventId: "event-1", duplicate: false }),
      finishDelivery: async (input) => { finished.push(input); },
    }),
    (error: unknown) => error instanceof MorroviaEmailDeliveryError
      && error.code === "provider_rejected"
      && !error.message.includes("provider secret response")
      && !error.message.includes("private-token"),
  );
  assert.deepEqual(finished, [{ eventId: "event-1", status: "failed", errorMessage: "Email provider rejected request (503)" }]);
});

test("trip invitation and email-event persistence own retry idempotency without storing raw tokens", () => {
  const repository = readFileSync("lib/easyt/repository.ts", "utf8");
  const migration = readFileSync("db/migrations/0014_morrovia_email_idempotency.sql", "utf8");
  const route = readFileSync("app/api/easyt/trips/[tripId]/gift/route.ts", "utf8");
  const client = readFileSync("app/journey/dashboard/dashboard-client.tsx", "utf8");
  assert.match(repository, /on conflict \(idempotency_key\)[\s\S]*do nothing/);
  assert.match(repository, /event\.status === "failed"/);
  assert.match(repository, /createHmac\("sha256", secret!\)/);
  assert.match(repository, /on conflict \(token_hash\) do nothing/);
  assert.match(migration, /unique index[\s\S]*idempotency_key/);
  assert.match(route, /request\.headers\.get\("idempotency-key"\)/);
  assert.match(route, /recipientEmail: gift\.recipientEmail/);
  assert.match(client, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(repository, /idempotency_key[^\n]*token/i);
});

test("configured sender addresses cannot control the user-facing display name", () => {
  assert.equal(morroviaSender("noreply@morrovia.test"), "Morrovia <noreply@morrovia.test>");
  assert.equal(morroviaSender("Legacy System <noreply@morrovia.test>"), "Morrovia <noreply@morrovia.test>");
  assert.throws(() => morroviaSender("Morrovia <valid@example.test>\r\nBcc: attacker@example.test"), /invalid/);
});
