import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {geographicContextMentionIds} from '../lib/easyt/place-intelligence.ts';
import {routeIntentFromHandoff} from '../lib/easyt/trip-route-intent.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import type {CanonicalEasyTTrip} from '../lib/easyt/trip.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8')).A15;
function original(){return requireReadableTripDocument(structuredClone(fixture.trip)) as CanonicalEasyTTrip;}
test('A15 actual resolved Granada and León in Nicaragua proves country context, preserving source mentions',()=>{
 const trip=original(),brief=trip.brief.structuredBrief!,mentions=brief.placeMentions!,country=mentions.find(m=>m.sourceText==='Nicaragua')!;
 assert(country);assert.equal(country.status,'resolved');
 const before=JSON.stringify(trip),context=geographicContextMentionIds(brief.source.rawPrompt!,mentions,[trip.brief.intent.route.origin!]);
 assert(context.has(country.mentionId),'The proven locative country qualifier must not request another base');
 assert.equal(JSON.stringify(trip),before,'Classification is read-only');
});
test('A15 fresh canonical projection contains the two accepted city requests without an unsolicited Nicaragua base',()=>{
 const trip=original();const route=routeIntentFromHandoff({origin:trip.brief.origin,originCountry:trip.brief.originCountry,originCanonicalPlaceId:trip.brief.originCanonicalPlaceId,journeyEnd:trip.brief.intent.route.journeyEnd,structuredBrief:trip.brief.structuredBrief,brief:trip.brief.structuredBrief!.source.rawPrompt},trip.stops);
 assert(!route.destinations.some(i=>i.sourceText==='Nicaragua'&&i.routeMembership==='required'),'A country qualifier is not an additional required destination');
 assert.deepEqual(route.destinations.map(i=>i.sourceText),['Granada','León']);
 assert(route.destinations.every(i=>i.requestedNights===null),'The actual prompt requests no nights');
});
const all=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8'));
test('A02 exact fully budgeted country header is geographic scope rather than another required base',()=>{
 const trip=requireReadableTripDocument(structuredClone(all.A02.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Italy')!;
 assert(geographicContextMentionIds(brief.source.rawPrompt!,brief.placeMentions!).has(country.mentionId));
 const route=routeIntentFromHandoff({structuredBrief:brief,brief:brief.source.rawPrompt},trip.stops);assert(!route.destinations.some(i=>i.sourceText==='Italy'));assert.deepEqual(route.destinations.map(i=>i.requestedNights),[3,3,1,3]);
});
for(const prompt of ['10 nights in Italy: Rome 3, Florence 3, Bologna 1, Venice 2.','10 nights in Italy: Rome 3, Florence 3, Bologna, Venice 3.','10 nights in Italy: Rome 3, Florence 3, Bologna 1, Venice 3. Also visit Italy.'])test(`A02 incomplete budget or separate country request remains actionable: ${prompt}`,()=>{
 const trip=requireReadableTripDocument(structuredClone(all.A02.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Italy')!;
 assert(!geographicContextMentionIds(prompt,brief.placeMentions!).has(country.mentionId));
});
for(const key of ['A02','A15'])test(`${key} eligible existing v2 correction is an accepted edit with only completeness invalidation`,()=>{
 const trip=requireReadableTripDocument(structuredClone(all[key].trip)),country=key==='A02'?'Italy':'Nicaragua',intent=trip.brief.intent.route.destinations.find(i=>i.sourceText===country)!;
 const before=JSON.stringify(trip),edit={kind:'planning-context' as const,mentionIds:[intent.id]};const result=prepareAcceptedBuilderEdit(trip,edit,builderDocumentFingerprint(trip));assert(result.ok);assert.equal(JSON.stringify(trip),before);
 assert(!result.trip.brief.intent.route.destinations.some(i=>i.id===intent.id));assert.deepEqual(result.trip.stops,trip.stops);assert.deepEqual(result.trip.planItems,trip.planItems);assert.deepEqual(result.trip.brief.intent.hardConstraints,trip.brief.intent.hardConstraints);assert.deepEqual(result.trip.brief.structuredBrief!.placeMentions,trip.brief.structuredBrief!.placeMentions);assert.deepEqual(result.trip.brief.structuredBrief!.countries,trip.brief.structuredBrief!.countries);assert.deepEqual(result.scope,{legIds:[],scheduleStopIds:[],recommendationStopIds:[],endpointChanged:false,routeAssessment:true});
 assert.equal(prepareAcceptedBuilderEdit(trip,edit,'obsolete').ok,false);
});
for(const authored of ['nights','binding','selection','shortlist','choice','commitment','item','explicit-chip','unknown-intent-field','unknown-discovery-field'] as const)test(`A15 context correction preserves later authored ${authored}`,()=>{
 const trip=original(),intent=trip.brief.intent.route.destinations.find(i=>i.sourceText==='Nicaragua')!,brief=trip.brief.structuredBrief!;
 if(authored==='unknown-intent-field')Object.assign(intent,{futureTravellerChoice:'retained'});
 if(authored==='unknown-discovery-field')Object.assign(brief.discoveryDraftByMentionId![intent.id]!,{futureTravellerChoice:'retained'});
 if(authored==='nights')intent.requestedNights=4;
 if(authored==='binding'){intent.stopIds=[trip.stops[0]!.id];trip.brief.intent.route.destinations.find(i=>i.stopIds.includes(trip.stops[0]!.id)&&i.id!==intent.id)!.stopIds=[];}
 if(authored==='selection')brief.placeSelections=[...(brief.placeSelections??[]),{mentionId:intent.id,kind:'base',selectedCanonicalPlaceId:trip.stops[0]!.canonicalPlaceId!,selectedName:trip.stops[0]!.name,routeStopId:trip.stops[0]!.id,provenance:{id:'authored',label:'Traveller choice',kind:'builder',supports:'Explicit later country base'}}];
 if(authored==='shortlist')brief.discoveryDraftByMentionId![intent.id]!.shortlistIds=['traveller-shortlist'];
 if(authored==='choice')brief.countryDiscoveryChoices={...brief.countryDiscoveryChoices,[intent.id]:['traveller-country-choice']};
 if(authored==='commitment')trip.brief.intent.hardConstraints.fixedCommitments.push({id:'country-booking',label:'Nicaragua booking',commitmentType:'booking',place:{name:'Nicaragua',canonicalPlaceId:'nicaragua'}});
 if(authored==='item')trip.planItems[0]!.notes=['Nicaragua country visit'];
 if(authored==='explicit-chip'){intent.id='builder-intent:country';brief.destinations.find(d=>d.placeMentionId==='place-nicaragua-0')!.provenance.source='builder';}
 const before=JSON.stringify(trip),result=prepareAcceptedBuilderEdit(trip,{kind:'planning-context',mentionIds:[intent.id]},builderDocumentFingerprint(trip));assert.equal(result.ok,false);assert.equal(JSON.stringify(trip),before);
});
for(const suffix of [' Explore Nicaragua for 4 nights.',' Visit Nicaragua.'])test(`A15 retains a separate affirmative country request: ${suffix}`,()=>{
 const trip=original(),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 assert(!geographicContextMentionIds((brief.source.rawPrompt??'')+suffix,brief.placeMentions!,[trip.brief.intent.route.origin!]).has(country.mentionId));
});
for(const cityName of ['Granada','León'])test(`A15 conflicting parent evidence for ${cityName} cannot prove the combined qualifier`,()=>{
 const trip=original(),brief=trip.brief.structuredBrief!,city=brief.placeMentions!.find(m=>m.sourceText===cityName)!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 city.status='resolved';city.parentCountries=['Spain'];
 assert(!geographicContextMentionIds(brief.source.rawPrompt!,brief.placeMentions!,[trip.brief.intent.route.origin!]).has(country.mentionId));
});
test('A15 existing erroneous v2 draft stays intact on read until an accepted guarded correction',()=>{
 const input=structuredClone(fixture.trip),before=JSON.stringify(input),trip=requireReadableTripDocument(input);
 assert.equal(JSON.stringify(input),before);assert(trip.brief.intent.route.destinations.some(i=>i.sourceText==='Nicaragua'&&i.routeMembership==='required'));
});
