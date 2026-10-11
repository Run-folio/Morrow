import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalRouteFixture } from './fixtures/batch14-route-documents.ts';
import { canonicalTripForOwner, tripBuildDocumentsCanonicalEquivalent } from '../lib/easyt/trip-promotion.ts';
import { requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import { mergeBuilderReconciliationDocuments, prepareBuilderNecessaryProjection } from '../lib/easyt/trip-builder-reconciliation.ts';
import { createTripMutationPersistenceQueue, mergeTripMutationDocuments } from '../lib/easyt/trip-mutation-persistence.ts';
import { insertItineraryActivity } from '../lib/easyt/itinerary-mutations.ts';
import { nextTripUpdatedAt, EasyTTripSaveConflictError } from '../lib/easyt/trip-continuity.ts';
import { saveTripRecoveryToEasyT, saveTripRecoveryToStorage, loadTripRecoveryFromStorage, cacheCanonicalTripWithRecoveryToStorage } from '../lib/easyt/storage.ts';
import { prepareAcceptedBuilderEdit } from '../lib/easyt/trip-builder-edit.ts';
import { builderDocumentFingerprint } from '../lib/easyt/trip-builder-document-commit.ts';
import type { TripCascadeStatus } from '../lib/easyt/trip.ts';
const baseTrip = () => requireReadableTripDocument(canonicalTripForOwner('owner-a',canonicalRouteFixture()));

test('shared reconciliation merge leaves absent status absent when all subject maps are empty', () => {
 const base=baseTrip(), authored=structuredClone(base);authored.travellers=3;
 const input=structuredClone(authored);
 const merged=mergeBuilderReconciliationDocuments(base,authored,base,input);
 assert.equal(merged.brief.cascadeStatus,undefined);
 assert.deepEqual(input,authored,'input remains unchanged');
});

for (const status of [
 {conflicts:[],affectedBookingIds:[],affectedPlanItemCount:0},
 {conflicts:['Review booking date'],affectedBookingIds:['booking-1'],affectedPlanItemCount:2},
 {conflicts:[],affectedBookingIds:[],affectedPlanItemCount:0, futureEvidence:{source:'retained'}} as TripCascadeStatus & {futureEvidence:{source:string}},
] satisfies TripCascadeStatus[]) test(`empty subject maps preserve explicit status ${JSON.stringify(status)}`, () => {
 const base=baseTrip();base.brief.cascadeStatus=structuredClone(status);
 const merged=mergeTripMutationDocuments(base,{...base,travellers:3},base);
 assert.deepEqual(merged.brief.cascadeStatus,status);
});

test('first queued save and repeated lost-response retries acknowledge the same committed document', async () => {
 const base=baseTrip();const authored=insertItineraryActivity(base,base.planItems[0].dayNumber,0,'Retain this authored item').trip;
 const values=new Map<string,string>();const storage={getItem:(key:string)=>values.get(key)??null,setItem:(key:string,value:string)=>{values.set(key,value)},removeItem:(key:string)=>{values.delete(key)},key:(index:number)=>[...values.keys()][index]??null,get length(){return values.size}};
 const recovery=saveTripRecoveryToStorage(storage,authored,{writeId:'lost-response'});assert(recovery.stored);
 let committed:ReturnType<typeof baseTrip>|undefined;let commits=0;
 const queue=createTripMutationPersistenceQueue(async submitted=>{commits++;committed=requireReadableTripDocument(canonicalTripForOwner('owner-a',submitted,nextTripUpdatedAt(submitted.updatedAt)));throw Error('Lost response after commit');});queue.reset(base);
 await assert.rejects(()=>queue.enqueue(authored,recovery.handle,base),/Lost response/);assert(committed);
 const retained=loadTripRecoveryFromStorage(storage,base.id,'owner-a')!;
 for(let retry=0;retry<2;retry++) {
  const saved=await saveTripRecoveryToEasyT(retained.trip,retained,async()=>Response.json({trip:committed,conflictReason:'cloud-changed'},{status:409}));
  assert.deepEqual(saved,committed);assert.equal(commits,1);assert(loadTripRecoveryFromStorage(storage,base.id,'owner-a'),'only exact acknowledgement caller may resolve recovery');
 }
 assert.equal(tripBuildDocumentsCanonicalEquivalent(retained.trip,committed,'owner-a'),true);
 const divergent={...committed,travellers:4};
 await assert.rejects(()=>saveTripRecoveryToEasyT(retained.trip,retained,async()=>Response.json({trip:divergent,conflictReason:'cloud-changed'},{status:409})),EasyTTripSaveConflictError);
 const meaningful={...committed,brief:{...committed.brief,cascadeStatus:{conflicts:['Review booking date'],affectedBookingIds:['booking-1'],affectedPlanItemCount:1}}};
 assert.equal(tripBuildDocumentsCanonicalEquivalent(retained.trip,meaningful,'owner-a'),false);
 await assert.rejects(()=>saveTripRecoveryToEasyT(retained.trip,retained,async()=>Response.json({trip:meaningful,conflictReason:'cloud-changed'},{status:409})),EasyTTripSaveConflictError);
 assert.equal(committed.planItems.flatMap(item=>item.notes).filter(note=>note==='Retain this authored item').length,1);
 const ack=cacheCanonicalTripWithRecoveryToStorage(storage,committed,retained);
 assert.equal(ack.recoveryResolved,true);assert.equal(loadTripRecoveryFromStorage(storage,base.id,'owner-a'),null);
 const newer=saveTripRecoveryToStorage(storage,{...authored,travellers:4},{writeId:'newer'});assert(newer.stored);
 cacheCanonicalTripWithRecoveryToStorage(storage,committed,retained);
 assert.equal(loadTripRecoveryFromStorage(storage,base.id,'owner-a')?.writeId,'newer');
 await assert.rejects(()=>saveTripRecoveryToEasyT({...retained.trip,ownerId:'owner-b'},retained,async()=>{throw Error('must not request')}),/ownership mismatch/);
});

for(const phase of ['pending','failed','conflict'] as const) test(`nonempty work preserves ${phase} evidence`, () => {
 const base=baseTrip();
 const edit=prepareAcceptedBuilderEdit(base,{kind:'travellers',travellers:3},builderDocumentFingerprint(base));assert(edit.ok);
 const projection=prepareBuilderNecessaryProjection(base,edit.trip,edit.scope);assert(projection.ok);
 const work=projection.trip;const units=work.brief.cascadeStatus!.routeReconciliation!.residual;assert(units.length);
 for(const unit of units) {unit.phase=phase;if(phase==='failed')unit.reason='unavailable';if(phase==='conflict')unit.reason='protected-date';}
 const result=mergeBuilderReconciliationDocuments(work,work,work,structuredClone(work));
 assert.deepEqual(result.brief.cascadeStatus,work.brief.cascadeStatus);
});

for(let mask=1;mask<8;mask++) test(`each nonempty subject-map combination still installs work: ${mask}`, () => {
 const empty=baseTrip();const edit=prepareAcceptedBuilderEdit(empty,{kind:'travellers',travellers:3},builderDocumentFingerprint(empty));assert(edit.ok);
 const projection=prepareBuilderNecessaryProjection(empty,edit.trip,edit.scope);assert(projection.ok);
 const work=projection.trip;const merged=structuredClone(work);delete merged.brief.cascadeStatus;
 const result=mergeBuilderReconciliationDocuments(mask&1?work:empty,mask&2?work:empty,mask&4?work:empty,merged);
 assert.ok(result.brief.cascadeStatus?.routeReconciliation?.residual.length,'real subject maps must not take absent-status shortcut');
});
