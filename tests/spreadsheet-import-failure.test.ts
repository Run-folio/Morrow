import assert from 'node:assert/strict';
import test from 'node:test';
import { philippinesImportFixture } from './fixtures/philippines-import.ts';
import { assessSpreadsheetImportTransfers } from '../lib/easyt/spreadsheet-import-transfers.ts';
import { builderDetailsStatus } from '../lib/easyt/builder-planning-status.ts';
import { pendingBuilderReconciliationUnits, retryBuilderReconciliationUnit } from '../lib/easyt/trip-builder-reconciliation.ts';
import { prepareTripDocumentForWrite, requireReadableTripDocument } from '../lib/easyt/trip-document.ts';
import type { TripLeg } from '../lib/easyt/trip.ts';
const completed=(legs:readonly TripLeg[])=>({ok:true as const,legs:structuredClone([...legs]),failedLegIds:[] as string[],assessments:legs.map(l=>({legId:l.id,state:{retrieval:'completed' as const,evidence:'insufficient' as const,retryable:false}}))});
for(const mode of ['invalid','failed','rejected','missing','unavailable','incomplete','thrown'] as const) test(`exact workbook retains ${mode} assessment as bounded retryable failure`,async()=>{
 const trip=philippinesImportFixture(),before=structuredClone(trip);let calls=0;
 const result=await assessSpreadsheetImportTransfers(trip,new AbortController().signal,async legs=>{calls++;if(mode==='thrown')throw Error('offline');if(mode==='invalid')return {ok:false,reason:'invalid-input'};
 const payload=completed(legs);
 if(mode==='failed')payload.failedLegIds=legs.map(l=>l.id);
 if(mode==='rejected')payload.legs=payload.legs.map(l=>({...l,toStopId:'wrong-occurrence'}));
 if(mode==='missing')payload.legs=[];
 if(mode==='unavailable'||mode==='incomplete')return {...payload,assessments:legs.map(l=>({legId:l.id,state:{retrieval:mode==='unavailable'?'unavailable' as const:'checking' as const,evidence:'insufficient' as const,retryable:true}}))};
 return payload;});
 assert.equal(calls,1);assert.deepEqual(trip,before);assert.deepEqual(result.stops,before.stops);assert.deepEqual(result.legs,before.legs);
 assert.deepEqual(result.stops.map(s=>s.nights),[2,5,4,5,3,1]);assert.equal(new Set(result.stops.map(s=>s.id)).size,6);
 assert.deepEqual([result.startDate,result.endDate],['2026-12-11','2026-12-31']);
 const reopened=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(result))));
 const units=reopened.brief.cascadeStatus!.routeReconciliation!.residual;
 assert.equal(units.length,5);assert.ok(units.every(u=>u.phase==='failed'&&u.kind==='leg'));assert.equal(pendingBuilderReconciliationUnits(reopened).length,0);
 assert.equal(builderDetailsStatus(reopened,'en').label,'Details need retry');
 const retry=retryBuilderReconciliationUnit(reopened,units[0]!);assert.equal(retry.ok,true);if(!retry.ok)return;
 assert.equal(pendingBuilderReconciliationUnits(retry.trip).length,1);assert.equal(retryBuilderReconciliationUnit(retry.trip,units[0]!).ok,false);
 assert.deepEqual(retry.trip.legs,JSON.parse(JSON.stringify(before.legs)));
});
test('successful insufficient evidence settles unknown without automatic or manual failure work',async()=>{
 const trip=philippinesImportFixture();const result=await assessSpreadsheetImportTransfers(trip,new AbortController().signal,async legs=>completed(legs));
 assert.deepEqual(result,trip);assert.equal(builderDetailsStatus(result,'en').label,'Details up to date');assert.equal(pendingBuilderReconciliationUnits(requireReadableTripDocument(result)).length,0);
 assert.ok(result.legs.every(l=>l.mode==='unknown'&&l.durationMinutes===null));
});
test('cancellation never returns a failure document to save',async()=>{
 const trip=philippinesImportFixture(),before=structuredClone(trip);
 for(const reject of [false,true]){const controller=new AbortController();await assert.rejects(assessSpreadsheetImportTransfers(trip,controller.signal,async legs=>{controller.abort();if(reject)throw Error('late');return completed(legs);}),{name:'AbortError'});}
 assert.deepEqual(trip,before);
});
test('protected bookings and selected decisions never enter import assessment or failure work',async()=>{
 const trip=philippinesImportFixture();trip.legs[0]!.routeMetadata.importedBookingId='booked';trip.legs[1]!.routeMetadata.userConfirmed=true;
 trip.legs[2]!.routeMetadata.decisionOption='train';const before=structuredClone(trip);
 const result=await assessSpreadsheetImportTransfers(trip,new AbortController().signal,async legs=>{assert.deepEqual(legs.map(l=>l.id),trip.legs.slice(3).map(l=>l.id));return {ok:false,reason:'invalid-input'};});
 assert.deepEqual(result.legs,before.legs);assert.deepEqual(result.brief.cascadeStatus!.routeReconciliation!.residual.map(u=>u.targetId).sort(),trip.legs.slice(3).map(l=>l.id).sort());
});

test('partial import response retains only unsuccessful occurrences and preserves existing work',async()=>{
 const trip=philippinesImportFixture();
 const initial=await assessSpreadsheetImportTransfers(trip,new AbortController().signal,async()=>({ok:false,reason:'invalid-input'}));
 const before=structuredClone(initial.brief.cascadeStatus);
 const result=await assessSpreadsheetImportTransfers(initial,new AbortController().signal,async legs=>completed(legs));
 assert.deepEqual(result.brief.cascadeStatus,before,'reassessment does not silently complete retained work');
 const partial=await assessSpreadsheetImportTransfers(trip,new AbortController().signal,async legs=>({...completed(legs),failedLegIds:[legs[1]!.id]}));
 assert.deepEqual(partial.brief.cascadeStatus!.routeReconciliation!.residual.map(u=>u.targetId),[trip.legs[1]!.id]);
 assert.deepEqual(partial.stops,trip.stops);assert.deepEqual(partial.legs,trip.legs);
});

import { completedTransferResolutionLeg } from '../lib/easyt/transfer-resolution-client.ts';
test('not-attempted preservation cannot complete new unknown work or admit changed retained facts',()=>{
 const leg=philippinesImportFixture().legs[0]!;
 const preservedPayload=(value:TripLeg,reason?:'batch_limit')=>({ok:true as const,legs:[value],failedLegIds:[],assessments:[{legId:value.id,state:{retrieval:'not-attempted' as const,evidence:'conditional' as const,retryable:false,...(reason?{reason}:{})}}]});
 assert.equal(completedTransferResolutionLeg(leg,preservedPayload(leg)),undefined);
 const retained={...leg,mode:'train' as const,durationMinutes:90};
 assert.deepEqual(completedTransferResolutionLeg(retained,preservedPayload(structuredClone(retained))),retained);
 assert.equal(completedTransferResolutionLeg(retained,preservedPayload({...retained,durationMinutes:120})),undefined);
 assert.equal(completedTransferResolutionLeg(retained,preservedPayload(retained,'batch_limit')),undefined);
 const authored={...leg,routeMetadata:{...leg.routeMetadata,userConfirmed:true}};
 assert.deepEqual(completedTransferResolutionLeg(authored,preservedPayload(structuredClone(authored))),authored);
});
