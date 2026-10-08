import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {captureJourneyBrief} from '../lib/easyt/journey-capture.ts';
import {projectHomepageInput} from '../lib/easyt/home-trip-handoff.ts';
import {extractStructuredTripBrief} from '../lib/easyt/structured-trip-brief.ts';
import {routeIntentFromHandoff} from '../lib/easyt/trip-route-intent.ts';
import {geographicContextMentionIds} from '../lib/easyt/place-intelligence.ts';
import {emptyHomepageInput} from './fixtures/homepage-dual-entry.ts';
import type {JourneyCaptureResult} from '../lib/easyt/journey-capture.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-initial-intake-capture.json',import.meta.url),'utf8')).find((f:any)=>f.case==='A15');
function project(prompt=fixture.prompt,capture=structuredClone(fixture.capture) as JourneyCaptureResult, selectedOrigin?:{name:string;country:string;canonicalPlaceId:string;coordinates:[number,number]}){
 const before=JSON.stringify(capture),r=projectHomepageInput({snapshot:{...emptyHomepageInput(),mode:'describe',prompt,...(selectedOrigin?{origin:{state:'selected' as const,value:selectedOrigin},originInput:selectedOrigin.name}:{}),tripType:{state:'selected',value:'one_way'}},capture,profile:null,handoffId:'country-context'});assert(r.ok);assert.equal(JSON.stringify(capture),before);return r.draft;
}
test('A15 actual origin qualifier keeps geography/source but adds no unsolicited country stay',()=>{
 const draft=project();assert.deepEqual(draft.routeIntent!.destinations.map(i=>i.sourceText),['Granada','León']);
 assert.equal(draft.locationMentions!.find(m=>m.role==='origin')!.sourceText,'San José, Costa Rica');assert.equal(draft.routeIntent!.journeyEnd.mode,'explicit');
 assert.equal(draft.structuredBrief!.source.rawPrompt,fixture.prompt);assert(draft.locationMentions!.some(m=>m.sourceText==='Costa Rica'));
 assert(draft.structuredBrief!.countries.some(c=>c.value==='Costa Rica'));assert(draft.routeIntent!.destinations.every(i=>i.requestedNights===null));
});
test('new extraction retains qualifier country as geographic context without a destination/base constraint',()=>{
 const c=fixture.capture;const b=extractStructuredTripBrief(fixture.prompt,c.parserVersion,{version:1,parserVersion:c.parserVersion,sequenceKind:'ordered',mentions:c.mentions,issues:c.structuredBrief.placeIssues??[]});
 assert(b.placeMentions!.some(m=>m.sourceText==='Costa Rica'));assert(b.countries.some(c=>c.value==='Costa Rica'));
 assert(!b.destinations.some(d=>d.name==='Costa Rica'));assert(!b.placeIssues!.some(i=>i.mentionId==='place-costa-rica-0'));
});
for(const prompt of ['Start in San José, Costa Rica, then explore Costa Rica for 7 nights.','Explore Costa Rica for 7 nights, then finish in Antigua Guatemala.'])test(`explicit country visit remains actionable: ${prompt}`,()=>{
 const c=captureJourneyBrief(prompt),d=project(prompt,c);assert(d.routeIntent!.destinations.some(i=>i.selectedPlace?.country==='Costa Rica'&&i.kind==='planning_area'));
});
for(const proof of ['ambiguous-country','foreign-city-parent','missing-city'] as const)test(`uncertain qualifier keeps reviewable country intent: ${proof}`,()=>{
 const c=structuredClone(fixture.capture) as JourneyCaptureResult;const country=c.mentions.find(m=>m.sourceText==='Costa Rica')!,city=c.mentions.find(m=>m.role==='origin')!;
 if(proof==='ambiguous-country')country.status='ambiguous';if(proof==='foreign-city-parent'){city.status='resolved';city.parentCountries=['Brazil'];}if(proof==='missing-city')c.mentions=c.mentions.filter(m=>m!==city);
 c.structuredBrief.placeMentions=c.mentions;const d=project(fixture.prompt,c);assert(d.routeIntent!.destinations.some(i=>i.id===country.mentionId));
});
test('a negated additional country visit does not turn the origin qualifier into a required base',()=>{
 const prompt='Start in San José, Costa Rica, then Granada in Nicaragua. Do not explore Costa Rica.';
 const d=project(prompt,captureJourneyBrief(prompt));assert(!d.routeIntent!.destinations.some(i=>i.selectedPlace?.canonicalPlaceId==='costa-rica'));
});

test('A15 selected shared origin retains qualifier context after source endpoint filtering',()=>{
 const d=project(fixture.prompt,structuredClone(fixture.capture),{name:'San José',country:'Costa Rica',canonicalPlaceId:'open-world:nominatim:relation:19827540',coordinates:[-84.0796683,9.9327373]});
 assert.deepEqual(d.routeIntent!.destinations.map(i=>i.sourceText),['Granada','León']);assert.equal(d.routeIntent!.origin!.country,'Costa Rica');assert(d.locationMentions!.some(m=>m.sourceText==='Costa Rica'));
});

test('Builder re-projection with the selected origin retains qualifier context after endpoint override',()=>{
 const d=project(fixture.prompt,structuredClone(fixture.capture),{name:'San José',country:'Costa Rica',canonicalPlaceId:'open-world:nominatim:relation:19827540',coordinates:[-84.0796683,9.9327373]});
 const rebuilt=routeIntentFromHandoff({routeIntent:d.routeIntent,origin:d.origin,originCountry:d.originCountry,originCanonicalPlaceId:d.originCanonicalPlaceId,journeyEnd:d.journeyEnd,structuredBrief:d.structuredBrief,brief:d.brief},[]);
 assert.deepEqual(rebuilt.destinations.map(i=>i.sourceText),['Granada','León']);
});

test('selected endpoint country proof cannot suppress a separate affirmative country visit',()=>{
 const prompt='Start in San José, Costa Rica. Explore Costa Rica for 7 nights.',capture=captureJourneyBrief(prompt);
 assert(!geographicContextMentionIds(prompt,capture.mentions,[{name:'San José',country:'Costa Rica'}]).has(capture.mentions.find(m=>m.canonicalPlaceId==='costa-rica')!.mentionId));
});
test('a selected endpoint with conflicting country cannot prove the qualifier after source removal',()=>{
 const mentions=fixture.capture.mentions.filter((m:any)=>m.role!=='origin');
 assert.equal(geographicContextMentionIds(fixture.prompt,mentions,[{name:'San José',country:'Brazil'}]).size,0);
});
