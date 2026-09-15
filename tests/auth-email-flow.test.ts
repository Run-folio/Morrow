import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS,
  emailVerificationStatePath,
  requestAcknowledgedVerificationEmail,
  signInEmailHandoffPath,
  submitEmailSignIn,
  submitEmailSignUp,
} from "../lib/easyt/auth-email-flow.ts";

const callbackURL = "/journey/trip-123/overview?panel=save#account";

test("signup waits for the explicit verification send before reporting success", async () => {
  const calls: string[] = [];
  const result = await submitEmailSignUp({
    callbackURL,
    email: "Traveller@Example.com",
    emailVerificationRequired: true,
    name: "Traveller",
    password: "private-password",
    signUpEmail: async () => ({ data: { user: { email: "traveller@example.com" } } }),
    sendVerificationEmail: async ({ email }) => {
      calls.push(email);
      return { data: { status: true } };
    },
  });
  assert.deepEqual(result, { kind: "verification-sent", email: "traveller@example.com" });
  assert.deepEqual(calls, ["traveller@example.com"]);
});

test("signup provider failure remains recoverable and never reports sent", async () => {
  let attempts = 0;
  const failed = await submitEmailSignUp({
    callbackURL,
    email: "traveller@example.com",
    emailVerificationRequired: true,
    name: "Traveller",
    password: "private-password",
    signUpEmail: async () => ({ data: { user: { email: "traveller@example.com" } } }),
    sendVerificationEmail: async () => {
      attempts += 1;
      return { error: { code: "EMAIL_DELIVERY_FAILED", message: "bounded failure" } };
    },
  });
  assert.deepEqual(failed, { kind: "verification-delivery-error", email: "traveller@example.com" });

  const retried = await requestAcknowledgedVerificationEmail({
    callbackURL,
    email: failed.email,
    sendVerificationEmail: async () => {
      attempts += 1;
      return { data: { status: true } };
    },
  });
  assert.deepEqual(retried, { kind: "verification-sent", email: "traveller@example.com" });
  assert.equal(attempts, 2);
});

test("unverified sign-in requests one acknowledged replacement link", async () => {
  let sends = 0;
  const result = await submitEmailSignIn({
    callbackURL,
    email: "traveller@example.com",
    password: "private-password",
    signInEmail: async () => ({ error: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" } }),
    sendVerificationEmail: async () => {
      sends += 1;
      return { data: { status: true } };
    },
  });
  assert.deepEqual(result, { kind: "verification-sent", email: "traveller@example.com" });
  assert.equal(sends, 1);
});

test("ordinary sign-in failures do not send verification mail", async () => {
  let sends = 0;
  const result = await submitEmailSignIn({
    callbackURL,
    email: "traveller@example.com",
    password: "wrong-password",
    signInEmail: async () => ({ error: { code: "INVALID_EMAIL_OR_PASSWORD", message: "Invalid email or password" } }),
    sendVerificationEmail: async () => {
      sends += 1;
      return { data: { status: true } };
    },
  });
  assert.equal(result.kind, "auth-error");
  assert.equal(sends, 0);
});

test("verification is not duplicated by Better Auth automatic hooks", () => {
  assert.deepEqual(ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS, {
    sendOnSignUp: false,
    sendOnSignIn: false,
  });
  const config = readFileSync("auth.config.ts", "utf8");
  assert.match(config, /ACKNOWLEDGED_EMAIL_VERIFICATION_TRIGGERS/);
  assert.doesNotMatch(config, /sendOnSignUp:\s*isEasyTEmailVerificationRequired/);
});

test("check-email and sign-in handoffs contain the email but never a password", () => {
  const checkEmail = emailVerificationStatePath(callbackURL, "traveller+long@example.com");
  const signIn = signInEmailHandoffPath(callbackURL, "traveller+long@example.com");
  for (const path of [checkEmail, signIn]) {
    const url = new URL(path, "https://morrovia.test");
    assert.equal(url.searchParams.get("email"), "traveller+long@example.com");
    assert.equal(url.searchParams.get("next"), callbackURL);
    assert.equal(url.searchParams.has("password"), false);
    assert.doesNotMatch(path, /private-password/);
  }
  assert.equal(new URL(emailVerificationStatePath("https://attacker.test", "traveller@example.com"), "https://morrovia.test").searchParams.get("next"), "/journey/dashboard");
});

test("auth UI owns truthful check-email, loading and shared password controls", () => {
  const login = readFileSync("app/journey/login/login-form.tsx", "utf8");
  const reset = readFileSync("app/journey/reset-password/page.tsx", "utf8");
  const controls = readFileSync("components/easyt/easyt-password-field.tsx", "utf8");
  assert.match(login, /Check your email/);
  assert.match(login, /verification-delivery-error/);
  assert.match(login, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(login, /disabled=\{!configured \|\| googleBusy \|\| Boolean\(verificationFailure\)\}/);
  assert.match(login, /EasyTPasswordField/);
  assert.match(reset, /EasyTPasswordField/);
  assert.match(controls, /type="button"/);
  assert.match(controls, /Show password/);
  assert.match(controls, /Hide password/);
  assert.match(controls, /aria-pressed=\{visible\}/);
  assert.match(login, /autoComplete=\{mode === "sign-in" \? "current-password" : "new-password"\}/);
  assert.equal(reset.match(/autoComplete="new-password"/g)?.length, 2);
});
