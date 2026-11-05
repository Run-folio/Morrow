import assert from 'node:assert/strict';
import test from 'node:test';
import {transportJourneyParts} from '../lib/easyt/transport-journey-parts.ts';
import type {CanonicalRouteEndpoint, TransferSegment, TripLeg} from '../lib/easyt/trip.ts';
const point=(id:string,name=id,country='Japan'):CanonicalRouteEndpoint=>({id,name,country,kind:'gateway',canonicalPlaceId:`synthetic:${id}`,coordinates:null});
const town=point('town'),air=point('air'),arrival=point('arrival'),stay=point('stay');
const part=(id:string,fromEndpoint:CanonicalRouteEndpoint,toEndpoint:CanonicalRouteEndpoint,mode:TransferSegment['mode']):TransferSegment=>({id,fromEndpoint,toEndpoint,mode,durationMinutes:null,distanceKm:null,provider:null,provenance:'planning_estimate',confidence:'unknown',scheduleNeedsChecking:true});
const leg=(segments?:TransferSegment[]):TripLeg=>({id:'synthetic',fromStopId:town.id,toStopId:stay.id,fromEndpoint:town,toEndpoint:stay,mode:'flight',distanceKm:null,durationMinutes:null,provider:null,provenance:'planning_estimate',routeMetadata:{},segments});
test('shows only saved parts in their original order without inventing a legacy segment',()=>{
 assert.deepEqual(transportJourneyParts(leg()).parts,[]);
 const source=leg([part('access',town,air,'train'),part('flight',air,arrival,'flight'),part('onward',arrival,stay,'road')]);
 const before=structuredClone(source),result=transportJourneyParts(source);
 assert.deepEqual(result.parts.map(p=>p.id),['access','flight','onward']);assert.deepEqual(result.gaps,[]);
 assert.deepEqual(source,before);assert.equal(result.parts[1].durationMinutes,null);
});
test('flight-only saved details identify access and onward gaps, never their mode or duration',()=>{
 const result=transportJourneyParts(leg([part('flight',air,arrival,'flight')]));
 assert.deepEqual(result.gaps,[{kind:'access',from:town,to:air},{kind:'onward',from:arrival,to:stay}]);
 assert.deepEqual(Object.keys(result.gaps[0]).sort(),['from','kind','to']);
});
test('discontinuous saved flight chains expose the missing connection',()=>{
 const other=point('other');const source=leg([part('access',town,air,'road'),part('flight',other,arrival,'flight'),part('onward',arrival,stay,'road')]);
 assert.deepEqual(transportJourneyParts(source).gaps,[{kind:'connection',from:air,to:other}]);
});
test('physical canonical identity survives different occurrence IDs',()=>{
 const source=leg([part('access',town,air,'road'),part('flight',{...air,id:'another-occurrence'},arrival,'flight'),part('onward',arrival,stay,'road')]);
 assert.deepEqual(transportJourneyParts(source).gaps,[]);
});
test('Matsumoto city flight details require an airport check without choosing Tokyo or rail',()=>{
 const from=point('matsumoto','Matsumoto'),to=point('chengdu','Chengdu','China');
 const source={...leg(),fromEndpoint:from,toEndpoint:to};
 assert.deepEqual(transportJourneyParts(source).gaps,[{kind:'departure-airport'}]);
 source.segments=[part('legacy',from,to,'flight')];assert.deepEqual(transportJourneyParts(source).gaps,[{kind:'departure-airport'}]);
 source.segments=[part('flight',air,to,'flight')];assert.deepEqual(transportJourneyParts(source).gaps,[{kind:'access',from,to:air}]);
 assert.doesNotMatch(JSON.stringify(transportJourneyParts(source)),/Tokyo|durationMinutes.:\d/);
});
test('nonflight legs do not acquire airport-transfer warnings',()=>{
 assert.deepEqual(transportJourneyParts({...leg([part('rail',air,arrival,'train')]),mode:'train'}).gaps,[]);
});
test('malformed saved parts fail closed instead of being presented as a complete chain',()=>{
 const source=leg([part('flight',air,arrival,'flight'),null as unknown as TransferSegment]);
 const result=transportJourneyParts(source);assert.equal(result.incomplete,true);assert.equal(result.parts.length,1);
 assert.deepEqual(result.gaps,[]);
});
test('JSON reload and unrelated edits preserve saved parts and leave bookings untouched',()=>{
 const source={leg:leg([part('flight',air,arrival,'flight')]),booking:{status:'booked',confirmation:'SYNTHETIC'},title:'Before'};
 const before=JSON.stringify(source),expected=transportJourneyParts(source.leg);
 assert.deepEqual(transportJourneyParts(JSON.parse(before).leg),expected);
 const edited={...JSON.parse(before),title:'After'};assert.deepEqual(transportJourneyParts(edited.leg),expected);
 assert.deepEqual(edited.booking,source.booking);assert.equal(JSON.stringify(source),before);
});

test('actual document roundtrip and booking-detail edits keep derived warnings and saved segments stable',async()=>{
 const {savedJourneyPartsTrip}=await import('./fixtures/saved-journey-parts.ts');
 const {prepareTripDocumentForWrite,requireReadableTripDocument}=await import('../lib/easyt/trip-document.ts');
 const {updateTravellerTransportBookingDetails}=await import('../lib/easyt/transport-booking.ts');
 const source=savedJourneyPartsTrip(false,true),before=structuredClone(source),expected=transportJourneyParts(source.legs[0]);
 const restored=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(source))));
 assert.deepEqual(restored.legs[0].segments,source.legs[0].segments);
 assert.deepEqual(transportJourneyParts(restored.legs[0]),expected);
 const edited=updateTravellerTransportBookingDetails(restored,restored.legs[0].id,{confirmation:'SYNTHETIC-EDIT',url:'https://example.invalid/synthetic',note:'Synthetic saved details'});
 const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(edited))));
 assert.deepEqual(transportJourneyParts(reloaded.legs[0]),expected);
 assert.equal(reloaded.brief.bookings?.[0].confirmation,'SYNTHETIC-EDIT');assert.deepEqual(source,before);
});

test('minor saved-coordinate drift at one canonical airport is not a missing interchange',()=>{
 const a={...air,coordinates:[2,2] as [number,number]},b={...air,id:'another-occurrence',coordinates:[2.000001,2] as [number,number]};
 const source=leg([part('access',town,a,'road'),part('flight',b,arrival,'flight'),part('onward',arrival,stay,'road')]);
 assert.deepEqual(transportJourneyParts(source).gaps,[]);
});
