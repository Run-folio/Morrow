import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {eligibleCountryContextIntentIds} from '../lib/easyt/trip-country-context.ts';
import {prepareAcceptedBuilderEdit} from '../lib/easyt/trip-builder-edit.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {geographicContextMentionIds} from '../lib/easyt/place-intelligence.ts';
import {routeIntentFromHandoff} from '../lib/easyt/trip-route-intent.ts';
import {savedJourneyFinishChoiceMatches} from '../lib/easyt/journey-endpoints.ts';
const fixtures=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-country.json',import.meta.url),'utf8'));
for(const suffix of [' 4 nights',' for 4 nights',' is essential'])test(`review: source country occurrence ${suffix} remains actionable in fresh projection`,()=>{
 const trip=requireReadableTripDocument(structuredClone(fixtures.A15.trip)),brief=trip.brief.structuredBrief!,country=brief.placeMentions!.find(m=>m.sourceText==='Nicaragua')!;
 brief.source.rawPrompt=brief.source.rawPrompt!.replace('in Nicaragua,','in Nicaragua'+suffix+',');
 if(suffix===' is essential')country.role='required';
 assert(!geographicContextMentionIds(brief.source.rawPrompt,brief.placeMentions!).has(country.mentionId));
 const route=routeIntentFromHandoff({brief:brief.source.rawPrompt,structuredBrief:brief},trip.stops);
 const intent=route.destinations.find(i=>i.id===country.mentionId);assert(intent);assert.equal(intent.routeMembership,'required');
 if(suffix===' 4 nights')assert.equal(intent.requestedNights,4);
});
for(const variant of ['selected-place-unknown','destination-unknown','destination-provenance-unknown','must-visit-authored','plan-item-reference'] as const)test(`review: country correction rejects later authored ${variant}`,()=>{
 const input=requireReadableTripDocument(structuredClone(fixtures.A15.trip)),intent=input.brief.intent.route.destinations.find(i=>i.sourceText==='Nicaragua')!,brief=input.brief.structuredBrief!,destination=brief.destinations.find(d=>d.placeMentionId===intent.id)!;
 if(variant==='selected-place-unknown')Object.assign(intent.selectedPlace!,{futureTravellerChoice:{keep:'country-plan'}});
 if(variant==='destination-unknown')Object.assign(destination,{futureTravellerChoice:{keep:'country-plan'}});
 if(variant==='destination-provenance-unknown')Object.assign(destination.provenance,{futureTravellerChoice:{keep:'country-plan'}});
 if(variant==='must-visit-authored')brief.mustVisit.push({...destination,role:'must-visit',priority:'required',provenance:{kind:'explicit',source:'builder',confidence:'high'}});
 if(variant==='plan-item-reference')Object.assign(input.planItems[0]!,{intentId:intent.id});
 const trip=requireReadableTripDocument(input),before=JSON.stringify(trip);
 assert(!eligibleCountryContextIntentIds(trip).includes(intent.id));
 assert.equal(prepareAcceptedBuilderEdit(trip,{kind:'planning-context',mentionIds:[intent.id]},builderDocumentFingerprint(trip)).ok,false);assert.equal(JSON.stringify(trip),before);
});
test('review: verified catalog alias cannot bypass contradictory supported provider identities',()=>{
 const fixture=JSON.parse(readFileSync(new URL('./fixtures/batch14-qualification-finish.json',import.meta.url),'utf8')).A20,trip=requireReadableTripDocument(fixture.trip),stop=trip.stops.find(s=>s.canonicalPlaceId==='bangkok')!;
 const candidate={name:'BKK',country:'Thailand',kind:'city',coordinates:[stop.longitude!,stop.latitude!] as [number,number],canonicalPlaceId:'open-world:nominatim:relation:999999',providerId:'nominatim:relation:1903516'};
 assert.equal(savedJourneyFinishChoiceMatches({name:'Bangkok',country:'Thailand',canonicalPlaceId:'bangkok'},candidate,trip.stops),false);
 assert.equal(savedJourneyFinishChoiceMatches({name:'Bangkok',country:'Thailand',canonicalPlaceId:'bangkok'},{...candidate,canonicalPlaceId:'bangkok',providerId:stop.providerId},trip.stops),true);
});
