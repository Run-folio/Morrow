import assert from 'node:assert/strict';
import test from 'node:test';
import { tripToday, todayTimeZone, localDateAt } from '../lib/easyt/trip-today.ts';
import { fixtureTrip } from '../components/easyt/storybook/trip-today.fixture.ts';
test('Tokyo local midnight, not the device date, chooses the canonical day',()=>{
 const trip=fixtureTrip();assert.equal(tripToday(trip,new Date('2026-11-10T14:59:59Z')).day?.dayNumber,1);assert.equal(tripToday(trip,new Date('2026-11-10T15:00:00Z')).day?.dayNumber,2);
});
test('timezone resolution never guesses a city in a multi-zone country',()=>{
 assert.equal(todayTimeZone({name:'Tokyo',country:'Japan'}),'Asia/Tokyo');assert.equal(todayTimeZone({name:'New York',country:'United States'}),'America/New_York');assert.equal(todayTimeZone({name:'Springfield',country:'United States'}),null);assert.equal(todayTimeZone({name:'Tokyo',country:'Brazil'}),null);
});
test('DST and date line use calendar parts from explicit IANA zones',()=>{
 assert.equal(localDateAt(new Date('2026-03-08T06:59:00Z'),'America/New_York'),'2026-03-08');assert.equal(localDateAt(new Date('2026-03-08T07:01:00Z'),'America/New_York'),'2026-03-08');assert.equal(localDateAt(new Date('2026-11-10T12:00:00Z'),'Pacific/Kiritimati'),'2026-11-11');assert.equal(localDateAt(new Date('2026-11-10T12:00:00Z'),'Pacific/Pago_Pago'),'2026-11-10');
});
test('missing, archived, invalid dates and no active day stay explicit',()=>{
 assert.equal(tripToday(null,new Date()).state,'no-trip');const t=fixtureTrip();assert.equal(tripToday({...t,status:'archived'},new Date()).state,'no-trip');assert.equal(tripToday({...t,startDate:''},new Date()).state,'dates-needed');assert.equal(tripToday({...t,startDate:'2026-02-30'},new Date()).state,'dates-needed');assert.equal(tripToday(t,new Date('2026-11-09T00:00:00Z')).state,'outside-trip');assert.equal(tripToday(t,new Date('2026-11-15T00:00:00Z')).state,'outside-trip');
});
test('unknown timezone and duplicate date occurrences never silently choose a day',()=>{
 const t=fixtureTrip();t.stops[0].country='United States';t.stops[0].name='Springfield';assert.equal(tripToday(t,new Date('2026-11-10T00:00:00Z')).state,'date-uncertain');const p=fixtureTrip();p.planItems.push({...p.planItems[0],id:'return-day',stopId:'tokyo-return',dayNumber:3});p.stops.push({...p.stops[0],id:'tokyo-return',order:1});assert.equal(tripToday(p,new Date('2026-11-10T06:00:00Z')).state,'choose-day');assert.equal(tripToday(p,new Date('2026-11-10T06:00:00Z'),'return-day').day?.stopId,'tokyo-return');
});
test('explicit preview is labelled preview, including past days',()=>{
 const t=fixtureTrip();const r=tripToday(t,new Date('2026-12-01T00:00:00Z'),'d1');assert.equal(r.state,'preview');assert.equal(r.day?.id,'d1');assert.equal(tripToday(t,new Date(),'missing').state,'invalid-preview');
});
test('elapsed times never remove saved plans or infer completion',()=>{
 const t=fixtureTrip();const r=tripToday(t,new Date('2026-11-10T14:59:00Z'));assert.equal(r.activities.length,2);assert.deepEqual(r.activities.map(a=>a.title),['Museum visit','Asakusa & Senso-ji']);
});
test('selected stays stay unbooked; confirmation is required for Booked',()=>{
 const t=fixtureTrip();assert.equal(tripToday(t,new Date('2026-11-10T06:00:00Z')).stay?.detail,'Selected · not booked');t.brief.bookings![0].confirmation='ABC';assert.match(tripToday(t,new Date('2026-11-10T06:00:00Z')).stay?.detail??'',/^Booked/);
});
test('recorded overnight transport is retained on its second day without claiming live progress',()=>{
 const t=fixtureTrip();t.brief.bookings!.push({id:'transport-leg',type:'transport',title:'Overnight train',date:'2026-11-09',endDate:'2026-11-11',confirmation:'TICKET',url:null,transportDetails:{mode:'train',from:'Tokyo',to:'Kyoto'}});t.stops.push({...t.stops[0],id:'kyoto',name:'Kyoto',order:1,arrivalDate:'2026-11-11',departureDate:'2026-11-12'});t.legs.push({id:'leg',fromStopId:'tokyo',toStopId:'kyoto',mode:'train',distanceKm:450,durationMinutes:600,provider:null,routeMetadata:{}});const r=tripToday(t,new Date('2026-11-10T06:00:00Z'));assert.equal(r.overnightTransport?.leg.id,'leg');assert.equal(r.transport?.leg.id,'leg');
});
test('Today projection cannot change the trip document',()=>{
 const t=fixtureTrip();const before=JSON.stringify(t);function freeze(x:unknown){if(x&&typeof x==='object'){Object.freeze(x);for(const v of Object.values(x))freeze(v);}}freeze(t);tripToday(t,new Date('2026-11-10T06:00:00Z'));assert.equal(JSON.stringify(t),before);
});

test('a missing itinerary day is not presented as a finished or absent trip',()=>{assert.equal(tripToday(fixtureTrip(),new Date('2026-11-12T06:00:00Z')).state,'day-missing');});

test('only an explicitly saved activity time appears as a timed plan',()=>{const t=fixtureTrip();assert.equal(tripToday(t,new Date('2026-11-10T06:00:00Z')).activities[0].startsAt,'10:00');t.brief.itineraryIdeas=[];assert.equal(tripToday(t,new Date('2026-11-10T06:00:00Z')).activities[0].startsAt,undefined);});
