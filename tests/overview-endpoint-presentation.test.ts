import assert from 'node:assert/strict';
import test from 'node:test';
import {hostileTripFixture} from './fixtures/hostile-trip-facts.ts';
import {originEndpointForTrip,endEndpointForTrip} from '../lib/easyt/trip-legs.ts';
import {overviewRouteSteps} from '../lib/easyt/trip-overview-route-steps.ts';
function fixture(ownerId:string|null='owner-a'){
 const trip=hostileTripFixture();trip.ownerId=ownerId;trip.brief.origin='London Gatwick (LGW)';trip.brief.originCountry='United Kingdom';trip.brief.originCoordinates=[-0.19,51.15];trip.brief.journeyEnd={mode:'same_as_start'};
 const origin=originEndpointForTrip(trip),end=endEndpointForTrip(trip)!;trip.legs.unshift({...trip.legs[0]!,id:'arrival',classification:'arrival',fromStopId:origin.id,toStopId:trip.stops[0]!.id,durationMinutes:null});trip.legs.push({...trip.legs[0]!,id:'return',classification:'departure',fromStopId:trip.stops.at(-1)!.id,toStopId:end.id,durationMinutes:null});return trip;
}
for(const owner of [null,'owner-a'])test(`compact endpoint rows preserve stays transfers and source for ${owner??'guest'}`,()=>{
 const trip=fixture(owner),before=JSON.stringify(trip),rows=overviewRouteSteps(trip);
 assert.deepEqual(rows.map(r=>r.kind),['origin','stay','stay','stay','end']);assert.equal(rows[0]!.label,'From London Gatwick (LGW)');assert.equal(rows.at(-1)!.label,'Return to London Gatwick (LGW)');
 assert.deepEqual(rows.filter(r=>r.kind==='stay').map(r=>r.id),trip.stops.map(s=>s.id));assert.deepEqual(rows.map(r=>r.number),[1,2,3,4,5]);assert.equal(rows[0]!.leg?.id,'arrival');assert.equal(rows.at(-2)!.leg?.id,'return');assert.equal(rows[0]!.leg?.durationMinutes,null);assert.equal(JSON.stringify(trip),before);
});
test('a different endpoint says To and an unknown end does not invent a return',()=>{
 const trip=fixture();trip.brief.journeyEnd={mode:'explicit',place:{name:'Seoul',country:'South Korea'}};assert.equal(overviewRouteSteps(trip).at(-1)!.label,'To Seoul');trip.brief.journeyEnd={mode:'unknown'};assert.equal(overviewRouteSteps(trip).at(-1)!.kind,'stay');
});
test('a genuine first or final stay matching an endpoint remains a numbered stay card',()=>{
 const trip=fixture();trip.stops[0]={...trip.stops[0]!,name:'London Gatwick (LGW)',country:'United Kingdom',longitude:-0.19,latitude:51.15};let rows=overviewRouteSteps(trip);assert.equal(rows[0]!.kind,'stay');assert.equal(rows[0]!.id,trip.stops[0]!.id);assert.equal(rows[0]!.number,1);
 trip.stops[2]={...trip.stops[2]!,longitude:10,latitude:20};trip.brief.journeyEnd={mode:'explicit',place:{name:trip.stops.at(-1)!.name,country:trip.stops.at(-1)!.country,coordinates:[10,20]}};rows=overviewRouteSteps(trip);assert.equal(rows.at(-1)!.kind,'stay');assert.equal(rows.at(-1)!.isJourneyEnd,true);assert.equal(rows.filter(r=>r.kind==='stay').length,trip.stops.length);
});
test('repeated city and airport-named overnight occurrences are never filtered out',()=>{
 const trip=fixture();trip.stops[1]={...trip.stops[1]!,name:trip.stops[0]!.name,country:trip.stops[0]!.country};trip.stops[2]={...trip.stops[2]!,name:'London Gatwick (LGW)',country:'United Kingdom',longitude:-0.19,latitude:51.15};const rows=overviewRouteSteps(trip);assert.deepEqual(rows.filter(r=>r.kind==='stay').map(r=>r.id),['a','b','c']);assert.equal(rows.at(-1)!.kind,'stay');
});
test('only endpoint labels localize; missing legs stay missing and source order is stable',()=>{
 const trip=fixture();trip.legs=[];trip.stops.reverse();const before=JSON.stringify(trip),rows=overviewRouteSteps(trip,'es');assert.equal(rows[0]!.label,'Desde London Gatwick (LGW)');assert.equal(rows.at(-1)!.label,'Regreso a London Gatwick (LGW)');assert.deepEqual(rows.filter(r=>r.kind==='stay').map(r=>r.id),['a','b','c']);assert.ok(rows.every(r=>r.leg===null));assert.equal(JSON.stringify(trip),before);
});

test('unproven same-name endpoints do not acquire new geographic authority',()=>{
 const trip=fixture();delete trip.brief.originCoordinates;trip.stops[0]={...trip.stops[0]!,name:trip.brief.origin,country:'United Kingdom'};trip.stops[2]={...trip.stops[2]!,name:trip.brief.origin,country:'United Kingdom'};const rows=overviewRouteSteps(trip);assert.equal(rows[0]!.kind,'origin');assert.equal(rows.at(-1)!.kind,'end');assert.equal(rows.filter(r=>r.kind==='stay').length,3);
});
