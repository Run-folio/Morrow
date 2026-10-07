import assert from 'node:assert/strict';
import { legacyRouteFixture, canonicalRouteFixture } from '../fixtures/batch14-route-documents.ts';
import { getEasyTDatabase, closeBatch14Database } from './batch14-repository-db.ts';
import { promoteTripForOwner, saveTripForOwner, getTripForOwner, archiveTripForOwner, restoreTripForOwner } from '../../lib/easyt/repository.ts';
import { EasyTTripSaveConflictError } from '../../lib/easyt/trip-continuity.ts';
import { TripDocumentReadError, requireReadableTripDocument } from '../../lib/easyt/trip-document.ts';
import { remapTripStopReferences } from '../../lib/easyt/trip-promotion.ts';
import { builderDocumentFingerprint } from '../../lib/easyt/trip-builder-document-commit.ts';
import { prepareBuilderHandlerEdit } from '../../lib/easyt/trip-builder-handler-contract.ts';
const sql=getEasyTDatabase();
async function snapshot(){return Promise.all(['easyt_trips','easyt_stops','easyt_legs','easyt_plan_items','easyt_recommendations'].map(async table=>{
 // Only fixed test table identifiers; parameterize data in actual repository queries.
 const parts=Object.assign([`select to_jsonb(t) as row from ${table} t order by id`],{raw:[]}) as unknown as TemplateStringsArray;
 return sql(parts);
}));}
try{
 await sql`insert into easyt_users(id,email) values ('owner-a','batch14-a@example.invalid'),('owner-b','batch14-b@example.invalid')`;
 // Candidate-specific live work + retained provenance through the actual promotion/CAS transaction.
 const original=canonicalRouteFixture();
 const workSource=requireReadableTripDocument(remapTripStopReferences({...original,id:'batch14-live-work',ownerId:null,status:'draft'},new Map(original.stops.map(stop=>[stop.id,stop.id]))));
 const removal=prepareBuilderHandlerEdit(workSource,{kind:'remove-destination',intentId:'intent:hiroshima'},builderDocumentFingerprint(workSource));assert.ok(removal.ok);
 const nightEdit=prepareBuilderHandlerEdit(removal.trip,{kind:'nights',intentId:'intent:kyoto',stopId:'kyoto',nights:4},builderDocumentFingerprint(removal.trip));assert.ok(nightEdit.ok);
 const units=nightEdit.trip.brief.cascadeStatus!.routeReconciliation!.residual;
 units.find(unit=>unit.kind==='recommendation')!.phase='failed';units.find(unit=>unit.kind==='recommendation')!.reason='unavailable';
 units.find(unit=>unit.kind==='schedule')!.phase='conflict';units.find(unit=>unit.kind==='schedule')!.reason='protected-date';
 const historical=JSON.stringify(nightEdit.trip.brief.retainedAuthoredContent);
 const workPromotion=await promoteTripForOwner('owner-a',nightEdit.trip);assert.equal(workPromotion.outcome,'promoted');
 const persisted=requireReadableTripDocument((await getTripForOwner('owner-a',workSource.id))!);
 assert.equal(JSON.stringify(persisted.brief.retainedAuthoredContent),historical);
 assert.deepEqual(persisted.brief.cascadeStatus!.routeReconciliation!.residual.map(u=>[u.kind,u.phase,u.reason]),units.map(u=>[u.kind,u.phase,u.reason]));
 assert.ok(persisted.brief.cascadeStatus!.routeReconciliation!.residual.filter(u=>['schedule','recommendation'].includes(u.kind)).every(u=>persisted.stops.some(stop=>stop.id===u.targetId)));
 const retryPromotion=await promoteTripForOwner('owner-a',nightEdit.trip);assert.equal(retryPromotion.outcome,'already-canonical');
 const workCandidates=[3,4].map(travellers=>{const edit=prepareBuilderHandlerEdit(persisted,{kind:'travellers',travellers},builderDocumentFingerprint(persisted));assert.ok(edit.ok);return edit.trip;});
 const workCAS=await Promise.allSettled(workCandidates.map(trip=>saveTripForOwner('owner-a',trip)));
 assert.equal(workCAS.filter(result=>result.status==='fulfilled').length,1);assert.ok(workCAS.some(result=>result.status==='rejected' && result.reason instanceof EasyTTripSaveConflictError));
 const workWinner=requireReadableTripDocument((await getTripForOwner('owner-a',workSource.id))!);
 assert.equal(JSON.stringify(workWinner.brief.retainedAuthoredContent),historical);
 const workChildStops=await sql`select id,nights from easyt_stops where trip_id=${workSource.id} order by stop_order`;
 assert.deepEqual(workChildStops,workWinner.stops.map(stop=>({id:stop.id,nights:stop.nights})));
 const legacy=legacyRouteFixture();const promoted=await promoteTripForOwner('owner-a',{...legacy,ownerId:null,status:'draft'});
 assert.equal(promoted.outcome,'promoted');assert.equal(promoted.trip.schemaVersion,2);
 const before=await snapshot();const conflicting=await promoteTripForOwner('owner-a',{...legacy,ownerId:null,title:'Unaccepted replacement'});
 assert.equal(conflicting.outcome,'conflict');assert.deepEqual(await snapshot(),before);
 await assert.rejects(promoteTripForOwner('owner-b',{...legacy,ownerId:null}));assert.deepEqual(await snapshot(),before);
 const sameToken=promoted.trip;
 const candidate=(suffix:string)=>{const trip=structuredClone(sameToken);trip.title='Winner candidate '+suffix;trip.stops[0].name+=' '+suffix;trip.legs[0].provider='Winner provider '+suffix;trip.planItems[0].title='Winner day '+suffix;trip.planItems[0].notes=['Winner note '+suffix];return trip;};
 const saves=await Promise.allSettled([saveTripForOwner('owner-a',candidate('A')),saveTripForOwner('owner-a',candidate('B'))]);
 assert.equal(saves.filter(result=>result.status==='fulfilled').length,1);
 const loser=saves.find(result=>result.status==='rejected');assert.ok(loser?.status==='rejected'&&loser.reason instanceof EasyTTripSaveConflictError);
 let current=(await getTripForOwner('owner-a',sameToken.id))!;
 const won=saves.find(result=>result.status==='fulfilled');assert.ok(won?.status==='fulfilled');assert.deepEqual(current,won.value);
 const stops=await sql`select id,name,nights from easyt_stops where trip_id=${current.id} order by stop_order`;
 assert.deepEqual(stops,current.stops.map(stop=>({id:stop.id,name:stop.name,nights:stop.nights})));
 const legs=await sql`select id,provider from easyt_legs where trip_id=${current.id} order by id`;
 assert.deepEqual(legs,[...current.legs].sort((a,b)=>a.id.localeCompare(b.id)).map(leg=>({id:leg.id,provider:leg.provider})));
 const items=await sql`select id,title,notes from easyt_plan_items where trip_id=${current.id} order by day_number`;
 assert.deepEqual(items,[...current.planItems].sort((a,b)=>a.dayNumber-b.dayNumber).map(item=>({id:item.id,title:item.title,notes:item.notes})));
 // Existing planned state wins over a draft candidate, and the effective
 // winning JSONB must still authorize every child projection replacement.
 current=await saveTripForOwner('owner-a',{...current,status:'planned'});
 const draftEdit=structuredClone(current);draftEdit.status='draft';draftEdit.stops[0].name='Planned winner stop';draftEdit.planItems[0].title='Planned winner day';
 current=await saveTripForOwner('owner-a',draftEdit);assert.equal(current.status,'planned');
 const plannedStops=await sql`select name from easyt_stops where id=${current.stops[0].id}`;assert.equal(plannedStops[0].name,current.stops[0].name);
 const plannedItems=await sql`select title from easyt_plan_items where id=${current.planItems[0].id}`;assert.equal(plannedItems[0].title,current.planItems[0].title);
 const winner=await snapshot();
 const old={...legacy,ownerId:'owner-a',updatedAt:current.updatedAt,title:'Old client overwrite'};
 await assert.rejects(saveTripForOwner('owner-a',old,{sourceSchemaVersion:1}),EasyTTripSaveConflictError);assert.deepEqual(await snapshot(),winner);
 await assert.rejects(saveTripForOwner('owner-b',current));assert.deepEqual(await snapshot(),winner);
 // Force a child-projection date error after the parent UPDATE; the entire
 // winning transaction must roll back, including the canonical CAS token.
 const invalidChild=structuredClone(current);invalidChild.planItems[0].date='invalid-date';
 await assert.rejects(saveTripForOwner('owner-a',invalidChild));assert.deepEqual(await snapshot(),winner);
 const future={...current,schemaVersion:3};
 await sql`update easyt_trips set schema_version=3,document=${JSON.stringify(future)}::jsonb where id=${current.id}`;
 const futureSnapshot=await snapshot();await assert.rejects(getTripForOwner('owner-a',current.id),TripDocumentReadError);
 await assert.rejects(saveTripForOwner('owner-a',current),TripDocumentReadError);assert.deepEqual(await snapshot(),futureSnapshot);
 await sql`update easyt_trips set schema_version=2,document=${JSON.stringify(current)}::jsonb where id=${current.id}`;
 assert.equal((await archiveTripForOwner('owner-a',current.id))?.status,'archived');assert.equal((await restoreTripForOwner('owner-a',current.id))?.schemaVersion,2);
}finally{await closeBatch14Database();}
