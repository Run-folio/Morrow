import assert from 'node:assert/strict';
import test from 'node:test';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {prepareBuilderNecessaryProjection} from '../lib/easyt/trip-builder-reconciliation.ts';

// Task 6 RED: retain this failing regression for the bounded child/preservation review.
test('balanced accepted night redistribution preserves exact itinerary day coverage before first save',()=>{
 let trip=requireReadableTripDocument(canonicalRouteFixture());
 const before=structuredClone(trip);const first=trip.stops[0]!,second=trip.stops[1]!;
 assert.ok(first.nights!==null&&second.nights!==null);
 for(const [stopId,nights] of [[first.id,first.nights+1],[second.id,second.nights-1]] as const){
  const intent=trip.brief.intent.route.destinations.find(intent=>intent.stopIds.includes(stopId))!;
  const edit=prepareAcceptedBuilderEdit(trip,{kind:'nights',stopId,intentId:intent.id,nights},builderDocumentFingerprint(trip));assert.ok(edit.ok);
  const prefix=prepareBuilderNecessaryProjection(trip,edit.trip,edit.scope);assert.ok(prefix.ok);trip=prefix.trip;
 }
 assert.deepEqual(trip.brief.intent.route.orderedStopIds,before.brief.intent.route.orderedStopIds);
 assert.equal(trip.stops.reduce((sum,stop)=>sum+(stop.nights??0),0),before.stops.reduce((sum,stop)=>sum+(stop.nights??0),0));
 const count=Math.round((Date.parse(trip.endDate)-Date.parse(trip.startDate))/86400000)+1;
 const expected=Array.from({length:count},(_,index)=>index+1);
 assert.deepEqual(trip.planItems.map(day=>day.dayNumber).sort((a,b)=>a-b),expected,
  'The existing cascade shifts old containers, leaving a missing/duplicate day after accepted stay lengths change.');
});
