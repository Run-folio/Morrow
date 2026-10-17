import assert from 'node:assert/strict';
import test from 'node:test';
import * as display from '../lib/easyt/trip-display.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

type HeaderTrip=Pick<EasyTTrip,'title'|'stops'>&{brief:Pick<EasyTTrip['brief'],'origin'|'customTitle'>};
const title=(trip:HeaderTrip)=>{
  assert.equal(typeof display.tripOverviewDisplayTitle,'function','Overview needs a provenance-safe display-only title');
  return display.tripOverviewDisplayTitle(trip);
};
const route=(customTitle?:string|null):HeaderTrip=>({title:'London Gatwick → Beijing → Shanghai → Tokyo → Kyoto',brief:{origin:'London Gatwick',...(customTitle===undefined?{}:{customTitle})},stops:[
  {id:'beijing',order:0,name:'Beijing',country:'China',countryCode:'CN',nights:3},
  {id:'shanghai',order:1,name:'Shanghai',country:'China',nights:3},
  {id:'tokyo',order:2,name:'Tokyo',country:'Japan',nights:3},
  {id:'kyoto',order:3,name:'Kyoto',country:'Japan',nights:3},
]as EasyTTrip['stops']});

test('explicit automatic Overview titles use destination countries without the origin airport',()=>{
  const trip=route(null),before=JSON.stringify(trip);assert.equal(title(trip),'China & Japan');assert.equal(JSON.stringify(trip),before);
});
test('explicitly authored names remain byte-for-byte unchanged',()=>{
  for(const name of ['Our China adventure','  春の旅 — China  & Japan  ','London Gatwick → Beijing → Tokyo'])assert.equal(title(route(name)),name);
});
test('ambiguous legacy saved titles are preserved rather than inferred from arrows or length',()=>{
  const trip=route();assert.equal(title(trip),trip.title);assert.equal(title({...trip,title:'Our very long but personal journey name'}),'Our very long but personal journey name');
});
test('the exact known legacy generator remains eligible for a short display title',()=>{
  const trip=route();trip.title=display.legacyGeneratedTripTitle(trip);assert.equal(title(trip),'China & Japan');
  for(const saved of [trip.title.toUpperCase(),`  ${trip.title}  `])assert.equal(title({...trip,title:saved}),saved);
});
test('unverified country labels are not promoted to geographic title facts',()=>{
  const trip=route(null);trip.stops=trip.stops.map(stop=>({...stop,country:'Somewhere unconfirmed',countryCode:undefined}));assert.equal(title(trip),'Your trip');
});
test('country codes and aliases deduplicate consistently and long country lists stay bounded',()=>{
  const trip=route(null);trip.stops=[{...trip.stops[0]!,country:'Unknown',countryCode:'JP'},{...trip.stops[1]!,country:'Japan'},{...trip.stops[2]!,country:'France'},{...trip.stops[3]!,country:'Italy'},{...trip.stops[3]!,id:'spain',order:4,country:'Spain'}];assert.equal(title(trip),'Japan, France + 2 more');
});
