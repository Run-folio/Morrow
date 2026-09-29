import assert from "node:assert/strict";
import test from "node:test";

import {
  HOME_TRIP_DRAFT_KEY,
  commitHomepageHandoff,
  createPendingIntakeReceipt,
  pendingIntakeReceiptForOwner,
  pendingHomepageHandoffForOwner,
  pendingReceiptStillCurrent,
  homepageSubmissionFingerprint,
  homepageSemanticInputFingerprint,
  homepageCompletedReceiptIsUnchanged,
  projectHomepageInput,
  readHomepageInput,
  reusableHomepageReceipt,
  type HomepageHandoffReceipt,
} from "../lib/easyt/home-trip-handoff.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";
import { emptyHomepageInput, selectedEntry, selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";

const testLock = async <T,>(_key: string, run: () => Promise<T>): Promise<T> => run();

function acceptedDraft(ownerId: string | null = "owner-a") {
  const snapshot = selectedStopsHomepageInput(ownerId);
  const result = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-1" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("Expected projection to succeed");
  return { snapshot, draft: result.draft };
}

test("homepage intake keys use the same exact private owner scope", () => {
  assert.notEqual(homepageInputStorageKey("owner-a"), homepageInputStorageKey("owner-b"));
  assert.notEqual(homepageInputStorageKey("owner-a"), homepageInputStorageKey(null));
  assert.match(homepageInputStorageKey("owner-a"), /owner-owner-a/);
});

test("late interpretation cannot apply after another tab rotates the pending receipt or Homepage envelope", () => {
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "handoff-old", tripId: "trip-old" });
  const values = new Map<string, string>([
    [homepageInputStorageKey("owner-a"), JSON.stringify({ snapshot, receipt })],
    [HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt })],
  ]);
  const storage = { getItem: (key: string) => values.get(key) ?? null };
  assert.equal(pendingReceiptStillCurrent(storage, receipt, true), true);
  const replacement = createPendingIntakeReceipt({ ...snapshot, prompt: "Tokyo only", revision: 1 }, { handoffId: "handoff-new", tripId: "trip-new" });
  values.set(homepageInputStorageKey("owner-a"), JSON.stringify({ snapshot: replacement.frozenSnapshot, receipt: replacement }));
  assert.equal(pendingReceiptStillCurrent(storage, receipt, true), false);
  values.set(homepageInputStorageKey("owner-a"), JSON.stringify({ snapshot, receipt }));
  values.set(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: replacement }));
  assert.equal(pendingReceiptStillCurrent(storage, receipt, true), false);
  assert.equal(pendingReceiptStillCurrent(storage, receipt, false), true);
  assert.equal(pendingReceiptStillCurrent(storage, { ...receipt, ownerId: "owner-b" }, false), false);
});

test("the intake codec accepts a complete matching snapshot and fails closed across owner/version boundaries", () => {
  const snapshot = emptyHomepageInput("owner-a");
  assert.equal(readHomepageInput({ snapshot }, "owner-b"), null);
  assert.equal(readHomepageInput({ snapshot: { ...snapshot, version: 99 } }, "owner-a"), null);
  assert.deepEqual(readHomepageInput({ snapshot }, "owner-a")?.snapshot, snapshot);
  assert.equal(readHomepageInput({ snapshot }, null), null);
  assert.equal(readHomepageInput(null, "owner-a"), null);
  assert.equal(readHomepageInput({ snapshot: "unknown" }, "owner-a"), null);
});

test("the intake codec rejects malformed nested choices, dates, coordinates and occurrence identities", () => {
  const base = {
    ...emptyHomepageInput("owner-a"),
    entries: [selectedEntry("tokyo", "Tokyo")],
  };
  const invalid = [
    { ...base, mode: "other" },
    { ...base, revision: -1 },
    { ...base, prompt: "x".repeat(4_001) },
    { ...base, entries: [...base.entries, { ...base.entries[0] }] },
    { ...base, dates: { state: "selected", value: { start: "2026-02-30", end: "2026-03-02" } } },
    { ...base, travellers: { state: "selected", value: Number.POSITIVE_INFINITY } },
    { ...base, interests: { state: "selected", value: ["food", "invented"] } },
    { ...base, origin: { state: "selected", value: { name: "Tokyo", coordinates: [181, 35] } } },
    { ...base, journeyEnd: { state: "selected", value: { mode: "explicit", place: { name: "Seoul", coordinates: [127, -91] } } } },
    { ...base, entries: [{ ...base.entries[0], selection: { ...base.entries[0]!.selection!, coordinates: [Number.NaN, 35] } }] },
    { ...base, entries: [{ ...base.entries[0], selection: { ...base.entries[0]!.selection!, bounds: { south: 10, west: 20, north: 5, east: 30 } } }] },
  ];
  for (const snapshot of invalid) assert.equal(readHomepageInput({ snapshot }, "owner-a"), null);
});

test("receipt validation distinguishes absence from malformed or mismatched bookkeeping", () => {
  const { snapshot, draft } = acceptedDraft();
  const inputFingerprint = homepageSubmissionFingerprint(draft);
  const receipt: HomepageHandoffReceipt = {
    version: 1,
    ownerId: "owner-a",
    handoffId: "handoff-1",
    inputFingerprint,
    tripId: "trip-reserved-1",
  };
  assert.equal(readHomepageInput({ snapshot }, "owner-a")?.receipt, undefined);
  assert.deepEqual(readHomepageInput({ snapshot, receipt }, "owner-a")?.receipt, receipt);
  assert.equal(readHomepageInput({ snapshot, receipt: { ...receipt, ownerId: "owner-b" } }, "owner-a"), null);
  assert.equal(readHomepageInput({ snapshot, receipt: { ...receipt, handoffId: "" } }, "owner-a"), null);
  assert.equal(readHomepageInput({ snapshot, receipt: { ...receipt, tripId: 4 } }, "owner-a"), null);
  assert.equal(readHomepageInput({ snapshot, receipt: { ...receipt, semanticInputFingerprint: 4 } }, "owner-a"), null);
  assert.equal(readHomepageInput({ snapshot, receipt: { ...receipt, semanticInputFingerprint: "" } }, "owner-a"), null);
  assert.deepEqual(readHomepageInput({ snapshot, receipt: { ...receipt, semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot) } }, "owner-a")?.receipt?.tripId, receipt.tripId);
});

test("semantically identical active input reuses a reserved trip while effective changes do not", () => {
  const { snapshot, draft } = acceptedDraft();
  const receipt: HomepageHandoffReceipt = {
    version: 1,
    ownerId: "owner-a",
    handoffId: draft.handoffId!,
    inputFingerprint: homepageSubmissionFingerprint(draft),
    tripId: "trip-reserved-1",
  };
  const stored = { snapshot, receipt };
  assert.deepEqual(reusableHomepageReceipt(stored, draft), receipt);

  const revised = projectHomepageInput({ snapshot: { ...snapshot, revision: 9, prompt: "inactive text" }, profile: null, handoffId: "handoff-1" });
  assert.equal(revised.ok, true);
  if (!revised.ok) throw new Error("Expected revised projection");
  assert.equal(homepageSubmissionFingerprint(revised.draft), receipt.inputFingerprint);
  assert.equal(reusableHomepageReceipt(stored, revised.draft)?.tripId, "trip-reserved-1");

  const changed = projectHomepageInput({ snapshot: { ...snapshot, entries: [...snapshot.entries, selectedEntry("seoul", "Seoul")] }, profile: null, handoffId: "handoff-1" });
  assert.equal(changed.ok, true);
  if (!changed.ok) throw new Error("Expected changed projection");
  assert.notEqual(homepageSubmissionFingerprint(changed.draft), receipt.inputFingerprint);
  assert.equal(reusableHomepageReceipt(stored, changed.draft), null);
  assert.equal(reusableHomepageReceipt(stored, { ...draft, handoffId: "handoff-2" }), null);
  assert.equal(reusableHomepageReceipt(stored, { ...draft, homepage: { ...draft.homepage!, ownerId: "owner-b" } }), null);
});

test("a failed replacement leaves the prior validated intake recoverable", () => {
  const prior = { snapshot: emptyHomepageInput("owner-a") };
  const values = new Map([[homepageInputStorageKey("owner-a"), JSON.stringify(prior)]]);
  const failingStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (_key: string, _value: string) => { throw new Error("quota"); },
  };
  assert.throws(() => failingStorage.setItem(homepageInputStorageKey("owner-a"), JSON.stringify({ snapshot: { ...prior.snapshot, revision: 1 } })));
  assert.deepEqual(readHomepageInput(JSON.parse(failingStorage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a"), prior);
});

test("legacy drafts remain ownerless unless their own compatibility metadata says otherwise", () => {
  const legacyDraft = { handoffId: "legacy", brief: "Two weeks in Japan" };
  assert.equal("homepage" in legacyDraft, false);
  assert.equal(readHomepageInput({ snapshot: legacyDraft }, "owner-a"), null);
});

test("a completed receipt classifies unchanged semantic input without trusting new provider output", () => {
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Kyoto and Tokyo" };
  const result = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-1" });
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error("projection failed");
  const receipt: HomepageHandoffReceipt = {
    version: 1, ownerId: "owner-a", handoffId: "handoff-1", tripId: "trip-a",
    inputFingerprint: homepageSubmissionFingerprint(result.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot),
  };
  assert.equal(homepageCompletedReceiptIsUnchanged({ snapshot, receipt }), true);
  assert.equal(homepageCompletedReceiptIsUnchanged({ snapshot: { ...snapshot, prompt: "Kyoto then Osaka" }, receipt }), false);
  assert.equal(homepageCompletedReceiptIsUnchanged({ snapshot, receipt: { ...receipt, semanticInputFingerprint: undefined } }), true);
  assert.equal(reusableHomepageReceipt({ snapshot: { ...snapshot, prompt: "Kyoto then Osaka" }, receipt }, result.draft), null);
});

test("pending intake validates its frozen semantic input independently of later edits", () => {
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto", revision: 7 };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "handoff-pending", tripId: "trip-pending" });
  const stored = { snapshot: { ...snapshot, prompt: "Later edit", revision: 8 }, receipt };
  assert.equal(receipt.phase, "pending-interpretation");
  assert.equal(receipt.semanticInputFingerprint, homepageSemanticInputFingerprint(snapshot));
  assert.deepEqual(readHomepageInput(stored, "owner-a")?.receipt, receipt);
  assert.deepEqual(pendingIntakeReceiptForOwner(receipt, "owner-a"), receipt);
  assert.equal(pendingIntakeReceiptForOwner(receipt, "owner-b"), null);
  assert.equal(pendingIntakeReceiptForOwner({ ...receipt, semanticInputFingerprint: "wrong" }, "owner-a"), null);
  assert.equal(pendingIntakeReceiptForOwner({ ...receipt, frozenSnapshot: { ...snapshot, prompt: "Tampered" } }, "owner-a"), null);
  assert.equal(pendingIntakeReceiptForOwner({ ...receipt, inputRevision: 6 }, "owner-a"), null);
  const envelope = { version: 2 as const, phase: "pending-interpretation" as const, receipt };
  assert.deepEqual(pendingHomepageHandoffForOwner(envelope, "owner-a", "handoff-pending"), receipt);
  assert.equal(pendingHomepageHandoffForOwner(envelope, "owner-a", "other-token"), null);
  assert.equal(pendingHomepageHandoffForOwner(envelope, "owner-b", "handoff-pending"), null);
});

test("pending homepage staging reads back both existing slots and rolls back a failed second write", async () => {
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "handoff-pending", tripId: "trip-pending" });
  const stored = { snapshot, receipt };
  const draft = { version: 2 as const, phase: "pending-interpretation" as const, receipt };
  const key = homepageInputStorageKey("owner-a");
  const previousInput = JSON.stringify({ snapshot: emptyHomepageInput("owner-a") });
  const previousDraft = JSON.stringify({ handoffId: "earlier", brief: "Keep this work" });
  const values = new Map([[key, previousInput], [HOME_TRIP_DRAFT_KEY, previousDraft]]);
  let preservationCalls = 0;
  let writes = 0;
  const storage = {
    getItem: (name: string) => values.get(name) ?? null,
    setItem: (name: string, value: string) => {
      writes += 1;
      if (writes === 2) throw new Error("quota");
      values.set(name, value);
    },
    removeItem: (name: string) => { values.delete(name); },
  };
  assert.deepEqual(await commitHomepageHandoff({ lock: testLock, storage, stored, draft, isCurrent: () => true,
    preserveAndBegin: () => { preservationCalls += 1; return true; } }), { ok: false, reason: "storage" });
  assert.equal(preservationCalls, 0);
  assert.equal(values.get(key), previousInput);
  assert.equal(values.get(HOME_TRIP_DRAFT_KEY), previousDraft);
  const silentStorage = {
    ...storage,
    setItem: (name: string, value: string) => { if (name !== HOME_TRIP_DRAFT_KEY) values.set(name, value); },
  };
  assert.deepEqual(await commitHomepageHandoff({ lock: testLock, storage: silentStorage, stored, draft, isCurrent: () => true,
    preserveAndBegin: () => { preservationCalls += 1; return true; } }), { ok: false, reason: "storage" });
  assert.equal(preservationCalls, 0);
  const successful = {
    ...storage,
    setItem: (name: string, value: string) => { values.set(name, value); },
  };
  assert.deepEqual(await commitHomepageHandoff({ lock: testLock, storage: successful, stored, draft, isCurrent: () => true,
    preserveAndBegin: () => { preservationCalls += 1; return true; } }),
  { ok: true, href: "/journey/new?homeDraft=1&handoff=handoff-pending" });
  assert.equal(preservationCalls, 1);
  assert.deepEqual(readHomepageInput(JSON.parse(values.get(key)!), "owner-a")?.receipt, receipt);
});
