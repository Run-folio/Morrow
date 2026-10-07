import assert from "node:assert/strict";
import test from "node:test";
import { canonicalRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { requireReadableTripDocument } from "../lib/easyt/trip-document.ts";
import { routeProjectionInputKey } from "../lib/easyt/trip-route-intent.ts";
import { canonicalTripForOwner, canonicalTripStopIdentityMap } from '../lib/easyt/trip-promotion.ts';

const modulePath = "../lib/easyt/trip-builder-input-draft.ts";
const modulePromise = import(modulePath).catch((error: NodeJS.ErrnoException) => {
  if (error.code === "ERR_MODULE_NOT_FOUND" && error.message.includes("trip-builder-input-draft.ts")) return null;
  throw error;
});
async function drafts() {
  const api = await modulePromise;
  assert.ok(api, "Task 1 field-bound input draft codec is not implemented");
  return api;
}
function fixture() {
  const trip = requireReadableTripDocument(canonicalRouteFixture());
  trip.brief.intent.route.destinations[2]!.requestedNights = 2;
  return trip;
}
type Binding = { kind: "origin" } | { kind: "nights"; stopId: string; intentId: string };
function nightBinding(trip: ReturnType<typeof fixture>): Binding {
  return { kind: "nights", stopId: trip.stops[2]!.id, intentId: trip.brief.intent.route.destinations[2]!.id };
}
function field(draft: any, binding: Binding) {
  return draft.fields.find((item: any) => JSON.stringify(item.binding) === JSON.stringify(binding));
}
function memoryStorage() {
  const values = new Map<string, string>();
  let failNext = false;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem(key: string, value: string) {
      if (failNext) { failNext = false; throw new Error("Device storage unavailable"); }
      values.set(key, value);
    },
    failNextWrite() { failNext = true; },
  };
}

test("partial_night_text_does_not_replace_canonical_requested_nights", async () => {
  const api = await drafts();
  const trip = fixture();
  const before = structuredClone(trip);
  const binding = nightBinding(trip);
  const draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  assert.equal(field(draft, binding).raw, "2x");
  assert.equal(field(draft, binding).status, "editable");
  assert.equal(trip.brief.intent.route.destinations[2]!.requestedNights, 2);
  assert.deepEqual(trip, before);
  const storage = memoryStorage();
  assert.equal(api.writeBuilderInputDraft(storage, trip, draft).ok, true);
  const reloaded = api.readBuilderInputDraft(storage, trip);
  assert.equal(reloaded.kind, "readable");
  assert.equal(field(reloaded.draft, binding).raw, "2x");
  assert.deepEqual(trip, before);
});

test("future_or_foreign_draft_preserves_original_bytes", async () => {
  const api = await drafts();
  const trip = fixture();
  const storage = memoryStorage();
  const key = api.builderInputDraftKey(trip.ownerId, trip.id);
  assert.equal(key, `easyt-private:${trip.ownerId}:builder-input:${encodeURIComponent(trip.id)}`);
  const draft = api.createBuilderInputDraft(trip);
  for (const bytes of ["{broken", JSON.stringify({ ...draft, version: 99 }), JSON.stringify({ ...draft, ownerId: "other-owner" }), JSON.stringify({ ...draft, tripId: "other-trip" })]) {
    storage.setItem(key, bytes);
    assert.equal(api.readBuilderInputDraft(storage, trip).kind, "protected");
    assert.equal(api.writeBuilderInputDraft(storage, trip, draft).ok, false);
    assert.equal(storage.getItem(key), bytes);
  }
});

test("partial_nights_and_origin_survive_unrelated_preference_edit_projection_and_reload", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  let draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  draft = api.updateBuilderInputDraft(draft, trip, { kind: "origin" }, "Madri");
  const original = structuredClone(draft);
  const changed = structuredClone(trip);
  changed.brief.budgetBand = "high";
  changed.brief.intent.preferences.budgetSensitivity = "high";
  changed.brief.intent.route.projectionInputKey = routeProjectionInputKey(changed);
  changed.updatedAt = "2026-10-06T10:00:00.000Z";
  draft = api.rebindBuilderInputDraft(draft, changed);
  const storage = memoryStorage();
  assert.equal(api.writeBuilderInputDraft(storage, changed, draft).ok, true);
  // Both device and account canonical documents use the real JSON document codec.
  for (const canonicalReload of [requireReadableTripDocument(structuredClone(changed)), requireReadableTripDocument(JSON.parse(JSON.stringify(changed)))]) {
    const result = api.readBuilderInputDraft(storage, canonicalReload);
    assert.equal(result.kind, "readable");
    for (const sourceBinding of [binding, { kind: "origin" } as Binding]) {
      assert.equal(field(result.draft, sourceBinding).raw, field(original, sourceBinding).raw);
      assert.equal(field(result.draft, sourceBinding).status, "editable");
    }
    assert.equal(canonicalReload.brief.intent.route.destinations[2]!.requestedNights, 2);
    assert.equal(canonicalReload.brief.origin, "London");
  }
  assert.deepEqual(original.fields.map((item: any) => item.raw), ["2x", "Madri"]);
});

test("removed_or_replaced_occurrence_preserves_but_blocks_its_raw_field", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  const draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  const originalField = structuredClone(field(draft, binding));
  for (const kind of ["remove", "replace"] as const) {
    const changed = structuredClone(trip);
    if (kind === "remove") {
      changed.stops = changed.stops.slice(0, 2);
      changed.brief.intent.route.destinations = changed.brief.intent.route.destinations.slice(0, 2);
      changed.brief.intent.route.orderedStopIds = changed.stops.map(stop => stop.id);
    } else {
      // Keep stable IDs but replace the bound canonical identity.
      changed.stops[2]!.canonicalPlaceId = changed.stops[0]!.canonicalPlaceId;
      changed.stops[2]!.name = changed.stops[0]!.name;
      changed.brief.intent.route.destinations[2]!.selectedPlace = structuredClone(changed.brief.intent.route.destinations[0]!.selectedPlace);
    }
    const rebound = api.rebindBuilderInputDraft(draft, changed);
    const retained = field(rebound, binding);
    assert.equal(retained.raw, "2x");
    assert.equal(retained.status, "binding-conflict");
    assert.deepEqual(retained.binding, originalField.binding);
    assert.equal(retained.basisKey, originalField.basisKey);
    assert.equal(rebound.fields.length, 1);
    const storage = memoryStorage();
    assert.equal(api.writeBuilderInputDraft(storage, changed, rebound).ok, true);
    const reloaded = api.readBuilderInputDraft(storage, requireReadableTripDocument(JSON.parse(JSON.stringify(changed))));
    assert.equal(reloaded.kind, "readable");
    assert.equal(field(reloaded.draft, binding).status, "binding-conflict");
    assert.equal(field(reloaded.draft, binding).raw, "2x");
  }
  assert.equal(field(draft, binding).status, "editable");
});

test("accept_one_field_consumes_only_its_matching_raw_revision", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  let draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "3");
  draft = api.updateBuilderInputDraft(draft, trip, { kind: "origin" }, "Madri");
  const original = structuredClone(draft);
  const accepted = api.consumeBuilderInputDraft(draft, binding, draft.inputRevision, "3");
  assert.equal(field(accepted, binding), undefined);
  assert.equal(field(accepted, { kind: "origin" }).raw, "Madri");
  assert.deepEqual(api.consumeBuilderInputDraft(draft, binding, draft.inputRevision - 1, "3"), draft);
  assert.deepEqual(api.consumeBuilderInputDraft(draft, binding, draft.inputRevision, "2"), draft);
  assert.deepEqual(draft, original);
});

test("old_envelope_rebinds_safely_after_draft_write_failure", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  const draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  const storage = memoryStorage();
  assert.equal(api.writeBuilderInputDraft(storage, trip, draft).ok, true);
  const key = api.builderInputDraftKey(trip.ownerId, trip.id);
  const originalBytes = storage.getItem(key);
  const changed = structuredClone(trip);
  changed.brief.budgetBand = "high";
  changed.brief.intent.preferences.budgetSensitivity = "high";
  changed.brief.intent.route.projectionInputKey = routeProjectionInputKey(changed);
  const rebound = api.rebindBuilderInputDraft(draft, changed);
  storage.failNextWrite();
  assert.equal(api.writeBuilderInputDraft(storage, changed, rebound).ok, false);
  assert.equal(storage.getItem(key), originalBytes);
  const reload = api.readBuilderInputDraft(storage, requireReadableTripDocument(JSON.parse(JSON.stringify(changed))));
  assert.equal(reload.kind, "readable");
  assert.equal(field(reload.draft, binding).raw, "2x");
  assert.equal(field(reload.draft, binding).status, "editable");
  assert.equal(storage.getItem(key), originalBytes, "hydration must not overwrite the retained envelope");
});

test("newer_raw_revision_cannot_be_replaced_by_older_projection_write", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  const older = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  const newer = api.updateBuilderInputDraft(older, trip, binding, "2xx");
  const storage = memoryStorage();
  assert.equal(api.writeBuilderInputDraft(storage, trip, newer).ok, true);
  const bytes = storage.getItem(api.builderInputDraftKey(trip.ownerId, trip.id));
  assert.equal(api.writeBuilderInputDraft(storage, trip, older).ok, false);
  assert.equal(storage.getItem(api.builderInputDraftKey(trip.ownerId, trip.id)), bytes);
});

test("generated_allocation_and_same_identity_enrichment_leave_raw_nights_editable", async () => {
  const api = await drafts();
  const trip = fixture();
  const binding = nightBinding(trip);
  const draft = api.updateBuilderInputDraft(api.createBuilderInputDraft(trip), trip, binding, "2x");
  const changed = structuredClone(trip);
  changed.stops[2]!.nights = 4;
  changed.stops[2]!.latitude = 34.386;
  changed.brief.nightAllocations![changed.stops[2]!.id] = 4;
  changed.brief.intent.route.destinations[2]!.selectedPlace!.providerId = "new-provider-evidence";
  assert.equal(field(api.rebindBuilderInputDraft(draft, changed), binding).status, "editable");
});
test('explicit_browser_scope_keeps_ownerless_body_and_remaps_only_proven_raw_fields', async () => {
  const api=await drafts(); const trip=fixture(); trip.ownerId=null;
  const storage={values:new Map<string,string>(),getItem(key:string){return this.values.get(key)??null;},setItem(key:string,value:string){this.values.set(key,value);}};
  let draft=api.createBuilderInputDraft(trip,0,'owner-a');
  draft=api.updateBuilderInputDraft(draft,trip,{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto'},'3.','owner-a');
  draft=api.updateBuilderInputDraft(draft,trip,{kind:'destination',intentId:'intent:kyoto'},'Kyo','owner-a');
  draft=api.updateBuilderInputDraft(draft,trip,{kind:'nights',intentId:'foreign-intent',stopId:'kyoto'},'keep blocked','owner-a');
  assert.ok(api.writeBuilderInputDraft(storage,trip,draft,'owner-a').ok); assert.equal(trip.ownerId,null);
  assert.equal(api.readBuilderInputDraft(storage,trip).kind,'empty');
  const next=requireReadableTripDocument(canonicalTripForOwner('owner-a',trip));
  const remapped=api.remapBuilderInputDraftIdentity(draft,trip,next,canonicalTripStopIdentityMap(trip),'owner-a');
  assert.ok(api.writeBuilderInputDraft(storage,next,remapped,'owner-a').ok);
  assert.equal(remapped.fields[0]!.status,'editable'); assert.equal(remapped.fields[1]!.status,'editable');
  assert.deepEqual(remapped.fields[2]!.acceptedSource,draft.fields[2]!.acceptedSource);
  assert.deepEqual(remapped.fields[2]!.binding,draft.fields[2]!.binding); assert.equal(remapped.fields[2]!.raw,'keep blocked');
  assert.equal(remapped.fields[2]!.status,'binding-conflict');
  assert.equal(api.readBuilderInputDraft(storage,next,'owner-a').kind,'readable');
  const foreign={...next,ownerId:'owner-b'}; assert.equal(api.readBuilderInputDraft(storage,foreign,'owner-a').kind,'protected');
});

test('new destination intake stays owner trip scoped and survives unrelated canonical changes and exact consumption',async()=>{
 const api=await drafts();const trip=fixture();const binding={kind:'destination-add'} as const;const storage=memoryStorage();
 const raw='San Pedro part';const input=api.updateBuilderInputDraft(api.createBuilderInputDraft(trip),trip,binding,raw);
 const newer=structuredClone(trip);newer.brief.budgetBand='high';newer.stops.reverse();const rebound=api.rebindBuilderInputDraft(input,newer);
 assert.equal(rebound.fields[0]!.raw,raw);assert.equal(rebound.fields[0]!.status,'editable');assert.ok(api.writeBuilderInputDraft(storage,newer,rebound).ok);
 const loaded=api.readBuilderInputDraft(storage,newer);assert.equal(loaded.kind,'readable');
 assert.equal(api.consumeBuilderInputDraft(rebound,binding,rebound.inputRevision,'other').fields.length,1);
 assert.equal(api.consumeBuilderInputDraft(rebound,binding,rebound.inputRevision,raw).fields.length,0);
 assert.throws(()=>api.rebindBuilderInputDraft(rebound,{...newer,ownerId:'foreign'}));
});
