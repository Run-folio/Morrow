import assert from "node:assert/strict";
import test from "node:test";

import { handoffLookupMentions, mergeHandoffLocationChoice, resolveHandoffIncrementally } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => { resolve = complete; });
  return { promise, resolve };
}

test("a fast occurrence publishes while an earlier occurrence remains unresolved", async () => {
  const first = deferred<string>();
  const seen: string[] = [];
  const work = resolveHandoffIncrementally(["tokyo-first", "kyoto", "tokyo-last"],
    async (id) => id === "tokyo-first" ? first.promise : id,
    { onOutcome: (outcome) => seen.push(outcome.item), timeoutMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(seen, ["kyoto", "tokyo-last"]);
  first.resolve("tokyo-first");
  const outcomes = await work;
  assert.deepEqual(outcomes.map((outcome) => outcome.item), ["tokyo-first", "kyoto", "tokyo-last"]);
  assert.deepEqual(seen, ["kyoto", "tokyo-last", "tokyo-first"]);
});

test("at most three lookups run together and each repeated occurrence receives its own outcome", async () => {
  const releases: Array<() => void> = [];
  let active = 0;
  let maximum = 0;
  const work = resolveHandoffIncrementally(["tokyo-1", "kyoto", "tokyo-2", "osaka", "nara"],
    async (id) => {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise<void>((resolve) => releases.push(resolve));
      active -= 1;
      return id;
    }, { onOutcome: () => {}, timeoutMs: 1000 });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(maximum, 3);
  while (releases.length) {
    releases.shift()!();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  const outcomes = await work;
  assert.deepEqual(outcomes.map((outcome) => outcome.value), ["tokyo-1", "kyoto", "tokyo-2", "osaka", "nara"]);
  assert.equal(maximum, 3);
});

test("timeout is an explicit per-occurrence result while a sibling remains usable", async () => {
  const outcomes = await resolveHandoffIncrementally(["slow", "fast"],
    async (id) => id === "slow" ? new Promise<string>(() => {}) : "usable",
    { timeoutMs: 5, onOutcome: () => {} });
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["timeout", "resolved"]);
  assert.equal(outcomes[1]?.value, "usable");
});

test("abort discards late outcomes and a fresh session can retry the same name", async () => {
  const controller = new AbortController();
  const late = deferred<string>();
  const seen: string[] = [];
  const work = resolveHandoffIncrementally(["tokyo-1"], async () => late.promise,
    { signal: controller.signal, onOutcome: (outcome) => seen.push(outcome.item) });
  controller.abort();
  late.resolve("old");
  await work;
  assert.equal(seen.length, 0);
  const retry = await resolveHandoffIncrementally(["tokyo-1"], async () => "new",
    { onOutcome: (outcome) => seen.push(outcome.item) });
  assert.equal(retry[0]?.value, "new");
  assert.deepEqual(seen, ["tokyo-1"]);
});

test("only named unresolved direct intent and canonical stops missing coordinates need provider lookup", () => {
  const captured = captureJourneyBrief("Tokyo and Kyoto").mentions.find((mention) => mention.canonicalName === "Tokyo");
  assert(captured);
  const base = { ...captured, coordinates: [139.6917, 35.6895] as [number, number] };
  const named = { ...base, mentionId: "denver-unresolved", canonicalName: "Denver", sourceText: "Denver",
    status: "unresolved" as const, canonicalPlaceId: undefined, coordinates: undefined,
    placeType: "unknown" as const, routability: "non_routable_reference" as const,
    requiresBaseSelection: false, role: "preferred" as const };
  const broad = { ...named, mentionId: "thailand-broad", canonicalName: "Thailand", sourceText: "Thailand",
    placeType: "country" as const, routability: "planning_area" as const, requiresBaseSelection: true };
  const incompleteCanonical = { ...base, mentionId: "kyoto-no-coordinates", coordinates: undefined };
  assert.deepEqual(handoffLookupMentions([base, named, broad, incompleteCanonical]).map((mention) => mention.mentionId),
    ["denver-unresolved", "kyoto-no-coordinates"]);
});

test("late coordinate enrichment keeps current user order and separate Tokyo occurrence identities", () => {
  const mention = captureJourneyBrief("Tokyo and Kyoto").mentions.find((item) => item.canonicalName === "Tokyo");
  assert(mention);
  const reordered = [
    { id: "tokyo-last", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo" },
    { id: "kyoto", name: "Kyoto", country: "Japan", canonicalPlaceId: "kyoto" },
    { id: "tokyo-first", name: "Tokyo", country: "Japan", canonicalPlaceId: "tokyo" },
  ];
  const enriched = mergeHandoffLocationChoice(reordered, mention, {
    name: "Tokyo namesake", country: "Japan", coordinates: [139.6917, 35.6895], providerId: "provider-tokyo",
  }, "tokyo-last");
  assert.deepEqual(enriched.map((stop) => stop.id), ["tokyo-last", "kyoto", "tokyo-first"]);
  assert.deepEqual(enriched.map((stop) => stop.name), ["Tokyo", "Kyoto", "Tokyo"]);
  assert.equal(enriched[0]?.providerId, "provider-tokyo");
  assert.equal(enriched[2]?.providerId, undefined);
});

test("scoped retry keeps the successful sibling and requests only the failed occurrence again", async () => {
  const calls: string[] = [];
  const resolve = async (id: string) => {
    calls.push(id);
    if (id === "kyoto" && calls.filter((call) => call === id).length === 1) throw new Error("temporary failure");
    return id;
  };
  const first = await resolveHandoffIncrementally(["tokyo", "kyoto"], resolve, { onOutcome: () => {} });
  assert.deepEqual(first.map((outcome) => outcome.status), ["resolved", "failed"]);
  const retry = await resolveHandoffIncrementally(first.filter((outcome) => outcome.status === "failed").map((outcome) => outcome.item), resolve, { onOutcome: () => {} });
  assert.deepEqual(retry.map((outcome) => outcome.status), ["resolved"]);
  assert.deepEqual(calls, ["tokyo", "kyoto", "kyoto"]);
});
