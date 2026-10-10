import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {acceptedGeographicPlace,geographicallyReady,stopGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {placeSuggestionLocationDetail} from '../lib/easyt/place-autocomplete.ts';
import {retireHandoffResolutionStatus,handoffOutcomeIsCurrent} from '../lib/easyt/home-trip-handoff.ts';
import {referenceRecordKey,REFERENCE_SNAPSHOT_ID} from '../lib/easyt/place-reference.ts';

const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
function productionExpression(expression:string,scope:Record<string,unknown>){
 const script=ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
 return new Function('scope',`with(scope){${script}}`)(scope);
}
const choices=[
 {name:'Cusco',country:'Peru',canonicalPlaceId:'reference:geonames:3941584',providerId:'fixture:southern-cusco',coordinates:[-71.96701,-13.53188] as [number,number],placeType:'city',routability:'direct_destination'},
 {name:'Cusco',country:'Peru',canonicalPlaceId:'reference:geonames:3697554',providerId:'fixture:northern-cusco',coordinates:[-76.47555,-7.25556] as [number,number],placeType:'city',routability:'direct_destination'},
];
for(const choice of choices){
 Object.assign(choice,{providerId:referenceRecordKey({source:'geonames',sourceId:choice.canonicalPlaceId.split(':')[2]!,countryCode:'PE',placeType:'city',coordinates:choice.coordinates},REFERENCE_SNAPSHOT_ID),referenceSnapshotId:REFERENCE_SNAPSHOT_ID});
}
function harness({stale=false,reject=false,parent=false}={}){
 let trip=requireReadableTripDocument(canonicalRouteFixture());const id=trip.stops[0]!.id,intent=trip.brief.intent.route.destinations[0]!;
 Object.assign(trip.stops[0]!,{name:'Cusco',country:'Peru',canonicalPlaceId:'cusco',providerId:undefined,geographicBinding:undefined,latitude:null,longitude:null,nights:5});
 Object.assign(intent,{id:'source-cusco-0',sourceText:'Cusco',kind:parent?'planning_area':'overnight_place',selectedPlace:{name:'Cusco',country:'Peru',canonicalPlaceId:'cusco'},requestedNights:5});
 const other='source-cusco-1';let pending=[{mention:{mentionId:intent.id}},{mention:{mentionId:other}}],statuses:Record<string,string>={[intent.id]:'needs-confirmation',[other]:'needs-confirmation'};
 const lookup={handled:new Set<string>(),statuses:new Map(Object.entries(statuses))};let dismissed=false,opened:string|null=null;
 const before=structuredClone(trip);
 const scope:Record<string,any>={savedFinishReview:{targetId:id,choices},savedFinishIsCurrent:()=>stale?null:{trip,inputRevision:1},savedTargetPlace:(t:typeof trip,targetId:string)=>stopGeographicPlace(t.stops.find(stop=>stop.id===targetId)!),acceptedGeographicPlace,builderPlaceCommand,
  dispatchAcceptedBuilderEdit:(command:Parameters<typeof prepareBuilderHandlerEdit>[1])=>{if(reject)return false;const result=prepareBuilderHandlerEdit(trip,command,builderDocumentFingerprint(trip));assert.ok(result.ok);if(result.ok)trip=result.trip;return true;},
  dismissSavedFinish:()=>{dismissed=true;},handoffLookupSessionRef:{current:lookup},retireHandoffResolutionStatus,
  setLocationChoices:(update:any)=>{pending=update(pending);},setHandoffResolutionStatuses:(update:any)=>{statuses=update(statuses);},
  pendingClarificationIds:[intent.id,other],activePlaceMentions:[{mentionId:intent.id}],builderEditSessionRef:{current:{getSnapshot:()=>({trip,inputRevision:1})}},geographicallyReady,stopGeographicPlace,
  confirmSavedLocation:(targetId:string)=>{opened=targetId;},setClarificationSessionIds:()=>{},setClarificationIndex:()=>{},setClarificationAutoOpened:()=>{},setClarificationDismissed:()=>{},setClarificationOpen:()=>{},
 };
 const section=source.indexOf('<BuilderClarificationDialog open={Boolean(savedFinishReview)}');
 const start=source.indexOf('onChoose={',section)+'onChoose={'.length,end=source.indexOf('\n        }}/>',start)+'\n        }'.length;
 const choose=productionExpression(source.slice(start,end),scope);
 const openBody=source.slice(source.indexOf('  const openClarificationSession ='),source.indexOf('  const dismissClarificationSession ='));
 const open=productionExpression(`(()=>{${openBody};return openClarificationSession;})()`,scope);
 return {choose,open,trip:()=>trip,before,pending:()=>pending,statuses:()=>statuses,lookup,dismissed:()=>dismissed,opened:()=>opened,id,intentId:intent.id,other};
}

test('accepted saved city choice retires only its original pending occurrence without changing nights, order or authored content',()=>{
 const h=harness();h.choose({id:'0'});
 assert.deepEqual(h.pending().map(item=>item.mention.mentionId),[h.other]);
 assert.equal(h.statuses()[h.intentId],'resolved');assert.equal(h.statuses()[h.other],'needs-confirmation');assert(h.lookup.handled.has(h.intentId));assert(!h.lookup.handled.has(h.other));
 assert.equal(handoffOutcomeIsCurrent(h.intentId,'pending',[],[...h.lookup.handled]),false,'late old lookup cannot resurrect confirmed occurrence');
 assert.equal(handoffOutcomeIsCurrent(h.other,'pending',[],[...h.lookup.handled]),true,'unconfirmed sibling remains eligible');
 assert.equal(geographicallyReady(stopGeographicPlace(h.trip().stops[0]!)),true);
 assert.deepEqual(h.trip().stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]),h.before.stops.map(stop=>[stop.id,stop.nights,stop.arrivalDate,stop.departureDate]));
 assert.deepEqual(h.trip().brief.intent.route.orderedStopIds,h.before.brief.intent.route.orderedStopIds);assert.deepEqual(h.trip().planItems,h.before.planItems);
 assert.equal(h.trip().brief.intent.route.destinations[0]!.requestedNights,5);assert.equal(h.dismissed(),true);
});
for(const option of ['stale','reject','parent'] as const)test(`${option} saved-city choice cannot retire another pending planning decision`,()=>{
 const h=harness({[option]:true});h.choose({id:'0'});assert.deepEqual(h.pending().map(item=>item.mention.mentionId),[h.intentId,h.other]);assert.equal(h.statuses()[h.intentId],'needs-confirmation');assert(!h.lookup.handled.has(h.intentId));
});
test('original pending direct-city control opens the existing saved location chooser for its bound occurrence',()=>{
 const h=harness();h.open(h.intentId);assert.equal(h.opened(),h.id);
});
test('same-country city choices retain distinct provider identities and expose the existing geographic disambiguation detail',()=>{
 const section=source.indexOf('<BuilderClarificationDialog open={Boolean(savedFinishReview)}');const start=source.indexOf('choices={',section)+'choices={'.length,end=source.indexOf('\n        onChoose=',start);
 const expression=source.slice(start,end).trim().replace(/}$/, '');
 const rendered=productionExpression(expression,{savedFinishReview:{choices},placeSuggestionLocationDetail});
 assert.deepEqual(rendered.map((item:any)=>item.id),['0','1']);assert.notEqual(rendered[0].detail,rendered[1].detail);
 assert.match(rendered[0].detail,/13\.53188.*71\.96701/);assert.match(rendered[1].detail,/7\.25556.*76\.47555/);
 assert.deepEqual(choices.map(choice=>choice.canonicalPlaceId),['reference:geonames:3941584','reference:geonames:3697554']);
});
