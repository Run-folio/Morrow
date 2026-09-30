import assert from "node:assert/strict";
import test from "node:test";
import { googleNearbyRequestDecision, googlePlaceFailureKind } from "../lib/easyt/google-place-request-control.ts";
import { googleDiscoveryScopeKey } from "../lib/easyt/google-map-workspace-selection.ts";

test("nearby runs once per canonical stop/category entry and only a newer explicit retry repeats it", () => {
  assert.notEqual(googleDiscoveryScopeKey("tokyo-first", "see"), googleDiscoveryScopeKey("tokyo-second", "see"));
  assert.notEqual(googleDiscoveryScopeKey("tokyo-first", "see"), googleDiscoveryScopeKey("tokyo-first", "eat"));
  assert.equal(googleNearbyRequestDecision(undefined, undefined, 0), "fetch");
  assert.equal(googleNearbyRequestDecision("ready", 0, 0), "reuse");
  assert.equal(googleNearbyRequestDecision("empty", 0, 0), "reuse");
  assert.equal(googleNearbyRequestDecision("unavailable", 0, 0), "reuse");
  assert.equal(googleNearbyRequestDecision("loading", 0, 0), "fetch", "aborted StrictMode or scope-exit fetch may restart");
  assert.equal(googleNearbyRequestDecision("ready", 0, 1), "fetch", "retry is a deliberate new request");
  assert.equal(googleNearbyRequestDecision("unavailable", 1, 1), "reuse", "retry cannot loop itself");
});

test("request failure categories are bounded and contain no provider or trip facts", () => {
  assert.equal(googlePlaceFailureKind(401), "configuration");
  assert.equal(googlePlaceFailureKind(403), "configuration");
  assert.equal(googlePlaceFailureKind(429), "quota");
  assert.equal(googlePlaceFailureKind(503), "provider");
  assert.equal(googlePlaceFailureKind(undefined, true), "offline");
});
