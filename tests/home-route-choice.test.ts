import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import * as handoff from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { homepageInputStorageKey } from "../lib/easyt/private-browser-context.ts";
import { emptyHomepageInput, selectedEntry } from "./fixtures/homepage-dual-entry.ts";

const lock = async <T,>(_key: string, run: () => Promise<T>) => run();
const fresh = () => ({ ...emptyHomepageInput("owner-a"), tripType: { state: "untouched" as const }, originInput: "", entries: [selectedEntry("a", "Tokyo"), selectedEntry("b", "Kyoto")] });
const describe = (prompt: string) => ({ ...fresh(), mode: "describe" as const, prompt });
const project = (snapshot: handoff.HomepageInputSnapshot, capture?: ReturnType<typeof captureJourneyBrief>) => handoff.projectHomepageInput({ snapshot, capture, profile: null, handoffId: "choice-handoff" });
async function choices() {
  assert.ok(existsSync(new URL("../lib/easyt/home-route-choice.ts", import.meta.url)), "the bounded route-choice adapter is missing");
  return import("../lib/easyt/home-route-choice.ts");
}

test("fresh structured Return default is projected without becoming an explicit selection", () => {
  const snapshot = fresh();
  const before = structuredClone(snapshot);
  const result = project(snapshot);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.routeIntent?.tripType, "return_to_start");
  assert.deepEqual(result.draft.journeyEnd, { mode: "same_as_start" });
  assert.deepEqual(snapshot, before);
});

test("selected endpointless One way becomes canonical One way, never unknown legacy", () => {
  const result = project({ ...fresh(), tripType: { state: "selected", value: "one_way" } });
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.routeIntent?.tripType, "one_way");
  assert.deepEqual(result.draft.journeyEnd, { mode: "unknown" });
});

test("fresh Describe without an ending defaults to Return without declaring traveller intent", () => {
  const snapshot = describe("Tokyo and Kyoto for two weeks");
  const result = project(snapshot);
  assert.ok(result.ok);
  assert.equal(result.draft.routeIntent?.tripType, "return_to_start");
  assert.deepEqual(result.draft.journeyEnd, { mode: "same_as_start" });
  assert.equal(snapshot.tripType.state, "untouched");
});

test("a saved unconfirmed ending remains unknown even when its type was untouched", async () => {
  const snapshot = { ...describe("Tokyo and Kyoto"), journeyEnd: { state: "selected" as const, value: { mode: "unknown" as const } } };
  const result = (await choices()).homepageRouteChoice(snapshot);
  assert.equal(result.tripType, "unknown_legacy");
});

test("new Builder capture defaults only absent ending intent and retains explicit One way and endpoints", async () => {
  const api = await choices();
  assert.deepEqual(api.newTripCapturedJourneyEnd("Tokyo and Kyoto", { mode: "unknown" }), { mode: "same_as_start" });
  assert.deepEqual(api.newTripCapturedJourneyEnd("A one-way trip through Tokyo and Kyoto", { mode: "unknown" }), { mode: "unknown" });
  const end = { mode: "explicit" as const, place: { name: "Osaka", canonicalPlaceId: "osaka" } };
  assert.deepEqual(JSON.parse(JSON.stringify(api.newTripCapturedJourneyEnd("Tokyo then Osaka", end))), end);
});

test("missing and cleared trip type retain known legacy endings and repeated finish stays", () => {
  for (const end of [{ mode: "unknown" }, { mode: "same_as_start" }, { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } }] as const) {
    for (const tripType of [undefined, { state: "cleared" as const }]) {
      const snapshot = { ...emptyHomepageInput("owner-a"), entries: [selectedEntry("first", "Rome"), selectedEntry("middle", "Tokyo"), selectedEntry("last", "Rome")], journeyEnd: { state: "selected" as const, value: end }, tripType };
      const restored = handoff.readHomepageInput({ snapshot }, "owner-a");
      assert(restored);
      const result = project(restored.snapshot);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(result.draft.routeIntent?.tripType, end.mode === "explicit" ? "one_way" : end.mode === "same_as_start" ? "return_to_start" : "unknown_legacy");
      assert.deepEqual(JSON.parse(JSON.stringify(result.draft.journeyEnd)), end);
      assert.deepEqual(result.draft.destinations?.map(stop => stop.id), ["first", "middle", "last"]);
    }
  }
});

test("partial origin is recoverable draft text but blocks canonical submission", () => {
  const snapshot = { ...fresh(), originInput: "Lon", origin: { state: "cleared" as const } };
  assert.equal(handoff.readHomepageInput({ snapshot }, "owner-a")?.snapshot.originInput, "Lon");
  const result = project(snapshot);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.deepEqual(result.issues, [{ field: "origin", code: "unresolved" }]);
});

test("affirmative whole-trip One way survives fallback and supplied semantic capture", () => {
  for (const prompt of ["A one-way trip through Tokyo and Kyoto", "Un viaje de solo ida por Tokio y Kioto"]) {
    const snapshot = describe(prompt);
    for (const capture of [undefined, { ...captureJourneyBrief(prompt), journeyEnd: { mode: "unknown" as const } }]) {
      const result = project(snapshot, capture);
      assert.equal(result.ok, true);
      if (!result.ok) continue;
      assert.equal(result.draft.routeIntent?.tripType, "one_way");
      assert.deepEqual(result.draft.routeIntent?.journeyEnd, { mode: "unknown" });
    }
  }
});

test("negated and ambiguous trip-level claims retain source and require review", async () => {
  const api = await choices();
  for (const prompt of ["Not a one-way trip through Japan", "Maybe a one-way trip through Japan", "No será un viaje de solo ida", "No sé si será de solo ida o de vuelta"]) {
    const evidence = api.homepageCapturedRouteEvidence(prompt);
    assert.equal(evidence.status, "requires_review", prompt);
    assert.notEqual(evidence.tripType, "one_way", prompt);
    const result = project(describe(prompt));
    assert.equal(result.ok, false, prompt);
    if (!result.ok) assert.equal(result.issues[0]?.field, "tripType");
  }
});

test("a one-way ticket is not whole-trip One way evidence", async () => {
  const api = await choices();
  assert.equal(api.homepageCapturedRouteEvidence("A one-way ticket to Tokyo, then return home").tripType, null);
  assert.equal(api.homepageCapturedRouteEvidence("Un billete de solo ida a Tokio para nuestro viaje").tripType, null);
});

test("selected Return conflicts with a captured explicit finish before acceptance", () => {
  const snapshot = { ...describe("Tokyo 3n, Kyoto 2n, Rome 3n"), tripType: { state: "selected" as const, value: "return_to_start" as const } };
  const capture = { ...captureJourneyBrief(snapshot.prompt), journeyEnd: { mode: "explicit" as const, place: { name: "Rome", canonicalPlaceId: "rome" } } };
  const result = project(snapshot, capture);
  assert.equal(result.ok, false);
  if (!result.ok) assert.deepEqual(result.issues, [{ field: "tripType", code: "conflict" }]);
});

test("reviewed Return survives unchanged capture, freezing and reload without losing source or stays", async () => {
  const api = await choices();
  const snapshot = { ...describe("Tokyo 3n, Kyoto 2n, Rome 3n"), tripType: { state: "selected" as const, value: "return_to_start" as const }, journeyEnd: { state: "selected" as const, value: { mode: "same_as_start" as const } } };
  const capture = { ...captureJourneyBrief(snapshot.prompt), journeyEnd: { mode: "explicit" as const, place: { name: "Rome", canonicalPlaceId: "rome" } } };
  const evidence = api.homepageCapturedRouteEvidence(snapshot.prompt, capture);
  const reviewed = { ...snapshot, routeReview: { version: 1 as const, acceptedTripType: "return_to_start" as const, reviewedInputKey: api.homepageRouteReviewKey(snapshot, evidence) } };
  const receipt = handoff.createPendingIntakeReceipt(reviewed, { handoffId: "reviewed", tripId: "reviewed-trip" });
  const restored = handoff.readHomepageInput(JSON.parse(JSON.stringify({ snapshot: reviewed, receipt })), "owner-a");
  assert(restored?.receipt?.version === 2);
  const result = project(restored.receipt.frozenSnapshot, capture);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.draft.routeIntent?.tripType, "return_to_start");
  assert.deepEqual(result.draft.routeIntent?.journeyEnd, { mode: "same_as_start" });
  assert.equal(result.draft.brief, snapshot.prompt);
  assert.deepEqual(result.draft.routeIntent?.destinations.map(intent => intent.requestedNights), [3, 2, 3]);
});

test("later meaningful edit permanently retires review while unrelated controls preserve it", async () => {
  const api = await choices();
  const snapshot = { ...describe("Finish in Rome"), tripType: { state: "selected" as const, value: "return_to_start" as const }, routeReview: { version: 1 as const, acceptedTripType: "return_to_start" as const, reviewedInputKey: "original-review" } };
  assert.deepEqual(api.invalidateHomepageRouteReview(snapshot, { ...snapshot, budget: { state: "selected", value: "high" } }).routeReview, snapshot.routeReview);
  const edited = api.invalidateHomepageRouteReview(snapshot, { ...snapshot, prompt: "Finish in Madrid" });
  assert.equal(edited.routeReview, undefined);
  assert.equal(api.invalidateHomepageRouteReview(edited, { ...edited, prompt: snapshot.prompt }).routeReview, undefined);
});

test("pending direct domain recovery retains exact intake without homepage envelope access", async () => {
  assert.equal(typeof handoff.retainPendingIntakeReview, "function", "domain review persistence is missing");
  const api = await choices();
  const snapshot = JSON.parse(JSON.stringify(describe("Maybe a one-way trip through Japan"))) as handoff.HomepageInputSnapshot;
  const receipt = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "direct", tripId: "direct-trip" });
  const key = homepageInputStorageKey(snapshot.ownerId);
  const values = new Map([[key, JSON.stringify({ snapshot, receipt })]]);
  const storage = {
    getItem: (key: string) => { assert.notEqual(key, handoff.HOME_TRIP_DRAFT_KEY); return values.get(key) ?? null; },
    setItem: (key: string, value: string) => { assert.notEqual(key, handoff.HOME_TRIP_DRAFT_KEY); values.set(key, value); },
    removeItem: (key: string) => { assert.notEqual(key, handoff.HOME_TRIP_DRAFT_KEY); values.delete(key); },
  };
  const evidence = api.homepageCapturedRouteEvidence(snapshot.prompt);
  const retained = await handoff.retainPendingIntakeReview({ storage, receipt, fromHomepage: false, issues: [{ field: "tripType", code: "unresolved" }], evidence, isCurrent: () => true, lock });
  assert.equal(retained.ok, true);
  const blocked = handoff.readHomepageInput(JSON.parse(values.get(key)!), snapshot.ownerId);
  assert.deepEqual(blocked?.receipt, receipt);
  assert.deepEqual(blocked?.snapshot, snapshot);
  const edited = await handoff.discardPendingIntakeForEdit({ storage, receipt, fromHomepage: false, preserveReview: true, isCurrent: () => true, lock });
  assert.equal(edited.ok, true);
  const restored = handoff.readHomepageInput(JSON.parse(values.get(key)!), snapshot.ownerId);
  assert.deepEqual(restored?.snapshot, snapshot);
  assert.equal(restored?.receipt, undefined);
  assert.equal(restored?.review?.phase, "editing");
  assert.deepEqual(restored?.review?.receipt, receipt);
});

test("opposed whole-trip source and selected toggle require deliberate review", async () => {
  const api = await choices();
  for (const [prompt, end] of [
    ["A one-way trip through Japan", { mode: "same_as_start" }],
    ["A round-trip journey through Japan", { mode: "explicit", place: { name: "Rome" } }],
    ["A one-way trip and a round-trip journey", { mode: "unknown" }],
  ] as const) assert.equal(api.homepageCapturedRouteEvidence(prompt, { journeyEnd: end }).status, "requires_review");
  const result = project({ ...describe("A round-trip journey through Japan"), tripType: { state: "selected", value: "one_way" } });
  assert.equal(result.ok, false);
});

test("questions, conditionals and English/Spanish refusals never assert whole-trip One way", async () => {
  const api = await choices();
  for (const prompt of [
    "No quiero un viaje de solo ida por Japón",
    "I won't take a one-way trip through Japan",
    "Should this be a one-way trip through Japan?",
    "Would a one-way trip through Japan work?",
    "If we take a one-way trip through Japan, would that work?",
    "Si hago un viaje de solo ida por Japón, ¿sería posible?",
    "¿Debería ser un viaje de solo ida por Japón?",
    "No me gustaría un viaje de solo ida por Japón",
    "We decided against a one-way trip through Japan",
    "The agent mentioned a one-way trip through Japan",
  ]) {
    const evidence = api.homepageCapturedRouteEvidence(prompt);
    assert.equal(evidence.status, "requires_review", prompt);
    assert.equal(evidence.tripType, null, prompt);
    assert.equal(project(describe(prompt)).ok, false, prompt);
  }
  for (const prompt of ["A one-way trip through Japan", "I want a one-way trip through Japan", "Plan a one-way trip through Japan", "Un viaje de solo ida por Japón", "Quiero un viaje de solo ida por Japón", "Our trip will be one way through Japan"]) {
    assert.equal(api.homepageCapturedRouteEvidence(prompt).tripType, "one_way", prompt);
    const capture = { ...captureJourneyBrief(prompt), journeyEnd: { mode: "unknown" as const } };
    const result = project(describe(prompt), capture);
    assert(result.ok, prompt);
    assert.equal(result.draft.routeIntent?.tripType, "one_way", prompt);
  }
});

test("review acknowledgement binds geographic evidence and owner but ignores unrelated controls", async () => {
  const api = await choices();
  const snapshot = { ...describe("Finish in Rome"), tripType: { state: "selected" as const, value: "return_to_start" as const } };
  const evidence = api.homepageCapturedRouteEvidence(snapshot.prompt, { journeyEnd: { mode: "explicit", place: { name: "Rome", canonicalPlaceId: "rome" } } });
  const key = api.homepageRouteReviewKey(snapshot, evidence);
  assert.notEqual(api.homepageRouteReviewKey({ ...snapshot, ownerId: "owner-b" }, evidence), key);
  assert.notEqual(api.homepageRouteReviewKey(snapshot, { ...evidence, journeyEnd: { mode: "explicit", place: { name: "Madrid", canonicalPlaceId: "madrid" } } }), key);
  assert.equal(api.homepageRouteReviewKey({ ...snapshot, dates: { state: "selected", value: { start: "2026-11-01", end: "2026-11-14" } } }, evidence), key);
});

test("domain review rejects a stale revision and a failed write preserves original bytes", async () => {
  const api = await choices();
  const snapshot = describe("Maybe a one-way trip through Japan");
  const receipt = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "guarded", tripId: "guarded-trip" });
  const key = homepageInputStorageKey(snapshot.ownerId);
  const original = JSON.stringify({ snapshot, receipt });
  const values = new Map([[key, original]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => { values.delete(key); } };
  const input = { storage, receipt, fromHomepage: false, issues: [{ field: "tripType" as const, code: "unresolved" as const }], evidence: api.homepageCapturedRouteEvidence(snapshot.prompt), isCurrent: () => true, lock };
  values.set(key, JSON.stringify({ snapshot: { ...snapshot, revision: 1, prompt: "A one-way trip" }, receipt }));
  const newer = values.get(key);
  assert.deepEqual(await handoff.retainPendingIntakeReview(input), { ok: false, reason: "stale" });
  assert.equal(values.get(key), newer);
  values.set(key, original);
  const failing = { ...storage, setItem: () => { throw new Error("Quota exceeded"); } };
  assert.deepEqual(await handoff.retainPendingIntakeReview({ ...input, storage: failing }), { ok: false, reason: "storage" });
  assert.equal(values.get(key), original);
});

test("homepage domain recovery preserves matching envelope until durable correction and guards replacement", async () => {
  const api = await choices();
  const snapshot = describe("Maybe a one-way trip through Japan");
  const receipt = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "home", tripId: "home-trip" });
  const key = homepageInputStorageKey(snapshot.ownerId);
  const envelope = JSON.stringify({ version: 2, phase: "pending-interpretation", receipt });
  const values = new Map([[key, JSON.stringify({ snapshot, receipt })], [handoff.HOME_TRIP_DRAFT_KEY, envelope]]);
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => { values.delete(key); } };
  const retained = await handoff.retainPendingIntakeReview({ storage, receipt, fromHomepage: true, issues: [{ field: "tripType", code: "unresolved" }], evidence: api.homepageCapturedRouteEvidence(snapshot.prompt), isCurrent: () => true, lock });
  assert.equal(retained.ok, true);
  assert.equal(values.get(handoff.HOME_TRIP_DRAFT_KEY), envelope);
  const foreign = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "foreign", tripId: "foreign-trip" });
  values.set(handoff.HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: foreign }));
  assert.deepEqual(await handoff.discardPendingIntakeForEdit({ storage, receipt, fromHomepage: true, preserveReview: true, lock }), { ok: false, reason: "stale" });
  values.set(handoff.HOME_TRIP_DRAFT_KEY, envelope);
  const failedRemove = { ...storage, removeItem: () => { throw new Error("Remove failed"); } };
  const blockedBytes = values.get(key);
  assert.deepEqual(await handoff.discardPendingIntakeForEdit({ storage: failedRemove, receipt, fromHomepage: true, preserveReview: true, lock }), { ok: false, reason: "storage" });
  assert.equal(values.get(key), blockedBytes);
  assert.equal(values.get(handoff.HOME_TRIP_DRAFT_KEY), envelope);
});

test("matching handoff label alone cannot authorise a foreign trip envelope", () => {
  const snapshot = describe("Tokyo and Kyoto");
  const receipt = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "same-label", tripId: "actual-trip" });
  const foreign = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "same-label", tripId: "other-trip" });
  const values = new Map([[homepageInputStorageKey(snapshot.ownerId), JSON.stringify({ snapshot, receipt })], [handoff.HOME_TRIP_DRAFT_KEY, JSON.stringify({ version: 2, phase: "pending-interpretation", receipt: foreign })]]);
  assert.equal(handoff.pendingReceiptStillCurrent({ getItem: key => values.get(key) ?? null }, receipt, true), false);
});

test("a retained receipt cannot apply its capture after the editable revision changes", () => {
  const snapshot = describe("Tokyo and Kyoto");
  const receipt = handoff.createPendingIntakeReceipt(snapshot, { handoffId: "same", tripId: "same-trip" });
  const values = new Map([[homepageInputStorageKey(snapshot.ownerId), JSON.stringify({ snapshot: { ...snapshot, revision: 1, prompt: "Tokyo and Rome" }, receipt })]]);
  assert.equal(handoff.pendingReceiptStillCurrent({ getItem: key => values.get(key) ?? null }, receipt, false), false);
});

test("a prompt replacing its selected origin retires stale raw origin before preflight and projection", () => {
  const snapshot = { ...describe("From London to Tokyo for 5 nights"), tripType: { state: "selected" as const, value: "one_way" as const },
    origin: { state: "selected" as const, value: { name: "London", canonicalPlaceId: "london" } }, originInput: "London" };
  const next = handoff.homepageSnapshotForDescribePrompt(snapshot, "From Madrid to Tokyo for 5 nights");
  assert.equal(next.origin.state, "untouched");
  assert.equal(next.originInput, "");
  assert.equal(handoff.homepagePreflightIssues(next).some(issue => issue.field === "origin"), false);
  const result = project(next);
  assert(result.ok);
  assert.equal(result.draft.locationMentions?.find(mention => mention.role === "origin")?.canonicalName, "Madrid");
  assert.notEqual(result.draft.routeIntent?.origin?.name, "London");
  assert.equal(snapshot.originInput, "London");
});

test("legacy known ending cannot hide newly captured contrary endpoint evidence", () => {
  const snapshot = { ...emptyHomepageInput("owner-a"), mode: "describe" as const, prompt: "Tokyo and Rome", journeyEnd: { state: "selected" as const, value: { mode: "same_as_start" as const } } };
  const capture = { ...captureJourneyBrief(snapshot.prompt), journeyEnd: { mode: "explicit" as const, place: { name: "Rome", canonicalPlaceId: "rome" } } };
  const result = project(snapshot, capture);
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.issues[0]?.code, "conflict");
});
