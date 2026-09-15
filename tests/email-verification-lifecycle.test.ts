import assert from "node:assert/strict";
import test from "node:test";

import { memoryAdapter, type MemoryDB } from "better-auth/adapters/memory";
import { betterAuth } from "better-auth";

import { ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS } from "../lib/easyt/auth-email-flow.ts";

const BASE_URL = "http://localhost:3000";
const AUTH_SECRET = "test-only-better-auth-secret-that-is-long-enough";

function createVerificationHarness(expiresIn = 3_600) {
  const db: MemoryDB = { user: [], session: [], account: [], verification: [] };
  const verificationUrls: string[] = [];
  let rejectDelivery = false;
  const auth = betterAuth({
    appName: "Morrovia",
    baseURL: BASE_URL,
    secret: AUTH_SECRET,
    database: memoryAdapter(db),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      requireEmailVerification: true,
    },
    emailVerification: {
      ...ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS,
      autoSignInAfterVerification: true,
      expiresIn,
      sendVerificationEmail: async ({ url }) => {
        verificationUrls.push(url);
        if (rejectDelivery) throw new Error("bounded provider failure");
      },
    },
    trustedOrigins: [BASE_URL],
    rateLimit: { enabled: false },
    logger: { level: "error", log() {} },
  });

  const post = (path: string, body: Record<string, unknown>) => auth.handler(new Request(`${BASE_URL}/api/auth${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE_URL },
    body: JSON.stringify(body),
  }));

  return {
    auth,
    db,
    post,
    verificationUrls,
    rejectDelivery(value: boolean) { rejectDelivery = value; },
  };
}

async function signUp(harness: ReturnType<typeof createVerificationHarness>, email = "traveller@example.com") {
  return harness.post("/sign-up/email", {
    callbackURL: "/journey/dashboard",
    email,
    name: "Morrovia Traveller",
    password: "safe-password-123",
  });
}

async function requestVerification(harness: ReturnType<typeof createVerificationHarness>, email = "traveller@example.com") {
  return harness.post("/send-verification-email", {
    callbackURL: "/journey/dashboard",
    email,
  });
}

test("new signup creates one unverified account and explicit send acknowledges the provider", async () => {
  const harness = createVerificationHarness();
  const signup = await signUp(harness);
  assert.equal(signup.status, 200);
  assert.equal(harness.db.user.length, 1);
  assert.equal(harness.db.user[0].emailVerified, false);
  assert.equal(harness.verificationUrls.length, 0);

  const sent = await requestVerification(harness);
  assert.equal(sent.status, 200);
  assert.equal(harness.verificationUrls.length, 1);
  const url = new URL(harness.verificationUrls[0]);
  assert.equal(url.origin, BASE_URL);
  assert.equal(url.pathname, "/api/auth/verify-email");
  assert.equal(url.searchParams.get("callbackURL"), "/journey/dashboard");
  assert.ok(url.searchParams.get("token"));
});

test("provider failure is visible while the created account remains recoverable", async () => {
  const harness = createVerificationHarness();
  assert.equal((await signUp(harness)).status, 200);
  harness.rejectDelivery(true);
  const originalConsoleError = console.error;
  const logs: string[] = [];
  console.error = (...values: unknown[]) => { logs.push(values.map(String).join(" ")); };
  const failed = await requestVerification(harness).finally(() => { console.error = originalConsoleError; });
  assert.equal(failed.status >= 400, true);
  assert.equal(harness.db.user.length, 1);
  assert.equal(harness.db.user[0].emailVerified, false);
  assert.equal(harness.verificationUrls.length, 1);

  harness.rejectDelivery(false);
  const retried = await requestVerification(harness);
  assert.equal(retried.status, 200);
  assert.equal(harness.db.user.length, 1);
  assert.equal(harness.verificationUrls.length, 2);
  assert.doesNotMatch(logs.join("\n"), /token=/i);
});

test("repeat signup does not duplicate an unverified account and supports a safe new send", async () => {
  const harness = createVerificationHarness();
  assert.equal((await signUp(harness)).status, 200);
  assert.equal((await signUp(harness)).status, 200);
  assert.equal(harness.db.user.length, 1);
  assert.equal(harness.verificationUrls.length, 0);
  assert.equal((await requestVerification(harness)).status, 200);
  assert.equal(harness.verificationUrls.length, 1);
});

test("unverified sign-in fails closed without an unacknowledged automatic send", async () => {
  const harness = createVerificationHarness();
  assert.equal((await signUp(harness)).status, 200);
  const signIn = await harness.post("/sign-in/email", {
    callbackURL: "/journey/dashboard",
    email: "traveller@example.com",
    password: "safe-password-123",
  });
  assert.equal(signIn.status, 403);
  assert.equal(harness.verificationUrls.length, 0);
  assert.equal((await requestVerification(harness)).status, 200);
  assert.equal(harness.verificationUrls.length, 1);
});

test("valid verification changes only its account and repeated use is state-idempotent", async () => {
  const harness = createVerificationHarness();
  assert.equal((await signUp(harness, "first@example.com")).status, 200);
  assert.equal((await signUp(harness, "second@example.com")).status, 200);
  assert.equal((await requestVerification(harness, "first@example.com")).status, 200);

  const verify = await harness.auth.handler(new Request(harness.verificationUrls[0]));
  assert.equal(verify.status, 302);
  assert.equal(verify.headers.get("location"), "/journey/dashboard");
  assert.equal(harness.db.user.find((user) => user.email === "first@example.com")?.emailVerified, true);
  assert.equal(harness.db.user.find((user) => user.email === "second@example.com")?.emailVerified, false);

  const repeated = await harness.auth.handler(new Request(harness.verificationUrls[0]));
  assert.equal(repeated.status, 302);
  assert.equal(harness.db.user.filter((user) => user.emailVerified).length, 1);
});

test("invalid and expired verification tokens fail safely", async () => {
  const invalidHarness = createVerificationHarness();
  const invalid = await invalidHarness.auth.handler(new Request(`${BASE_URL}/api/auth/verify-email?token=not-a-token&callbackURL=%2Fjourney%2Fdashboard`));
  assert.equal(invalid.status, 302);
  assert.match(invalid.headers.get("location") ?? "", /error=invalid_token/i);

  const expiredHarness = createVerificationHarness(-1);
  assert.equal((await signUp(expiredHarness)).status, 200);
  assert.equal((await requestVerification(expiredHarness)).status, 200);
  const expired = await expiredHarness.auth.handler(new Request(expiredHarness.verificationUrls[0]));
  assert.equal(expired.status, 302);
  assert.match(expired.headers.get("location") ?? "", /error=token_expired/i);
  assert.equal(expiredHarness.db.user[0].emailVerified, false);
});
