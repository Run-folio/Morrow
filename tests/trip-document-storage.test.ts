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
