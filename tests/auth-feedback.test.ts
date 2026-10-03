import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

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
    "Email not verified. Request a new verification link to continue.",
  );
});

test("Itinerary Undo uses an opt-in transient notice without changing persistent actionable notices", () => {
  const workspace = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../components/easyt/trip-itinerary-workspace.module.css", import.meta.url), "utf8");
  const feedback = readFileSync(new URL("../components/easyt/morrovia-feedback.tsx", import.meta.url), "utf8");
  assert.match(workspace, /<MorroviaBriefNotice[\s\S]*className=\{styles\.compactNotice\}/);
  assert.match(workspace, /undoReceipt \? <EasyTButton[\s\S]*onClick=\{undoLastItemAction\}/);
  assert.match(workspace, /autoDismissMs=\{undoReceipt \? 5000 : 3200\}/);
  assert.match(workspace, /autoDismissWithAction/);
  assert.match(feedback, /className=\{`\$\{styles\.briefNotice\} \$\{className\}`\}/);
  assert.match(feedback, /role="status"[\s\S]*aria-live="polite"/);
  assert.match(feedback, /autoDismissWithAction = false/);
  assert.match(feedback, /!action \|\| autoDismissWithAction/);
  assert.match(styles, /\.notice \{[\s\S]*position: absolute;/);
  assert.match(styles, /@media \(max-width: 540px\)[\s\S]*\.notice \{[\s\S]*position: fixed;/);
});
