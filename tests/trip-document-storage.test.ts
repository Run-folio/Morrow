import assert from "node:assert/strict";
import test from "node:test";
import { legacyRouteFixture, canonicalRouteFixture } from "./fixtures/batch14-route-documents.ts";
import { TripDocumentReadError } from "../lib/easyt/trip-document.ts";
import { EASYT_ACTIVE_TRIP_KEY, loadActiveTripFromStorage, loadLocalTripFromStorage, loadCachedTripFromStorage, loadTripRecoveryFromStorage, listTripRecoveriesFromStorage, loadCurrentTripRecoveryFromStorage, loadRequestedTrip, saveTripToEasyT, cacheCanonicalTripWithRecoveryToStorage, tripCacheStorageKey, tripRecoveryStorageKey, type EasyTBrowserStorage } from "../lib/easyt/storage.ts";
class MemoryStorage implements EasyTBrowserStorage {
  values = new Map<string,string>(); writes = 0;
  get length() { return this.values.size; }
  key(index:number) { return [...this.values.keys()][index] ?? null; }
  getItem(key:string) { return this.values.get(key) ?? null; }
  setItem(key:string, value:string) { this.writes++; this.values.set(key,value); }
  removeItem(key:string) { this.writes++; this.values.delete(key); }
}
test("all_local_read_paths_decode_v1_without_storage_writes", () => {
  const trip = legacyRouteFixture(); const storage = new MemoryStorage();
  storage.values.set(EASYT_ACTIVE_TRIP_KEY, JSON.stringify(trip));
  const snapshot = [...storage.values];
  assert.equal(loadLocalTripFromStorage(storage,trip.id,trip.ownerId)?.schemaVersion,2);
  assert.equal(loadActiveTripFromStorage(storage,trip.ownerId)?.schemaVersion,2);
  assert.equal(loadCurrentTripRecoveryFromStorage(storage,trip.ownerId)?.trip.schemaVersion,2);
  assert.equal(storage.writes,0); assert.deepEqual([...storage.values],snapshot);
  storage.values.set(tripCacheStorageKey(trip.ownerId,trip.id), JSON.stringify({version:2,ownerId:trip.ownerId,tripId:trip.id,trip,cachedAt:trip.updatedAt}));
  storage.values.set(tripRecoveryStorageKey(trip.ownerId,trip.id,"existing"), JSON.stringify({version:2,ownerId:trip.ownerId,tripId:trip.id,trip,state:"pending",writeId:"existing",savedAt:trip.updatedAt}));
  assert.equal(loadCachedTripFromStorage(storage,trip.id,trip.ownerId)?.schemaVersion,2);
  assert.equal(loadTripRecoveryFromStorage(storage,trip.id,trip.ownerId)?.writeId,"existing");
  assert.equal(listTripRecoveriesFromStorage(storage,trip.ownerId)[0]?.trip.schemaVersion,2);
  assert.equal(storage.writes,0);
});
test("retained_legacy_key_never_shadows_newer_scoped_recovery", () => {
  const trip=legacyRouteFixture();const storage=new MemoryStorage();
  storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(trip));
  const newer={...canonicalRouteFixture(),title:"Newer traveller draft"};
  storage.values.set(tripRecoveryStorageKey(trip.ownerId,trip.id,"newer"),JSON.stringify({version:2,ownerId:trip.ownerId,tripId:trip.id,trip:newer,state:"pending",writeId:"newer",savedAt:trip.updatedAt}));
  assert.equal(loadActiveTripFromStorage(storage,trip.ownerId)?.title,newer.title);
  assert.equal(storage.writes,0);assert.ok(storage.getItem(EASYT_ACTIVE_TRIP_KEY));
});
test("future_local_version_is_visible_and_source_is_preserved", () => {
  const trip={...canonicalRouteFixture(),schemaVersion:3};const storage=new MemoryStorage();
  storage.values.set(tripCacheStorageKey(trip.ownerId,trip.id),JSON.stringify({version:2,ownerId:trip.ownerId,tripId:trip.id,trip,cachedAt:trip.updatedAt}));
  assert.throws(()=>loadCachedTripFromStorage(storage,trip.id,trip.ownerId),TripDocumentReadError);
  assert.equal(storage.writes,0);
});
test("future_cloud_version_does_not_fall_back_to_stale_cache",async()=>{
  const trip=legacyRouteFixture();const storage=new MemoryStorage();
  storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(trip));
  const oldFetch=globalThis.fetch;const previousWindow=Object.getOwnPropertyDescriptor(globalThis,"window");
  Object.defineProperty(globalThis,"window",{configurable:true,value:{localStorage:storage}});
  globalThis.fetch=async()=>Response.json({trip:{...trip,schemaVersion:3}});
  try { await assert.rejects(loadRequestedTrip(trip.id,trip.ownerId),TripDocumentReadError);assert.equal(storage.writes,0); }
  finally { globalThis.fetch=oldFetch;if(previousWindow)Object.defineProperty(globalThis,"window",previousWindow);else Reflect.deleteProperty(globalThis,"window"); }
});
test("http_success_and_conflict_payloads_decode_supported_documents",async()=>{
  const trip=legacyRouteFixture();
  const request=(async()=>Response.json({trip})) as typeof fetch;
  assert.equal((await saveTripToEasyT(trip,request)).schemaVersion,2);
  await assert.rejects(saveTripToEasyT(trip,(async()=>Response.json({trip,conflictReason:"cloud-newer"},{status:409})) as typeof fetch),(error:unknown)=>error instanceof Error && "canonicalTrip" in error && (error.canonicalTrip as typeof trip).schemaVersion===2);
});

test("representation_only_migration_never_acknowledges_a_recovery",()=>{
  const trip=legacyRouteFixture();const storage=new MemoryStorage();
  const handle={ownerId:trip.ownerId,tripId:trip.id,writeId:"legacy-pending"};
  storage.values.set(tripRecoveryStorageKey(trip.ownerId,trip.id,handle.writeId),JSON.stringify({version:2,...handle,trip,state:"pending",savedAt:trip.updatedAt}));
  const result=cacheCanonicalTripWithRecoveryToStorage(storage,trip);
  assert.equal(result.recoveryResolved,false);assert.equal(loadTripRecoveryFromStorage(storage,trip.id,trip.ownerId)?.writeId,handle.writeId);
  assert.equal(cacheCanonicalTripWithRecoveryToStorage(storage,trip,handle).recoveryResolved,true);
});

test('exact_durable_ack_stops_retained_legacy_source_shadowing_cache_and_selection',async()=>{
 const {saveTripRecoveryToStorage}=await import('../lib/easyt/storage.ts');const {requireReadableTripDocument}=await import('../lib/easyt/trip-document.ts');
 const legacy=legacyRouteFixture();const storage=new MemoryStorage();const raw=JSON.stringify(legacy);storage.values.set(EASYT_ACTIVE_TRIP_KEY,raw);
 const edited=requireReadableTripDocument(legacy);edited.title='Acknowledged newer';const recovery=saveTripRecoveryToStorage(storage,edited,{writeId:'new-edit'});
 assert.equal(cacheCanonicalTripWithRecoveryToStorage(storage,{...edited,updatedAt:'2026-10-06T20:00:00.000Z'},recovery.handle).recoveryResolved,true);
 assert.equal(storage.getItem(EASYT_ACTIVE_TRIP_KEY),raw);assert.equal(loadLocalTripFromStorage(storage,legacy.id,legacy.ownerId)?.title,edited.title);assert.equal(loadActiveTripFromStorage(storage,legacy.ownerId)?.title,edited.title);assert.equal(loadCurrentTripRecoveryFromStorage(storage,legacy.ownerId),null);
 cacheCanonicalTripWithRecoveryToStorage(storage,{...edited,id:'another-trip',updatedAt:'2026-10-06T20:01:00.000Z'});assert.equal(loadActiveTripFromStorage(storage,legacy.ownerId)?.id,'another-trip');
 storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify({...legacy,title:'Later old-client draft'}));assert.equal(loadLocalTripFromStorage(storage,legacy.id,legacy.ownerId)?.title,'Later old-client draft');
});

test('late_ack_never_hides_a_newer_legacy_edit_or_cross_owner_source',async()=>{
 const {saveTripRecoveryToStorage}=await import('../lib/easyt/storage.ts');const {requireReadableTripDocument}=await import('../lib/easyt/trip-document.ts');const legacy=legacyRouteFixture();const storage=new MemoryStorage();storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(legacy));
 const edited=requireReadableTripDocument(legacy);edited.title='Earlier accepted edit';const recovery=saveTripRecoveryToStorage(storage,edited,{writeId:'earlier'});
 const later={...legacy,title:'Later retained source'};storage.values.set(EASYT_ACTIVE_TRIP_KEY,JSON.stringify(later));cacheCanonicalTripWithRecoveryToStorage(storage,{...edited,updatedAt:'2026-10-06T20:00:00.000Z'},recovery.handle);
 assert.equal(loadLocalTripFromStorage(storage,legacy.id,legacy.ownerId)?.title,later.title);assert.equal(loadActiveTripFromStorage(storage,'owner-b'),null);
});

test('exact_guest_promotion_ack_stops_ownerless_source_shadowing_promoted_cache',async()=>{
 const {saveTripRecoveryToStorage}=await import('../lib/easyt/storage.ts');const {requireReadableTripDocument}=await import('../lib/easyt/trip-document.ts');const legacy={...legacyRouteFixture(),ownerId:null};const storage=new MemoryStorage();const raw=JSON.stringify(legacy);storage.values.set(EASYT_ACTIVE_TRIP_KEY,raw);
 const edited=requireReadableTripDocument(legacy);edited.title='Promoted edit';const recovery=saveTripRecoveryToStorage(storage,edited,{writeId:'guest-edit'});const promoted={...edited,ownerId:'owner-a'};
 assert.equal(cacheCanonicalTripWithRecoveryToStorage(storage,promoted,recovery.handle).recoveryResolved,true);assert.equal(loadLocalTripFromStorage(storage,legacy.id,'owner-a')?.title,promoted.title);assert.equal(loadActiveTripFromStorage(storage,'owner-b'),null);assert.equal(loadActiveTripFromStorage(storage,null),null);assert.equal(storage.getItem(EASYT_ACTIVE_TRIP_KEY),raw);
});
