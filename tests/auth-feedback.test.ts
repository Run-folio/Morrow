import assert from "node:assert/strict";
import test from "node:test";

import { authFormErrorMessage } from "../lib/easyt/auth-feedback.ts";

test("signup presents an existing account as a sign-in recovery path", () => {
  assert.equal(
    authFormErrorMessage({ mode: "sign-up", code: "USER_ALREADY_EXISTS", message: "User already exists" }),
    "An account already uses this email. Sign in instead, or reset your password if needed.",
  );
});

test("auth failures remain inline and recoverable", () => {
  assert.equal(
    authFormErrorMessage({ mode: "sign-up", message: "network failed" }),
    "We could not create your account just now. Check the details and try again.",
  );
  assert.equal(
    authFormErrorMessage({ mode: "sign-in", message: "email not verified" }),
    "Email not verified. We sent a fresh verification link. Check your inbox, including spam, then sign in again.",
  );
});
