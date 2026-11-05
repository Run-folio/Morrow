import assert from 'node:assert/strict';
import test from 'node:test';
import {gatewayReturnTrip,returnTripForPlaces} from './fixtures/gateway-return.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {markTransportLegBooked} from '../lib/easyt/transport-booking.ts';
import {prepareBuilderHandlerEdit,prepareMissingReturnJourneyRepair} from '../lib/easyt/trip-builder-handler-contract.ts';
import {missingReturnJourney} from '../lib/easyt/missing-return-journey.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {itineraryTransportAgenda} from '../lib/easyt/itinerary-transport-agenda.ts';

function incompleteReturn(){
 const trip=gatewayReturnTrip();
 const booked=markTransportLegBooked(trip,trip.legs[0].id,{confirmation:'KEEP-OUTBOUND',note:'Synthetic preserved booking'});
 booked.legs=booked.legs.slice(0,-1);
 return requireReadableTripDocument(JSON.parse(JSON.stringify(booked)));
}
test('an accepted edit restores only a missing terminal return and preserves the saved booked prefix through reload',()=>{
 const source=incompleteReturn(),before=structuredClone(source);
 assert.equal(source.legs.length,1);
 const result=prepareBuilderHandlerEdit(source,{kind:'budget',budget:'high'},builderDocumentFingerprint(source));assert.ok(result.ok);
 assert.equal(result.trip.legs.length,2,'authoritative return intent must not keep a truncated projection');
 assert.deepEqual(result.trip.legs[0],source.legs[0]);assert.deepEqual(result.trip.brief.bookings,source.brief.bookings);
 assert.deepEqual(result.trip.stops,source.stops);assert.deepEqual(result.trip.planItems,source.planItems);
 const back=result.trip.legs.at(-1)!;
 assert.equal(back.toEndpoint?.name,'London Gatwick Airport');assert.equal(back.mode,'unknown');assert.equal(back.durationMinutes,null);
 assert.equal(back.provenance,'unknown');assert.equal(back.scheduleNeedsChecking,true);
 assert.ok(result.trip.brief.cascadeStatus?.routeReconciliation?.residual.some(unit=>unit.kind==='leg'&&unit.targetId===back.id&&unit.phase==='pending'));
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip)));assert.equal(restored.legs.length,2);
 assert.equal(itineraryTransportAgenda(restored).at(-1)!.date,source.endDate);assert.deepEqual(source,before);
});

test('explicit repair is current-head checked, pending, idempotent and never rewrites the booked prefix',()=>{
 const source=incompleteReturn(),before=structuredClone(source),fingerprint=builderDocumentFingerprint(source);
 assert.equal(missingReturnJourney(source).kind,'repairable');assert.deepEqual(source,before);
 const result=prepareMissingReturnJourneyRepair(source,fingerprint);assert.ok(result.ok);
 assert.deepEqual(result.trip.legs.slice(0,-1),source.legs);assert.deepEqual(result.trip.brief.bookings,source.brief.bookings);
 assert.equal(result.trip.legs.at(-1)!.id,result.legId);assert.equal(result.trip.legs.at(-1)!.mode,'unknown');
 assert.equal(missingReturnJourney(result.trip).kind,'not-needed');assert.equal(prepareMissingReturnJourneyRepair(result.trip,builderDocumentFingerprint(result.trip)).ok,false);
 const changed={...source,endDate:'2026-12-22'};assert.deepEqual(prepareMissingReturnJourneyRepair(changed,fingerprint),{ok:false,reason:'stale-source'});
 assert.deepEqual(source,before);
});

test('explicit restoration preserves authored day notes and absence of unrelated optional fields',()=>{
 const source=incompleteReturn();source.planItems=[{id:'saved-arrival',stopId:source.stops[0].id,dayNumber:1,date:source.startDate,type:'arrival',title:'Keep this first day',reason:'Authored itinerary',notes:['Keep this note'],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}];
 source.brief.mustDo='Keep this trip brief';const before=structuredClone(source);
 const result=prepareMissingReturnJourneyRepair(source,builderDocumentFingerprint(source));assert.ok(result.ok);
 assert.deepEqual(result.trip.planItems,source.planItems);assert.equal(result.trip.brief.mustDo,source.brief.mustDo);
 assert.equal(Object.hasOwn(result.trip.brief,'itineraryIdeas'),Object.hasOwn(source.brief,'itineraryIdeas'));assert.deepEqual(source,before);
});

test('restoration retains existing cascade affected-booking records while adding pending return work',()=>{
 const source=incompleteReturn();source.brief.cascadeStatus={conflicts:[],affectedBookingIds:['KEEP-AFFECTED-BOOKING'],affectedPlanItemCount:2};const before=structuredClone(source);
 const result=prepareMissingReturnJourneyRepair(source,builderDocumentFingerprint(source));assert.ok(result.ok);
 assert.deepEqual(result.trip.brief.cascadeStatus?.affectedBookingIds,source.brief.cascadeStatus.affectedBookingIds);
 assert.equal(result.trip.brief.cascadeStatus?.affectedPlanItemCount,2);assert.deepEqual(result.trip.brief.cascadeStatus?.conflicts,source.brief.cascadeStatus.conflicts);assert.deepEqual(source,before);
});

test('one-way and explicit different finishes do not acquire a fabricated return',()=>{
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint');
 for(const end of [{mode:'unknown' as const},{mode:'explicit' as const,place:paris}]){
  const trip=gatewayReturnTrip(end),before=structuredClone(trip);assert.equal(missingReturnJourney(trip).kind,'not-needed');
  assert.equal(prepareMissingReturnJourneyRepair(trip,builderDocumentFingerprint(trip)).ok,false);
  const edited=prepareBuilderHandlerEdit(trip,{kind:'budget',budget:'high'},builderDocumentFingerprint(trip));assert.ok(edited.ok);
  assert.deepEqual(edited.trip.legs,trip.legs);assert.deepEqual(trip,before);
 }
});

test('an existing booked return or final stay already at the start never gets another leg',()=>{
 const trip=gatewayReturnTrip(),booked=requireReadableTripDocument(markTransportLegBooked(trip,trip.legs.at(-1)!.id,{confirmation:'KEEP-RETURN'})),before=structuredClone(booked);
 assert.equal(missingReturnJourney(booked).kind,'not-needed');assert.equal(prepareMissingReturnJourneyRepair(booked,builderDocumentFingerprint(booked)).ok,false);assert.deepEqual(booked,before);
 const london=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
 const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','stop');
 const alreadyHome=returnTripForPlaces(london,[paris,london]);assert.equal(alreadyHome.legs.length,2);assert.equal(missingReturnJourney(alreadyHome).kind,'not-needed');
});

const unsafe:{name:string;change:(trip:ReturnType<typeof incompleteReturn>)=>void}[]=[
 {name:'wrong prefix',change:t=>{t.legs[0].fromStopId='other-start';}},
 {name:'changed saved endpoint snapshot',change:t=>{t.legs[0].fromEndpoint={...t.legs[0].fromEndpoint!,name:'Different airport'};}},
 {name:'extra journey',change:t=>{t.legs.push({...t.legs[0],id:'extra-saved-journey'});}},
 {name:'unverified origin',change:t=>{delete t.brief.intent.route.origin!.geographicBinding;}},
 {name:'inconsistent end intent',change:t=>{t.brief.journeyEnd={mode:'unknown'};}},
 {name:'conflicting return date',change:t=>{t.stops.at(-1)!.departureDate='2026-12-22';}},
 {name:'orphan return booking',change:t=>{const complete=gatewayReturnTrip(),booked=markTransportLegBooked(complete,complete.legs.at(-1)!.id,{confirmation:'PROTECTED'});t.brief.bookings!.push(booked.brief.bookings!.at(-1)!);}},
 {name:'orphan airport choice',change:t=>{t.brief.flightSearchAirportsByLeg={'old-return-leg':{version:1,basis:'retained-source',from:null,to:null}};}},
 {name:'orphan transport choice',change:t=>{t.brief.decisionSelections={transportByLeg:{'old-return-leg':'legacy-choice'}};}},
 {name:'orphan authored day',change:t=>{t.planItems=[{id:'retained-day',stopId:'removed-stay',dayNumber:1,date:t.startDate,type:'arrival',title:'Protected day',reason:'',notes:['Keep'],startsAt:null,endsAt:null,bookingUrl:null,latitude:null,longitude:null}];}},
 {name:'orphan schedule lock',change:t=>{t.brief.scheduleLocks={stopIds:['removed-stay'],arrivalDates:{}};}},
];
for(const item of unsafe)test(`unsafe ${item.name} is retained and cannot be repaired automatically`,()=>{
 const trip=incompleteReturn();item.change(trip);const before=structuredClone(trip);
 assert.equal(missingReturnJourney(trip).kind,'blocked');assert.equal(prepareMissingReturnJourneyRepair(trip,builderDocumentFingerprint(trip)).ok,false);assert.deepEqual(trip,before);
});

test('multi-stop repair appends only the final journey to the chosen original airport',()=>{
 const origin=gatewayReturnTrip().brief.intent.route.origin!;
 const cairns=selectedTransferPlace('Cairns','Australia','reference:geonames:2172797','stop'),chengdu=selectedTransferPlace('Chengdu','China','reference:geonames:1815286','stop');
 const trip=returnTripForPlaces(origin,[cairns,chengdu]);trip.legs=trip.legs.slice(0,-1);const before=structuredClone(trip);
 const result=prepareMissingReturnJourneyRepair(trip,builderDocumentFingerprint(trip));assert.ok(result.ok);
 assert.equal(result.trip.legs.length,3);assert.deepEqual(result.trip.legs.slice(0,2),trip.legs);assert.equal(result.trip.legs.at(-1)!.toEndpoint?.canonicalPlaceId,origin.canonicalPlaceId);
 assert.equal(itineraryTransportAgenda(requireReadableTripDocument(JSON.parse(JSON.stringify(result.trip)))).at(-1)!.date,trip.endDate);assert.deepEqual(trip,before);
});
