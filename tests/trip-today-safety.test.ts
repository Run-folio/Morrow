import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {tripWorkspaceMapActionHref,mapWorkspaceReturnHref,workspaceViewFromPathname,isCanonicalTripWorkspaceHref} from '../lib/easyt/trip-workspace-links.ts';
import {fixtureTrip} from '../components/easyt/storybook/trip-today.fixture.ts';
test('Today has no mutation, geolocation, completion or secondary-storage boundary',()=>{
 const view=readFileSync('components/easyt/trip-today-workspace.tsx','utf8');const projection=readFileSync('lib/easyt/trip-today.ts','utf8');
 for(const text of [view,projection])assert.doesNotMatch(text,/mutateTrip|localStorage|sessionStorage|geolocation|saveTrip|markComplete|fetch\(/);
 assert.match(view,/ItineraryDayPhoto/);assert.match(view,/Selected|model.stay.detail/);
});
test('Today deep links preserve workspace navigation and Map return context',()=>{
 const t=fixtureTrip(),base='/journey/'+t.id+'/today';assert.equal(workspaceViewFromPathname(base,t.id),'today');assert.equal(isCanonicalTripWorkspaceHref(base),true);assert.equal(mapWorkspaceReturnHref(t.id,base+'?day=2'),base+'?day=2');const map=new URL(tripWorkspaceMapActionHref(t,base,new Date('2026-11-10T15:00:00Z')),'https://example.test');assert.equal(map.searchParams.get('day'),'2');assert.equal(map.searchParams.get('stop'),'tokyo');
});
test('Today Map cannot select an ambiguous or invalid preview day',()=>{
 const t=fixtureTrip();t.planItems.push({...t.planItems[1],id:'ambiguous',stopId:'springfield',date:'2026-11-10',dayNumber:3});t.stops.push({...t.stops[0],id:'springfield',name:'Springfield',country:'United States',order:1});
 const href='/journey/'+t.id+'/today';for(const path of [href,href+'?day=999']){const map=new URL(tripWorkspaceMapActionHref(t,path,new Date('2026-11-10T08:00:00Z')),'https://example.test');assert.equal(map.searchParams.has('day'),false);assert.equal(map.searchParams.has('stop'),false);}
});
