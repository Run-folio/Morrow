import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {builderPlaceCommand,prepareBuilderHandlerEdit} from '../lib/easyt/trip-builder-handler-contract.ts';
import {builderDocumentFingerprint} from '../lib/easyt/trip-builder-document-commit.ts';
import {acceptedGeographicPlace} from '../lib/easyt/geographic-binding.ts';
import {retireHandoffResolutionStatus,handoffOutcomeIsCurrent,insertHandoffOccurrence,handoffCanonicalOccurrenceBindings} from '../lib/easyt/home-trip-handoff.ts';
const source=readFileSync(new URL('../app/journey/new/trip-builder.tsx',import.meta.url),'utf8');
function expression(code:string,scope:Record<string,unknown>){const js=ts.transpileModule(`return (${code});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;return new Function('scope',`with(scope){${js}}`)(scope);}
test('available source-owned provider choices take precedence over an empty Discovery search shell',()=>{
 const code=source.slice(source.indexOf('  const renderedDiscoveryEntry:'),source.indexOf('  useEffect(() => {',source.indexOf('  const renderedDiscoveryEntry:')));
 const render=expression(`(()=>{${code};return renderedDiscoveryEntry;})()`,{activeProviderClarification:{mention:{mentionId:'source-town'},choices:[{name:'Recorded town'}]},discoveryProjection:{places:[]},discoveryEntry:{kind:'clarification',step:'places',mentionId:'source-town'},activeClarificationMention:{mentionId:'source-town'}});
 assert.equal(render.kind,'legacy-recovery');assert.equal(render.mentionId,'source-town');
});
function harness({stale=false,reject=false,invalid=false,optimizable=false}={}){
 let trip=requireReadableTripDocument(canonicalRouteFixture());const route=trip.brief.intent.route;
 route.orderAuthority=optimizable?'optimizable':'explicit';route.explicitIntentIds=route.destinations.map(i=>i.id);
 const mention={mentionId:'source-town',sourceText:'Recorded town',canonicalName:'Recorded town',order:1};
 const intent={id:mention.mentionId,sourceText:mention.sourceText,kind:'overnight_place' as const,selectedPlace:null,resolution:'pending' as const,requestedNights:1,routeMembership:'required' as const,stopIds:[] as string[]};
 route.destinations.splice(1,0,intent);route.explicitIntentIds.splice(1,0,intent.id);
 // Keep one requested night available without redistributing other source commitments.
 trip.endDate='2026-10-20';
 const choice={name:'Recorded town',country:'Morocco',canonicalPlaceId:'open-world:photon:N:365060850',providerId:'photon:N:365060850',coordinates:[-7.1309706,31.0451536] as [number,number],placeType:invalid?'transport_gateway':'town',routability:'direct_destination'};
 const other='source-other';const before=structuredClone(trip);let pending=[{mention},{mention:{mentionId:other}}],statuses:Record<string,string>={[intent.id]:'needs-confirmation',[other]:'needs-confirmation'},advanced=false;
 const lookup={handled:new Set<string>(),statuses:new Map(Object.entries(statuses))};const scope:Record<string,any>={builderEditSessionRef:{current:{getSnapshot:()=>({trip,inputRevision:stale?2:1,browserOwnerId:'owner-a'})}},activeBrowserOwnerIdRef:{current:'owner-a'},insertHandoffOccurrence,handoffCanonicalOccurrenceBindings,intakeMentions:route.destinations.map((i,order)=>({mentionId:i.id,order,canonicalName:i.sourceText})),setBaseSearchErrors:()=>{},providerClarificationScope:{tripId:trip.id,ownerId:'owner-a',revision:1,mentionId:mention.mentionId},acceptedGeographicPlace,isOriginMention:()=>false,builderPlaceCommand,handoffStopOccurrenceId:()=> 'town-pending-slot',handoffOccurrenceMentionIdsRef:{current:new Set()},
 dispatchAcceptedBuilderEdits:(commands:any[],options?:any)=>{if(reject)return false;if(options?.expectedInputRevision!==undefined&&options.expectedInputRevision!==(stale?2:1))return false;let next=trip;for(const command of commands){const result=prepareBuilderHandlerEdit(next,command,builderDocumentFingerprint(next));assert.ok(result.ok,JSON.stringify(result));if(result.ok)next=result.trip;}trip=next;return true;},
 handoffLookupSessionRef:{current:lookup},setLocationChoices:(update:any)=>pending=update(pending),setHandoffResolutionStatuses:(update:any)=>statuses=update(statuses),retireHandoffResolutionStatus,advanceClarificationSession:()=>advanced=true};
 const code=source.slice(source.indexOf('  const chooseProviderClarification ='),source.indexOf('  const applyTripBrief ='));
 const choose=expression(`(()=>{${code};return chooseProviderClarification;})()`,scope);
 return {choose:()=>choose(mention,choice),trip:()=>trip,before,pending:()=>pending,statuses:()=>statuses,lookup,advanced:()=>advanced,other,intentId:intent.id};
}
test('accepting the existing provider town binds the original source slot and requested night before retiring its pending lookup',()=>{
 const h=harness();h.choose();const t=h.trip(),i=t.brief.intent.route.destinations.find(i=>i.id===h.intentId)!;
 assert.equal(i.resolution,'resolved');assert.equal(i.requestedNights,1);assert.deepEqual(i.stopIds,['town-pending-slot']);assert.equal(t.stops[1]?.id,'town-pending-slot');assert.equal(t.stops[1]?.nights,1);
 assert.deepEqual(t.stops.filter(s=>s.id!=='town-pending-slot').map(s=>[s.id,s.nights]),h.before.stops.map(s=>[s.id,s.nights]));assert.deepEqual(t.planItems.filter(item=>h.before.planItems.some(old=>old.id===item.id)).map(({date,dayNumber,...item})=>item),h.before.planItems.map(({date,dayNumber,...item})=>item));assert.equal(t.brief.intent.route.orderAuthority,'explicit');
 assert.deepEqual(h.pending().map(p=>p.mention.mentionId),[h.other]);assert.equal(h.statuses()[h.intentId],'resolved');assert.equal(h.statuses()[h.other],'needs-confirmation');assert(h.advanced());assert(h.lookup.handled.has(h.intentId));assert(!handoffOutcomeIsCurrent(h.intentId,'pending',[],[...h.lookup.handled]));
});
for(const option of ['stale','reject','invalid'] as const)test(`${option} provider choice cannot mutate or retire its original source`,()=>{const h=harness({[option]:true});h.choose();assert.deepEqual(h.trip(),h.before);assert.equal(h.pending().length,2);assert.equal(h.statuses()[h.intentId],'needs-confirmation');assert.equal(h.lookup.handled.size,0);assert(!h.advanced());});

test('Builder supplies only source-owned usable geography to Discovery actionability',async()=>{
 const {extractStructuredTripBrief}=await import('../lib/easyt/structured-trip-brief.ts');
 const {discoveryEntryForBrief}=await import('../lib/easyt/discovery-entry.ts');
 const {geographicallyReady,stopGeographicPlace}=await import('../lib/easyt/geographic-binding.ts');
 const brief=extractStructuredTripBrief('Santorini 3 nights'),mention=brief.placeMentions![0]!;
 const trip=requireReadableTripDocument(canonicalRouteFixture());
 Object.assign(trip.stops[0]!,{canonicalPlaceId:'santorini',name:'Santorini',country:'Greece',latitude:null,longitude:null,geographicBinding:undefined});
 Object.assign(trip.brief.intent.route.destinations[0]!,{id:mention.mentionId,kind:'planning_area',selectedPlace:{name:'Santorini',canonicalPlaceId:'santorini',country:'Greece'},stopIds:[trip.stops[0]!.id]});
 const code=source.slice(source.indexOf('  const discoveryEntry: DiscoveryEntry ='),source.indexOf('  const discoveryRead ='));
 const actual=expression(`(()=>{${code};return discoveryEntry;})()`,{activeClarificationMention:mention,effectiveStructuredBrief:brief,activePlaceMentions:brief.placeMentions,stops:trip.stops,activeTripDocument:trip,canonicalBuilder:trip,selectedMentionIds:new Set(),discoveryEntryForBrief,geographicallyReady,stopGeographicPlace});
 assert.equal(actual.kind,'region');
});

test('an existing unverified area source opens recovery even when ordinary pending lists are empty',()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture());const intent=trip.brief.intent.route.destinations[0]!;intent.kind='planning_area';
 let opened=false;const code=source.slice(source.indexOf('  const openClarificationSession ='),source.indexOf('  const dismissClarificationSession ='));
 const open=expression(`(()=>{${code};return openClarificationSession;})()`,{pendingClarificationIds:[],builderEditSessionRef:{current:{getSnapshot:()=>({trip})}},activePlaceMentions:[{mentionId:intent.id}],geographicallyReady:()=>false,stopGeographicPlace:()=>({}),confirmSavedLocation:()=>assert.fail('Area needs source base recovery, not same-name city confirmation'),setClarificationSessionIds:(ids:string[])=>assert.deepEqual(ids,[intent.id]),setClarificationIndex:()=>{},setClarificationAutoOpened:()=>{},setClarificationDismissed:()=>{},setClarificationOpen:(v:boolean)=>opened=v});
 open(intent.id);assert(opened);
});

test('a real recovered base targets the original unverified area occurrence rather than a new timestamp stay',async()=>{
 const {geographicallyReady,stopGeographicPlace}=await import('../lib/easyt/geographic-binding.ts');
 const {isSameCanonicalPlace}=await import('../lib/easyt/journey-endpoints.ts');
 const trip=requireReadableTripDocument(canonicalRouteFixture()),intent=trip.brief.intent.route.destinations[0]!;
 intent.kind='planning_area';Object.assign(trip.stops[0]!,{latitude:null,longitude:null,geographicBinding:undefined});
 const start=source.indexOf('      const boundAreaIntent ='),end=source.indexOf('      const addedStop:',start);
 const code=source.slice(start,end);const selected=expression(`(()=>{${code};return id;})()`,{sourceSnapshot:{trip},targetMentionId:intent.id,targetMention:{mentionId:intent.id,routability:'needs_base_selection'},resolvedName:'Real selected base',resolvedCountry:'Japan',selectedCanonicalPlaceId:'new-base',resolved:{canonicalPlaceId:'new-base',providerId:'photon:N:12345',coordinates:[140,35]},stops:trip.stops,placeSelections:[],placeMentionSupportsMultipleSelections:()=>false,capturedStructuredBrief:{destinations:[{placeMentionId:intent.id,canonicalPlaceId:intent.selectedPlace?.canonicalPlaceId}]},handoffStopOccurrenceId:()=>assert.fail('Canonical source binding must win'),handoffOccurrenceMentionIdsRef:{current:new Set()},isSameCanonicalPlace,geographicallyReady,stopGeographicPlace,language:'en',fail:(message:string)=>assert.fail(message)});
 assert.equal(selected,intent.stopIds[0]);
});

test('recovering an unordered source town preserves its captured slot without upgrading route-order authority',()=>{const h=harness({optimizable:true});h.choose();assert.equal(h.trip().stops[1]?.id,'town-pending-slot');assert.equal(h.trip().brief.intent.route.orderAuthority,'optimizable');});

test('a deliberate provider choice records source confirmation for the Build omission safeguard',()=>{
 const h=harness();h.choose();const selection=h.trip().brief.structuredBrief?.placeSelections?.find(s=>s.mentionId===h.intentId);
 assert.equal(selection?.kind,'ambiguity');assert.equal(selection?.routeStopId,'town-pending-slot');assert.equal(selection?.selectedCanonicalPlaceId,'open-world:photon:N:365060850');
});

for(const change of ['trip','owner','revision','source'] as const)test(`a pending targeted base lookup cannot accept a changed ${change} scope`,async()=>{
 const trip=requireReadableTripDocument(canonicalRouteFixture()),intent=trip.brief.intent.route.destinations[0]!;
 let snapshot={trip,browserOwnerId:'owner-a',inputRevision:1},resolve:any,mutations=0;
 const response=new Promise(done=>resolve=done);
 const code=source.slice(source.indexOf('  const addStop = async ('),source.indexOf('  const addSupportedBase ='));
 const add=expression(`(()=>{${code};return addStop;})()`,{builderEditSessionRef:{current:{getSnapshot:()=>snapshot}},activeBrowserOwnerIdRef:{current:'owner-a'},addPlaceLookupSequenceRef:{current:0},resolvingPlaceMentionId:null,capturedStructuredBrief:{placeMentions:[{mentionId:intent.id,routability:'direct_destination'}]},intakeMentions:[],stops:[],stopInput:'Selected base',setBaseSearchErrors:()=>{},fetch:()=>response,language:'en',ui:{unavailable:'unavailable'},canonicalPlaceFactsMatch:()=>{mutations++;throw Error('Stale lookup reached acceptance');},setStopChecking:()=>{}});
 const pending=add('Selected base','Japan',intent.id);
 const changed=structuredClone(trip);if(change==='trip')changed.id='other-trip';if(change==='source')changed.brief.intent.route.destinations=[];
 snapshot={trip:changed,browserOwnerId:change==='owner'?'owner-b':'owner-a',inputRevision:change==='revision'?2:1};
 resolve({json:async()=>({result:{name:'Selected base',get country(){mutations++;return 'Japan';},coordinates:[139,35]}})});await pending;assert.equal(mutations,0);
});


test('provider namesake choices keep the existing traveller search available',()=>{
 const start=source.indexOf('  const clarificationNeedsSearch =');const code=source.slice(start,source.indexOf('  const clarificationIsFinal =',start));
 const actual=expression(`(()=>{${code};return clarificationNeedsSearch;})()`,{activeClarificationMention:{status:'unresolved',placeType:'unknown',requiresBaseSelection:false,routability:'non_routable_reference'},clarificationIsAmbiguity:true,clarificationSupportsMultiple:false});
 assert.equal(actual,true,'Foreign namesakes must not trap an unresolved source without its existing search');
});

test('provider town and landmark choices expose distinct visible place types',()=>{
 const start=source.indexOf('  const clarificationChoices:');const code=source.slice(start,source.indexOf('  const clarificationIsAmbiguity =',start));
 const town={name:'Merzouga',country:'Morocco',region:'Drâa-Tafilalet',providerId:'photon:N:3901504169',placeType:'town',coordinates:[-4.0140878,31.0999166]};
 const landmark={...town,providerId:'photon:N:9963716517',placeType:'landmark',coordinates:[-4.0079333,31.1000399]};
 const actual=expression(`(()=>{${code};return clarificationChoices;})()`,{activeProviderClarification:{choices:[town,landmark]},placeSuggestionLocationDetail:(choice:any)=>[choice.region,choice.country].join(' · '),placeTypeLabel:(type:string)=>type==='town'?'Town':'Landmark'});
 assert.notEqual(actual[0].detail,actual[1].detail,'A real overnight town and landmark must have distinguishable traveller-visible details');assert.match(actual[0].detail,/Town/);assert.match(actual[1].detail,/Landmark/);
});

test('unresolved identity search has no invented planning parent while a known island retains strict scope',()=>{
 const start=source.indexOf('        search={clarificationNeedsSearch');const code=source.slice(start,source.indexOf('        doneLabel=',start));
 const expr=code.match(/parentConstraint: (.*),\n/)![1]!;
 const parent={canonicalName:'Santorini',placeType:'island',parentCountries:['Greece']};
 const base={clarificationUsesNearbyBases:false,clarificationIsAmbiguity:true,planningParentForMention:()=>parent};
 assert.equal(expression(expr,{...base,activeClarificationMention:{placeType:'unknown'}}),undefined,'An unresolved phrase is not a verified geographic boundary');
 assert.deepEqual(expression(expr,{...base,activeClarificationMention:{placeType:'island'}}),parent,'Known Santorini must keep its independent containment check');
});
