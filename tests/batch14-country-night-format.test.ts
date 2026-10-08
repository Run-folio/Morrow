import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {geographicContextMentionIds} from '../lib/easyt/place-intelligence.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {routeIntentFromHandoff} from '../lib/easyt/trip-route-intent.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8')).A15;
for(const format of ['4 nights','4n','4nights','4night','4 n',': 4n','—4nights'])test(`supported country night syntax retains required parent budget: ${format}`,()=>{
 const trip=requireReadableTripDocument(structuredClone(fixture.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 brief.source.rawPrompt=brief.source.rawPrompt!.replace('in Nicaragua,',`in Nicaragua ${format},`);
 const route=routeIntentFromHandoff({brief:brief.source.rawPrompt,structuredBrief:brief},trip.stops),intent=route.destinations.find(i=>i.id===country.mentionId);
 assert(intent,'An existing supported night quantity must not disappear as context');assert.equal(intent.requestedNights,4);assert.equal(intent.routeMembership,'required');
 assert(!geographicContextMentionIds(brief.source.rawPrompt,brief.placeMentions!).has(country.mentionId));
});
test('context-only country remains excluded without a night or affirmative requirement',()=>{
 const trip=requireReadableTripDocument(structuredClone(fixture.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 assert(geographicContextMentionIds(brief.source.rawPrompt!,brief.placeMentions!).has(country.mentionId));
 assert(!routeIntentFromHandoff({brief:brief.source.rawPrompt,structuredBrief:brief},trip.stops).destinations.some(i=>i.id===country.mentionId));
});
for(const suffix of ['4nightside','4northern'])test(`source parser word boundary is retained for ${suffix}`,()=>{
 const trip=requireReadableTripDocument(structuredClone(fixture.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 brief.source.rawPrompt=brief.source.rawPrompt!.replace('in Nicaragua,',`in Nicaragua ${suffix},`);
 assert(geographicContextMentionIds(brief.source.rawPrompt,brief.placeMentions!).has(country.mentionId));
 assert(!routeIntentFromHandoff({brief:brief.source.rawPrompt,structuredBrief:brief},trip.stops).destinations.some(i=>i.id===country.mentionId));
});
