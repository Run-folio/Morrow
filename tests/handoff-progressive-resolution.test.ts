import assert from "node:assert/strict";
import test from "node:test";

import { createHandoffSharedLookup, handoffLookupMentions, handoffOutcomeIsCurrent, handoffRouteStops, handoffStopOccurrenceId, insertHandoffOccurrence, mergeHandoffLocationChoice, resolveHandoffIncrementally, retireHandoffResolutionStatus } from "../lib/easyt/home-trip-handoff.ts";
import { captureJourneyBrief } from "../lib/easyt/journey-capture.ts";
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { builderPlaceCommand, prepareBuilderHandlerEdit } from '../lib/easyt/trip-builder-handler-contract.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import { preferredHandoffLocationChoice } from '../lib/easyt/home-trip-handoff.ts';

test('actual intake callback accepts an unchanged sibling after another enrichment advances revision',()=>{
  const capture=captureJourneyBrief('Tokyo and Kyoto');
  let trip=requireReadableTripDocument(canonicalRouteFixture()),revision=1;
  trip.brief.structuredBrief=capture.structuredBrief;
  const mention=capture.mentions.find(item=>item.canonicalName==='Kyoto')!;
  trip.brief.intent.route.destinations[1]!.id=mention.mentionId;
  const lookupSession={statuses:new Map([[mention.mentionId,'pending']]),handled:new Set<string>()};
  let accepted=0;
  const scope={lookupSession,handoffLookupSessionRef:{current:lookupSession},isCurrent:()=>true,
    builderEditSessionRef:{current:{getSnapshot:()=>({trip,inputRevision:revision,browserOwnerId:'owner-a'})}},
    activeBrowserOwnerIdRef:{current:'owner-a'},lookupOwnerId:'owner-a',lookupTripId:trip.id,
    removedPlaceMentionIdsRef:{current:[]},placeSelectionsRef:{current:[]},setHandoffResolutionStatuses:()=>{},
    handoffOutcomeIsCurrent,retireHandoffResolutionStatus,preferredHandoffLocationChoice,
    isOriginMention:(item:typeof mention)=>item.role==='origin'||item.role==='fixed_start',draft:{},originResolutionVersionRef:{current:0},originVersion:0,
    seedById:new Map(trip.stops.map(stop=>[stop.id,{...stop,coordinates:[stop.longitude,stop.latitude]}])),handoffOccurrenceMentionIdsRef:{current:{[trip.stops[1]!.id]:mention.mentionId}},handoffStopOccurrenceId,builderPlaceCommand,
    dispatchAcceptedBuilderEdit:(command:Parameters<typeof prepareBuilderHandlerEdit>[1],options:{expectedInputRevision:number})=>{
      assert.equal(options.expectedInputRevision,revision);
      const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(result.ok);trip=result.trip;revision++;accepted++;
    }};
  const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('      const onOutcome ='),source.indexOf('      const runLookups ='));
  const script=ts.transpileModule(`${body}\nreturn onOutcome;`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  const outcome=new Function('scope',`with(scope){${script}}`)(scope);
  outcome({item:mention,value:[{name:'Kyoto',country:'Japan',coordinates:[135.7681,35.0116]}],status:'resolved'},0);
  assert.equal(accepted,1,'a sibling input revision must not invalidate an unchanged target');
  const acceptedTrip=structuredClone(trip);
  const send=()=>{lookupSession.statuses.set(mention.mentionId,'pending');outcome({item:mention,value:[{name:'Kyoto',country:'Japan',coordinates:[135.7681,35.0116]}],status:'resolved'},0)};
  trip.stops[1]!.longitude=(trip.stops[1]!.longitude??0)+1;send();assert.equal(accepted,1,'a manually replaced target must reject the old result');
  trip=structuredClone(acceptedTrip);scope.activeBrowserOwnerIdRef.current='owner-b';send();assert.equal(accepted,1,'foreign owner result must be discarded');
  scope.activeBrowserOwnerIdRef.current='owner-a';trip.id='other-trip';send();assert.equal(accepted,1,'foreign trip result must be discarded');
  trip=structuredClone(acceptedTrip);
  trip.brief.intent.route.destinations=trip.brief.intent.route.destinations.filter(item=>item.id!==mention.mentionId);
  lookupSession.statuses.set(mention.mentionId,'pending');outcome({item:mention,value:[{name:'Kyoto',country:'Japan',coordinates:[135.7681,35.0116]}],status:'resolved'},0);
  assert.equal(accepted,1,'removed intent must never resurrect');
});

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

test("a provider response just over four seconds is not timed out by the default handoff lookup", async () => {
  const outcomes = await resolveHandoffIncrementally(["slow-but-available"],
    async () => new Promise<string>((resolve) => setTimeout(() => resolve("resolved"), 4_100)),
    { onOutcome: () => {} });
  assert.equal(outcomes[0]?.status, "resolved");
  assert.equal(outcomes[0]?.value, "resolved");
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

test("late provider outcomes cannot restore a handled or removed occurrence", () => {
  assert.equal(handoffOutcomeIsCurrent("tokyo-2", "pending", [], []), true);
  assert.equal(handoffOutcomeIsCurrent("tokyo-2", "resolved", [], []), false);
  assert.equal(handoffOutcomeIsCurrent("tokyo-2", "pending", ["tokyo-2"], []), false);
  assert.equal(handoffOutcomeIsCurrent("tokyo-2", "pending", [], ["tokyo-2"]), false);
});

test("retiring one handled lookup leaves a sibling pending without a false completion", () => {
  const status = { "tokyo-first": "pending" as const, kyoto: "pending" as const };
  assert.deepEqual(retireHandoffResolutionStatus(status, "tokyo-first"), { kyoto: "pending" });
  assert.deepEqual(status, { "tokyo-first": "pending", kyoto: "pending" });
});

test("two unresolved visits to one canonical place retain separate occurrence IDs", () => {
  const first = { mentionId: "mention-a", order: 1, canonicalName: "Tokyo" };
  const second = { mentionId: "mention-b", order: 3, canonicalName: "Tokyo" };
  const mapping = { "destination-1": "mention-a", "destination-3": "mention-b" };
  assert.equal(handoffStopOccurrenceId(first, mapping), "destination-1");
  assert.equal(handoffStopOccurrenceId(second, mapping), "destination-3");
  assert.notEqual(handoffStopOccurrenceId(first, {}), handoffStopOccurrenceId(second, {}));
});

test("Describe lookup IDs match the initial canonical route seeds and preserve an unresolved middle occurrence", () => {
  const mentions = captureJourneyBrief("Tokyo, Kyoto and Osaka").mentions.filter((mention) => mention.role !== "origin");
  const seeds = handoffRouteStops(mentions);
  for (const mention of mentions) {
    const seed = seeds.find((stop) => stop.name === mention.canonicalName);
    if (seed) assert.equal(handoffStopOccurrenceId(mention, {}), seed.id);
  }
  const current = [{ id: "tokyo-1", name: "Tokyo" }, { id: "kyoto-3", name: "Kyoto" }];
  const mentionOrder = [{ mentionId: "tokyo", order: 1, canonicalName: "Tokyo" }, { mentionId: "middle", order: 2, canonicalName: "X" }, { mentionId: "kyoto", order: 3, canonicalName: "Kyoto" }];
  assert.deepEqual(insertHandoffOccurrence(current, { id: "x-2", name: "X" }, mentionOrder[1]!, mentionOrder, {}).map((stop) => stop.id), ["tokyo-1", "x-2", "kyoto-3"]);
  assert.deepEqual(insertHandoffOccurrence([...current].reverse(), { id: "x-2", name: "X" }, mentionOrder[1]!, mentionOrder, {}).map((stop) => stop.id), ["kyoto-3", "tokyo-1", "x-2"], "an existing user reorder remains intact");
});

test("a timed-out occurrence aborts its own provider work", async () => {
  let aborted = false;
  const outcomes = await resolveHandoffIncrementally(["slow"], async (_id, signal) => new Promise<string>((_, reject) => {
    signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
  }), { timeoutMs: 5, onOutcome: () => {} });
  assert.equal(outcomes[0]?.status, "timeout");
  assert.equal(aborted, true);
});

test("shared lookup aborts when its final consumer times out but keeps a surviving repeated occurrence", async () => {
  const session = new AbortController();
  let calls = 0;
  let providerAborts = 0;
  const lookup = createHandoffSharedLookup((name: string) => name, async (_name, signal) => {
    calls += 1;
    return new Promise<string>((resolve, reject) => {
      signal.addEventListener("abort", () => { providerAborts += 1; reject(new Error("aborted")); });
      setTimeout(() => resolve("Tokyo"), 20);
    });
  }, session.signal);
  const first = new AbortController();
  const second = new AbortController();
  const a = lookup("Tokyo", first.signal);
  const b = lookup("Tokyo", second.signal);
  first.abort();
  await assert.rejects(a);
  assert.equal(await b, "Tokyo");
  assert.equal(calls, 1);
  assert.equal(providerAborts, 0);
  const lone = new AbortController();
  const pending = lookup("Kyoto", lone.signal);
  lone.abort();
  await assert.rejects(pending);
  assert.equal(providerAborts, 1);
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
