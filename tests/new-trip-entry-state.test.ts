import assert from "node:assert/strict";
import test from "node:test";

import {
  createPendingIntakeReceipt,
  homepageSemanticInputFingerprint,
  homepageSubmissionFingerprint,
  projectHomepageInput,
  type HomepageHandoffReceipt,
  type HomepageInputSnapshot,
} from "../lib/easyt/home-trip-handoff.ts";
import { resolveNewTripEntryState, resumableNewTripSnapshot } from "../app/journey/new/new-trip-entry-state.ts";
import { emptyHomepageInput, selectedEntry, selectedStopsHomepageInput } from "./fixtures/homepage-dual-entry.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";

const ownerId = "owner-a";
const describe = (prompt = "Visit Kyoto and Tokyo") => ({
  ...emptyHomepageInput(ownerId), mode: "describe" as const, prompt,
  dates: { state: "selected" as const, value: { start: "2027-04-01", end: "2027-04-14" } },
  travellers: { state: "selected" as const, value: 2 },
});

function handoff(snapshot: HomepageInputSnapshot) {
  const projected = projectHomepageInput({ snapshot, profile: null, handoffId: "handoff-a" });
  assert.equal(projected.ok, true);
  if (!projected.ok) throw new Error("projection failed");
  const receipt: HomepageHandoffReceipt = {
    version: 1, ownerId, handoffId: "handoff-a", tripId: "trip-a",
    inputFingerprint: homepageSubmissionFingerprint(projected.draft),
    semanticInputFingerprint: homepageSemanticInputFingerprint(snapshot),
  };
  return { stored: { snapshot, receipt }, draft: { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } } };
}

test("Describe semantic input ignores provider capture and volatile metadata", () => {
  const snapshot = describe();
  const firstCapture = captureJourneyBrief(snapshot.prompt);
  const secondCapture = { ...firstCapture, routeHints: [...firstCapture.routeHints, "provider changed its route hint"] };
  const first = projectHomepageInput({ snapshot, capture: firstCapture, profile: null, handoffId: "same" });
  const second = projectHomepageInput({ snapshot, capture: secondCapture, profile: null, handoffId: "same" });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) throw new Error("projection failed");
  assert.notEqual(homepageSubmissionFingerprint(first.draft), homepageSubmissionFingerprint(second.draft));
  assert.equal(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot }));
  const same = { ...snapshot, revision: 48, prompt: "  Visit   Kyoto and Tokyo  ", entries: [selectedEntry("inactive", "Seoul")] };
  assert.equal(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint(same));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, prompt: "Visit Tokyo and Kyoto" }));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, dates: { state: "cleared" } }));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, travellers: { state: "selected", value: 3 } }));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, interests: { state: "selected", value: ["food"] } }));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, origin: { state: "selected", value: { name: "Osaka", canonicalPlaceId: "osaka", coordinates: [135.5, 34.7] } } }));
});

test("structured fingerprint keeps occurrence identity and ordered canonical choices", () => {
  const snapshot = selectedStopsHomepageInput(ownerId, [["tokyo-1", "Tokyo"], ["kyoto", "Kyoto"], ["tokyo-2", "Tokyo"]]);
  const copied = { ...snapshot, revision: 12, prompt: "inactive", entries: snapshot.entries.map((entry) => ({ ...entry, selection: entry.selection && { ...entry.selection, coordinates: [1, 2] as [number, number] } })) };
  assert.equal(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint(copied));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, entries: [snapshot.entries[0], snapshot.entries[2], snapshot.entries[1]] }));
  assert.notEqual(homepageSemanticInputFingerprint(snapshot), homepageSemanticInputFingerprint({ ...snapshot, entries: [snapshot.entries[0], selectedEntry("osaka", "Osaka"), snapshot.entries[2]] }));
});

test("completed matching receipt never reseeds plain New trip; edited intake detaches receipt", () => {
  const { stored } = handoff(describe());
  assert.equal(resumableNewTripSnapshot(stored), null);
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: stored }).kind, "fresh");
  const edited = { ...stored, snapshot: { ...stored.snapshot, prompt: "Visit Osaka and Tokyo" } };
  assert.deepEqual(resumableNewTripSnapshot(edited), edited.snapshot);
  const decision = resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: edited });
  assert.equal(decision.kind, "fresh");
  assert.equal(decision.snapshot?.prompt, edited.snapshot.prompt);
  assert.equal(decision.receipt, undefined);
});

test("legacy completed receipt fails safe and cannot infer edit from draft fingerprint", () => {
  const { stored } = handoff(describe());
  const legacy = { snapshot: { ...stored.snapshot, prompt: "Edited since old submission" }, receipt: { ...stored.receipt, semanticInputFingerprint: undefined } };
  assert.equal(resumableNewTripSnapshot(legacy), null);
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: legacy }).kind, "fresh");
});

test("explicit trip and current draft outrank intake; pending hydration never renders starter", () => {
  const { stored } = handoff(describe());
  assert.equal(resolveNewTripEntryState({ hydrated: false, ownerId, storedInput: stored }).kind, "loading");
  assert.equal(resolveNewTripEntryState({ hydrated: true, sessionPending: true, ownerId, storedInput: stored }).kind, "loading");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, trip: "trip-explicit", storedInput: stored }).kind, "explicit-trip");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, recover: "trip-recovery", storedInput: stored }).kind, "explicit-trip");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, currentDraftTripId: "trip-current", storedInput: stored }).kind, "current-draft");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, inspire: "route-key", storedInput: stored }).kind, "route-handoff");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, hasBuilderContext: true }).kind, "populated-builder");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, savedLibraryTripId: "other-trip" }).kind, "fresh");
});

test("handoff requires exact owner, URL token, stored receipt and draft integrity", () => {
  const { stored, draft } = handoff(selectedStopsHomepageInput(ownerId));
  const base = { hydrated: true, ownerId, homeDraft: true, handoff: "handoff-a", storedInput: stored, draft };
  assert.equal(resolveNewTripEntryState(base).kind, "home-handoff");
  assert.equal(resolveNewTripEntryState({ ...base, reservedTripId: "trip-a" }).kind, "explicit-trip");
  assert.equal(resolveNewTripEntryState({ ...base, ownerId: "owner-b" }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...base, handoff: "handoff-wrong" }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...base, draft: { ...draft, routeHints: ["tampered"] } }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...base, draft: null }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...base, draft: null, reservedTripId: "trip-a" }).kind, "explicit-trip");
  assert.equal(resolveNewTripEntryState({ ...base, draft: null, reservedTripId: "trip-other" }).kind, "unavailable");
});

test("one homepage handoff is consumed once, then import return cannot consume it again", () => {
  const { stored, draft } = handoff(describe());
  const pending = { hydrated: true, ownerId, homeDraft: true, handoff: "handoff-a", storedInput: stored, draft };
  assert.equal(resolveNewTripEntryState(pending).kind, "home-handoff");
  assert.deepEqual(resolveNewTripEntryState({ ...pending, reservedTripId: "trip-a" }), { kind: "explicit-trip", tripId: "trip-a" });
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: stored }).kind, "fresh");
  assert.equal(resumableNewTripSnapshot(stored), null);
  const importedReturn = { ...stored, snapshot: { ...stored.snapshot, prompt: "Visit Kyoto, Tokyo and Osaka" } };
  const resumed = resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: importedReturn });
  assert.equal(resumed.kind, "fresh");
  assert.equal(resumed.snapshot?.prompt, importedReturn.snapshot.prompt);
  assert.equal(resolveNewTripEntryState({ ...pending, storedInput: importedReturn }).kind, "home-handoff");
  const legacy = { ...stored, receipt: { ...stored.receipt, semanticInputFingerprint: undefined } };
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: legacy }).snapshot, undefined);
});

test("route handoff and canonical repeated stops retain distinct entry identities", () => {
  const structured = selectedStopsHomepageInput(ownerId, [["tokyo-1", "Tokyo"], ["kyoto", "Kyoto"], ["tokyo-2", "Tokyo"]]);
  const input = resolveNewTripEntryState({ hydrated: true, ownerId, storedInput: { snapshot: structured } });
  assert.equal(input.kind, "fresh");
  assert.deepEqual(input.snapshot?.entries.map((entry) => entry.id), ["tokyo-1", "kyoto", "tokyo-2"]);
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, inspire: "route-a", storedInput: { snapshot: structured } }).kind, "route-handoff");
  assert.notEqual(homepageSemanticInputFingerprint(structured), homepageSemanticInputFingerprint({ ...structured, entries: [...structured.entries].reverse() }));
});

test("owner change and reload fail closed while unrelated saved trips leave fresh entry fresh", () => {
  const { stored, draft } = handoff(describe());
  assert.equal(resolveNewTripEntryState({ hydrated: false, ownerId, storedInput: stored }).kind, "loading");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId: "owner-b", homeDraft: true, handoff: "handoff-a", storedInput: stored, draft }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId: "owner-b", storedInput: stored }).kind, "fresh");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, savedLibraryTripId: "library-trip", storedInput: stored }).kind, "fresh");
});

test("pending intake keeps one reserved identity across URL handoff, tabs and direct reload", () => {
  const snapshot = describe();
  const receipt = createPendingIntakeReceipt(snapshot, { handoffId: "pending-a", tripId: "trip-pending-a" });
  const storedInput = { snapshot: { ...snapshot, prompt: "Edited outer input" }, receipt };
  const draft = { version: 2 as const, phase: "pending-interpretation" as const, receipt };
  const home = { hydrated: true, ownerId, homeDraft: true, handoff: "pending-a", storedInput, draft };
  for (const tab of [home, { ...home }]) {
    const state = resolveNewTripEntryState(tab);
    assert.equal(state.kind, "pending-home-handoff");
    assert.equal(state.tripId, "trip-pending-a");
    assert.equal(state.snapshot?.prompt, snapshot.prompt);
  }
  assert.equal(resolveNewTripEntryState({ ...home, reservedTripId: "trip-pending-a" }).kind, "explicit-trip");
  assert.equal(resolveNewTripEntryState({ ...home, ownerId: "owner-b" }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...home, handoff: "wrong" }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ ...home, draft: { ...draft, receipt: { ...receipt, tripId: "other" } } }).kind, "unavailable");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, storedInput }).kind, "pending-direct-intake");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, trip: "explicit", storedInput }).tripId, "explicit");
  assert.equal(resolveNewTripEntryState({ hydrated: true, ownerId, currentDraftTripId: "current", storedInput }).tripId, "current");
});

test("recovery of a reserved pending handoff wins after the completed receipt write but before envelope cleanup", () => {
  const snapshot = describe();
  const pending = createPendingIntakeReceipt(snapshot, { handoffId: "pending-crash", tripId: "trip-crash" });
  const completed: HomepageHandoffReceipt = {
    version: 1, ownerId, handoffId: pending.handoffId, tripId: pending.tripId,
    inputFingerprint: "projected-draft-fingerprint",
    semanticInputFingerprint: pending.semanticInputFingerprint,
  };
  const entry = resolveNewTripEntryState({
    hydrated: true, ownerId, homeDraft: true, handoff: pending.handoffId,
    storedInput: { snapshot, receipt: completed },
    draft: { version: 2, phase: "pending-interpretation", receipt: pending },
    reservedTripId: pending.tripId,
  });
  assert.deepEqual(entry, { kind: "explicit-trip", tripId: pending.tripId });
});
