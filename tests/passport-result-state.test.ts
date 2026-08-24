import assert from "node:assert/strict";
import test from "node:test";

import {
  beginPassportCheck,
  emptyPassportResult,
  failPassportCheck,
  invalidatePassportResult,
  resolvePassportCheck,
} from "../lib/easyt/passport-result-state.ts";
import { touristEntryRequirementFor } from "../lib/easyt/visa-requirements.ts";

const resultFor = (nationality: string, destination: string, language: "en" | "es" = "en") => ({
  nationality,
  destination,
  language,
  requirement: touristEntryRequirementFor(nationality, destination, language),
});

const completedResult = () => resolvePassportCheck(beginPassportCheck(emptyPassportResult()), 1, resultFor("United Kingdom", "Guatemala"));

test("passport component state clears a completed result when nationality changes", () => {
  const state = invalidatePassportResult(completedResult());
  assert.deepEqual({ status: state.status, result: state.result }, { status: "idle", result: null });
});

test("passport component state clears a completed result when destination changes", () => {
  const state = invalidatePassportResult(completedResult());
  assert.deepEqual({ status: state.status, result: state.result }, { status: "idle", result: null });
});

test("passport component state clears a completed result when language changes", () => {
  const state = invalidatePassportResult(completedResult());
  assert.deepEqual({ status: state.status, result: state.result }, { status: "idle", result: null });
});

test("passport component state starts a result only for its active selection", () => {
  const ready = resolvePassportCheck(beginPassportCheck(emptyPassportResult()), 1, resultFor("United Kingdom", "Guatemala"));
  assert.equal(ready.status, "ready");
  assert.equal(ready.result?.requirement.sourceHref.length > 0, true);
});

test("passport component state exposes loading and failure without retaining prior guidance", () => {
  const loading = beginPassportCheck(emptyPassportResult());
  assert.deepEqual({ status: loading.status, result: loading.result }, { status: "loading", result: null });
  const failed = failPassportCheck(loading, loading.requestId);
  assert.deepEqual({ status: failed.status, result: failed.result }, { status: "failed", result: null });
});

test("passport component state ignores an older response after a new check begins", () => {
  const first = beginPassportCheck(emptyPassportResult());
  const second = beginPassportCheck(first);
  const stale = resolvePassportCheck(second, first.requestId, resultFor("United Kingdom", "Guatemala"));
  assert.equal(stale.status, "loading");
  assert.equal(stale.result, null);
  const current = resolvePassportCheck(second, second.requestId, resultFor("Canada", "Japan", "es"));
  assert.equal(current.status, "ready");
  assert.equal(current.result?.nationality, "Canada");
  assert.equal(current.result?.destination, "Japan");
  assert.equal(current.result?.language, "es");
});

test("explicit request ids survive deferred React state updates", () => {
  const loading = beginPassportCheck(emptyPassportResult(4), 5);
  assert.equal(loading.requestId, 5);
  const ready = resolvePassportCheck(loading, 5, resultFor("United Kingdom", "Guatemala"));
  assert.equal(ready.status, "ready");

  const invalidated = invalidatePassportResult(ready, 6);
  assert.deepEqual({ status: invalidated.status, requestId: invalidated.requestId, result: invalidated.result }, { status: "idle", requestId: 6, result: null });
});
