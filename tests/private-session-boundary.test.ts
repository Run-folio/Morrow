import assert from "node:assert/strict";
import test from "node:test";

import { isEasyTEmailVerificationRequired } from "../lib/easyt/auth-environment.ts";
import { runClientMutation } from "../lib/easyt/client-mutation.ts";
import {
  ownerBoundaryState,
  travelProfileStorageKey,
  travelReadinessStorageKey,
} from "../lib/easyt/private-browser-context.ts";
import { journeyReauthenticationPath, safeJourneyReturnTarget } from "../lib/easyt/trip-continuity.ts";

test("private profile and passport context is namespaced by exact owner", () => {
  assert.notEqual(travelProfileStorageKey("owner-a"), travelProfileStorageKey("owner-b"));
  assert.notEqual(travelReadinessStorageKey("owner-a"), travelReadinessStorageKey("owner-b"));
  assert.notEqual(travelProfileStorageKey("owner-a"), travelProfileStorageKey(null));
  assert.match(travelReadinessStorageKey("owner-a"), /owner-owner-a/);
});

test("an A to B switch fails closed before stale private props can render", () => {
  assert.equal(ownerBoundaryState({ renderedOwnerId: "owner-a", sessionOwnerId: "owner-b", rememberedOwnerId: "owner-b", sessionPending: false, previouslyAuthenticatedOwnerId: "owner-a" }), "mismatch");
  assert.equal(ownerBoundaryState({ renderedOwnerId: "owner-a", sessionOwnerId: "owner-a", rememberedOwnerId: "owner-b", sessionPending: false, previouslyAuthenticatedOwnerId: "owner-a" }), "mismatch");
});

test("session expiry is distinct from an account switch so an open document can remain intact", () => {
  assert.equal(ownerBoundaryState({ renderedOwnerId: "owner-a", sessionOwnerId: null, rememberedOwnerId: null, sessionPending: false, previouslyAuthenticatedOwnerId: "owner-a" }), "expired");
});

test("reauth preserves the exact child Map query and hash", () => {
  const target = "/journey/trip-1/map?day=4&panel=eat#finder";
  const href = journeyReauthenticationPath(target);
  assert.equal(new URL(`https://morrovia.test${href}`).searchParams.get("next"), target);
  assert.equal(safeJourneyReturnTarget("https://attacker.test"), "/journey/dashboard");
});

test("network rejection becomes a deterministic settled mutation result", async () => {
  assert.deepEqual(await runClientMutation(async () => { throw new Error("offline"); }), { kind: "network" });
  assert.deepEqual(await runClientMutation(async () => 204), { kind: "response", value: 204 });
});

test("email-verification messaging can use the same configuration predicate as auth", () => {
  const previousKey = process.env.RESEND_API_KEY;
  const previousFrom = process.env.EMAIL_FROM;
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
  assert.equal(isEasyTEmailVerificationRequired(), false);
  process.env.RESEND_API_KEY = "configured";
  process.env.EMAIL_FROM = "trips@example.test";
  assert.equal(isEasyTEmailVerificationRequired(), true);
  if (previousKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = previousKey;
  if (previousFrom === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = previousFrom;
});
