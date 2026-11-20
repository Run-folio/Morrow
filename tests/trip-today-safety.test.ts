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

test('full-day presentation retains an explicitly saved start time',()=>{const view=readFileSync('components/easyt/trip-today-workspace.tsx','utf8');assert.match(view,/\[copy\.allDay,time\]\.filter\(Boolean\)\.join/);});

test('Today puts compact actions by the place and the empty selected-day plans', () => {
 const view=readFileSync('components/easyt/trip-today-workspace.tsx','utf8');
 const css=readFileSync('components/easyt/trip-today-workspace.module.css','utf8');
 assert.match(view, /<h3>\{stop\.name\}<\/h3>[\s\S]*?href=\{itineraryHref\}[^>]*size="small"[^>]*>\{copy\.itinerary\}/);
 assert.match(view, /\{copy\.noPlans\}[\s\S]*?href=\{exploreWorkspaceHref\(trip\.id,stop\.id,day\.dayNumber\)\}[^>]*>\{copy\.findActivity\}/);
 assert.doesNotMatch(view, /styles\.(?:dateBasis|mobileItinerary|desktopItinerary|primaryLink)|copy\.basis|model\.timezone/);
 assert.match(view, /<h2[^>]*className=\{isPreview\?'sr-only':undefined\}[^>]*>\{isPreview\?copy\.preview:copy\.today\}/);
 assert.doesNotMatch(view, /Return to Today|Volver a Hoy|copy\.return/);
 assert.match(view, /transport\?\.booking\?copy\.saved:null/);
 assert.match(view, /\{transportStatus\?<p>\{transportStatus\}<\/p>:null\}/);
 assert.doesNotMatch(view, /Time set|Time not set|Itinerary date|copy\.(?:time|untimed|itineraryDate)\b/);
 assert.match(view, /activity\.booking\?<p>\{activity\.booking\.confirmation\?copy\.booked:copy\.saved\}/);
 assert.match(view, /const nextTransportDate=transport\?transportDate\(transport\):null/);
 assert.match(view, /\{nextTransportDate\?<p>.*date\(nextTransportDate\)/);
 assert.match(view, /\{copy\.itinerary\}[\s\S]*?<\/div>\s*<ItineraryDayPhoto/);
 assert.match(css, /\.location \{[^}]*grid-template-columns: minmax\(0, 1fr\);[^}]*justify-items: start/);
 assert.match(css, /\.location \.locationPhoto \{[^}]*aspect-ratio: 3 \/ 2/);
 assert.doesNotMatch(css, /\.location[^{}]*\{[^}]*linear-gradient/);
});
