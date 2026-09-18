import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_TRIP_DRAFT_KEY,
  commitHomepageHandoff,
  homepageSubmissionFingerprint,
  projectHomepageInput,
  readHomepageInput,
  type HomepageHandoffReceipt,
} from "../lib/easyt/home-trip-handoff.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";
import { selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";

class MemoryStorage {
  readonly values = new Map<string, string>();
  failGet = false;
  failSetAt = 0;
  failRemove = false;
  writes = 0;

  getItem(key: string) {
    if (this.failGet) throw new Error("blocked read");
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes += 1;
    if (this.failSetAt === this.writes) throw new Error("blocked write");
    this.values.set(key, value);
  }

  removeItem(key: string) {
    if (this.failRemove) throw new Error("blocked remove");
    this.values.delete(key);
  }
}

function acceptedHandoff(ownerId: string | null = "owner-a") {
  const snapshot = selectedStopsHomepageInput(ownerId);
  snapshot.revision = 4;
  const projected = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-a" });
  assert.equal(projected.ok, true);
  if (!projected.ok) throw new Error("Expected projection");
  const receipt: HomepageHandoffReceipt = {
    version: 1,
    ownerId,
    handoffId: "handoff-a",
    inputFingerprint: homepageSubmissionFingerprint(projected.draft),
    tripId: "trip-reserved-a",
  };
  const draft = { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } };
  return { stored: { snapshot, receipt }, draft };
}

test("a stale homepage request returns before storage or preservation mutation", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  let preservationCalls = 0;

  const result = await commitHomepageHandoff({
    storage,
    stored,
    draft,
    isCurrent: () => false,
    preserveAndBegin: () => { preservationCalls += 1; return true; },
  });

  assert.deepEqual(result, { ok: false, reason: "stale" });
  assert.equal(storage.writes, 0);
  assert.equal(preservationCalls, 0);
});

test("a request invalidated after staging rolls both slots back before preservation", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const priorInput = JSON.stringify({ snapshot: selectedStopsHomepageInput("owner-a") });
  const priorDraft = JSON.stringify({ handoffId: "prior" });
  storage.values.set(homepageInputStorageKey("owner-a"), priorInput);
  storage.values.set(HOME_TRIP_DRAFT_KEY, priorDraft);
  let checks = 0;
  let preservationCalls = 0;

  const result = await commitHomepageHandoff({
    storage,
    stored,
    draft,
    isCurrent: () => ++checks < 4,
    preserveAndBegin: () => { preservationCalls += 1; return true; },
  });

  assert.deepEqual(result, { ok: false, reason: "stale" });
  assert.equal(preservationCalls, 0);
  assert.equal(storage.getItem(homepageInputStorageKey("owner-a")), priorInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), priorDraft);
});

test("a valid handoff stages owner input and reserved identity before preserving current work", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  let stagedBeforePreservation = false;

  const result = await commitHomepageHandoff({
    storage,
    stored,
    draft,
    isCurrent: () => true,
    preserveAndBegin: () => {
      stagedBeforePreservation = Boolean(
        storage.getItem(homepageInputStorageKey("owner-a"))
        && storage.getItem(HOME_TRIP_DRAFT_KEY),
      );
      return true;
    },
  });

  assert.equal(stagedBeforePreservation, true);
  assert.deepEqual(result, { ok: true, href: "/journey/new?homeDraft=1&handoff=handoff-a" });
  assert.deepEqual(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt, stored.receipt);
  const stagedDraft = JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!);
  assert.equal(homepageSubmissionFingerprint(stagedDraft), homepageSubmissionFingerprint(draft));
  assert.deepEqual(stagedDraft.homepage.receipt, draft.homepage.receipt);
});

test("cancelled preservation keeps the new intake and restores the prior shared handoff", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const prior = JSON.stringify({ handoffId: "prior", brief: "Keep this recoverable" });
  storage.values.set(HOME_TRIP_DRAFT_KEY, prior);

  const result = await commitHomepageHandoff({
    storage,
    stored,
    draft,
    isCurrent: () => true,
    preserveAndBegin: () => false,
  });

  assert.deepEqual(result, { ok: false, reason: "preservation" });
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), prior);
  assert.deepEqual(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt, stored.receipt);
});

test("storage failures never invoke preservation and retain the previous shared handoff", async () => {
  for (const failSetAt of [1, 2]) {
    const storage = new MemoryStorage();
    const { stored, draft } = acceptedHandoff();
    const prior = JSON.stringify({ handoffId: "prior" });
    storage.values.set(HOME_TRIP_DRAFT_KEY, prior);
    storage.failSetAt = failSetAt;
    let preservationCalls = 0;

    const result = await commitHomepageHandoff({
      storage,
      stored,
      draft,
      isCurrent: () => true,
      preserveAndBegin: () => { preservationCalls += 1; return true; },
    });

    assert.deepEqual(result, { ok: false, reason: "storage" });
    assert.equal(preservationCalls, 0);
    assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), prior);
  }
});

test("mismatched or malformed receipt bookkeeping fails before mutation", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const result = await commitHomepageHandoff({
    storage,
    stored: { ...stored, receipt: { ...stored.receipt, inputFingerprint: "old-input" } },
    draft,
    isCurrent: () => true,
    preserveAndBegin: () => true,
  });
  assert.deepEqual(result, { ok: false, reason: "storage" });
  assert.equal(storage.writes, 0);
});

test("validated receipt bookkeeping survives independent JSON reload before retry", async () => {
  const storage = new MemoryStorage();
  const accepted = acceptedHandoff();
  const stored = JSON.parse(JSON.stringify(accepted.stored));
  const draft = JSON.parse(JSON.stringify(accepted.draft));
  const result = await commitHomepageHandoff({
    storage,
    stored,
    draft,
    isCurrent: () => true,
    preserveAndBegin: () => true,
  });
  assert.equal(result.ok, true);
});
