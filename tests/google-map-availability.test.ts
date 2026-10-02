import assert from "node:assert/strict";
import test from "node:test";
import { startGoogleMapAvailabilityProbe } from "../lib/easyt/google-map-availability.ts";

test("a successful availability response cancels the fallback timeout", async () => {
  let fireTimeout: () => void = () => { assert.fail("timeout callback was not scheduled"); };
  let timeoutCleared = false;
  let resolveRequest!: (response: { ok: boolean }) => void;
  const results: boolean[] = [];
  const request = new Promise<{ ok: boolean }>((resolve) => { resolveRequest = resolve; });

  startGoogleMapAvailabilityProbe({
    request: () => request,
    onResult: (available) => results.push(available),
    scheduleTimeout: (callback) => { fireTimeout = callback; return 7; },
    clearTimeout: (handle) => { timeoutCleared = handle === 7; },
    timeoutMs: 7_000,
  });

  resolveRequest({ ok: true });
  await request;
  await Promise.resolve();
  assert.equal(timeoutCleared, true);

  fireTimeout();
  assert.deepEqual(results, [true], "a stale timeout cannot disable a provider that already passed availability");
});

test("an availability timeout settles unavailable and aborts the request", () => {
  let fireTimeout: () => void = () => { assert.fail("timeout callback was not scheduled"); };
  let aborted = false;
  const results: boolean[] = [];

  startGoogleMapAvailabilityProbe({
    request: (signal) => new Promise(() => { signal.addEventListener("abort", () => { aborted = true; }); }),
    onResult: (available) => results.push(available),
    scheduleTimeout: (callback) => { fireTimeout = callback; return 9; },
    clearTimeout: () => {},
    timeoutMs: 7_000,
  });

  fireTimeout();
  assert.equal(aborted, true);
  assert.deepEqual(results, [false]);
});
