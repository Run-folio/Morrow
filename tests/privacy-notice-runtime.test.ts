import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const privacy = source("app/journey/privacy/privacy-notice.tsx");

test("privacy notice is controller-owned, deep-linkable and has an executable rights path", () => {
  assert.match(privacy, /morroviaLegalIdentity\.operatorTradingAs/);
  assert.match(privacy, /morroviaLegalIdentity\.privacyContact/);
  for (const id of ["data-we-use", "personalisation", "ai-and-speech", "analytics-settings", "providers-and-transfers", "retention", "your-rights"]) {
    assert.match(privacy, new RegExp(`id=\\"${id}\\"`));
  }
  assert.match(privacy, /Morrovia data rights request/);
  assert.match(privacy, /mailto:/);
  assert.match(privacy, /ico\.org\.uk\/make-a-complaint\/data-protection-complaints/);
  assert.match(privacy, /does not currently provide a complete automated account export or self-service account deletion tool/);
  assert.match(privacy, /A trip PDF is not a full account-data export/);
});

test("privacy notice covers the actual trip, account, profile and browser data boundaries", () => {
  for (const fact of [
    "Account and authentication",
    "free-text prompts",
    "structured intent",
    "traveller count",
    "custom activities",
    "Neon Postgres",
    "Guest drafts and recovery state",
    "passport-expiry month",
    "Feedback, sharing and email",
  ]) assert.match(privacy, new RegExp(fact));
  assert.match(privacy, /soft-deletes a trip from normal account views/);
  assert.match(privacy, /fixed deletion periods are not yet implemented/);
  assert.match(privacy, /Transactional email events are keyed by recipient email and are not currently removed/);
});

test("personalisation copy matches profile seeding and trip-level ranking behaviour", () => {
  assert.match(privacy, /Interests and preferences supplied for a trip may influence route scoring, night allocation, nearby suggestions, activities and recommendation ranking/);
  assert.match(privacy, /Explicit profile defaults may seed an untouched future trip/);
  assert.match(privacy, /Changing interests on one trip does not silently rewrite your permanent profile/);
  assert.match(privacy, /Edit or remove saved defaults in Profile/);

  const profile = source("lib/easyt/travel-profile.ts");
  assert.match(profile, /Profile defaults seed an untouched new trip; they never overwrite edits/);
  assert.doesNotMatch(source("app/journey/new/trip-builder.tsx"), /setTravelProfile\([^)]*preferences\.interests/);
});

test("AI and speech copy states the real provider boundaries and qualified retention", () => {
  assert.match(privacy, /server-side OpenAI Responses API/);
  assert.match(privacy, /up to 600 characters/);
  assert.match(privacy, /question, up to 500 characters/);
  assert.match(privacy, /store:false, but that setting does not prove that provider retention is zero/);
  assert.match(privacy, /SpeechRecognition or webkitSpeechRecognition/);
  assert.match(privacy, /cannot prove that speech audio stays on-device/);
  assert.match(privacy, /does not submit automatically/);
});

test("optional analytics and affiliate attribution remain distinct from necessary technology", () => {
  assert.match(privacy, /Necessary session and security cookies/);
  assert.match(privacy, /PostHog and Google Analytics/);
  assert.match(privacy, /Omio Impact/);
  assert.match(privacy, /Microsoft Clarity is disabled and is not active tracking/);
  assert.match(privacy, /Rejecting optional technology does not disable core planning or account functions/);
  assert.match(privacy, /\/journey\/cookies#cookie-settings/);
});

test("booking import copy describes deliberate forwarding, deterministic review and no inbox scan", () => {
  assert.match(privacy, /remains unavailable unless the server-side activation gates are configured/);
  assert.match(privacy, /Resend receives that message/);
  assert.match(privacy, /deterministically extracts a booking candidate for your review/);
  assert.match(privacy, /Nothing is applied to a trip until an authenticated traveller confirms it/);
  assert.match(privacy, /does not intentionally copy the raw subject, body, HTML, headers or attachment content/);
  assert.match(privacy, /does not connect to or scan Gmail, Outlook or another mailbox/);
});

test("provider and transfer claims include configured searches without inventing safeguards", () => {
  for (const provider of ["Neon", "Google Places", "Resend", "OpenAI", "PostHog", "Nominatim", "Overpass", "Photon", "CARTO", "Wikipedia", "Wikimedia", "Unsplash", "Booking.com Demand"]) {
    assert.match(privacy, new RegExp(provider.replace(".", "\\.")));
  }
  assert.match(privacy, /repository does not prove each processing location, transfer mechanism or contractual safeguard/);
  assert.match(privacy, /approved retention schedule/);
  assert.doesNotMatch(privacy, /GDPR compliant/i);
});

test("signup agrees to published Terms and acknowledges Privacy without treating the notice as consent", () => {
  const login = source("app/journey/login/login-form.tsx");
  assert.match(login, /By creating an account, you agree to the/);
  assert.match(login, /href="\/journey\/terms">Terms of Use/);
  assert.match(login, /and acknowledge the/);
  assert.match(login, /href="\/journey\/privacy"/);
  assert.doesNotMatch(login, /consent to (?:the )?Privacy|agree to (?:the )?Privacy/i);
});

test("privacy-sensitive API failures log bounded categories instead of raw error objects", () => {
  const feedback = source("app/api/easyt/feedback/route.ts");
  const gift = source("app/api/easyt/trips/[tripId]/gift/route.ts");
  const discovery = source("app/api/journey-discover/route.ts");
  for (const api of [feedback, gift, discovery]) {
    const log = api.match(/console\.error\([\s\S]*?\);/)?.[0] ?? "";
    assert.match(log, /errorName/);
    assert.doesNotMatch(log, /,\s*error\s*\)/);
  }
  const email = source("lib/easyt/email.ts");
  assert.match(email, /Email provider rejected request \(\$\{response\.status\}\)/);
  assert.doesNotMatch(email, /response\.text\(\)/);
});

test("privacy copy and signup contain no em dash regressions", () => {
  assert.doesNotMatch(privacy, /—/);
  assert.doesNotMatch(source("app/journey/login/login-form.tsx"), /—/);
});

test("engineering audit records what, purpose, storage, recipient, retention, basis, control and transfer evidence", () => {
  const audit = source("docs/legal-runtime-audit.md");
  assert.match(audit, /## Privacy data-flow matrix for #35/);
  assert.match(audit, /\| What \| Why \| Where stored \| Recipient \| Retention proved in code \| Basis candidate \| User control \| UK\/EEA transfer evidence \|/);
});
