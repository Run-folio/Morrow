import assert from 'node:assert/strict';
import test from 'node:test';
import * as links from '../lib/easyt/trip-workspace-links.ts';
const trip={id:'trip-mobile',stops:[{id:'tokyo-a',order:0,nights:3},{id:'kyoto',order:1,nights:3},{id:'tokyo-b',order:2,nights:2}],planItems:[{dayNumber:1,stopId:'tokyo-a'},{dayNumber:4,stopId:'kyoto'},{dayNumber:7,stopId:'tokyo-b'}]} as any;
test('mobile map action retains selected repeated stop, Calendar and return hash',()=>{
 const resolve=(links as any).tripWorkspaceMapActionHref;
 assert.equal(typeof resolve,'function');
 const href=resolve(trip,'/journey/trip-mobile/itinerary?day=7&itineraryView=calendar#notes');
 const q=new URL(href,'https://morrovia.invalid').searchParams;
 assert.equal(q.get('stop'),'tokyo-b');assert.equal(q.get('day'),'7');
 assert.equal(q.get('returnTo'),'/journey/trip-mobile/itinerary?day=7&itineraryView=calendar#notes');
});
test('mobile map action retains Stay scope and never borrows another trip',()=>{
 const resolve=(links as any).tripWorkspaceMapActionHref;assert.equal(typeof resolve,'function');
 const stay=new URL(resolve(trip,'/journey/trip-mobile/stay?stop=tokyo-b'),'https://morrovia.invalid');
 assert.equal(stay.searchParams.get('mode'),'stay');assert.equal(stay.searchParams.get('stop'),'tokyo-b');
 for(const target of ['/journey/other/itinerary?day=7','https://evil.example/journey/trip-mobile/itinerary?day=7']){
 const q=new URL(resolve(trip,target),'https://morrovia.invalid').searchParams;assert.equal(q.get('stop'),null);assert.equal(q.get('day'),null);assert.equal(q.get('returnTo'),'/journey/trip-mobile');}
});

test('bare and invalid section targets retain their canonical default scope',()=>{
 const withTransit={...trip,stops:[{id:'airport',order:-1,nights:0},...trip.stops]};
 for(const section of ['stay','stay?stop=airport','itinerary','itinerary?day=999']) {
   const q=new URL(links.tripWorkspaceMapActionHref(withTransit,`/journey/trip-mobile/${section}`),'https://morrovia.invalid').searchParams;
   assert.equal(q.get('stop'),'tokyo-a');
   if(section.startsWith('itinerary')) assert.equal(q.get('day'),'1');
 }
});
