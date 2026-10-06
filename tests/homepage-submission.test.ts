import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import {
  HOME_TRIP_DRAFT_KEY,
  commitHomepageHandoff,
  createPendingIntakeReceipt,
  homepageSubmissionFingerprint,
  homepageSemanticInputFingerprint,
  projectHomepageInput,
  readHomepageInput,
  reservePendingDescribeHandoff,
  persistEditableHomepageInput,
  type HomepageHandoffReceipt,
} from "../lib/easyt/home-trip-handoff.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";
import { emptyHomepageInput, selectedEntry, selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import * as handoffTransitions from "../lib/easyt/home-trip-handoff.ts";

const testLock = async <T,>(_key: string, run: () => Promise<T>): Promise<T> => run();

test("Homepage Describe stages frozen intake before navigation without awaiting capture", () => {
  const source = readFileSync(new URL("../app/journey/home/home-trip-starter.tsx", import.meta.url), "utf8");
  assert.match(source, /reservePendingDescribeHandoff\(/);
  assert.doesNotMatch(source, /requestJourneyCapture/);
});

test("interleaved Homepage Describe tabs reserve one receipt after the second re-reads under the owner lock", async () => {
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  let tail = Promise.resolve();
  const lock = async <T,>(_key: string, run: () => Promise<T>): Promise<T> => {
    const prior = tail;
    let release!: () => void;
    tail = new Promise<void>((resolve) => { release = resolve; });
    await prior;
    try { return await run(); } finally { release(); }
  };
  let issued = 0;
  const submit = () => reservePendingDescribeHandoff({
    storage, snapshot, isCurrent: () => true, preserveAndBegin: () => true, lock,
    createIds: () => ({ handoffId: `handoff-${++issued}`, tripId: `trip-${issued}` }),
  });
  const [first, second] = await Promise.all([submit(), submit()]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.equal(first.receipt.tripId, second.receipt.tripId);
  assert.equal(first.href, second.href);
  assert.equal(issued, 1);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt?.tripId, first.receipt.tripId);
});

test("a different Homepage Describe submission cannot replace an unacknowledged pending handoff", async () => {
  const storage = new MemoryStorage();
  const firstSnapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const editedSnapshot = { ...firstSnapshot, revision: 1, prompt: "Tokyo and Osaka" };
  let issued = 0;
  const lock = async <T,>(_key: string, run: () => Promise<T>): Promise<T> => run();
  const submit = (snapshot: typeof firstSnapshot) => reservePendingDescribeHandoff({
    storage, snapshot, isCurrent: () => true, preserveAndBegin: () => true, lock,
    createIds: () => ({ handoffId: `handoff-${++issued}`, tripId: `trip-${issued}` }),
  });
  const first = await submit(firstSnapshot);
  assert.equal(first.ok, true);
  const priorInput = storage.getItem(homepageInputStorageKey("owner-a"));
  const priorEnvelope = storage.getItem(HOME_TRIP_DRAFT_KEY);
  assert.deepEqual(await submit(editedSnapshot), { ok: false, reason: "preservation" });
  assert.equal(storage.getItem(homepageInputStorageKey("owner-a")), priorInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), priorEnvelope);
  assert.equal(issued, 1);
});

test("a new Describe prompt can reserve after a completed unrelated handoff", async () => {
  for (const ownerId of [null, "owner-a"]) {
    const storage = new MemoryStorage();
    const prior = { ...emptyHomepageInput(ownerId), mode: "describe" as const, prompt: "Wales for five weeks" };
    const completed: HomepageHandoffReceipt = {
      version: 1, ownerId, handoffId: "previous-handoff", tripId: "previous-trip",
      inputFingerprint: "previous-projection", semanticInputFingerprint: homepageSemanticInputFingerprint(prior),
    };
    storage.setItem(homepageInputStorageKey(ownerId), JSON.stringify({ snapshot: prior, receipt: completed }));
    const next = { ...prior, revision: prior.revision + 1, prompt: "Scotland for two weeks" };
    const edited = await persistEditableHomepageInput({ storage, snapshot: next, preserveCompletedReceipt: true, lock: testLock });
    assert.equal(edited.ok, true);
    let issued = 0;
    const result = await reservePendingDescribeHandoff({
      storage, snapshot: next, isCurrent: () => true, preserveAndBegin: () => true, lock: testLock,
      createIds: () => ({ handoffId: `new-handoff-${++issued}`, tripId: `new-trip-${issued}` }),
    });
    assert.equal(result.ok, true, `new ${ownerId ?? "guest"} intake should not inherit the old receipt`);
    if (!result.ok) continue;
    assert.equal(result.receipt.tripId, "new-trip-1");
    assert.equal(result.receipt.frozenSnapshot.prompt, next.prompt);
    assert.equal(issued, 1);
    assert.equal(completed.tripId, "previous-trip");
  }
});

test("a failed Describe preservation keeps the prompt and retries the same reserved identity", async () => {
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput(null), mode: "describe" as const, prompt: "Wales for five weeks" };
  const priorDraft = JSON.stringify({ handoffId: "unrelated-draft" });
  storage.setItem(HOME_TRIP_DRAFT_KEY, priorDraft);
  let issued = 0;
  let allowNavigation = false;
  const submit = () => reservePendingDescribeHandoff({
    storage, snapshot, isCurrent: () => true, preserveAndBegin: () => allowNavigation, lock: testLock,
    createIds: () => ({ handoffId: `handoff-${++issued}`, tripId: `trip-${issued}` }),
  });
  assert.deepEqual(await submit(), { ok: false, reason: "preservation" });
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), priorDraft);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey(null))!), null)?.snapshot.prompt, snapshot.prompt);
  allowNavigation = true;
  const retried = await submit();
  assert.equal(retried.ok, true);
  if (!retried.ok) return;
  assert.equal(retried.receipt.tripId, "trip-1");
  assert.equal(issued, 1);
  assert.equal(JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!).receipt.tripId, "trip-1");
});

test("an edit in another tab cannot erase a pending Homepage receipt", async () => {
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "pending-first", tripId: "trip-first" });
  const original = JSON.stringify({ snapshot, receipt });
  storage.setItem(homepageInputStorageKey("owner-a"), original);
  const edited = { ...snapshot, revision: 1, prompt: "Tokyo and Osaka" };
  const result = await persistEditableHomepageInput({ storage, snapshot: edited,
    lock: async <T,>(_key: string, run: () => Promise<T>) => run() });
  assert.deepEqual(result, { ok: false, reason: "reserved" });
  assert.equal(storage.getItem(homepageInputStorageKey("owner-a")), original);
});

test("Homepage Stops cannot replace another tab's pending Describe handoff", async () => {
  const storage = new MemoryStorage();
  const describe = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const pending = createPendingIntakeReceipt(describe, { handoffId: "pending-first", tripId: "trip-first" });
  const originalInput = JSON.stringify({ snapshot: describe, receipt: pending });
  const originalEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: pending });
  storage.setItem(homepageInputStorageKey("owner-a"), originalInput);
  storage.setItem(HOME_TRIP_DRAFT_KEY, originalEnvelope);
  const { stored, draft } = acceptedHandoff();
  const result = await commitHomepageHandoff({ lock: testLock, storage, stored, draft, isCurrent: () => true,
    preserveAndBegin: () => true });
  assert.deepEqual(result, { ok: false, reason: "preservation" });
  assert.equal(storage.getItem(homepageInputStorageKey("owner-a")), originalInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), originalEnvelope);
});

test("two Stops tabs with the same intake cannot create different reserved trips", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  assert.deepEqual(await commitHomepageHandoff({ lock: testLock, storage, stored, draft,
    isCurrent: () => true, preserveAndBegin: () => true }),
  { ok: true, href: "/journey/new?homeDraft=1&handoff=handoff-a" });
  const nextProjection = projectHomepageInput({ snapshot: stored.snapshot, profile: null, handoffId: "handoff-b" });
  assert.equal(nextProjection.ok, true);
  if (!nextProjection.ok) return;
  const nextReceipt: HomepageHandoffReceipt = { version: 1, ownerId: "owner-a", handoffId: "handoff-b",
    tripId: "trip-b", inputFingerprint: homepageSubmissionFingerprint(nextProjection.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(stored.snapshot) };
  const nextDraft = { ...nextProjection.draft, homepage: { ...nextProjection.draft.homepage!, receipt: nextReceipt } };
  assert.deepEqual(await commitHomepageHandoff({ lock: testLock, storage,
    stored: { snapshot: stored.snapshot, receipt: nextReceipt }, draft: nextDraft,
    isCurrent: () => true, preserveAndBegin: () => true }), { ok: false, reason: "preservation" });
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt?.tripId,
    stored.receipt.tripId);
});

test("an edited completed Stops intake can commit a distinct trip without losing the first", async () => {
  const storage = new MemoryStorage();
  const first = acceptedHandoff();
  assert.equal((await commitHomepageHandoff({ lock: testLock, storage, ...first,
    isCurrent: () => true, preserveAndBegin: () => true })).ok, true);
  const firstDraft = storage.getItem(HOME_TRIP_DRAFT_KEY);
  const editedSnapshot = { ...first.stored.snapshot, revision: first.stored.snapshot.revision + 1,
    entries: [...first.stored.snapshot.entries, selectedEntry("osaka", "Osaka")] };
  const edited = await persistEditableHomepageInput({ storage, snapshot: editedSnapshot,
    preserveCompletedReceipt: true, lock: testLock });
  assert.equal(edited.ok, true);
  assert.equal(edited.ok && edited.stored.receipt?.tripId, first.stored.receipt.tripId);
  const projection = projectHomepageInput({ snapshot: editedSnapshot, profile: null, handoffId: "handoff-b" });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const receipt: HomepageHandoffReceipt = { version: 1, ownerId: "owner-a", handoffId: "handoff-b",
    tripId: "trip-b", inputFingerprint: homepageSubmissionFingerprint(projection.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(editedSnapshot) };
  const draft = { ...projection.draft, homepage: { ...projection.draft.homepage!, receipt } };
  const result = await commitHomepageHandoff({ lock: testLock, storage,
    stored: { snapshot: editedSnapshot, receipt }, draft, isCurrent: () => true,
    preserveAndBegin: () => true });
  assert.deepEqual(result, { ok: true, href: "/journey/new?homeDraft=1&handoff=handoff-b" });
  assert.notEqual(receipt.tripId, first.stored.receipt.tripId);
  assert.notEqual(storage.getItem(HOME_TRIP_DRAFT_KEY), firstDraft);
  assert.equal(JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!).homepage.receipt.tripId, "trip-b");
});

for (const [label, change] of [
  ["changed canonical stop", (snapshot: ReturnType<typeof selectedStopsHomepageInput>) => ({
    ...snapshot, entries: [snapshot.entries[0]!, selectedEntry("new-third", "Seoul"), snapshot.entries[2]!],
  })],
  ["added stop", (snapshot: ReturnType<typeof selectedStopsHomepageInput>) => ({
    ...snapshot, entries: [...snapshot.entries, selectedEntry("new-fourth", "Seoul")],
  })],
  ["removed stop", (snapshot: ReturnType<typeof selectedStopsHomepageInput>) => ({
    ...snapshot, entries: snapshot.entries.slice(0, 2),
  })],
  ["reordered stops", (snapshot: ReturnType<typeof selectedStopsHomepageInput>) => ({
    ...snapshot, entries: [snapshot.entries[1]!, snapshot.entries[0]!, snapshot.entries[2]!],
  })],
  ["changed dates", (snapshot: ReturnType<typeof selectedStopsHomepageInput>) => ({
    ...snapshot, dates: { state: "selected" as const, value: { start: "2026-10-15", end: "2026-10-20" } },
  })],
] as const) {
  test(`a completed Stops receipt yields a new handoff for ${label}`, async () => {
    const storage = new MemoryStorage();
    const first = acceptedHandoff("owner-a", [["tokyo", "Tokyo"], ["kyoto", "Kyoto"], ["osaka", "Osaka"]]);
    assert.equal((await commitHomepageHandoff({ lock: testLock, storage, ...first,
      isCurrent: () => true, preserveAndBegin: () => true })).ok, true);
    const snapshot = { ...change(first.stored.snapshot), revision: first.stored.snapshot.revision + 1 };
    const persisted = await persistEditableHomepageInput({ storage, snapshot,
      preserveCompletedReceipt: true, lock: testLock });
    assert.equal(persisted.ok, true);
    const projection = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-changed" });
    assert.equal(projection.ok, true);
    if (!projection.ok) return;
    const receipt: HomepageHandoffReceipt = { version: 1, ownerId: "owner-a", handoffId: "handoff-changed",
      tripId: "trip-changed", inputFingerprint: homepageSubmissionFingerprint(projection.draft),
      semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot) };
    const draft = { ...projection.draft, homepage: { ...projection.draft.homepage!, receipt } };
    const result = await commitHomepageHandoff({ lock: testLock, storage,
      stored: { snapshot, receipt }, draft, isCurrent: () => true, preserveAndBegin: () => true });
    assert.equal(result.ok, true, `${label} should create a distinct handoff`);
    assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt?.tripId,
      "trip-changed");
  });
}

test("failed changed Stops preservation retains the edited draft and retries the same identity", async () => {
  const storage = new MemoryStorage();
  const first = acceptedHandoff();
  assert.equal((await commitHomepageHandoff({ lock: testLock, storage, ...first,
    isCurrent: () => true, preserveAndBegin: () => true })).ok, true);
  const firstEnvelope = storage.getItem(HOME_TRIP_DRAFT_KEY);
  const snapshot = { ...first.stored.snapshot, revision: first.stored.snapshot.revision + 1,
    entries: [...first.stored.snapshot.entries, selectedEntry("osaka", "Osaka")] };
  assert.equal((await persistEditableHomepageInput({ storage, snapshot,
    preserveCompletedReceipt: true, lock: testLock })).ok, true);
  const projection = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-retry" });
  assert.equal(projection.ok, true);
  if (!projection.ok) return;
  const receipt: HomepageHandoffReceipt = { version: 1, ownerId: "owner-a", handoffId: "handoff-retry",
    tripId: "trip-retry", inputFingerprint: homepageSubmissionFingerprint(projection.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot) };
  const stored = { snapshot, receipt };
  const draft = { ...projection.draft, homepage: { ...projection.draft.homepage!, receipt } };
  let preserveCalls = 0;
  const attempt = (preserveAndBegin: () => boolean) => commitHomepageHandoff({ lock: testLock, storage,
    stored, draft, isCurrent: () => true, preserveAndBegin });
  assert.deepEqual(await attempt(() => { preserveCalls++; return false; }), { ok: false, reason: "preservation" });
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), firstEnvelope);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.snapshot.entries.length, 3);
  assert.deepEqual(await attempt(() => { preserveCalls++; return true; }),
    { ok: true, href: "/journey/new?homeDraft=1&handoff=handoff-retry" });
  assert.equal(preserveCalls, 2);
  assert.equal(JSON.parse(storage.getItem(HOME_TRIP_DRAFT_KEY)!).homepage.receipt.tripId, "trip-retry");
});

test("a completed owner A Stops receipt cannot block owner B's handoff", async () => {
  const storage = new MemoryStorage();
  const ownerA = acceptedHandoff("owner-a");
  assert.equal((await commitHomepageHandoff({ lock: testLock, storage, ...ownerA,
    isCurrent: () => true, preserveAndBegin: () => true })).ok, true);
  const ownerAInput = storage.getItem(homepageInputStorageKey("owner-a"));
  const ownerB = acceptedHandoff("owner-b");
  assert.equal((await commitHomepageHandoff({ lock: testLock, storage, ...ownerB,
    isCurrent: () => true, preserveAndBegin: () => true })).ok, true);
  assert.equal(storage.getItem(homepageInputStorageKey("owner-a")), ownerAInput);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-b"))!), "owner-b")?.receipt?.ownerId,
    "owner-b");
});

test("pending Edit clears only its exact receipt and cannot remove a newer handoff", async () => {
  const discard = (handoffTransitions as unknown as { discardPendingIntakeForEdit?: (input: unknown) => Promise<{ ok: boolean; reason?: string }> }).discardPendingIntakeForEdit;
  assert.equal(typeof discard, "function");
  if (!discard) return;
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto" };
  const old = createPendingIntakeReceipt(snapshot, { handoffId: "old", tripId: "old-trip" });
  const next = createPendingIntakeReceipt({ ...snapshot, revision: 1, prompt: "Osaka" }, { handoffId: "new", tripId: "new-trip" });
  const key = homepageInputStorageKey("owner-a");
  storage.setItem(key, JSON.stringify({ snapshot, receipt: old }));
  storage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: old }));
  assert.equal((await discard({ storage, receipt: old, fromHomepage: true, lock: testLock })).ok, true);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(key)!), "owner-a")?.receipt, undefined);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), null);
  storage.setItem(key, JSON.stringify({ snapshot: next.frozenSnapshot, receipt: next }));
  const nextEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: next });
  storage.setItem(HOME_TRIP_DRAFT_KEY, nextEnvelope);
  assert.deepEqual(await discard({ storage, receipt: old, fromHomepage: true, lock: testLock }), { ok: false, reason: "stale" });
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), nextEnvelope);
});

test("canonical acknowledgement cannot overwrite a newer pending token", async () => {
  const complete = (handoffTransitions as unknown as { acknowledgePendingIntakeReceipt?: (input: unknown) => Promise<{ ok: boolean; reason?: string }> }).acknowledgePendingIntakeReceipt;
  assert.equal(typeof complete, "function");
  if (!complete) return;
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const old = createPendingIntakeReceipt(stored.snapshot, { handoffId: stored.receipt.handoffId, tripId: stored.receipt.tripId });
  const next = createPendingIntakeReceipt({ ...stored.snapshot, revision: stored.snapshot.revision + 1 }, { handoffId: "newer", tripId: "newer-trip" });
  const key = homepageInputStorageKey("owner-a");
  storage.setItem(key, JSON.stringify({ snapshot: stored.snapshot, receipt: old }));
  storage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: old }));
  assert.deepEqual(await complete({ storage, pending: old, completed: stored.receipt, draft, fromHomepage: true, lock: testLock }), { ok: true });
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(key)!), "owner-a")?.receipt?.version, 1);
  storage.setItem(key, JSON.stringify({ snapshot: next.frozenSnapshot, receipt: next }));
  const nextEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: next });
  storage.setItem(HOME_TRIP_DRAFT_KEY, nextEnvelope);
  assert.deepEqual(await complete({ storage, pending: old, completed: stored.receipt, draft, fromHomepage: true, lock: testLock }), { ok: false, reason: "stale" });
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), nextEnvelope);
});

test("acknowledgement rolls back both receipt slots if the second write fails", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const pending = createPendingIntakeReceipt(stored.snapshot, { handoffId: stored.receipt.handoffId, tripId: stored.receipt.tripId });
  const inputKey = homepageInputStorageKey("owner-a");
  const beforeInput = JSON.stringify({ snapshot: stored.snapshot, receipt: pending });
  const beforeEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: pending });
  storage.setItem(inputKey, beforeInput);
  storage.setItem(HOME_TRIP_DRAFT_KEY, beforeEnvelope);
  storage.failSetAt = storage.writes + 2;
  const result = await handoffTransitions.acknowledgePendingIntakeReceipt({ storage, pending,
    completed: stored.receipt, draft, fromHomepage: true, lock: testLock });
  assert.deepEqual(result, { ok: false, reason: "storage" });
  assert.equal(storage.getItem(inputKey), beforeInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), beforeEnvelope);
});

test("unavailable owner lock fails closed before an intake edit", async () => {
  const storage = new MemoryStorage();
  const snapshot = emptyHomepageInput("owner-a");
  const result = await persistEditableHomepageInput({ storage, snapshot,
    lock: async () => { throw new Error("lock unavailable"); } });
  assert.deepEqual(result, { ok: false, reason: "storage" });
  assert.equal(storage.writes, 0);
});

test("an acknowledgement from another owner cannot alter the current receipt", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const pending = createPendingIntakeReceipt(stored.snapshot, { handoffId: stored.receipt.handoffId, tripId: stored.receipt.tripId });
  const key = homepageInputStorageKey("owner-a");
  const original = JSON.stringify({ snapshot: stored.snapshot, receipt: pending });
  storage.setItem(key, original);
  const result = await handoffTransitions.acknowledgePendingIntakeReceipt({ storage, pending,
    completed: { ...stored.receipt, ownerId: "owner-b" }, draft, fromHomepage: false, lock: testLock });
  assert.deepEqual(result, { ok: false, reason: "stale" });
  assert.equal(storage.getItem(key), original);
  assert.equal(storage.getItem(homepageInputStorageKey("owner-b")), null);
});

test("an Edit waiting on the lock cannot clear a replacement handoff", async () => {
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo" };
  const old = createPendingIntakeReceipt(snapshot, { handoffId: "old", tripId: "old-trip" });
  const newer = createPendingIntakeReceipt({ ...snapshot, revision: 1, prompt: "Kyoto" }, { handoffId: "new", tripId: "new-trip" });
  const key = homepageInputStorageKey("owner-a");
  storage.setItem(key, JSON.stringify({ snapshot, receipt: old }));
  storage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: old }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const delayed = async <T,>(_key: string, run: () => Promise<T>) => { await gate; return run(); };
  const edit = handoffTransitions.discardPendingIntakeForEdit({ storage, receipt: old, fromHomepage: true, lock: delayed });
  const nextInput = JSON.stringify({ snapshot: newer.frozenSnapshot, receipt: newer });
  const nextEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: newer });
  storage.setItem(key, nextInput);
  storage.setItem(HOME_TRIP_DRAFT_KEY, nextEnvelope);
  release();
  assert.deepEqual(await edit, { ok: false, reason: "stale" });
  assert.equal(storage.getItem(key), nextInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), nextEnvelope);
});

test("completion waiting on the lock cannot replace a newer pending receipt", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const old = createPendingIntakeReceipt(stored.snapshot, { handoffId: stored.receipt.handoffId, tripId: stored.receipt.tripId });
  const newer = createPendingIntakeReceipt({ ...stored.snapshot, revision: 5 }, { handoffId: "new", tripId: "new-trip" });
  const key = homepageInputStorageKey("owner-a");
  storage.setItem(key, JSON.stringify({ snapshot: stored.snapshot, receipt: old }));
  storage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: old }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const delayed = async <T,>(_key: string, run: () => Promise<T>) => { await gate; return run(); };
  const complete = handoffTransitions.acknowledgePendingIntakeReceipt({ storage, pending: old,
    completed: stored.receipt, draft, fromHomepage: true, lock: delayed });
  const nextInput = JSON.stringify({ snapshot: newer.frozenSnapshot, receipt: newer });
  const nextEnvelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: newer });
  storage.setItem(key, nextInput);
  storage.setItem(HOME_TRIP_DRAFT_KEY, nextEnvelope);
  release();
  assert.deepEqual(await complete, { ok: false, reason: "stale" });
  assert.equal(storage.getItem(key), nextInput);
  assert.equal(storage.getItem(HOME_TRIP_DRAFT_KEY), nextEnvelope);
});

test("two Homepage tabs committing the same frozen Describe receipt converge on one reserved trip", async () => {
  const storage = new MemoryStorage();
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Kyoto in Japan" };
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "same-handoff", tripId: "same-trip" });
  const stored = { snapshot, receipt };
  const draft = { version: 2 as const, phase: "pending-interpretation" as const, receipt };
  const commit = () => commitHomepageHandoff({ lock: testLock, storage, stored, draft, isCurrent: () => true, preserveAndBegin: () => true });
  const first = await commit();
  const second = await commit();
  assert.deepEqual(first, { ok: true, href: "/journey/new?homeDraft=1&handoff=same-handoff" });
  assert.deepEqual(second, first);
  assert.equal(readHomepageInput(JSON.parse(storage.getItem(homepageInputStorageKey("owner-a"))!), "owner-a")?.receipt?.tripId, "same-trip");
});

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

function acceptedHandoff(ownerId: string | null = "owner-a", destinations?: Array<[string, string]>) {
  const snapshot = selectedStopsHomepageInput(ownerId, destinations);
  snapshot.revision = 4;
  const projected = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-a" });
  assert.equal(projected.ok, true);
  if (!projected.ok) throw new Error("Expected projection");
  const receipt: HomepageHandoffReceipt = {
    version: 1,
    ownerId,
    handoffId: "handoff-a",
    inputFingerprint: homepageSubmissionFingerprint(projected.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot),
    tripId: "trip-reserved-a",
  };
  const draft = { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } };
  return { stored: { snapshot, receipt }, draft };
}

test("a stale homepage request returns before storage or preservation mutation", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  let preservationCalls = 0;

  const result = await commitHomepageHandoff({ lock: testLock,
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

test("a mismatched semantic receipt in the draft fails before any write", async () => {
  const storage = new MemoryStorage();
  const { stored, draft } = acceptedHandoff();
  const result = await commitHomepageHandoff({ lock: testLock,
    storage, stored,
    draft: { ...draft, homepage: { ...draft.homepage!, receipt: { ...stored.receipt, semanticInputFingerprint: "other" } } },
    isCurrent: () => true, preserveAndBegin: () => true,
  });
  assert.deepEqual(result, { ok: false, reason: "storage" });
  assert.equal(storage.writes, 0);
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

  const result = await commitHomepageHandoff({ lock: testLock,
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

  const result = await commitHomepageHandoff({ lock: testLock,
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

  const result = await commitHomepageHandoff({ lock: testLock,
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

    const result = await commitHomepageHandoff({ lock: testLock,
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
  const result = await commitHomepageHandoff({ lock: testLock,
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
  const result = await commitHomepageHandoff({ lock: testLock,
    storage,
    stored,
    draft,
    isCurrent: () => true,
    preserveAndBegin: () => true,
  });
  assert.equal(result.ok, true);
});
