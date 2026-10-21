import assert from 'node:assert/strict';
import test from 'node:test';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {flightAirportAssumptionLabel} from '../lib/easyt/flight-airport-assumptions.ts';
import {transferTimingLabel} from '../lib/easyt/transfer-timing-label.ts';
import {transferJourneyModeLabel} from '../lib/easyt/transfer-journey.ts';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import type {TripLeg} from '../lib/easyt/trip.ts';
import {japanTrip} from './fixtures/transport-choice.ts';
import {supportedTransportChoicesForLeg,selectTripLegTransportChoice,effectiveTripLeg,clearTripLegTransportChoice} from '../lib/easyt/transport-mode-choice.ts';
import {selectedTransportChoiceForLeg} from '../lib/easyt/transport-mode-choice.ts';
import {routeEndpointForLeg} from '../lib/easyt/trip-legs.ts';
import savedUnresolved from './fixtures/paris-lhr-saved-unresolved.json' with {type:'json'};
import {tripFromBuilder,type EasyTTrip} from '../lib/easyt/trip.ts';
import {prepareTripDocumentForWrite,requireReadableTripDocument} from '../lib/easyt/trip-document.ts';

const paris=selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint');
const london=selectedTransferPlace('London','United Kingdom','reference:geonames:2643743','endpoint');
const cdg=selectedTransferPlace('CDG','France','reference:ourairports:4185','endpoint');
const lhr=selectedTransferPlace('LHR','United Kingdom','reference:ourairports:2434','endpoint');
function canonical(from=paris,to=lhr):TripLeg {
 return buildCanonicalTripLegs({tripId:'airport-planning-control',origin:{...from,coordinates:from.coordinates??null},stops:[],
  journeyEnd:{mode:'explicit',place:to}})[0]!;
}
function savedReturnTrip():EasyTTrip {
 const trip=tripFromBuilder({id:'airport-planning-control',origin:lhr.name,originCountry:lhr.country,originCanonicalPlaceId:lhr.canonicalPlaceId,
  originProviderId:lhr.providerId,originCoordinates:lhr.coordinates,journeyEnd:{mode:'same_as_start'},
  stops:[{id:'paris-stay',...paris,country:paris.country!}],startDate:'2026-11-20',endDate:'2026-11-24',
  picks:{},mustDo:'',pace:'slow',hotels:'few',budget:'mid',draft:[],nightAllocations:{'paris-stay':4}});
 const saved:TripLeg=JSON.parse(JSON.stringify(savedUnresolved));
 assert.equal(trip.legs.at(-1)?.id,saved.id);
 return prepareTripDocumentForWrite({...trip,legs:trip.legs.map(leg=>leg.id===saved.id?saved:leg)});
}

test('saved unknown Paris to explicit LHR offers an opt-in flight estimate without changing the saved leg',()=>{
 // Captured offline from unchanged staging73f6c407 resolver, using public
 // maintained Paris/LHR fixtures. It is not read from the traveller's trip.
 const trip=savedReturnTrip(),source=trip.legs.at(-1)!,before=structuredClone(trip);
 const choices=supportedTransportChoicesForLeg(trip,source),flight=choices.find(choice=>choice.candidateId==='flight:airport-planning');
 assert.ok(flight,'the existing Change transport dialog needs a selectable planning option');
 assert.equal(flight.mode,'flight');assert.equal(flight.durationMinutes,240);assert.equal(flight.provenance,'planning_estimate');
 assert.deepEqual(trip,before,'opening choices is read-only');
 assert.equal(effectiveTripLeg(trip,source).mode,'unknown','no selection means no automatic air inference');
 const chosen=selectTripLegTransportChoice(trip,source.id,flight.identity);
 assert.deepEqual(chosen.legs,before.legs,'the saved source/provenance is retained');
 const reloaded=requireReadableTripDocument(JSON.parse(JSON.stringify(prepareTripDocumentForWrite(chosen))));
 const effective=effectiveTripLeg(reloaded,reloaded.legs.at(-1)!);
 assert.equal(effective.mode,'flight');assert.equal(effective.doorToDoorMinutes,240);assert.equal(effective.provenance,'planning_estimate');
 assert.equal(effective.scheduleNeedsChecking,true);assert.equal(effective.headlineMinutes,null);
 assert.deepEqual(effective.fromEndpoint,source.fromEndpoint);assert.deepEqual(effective.toEndpoint,source.toEndpoint);
 assert.equal(effectiveTripLeg(clearTripLegTransportChoice(reloaded,source.id),source).mode,'unknown');
 const stale=structuredClone(reloaded),last=stale.legs.at(-1)!;last.fromEndpoint!.coordinates=[2.4,48.9];
 assert.equal(effectiveTripLeg(stale,last).mode,'unknown','stale point invalidates the derived choice without deleting saved data');
});

test('opt-in unknown-leg allowance respects provider/imported facts, flight exclusions and explicit airport geography',()=>{
 const unknown:TripLeg={...canonical(),mode:'unknown',durationMinutes:null,doorToDoorMinutes:null,provenance:'unknown',routeMetadata:{source:'multimodal-resolver'}};
 for(const source of [
  {...unknown,provenance:'provider' as const}, {...unknown,provenance:'canonical_schedule' as const},
  {...unknown,routeMetadata:{source:'imported-booking'}}, {...unknown,routeMetadata:{source:'traveller-authored'}},
  {...unknown,routeMetadata:{source:'multimodal-resolver',confirmed:true}},
  {...unknown,routeMetadata:{source:'multimodal-resolver',transportConstraints:{excludedModes:['flight' as const]}}},
  {...unknown,toEndpoint:{...unknown.toEndpoint!,canonicalPlaceId:'explicit-other-airport'}},
  {...unknown,fromEndpoint:{...unknown.fromEndpoint!,coordinates:[2.4,48.9] as [number,number]}},
  {...unknown,segments:[{id:'explicit-saved-airport-segment',mode:'flight' as const,fromEndpoint:unknown.fromEndpoint!,toEndpoint:unknown.toEndpoint!,durationMinutes:99,distanceKm:null,provenance:'planning_estimate' as const,confidence:'low' as const,scheduleNeedsChecking:true,provider:'Existing explicit segment'}]},
 ]) {
  const trip={...japanTrip(),legs:[source]},before=structuredClone(trip);
  assert.equal(supportedTransportChoicesForLeg(trip,source).length,0);
  assert.deepEqual(trip,before);
 }
 const booked={...japanTrip(),legs:[unknown],brief:{...japanTrip().brief,bookings:[{id:`transport-${unknown.id}`,type:'transport' as const,title:'Existing booked transport',date:null,confirmation:null,url:null}]}};
 assert.equal(supportedTransportChoicesForLeg(booked,unknown).length,0);
});

test('actual Change transport dialog requires explicit flight selection and Use; cancel preserves unknown',async()=>{
 const {readFileSync}=await import('node:fs'),ts=await import('typescript');
 const source=readFileSync('components/easyt/trip-transport-choice-control.tsx','utf8');
 const ast=ts.createSourceFile('choice.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='TransportModeDialog');assert(declaration);
 const js=ts.transpileModule(`${declaration.getText(ast)};return TransportModeDialog;`,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const states:unknown[]=[];let cursor=0;
 const dependencies={React:{Fragment:'fragment',createElement:(type:unknown,props:any,...children:unknown[])=>({type,props:{...props,children:children.flat(Infinity)}})},
  useState:(initial:unknown)=>{const index=cursor++;if(!(index in states))states[index]=initial;return [states[index],(next:unknown)=>{states[index]=next;}];},useId:()=> 'unknown-choice',
  selectedTransportChoiceForLeg,supportedTransportChoicesForLeg,transferTimingLabel,routeEndpointForLeg,formatIsoDate:(date:string)=>date,
  modeLabels:{unknown:'Transport to confirm',flight:'Flight'},EasyTButton:'button',MorroviaContentDialog:'dialog',
  Plane:'plane',TrainFront:'train',CarFront:'car',Ship:'ship',Footprints:'walk',Route:'route',X:'close',ChevronDown:'chevron',styles:{}};
 const component=new Function(...Object.keys(dependencies),js)(...Object.values(dependencies));
 let trip=savedReturnTrip(),writes=0;const leg=trip.legs.at(-1)!,before=structuredClone(trip.legs);
 const render=()=>{cursor=0;return component({trip,leg,onChange:(identity:string)=>{writes++;trip=selectTripLegTransportChoice(trip,leg.id,identity);return true;},pending:false,language:'en'});};
 const nodes=(tree:any):any[]=>!tree||typeof tree!=='object'?[]:Array.isArray(tree)?tree.flatMap(nodes):[tree,...nodes(tree.props?.children)];
 const text=(tree:any):string=>typeof tree==='string'?tree:!tree||typeof tree!=='object'?'':Array.isArray(tree)?tree.map(text).join(''):text(tree.props?.children);
 const button=(tree:any,label:string)=>nodes(tree).find(node=>node.type==='button'&&text(node)===label);
 let tree=render();nodes(tree).find(node=>node.props?.['aria-label']==='Change transport mode').props.onClick();tree=render();
 assert.equal(writes,0);assert.equal(button(tree,'Use flight').props.disabled,true);
 let radio=nodes(tree).find(node=>node.props?.role==='radio');assert(radio);assert.equal(radio.props.tabIndex,0);assert.equal(radio.props['data-mode-initial'],'true');
 radio.props.onClick();tree=render();assert.equal(button(tree,'Use flight').props.disabled,false);
 button(tree,'Cancel').props.onClick();render();assert.equal(writes,0);assert.equal(trip.legs.at(-1)!.mode,'unknown');
 nodes(render()).find(node=>node.props?.['aria-label']==='Change transport mode').props.onClick();tree=render();
 nodes(tree).find(node=>node.props?.role==='radio').props.onClick();tree=render();button(tree,'Use flight').props.onClick();
 await Promise.resolve();assert.equal(writes,1);assert.equal(effectiveTripLeg(trip,leg).mode,'flight');assert.deepEqual(trip.legs,before);
});

test('actual canonical Paris city to explicit LHR retains a bounded flight planning total',async()=>{
 const source=canonical(),before=structuredClone(source);
 assert.equal(source.mode,'flight');assert.equal(source.durationMinutes,240);
 const result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.outcome,'resolved');assert.equal(result.leg.mode,'flight');
 assert.equal(result.leg.durationMinutes,240);assert.equal(result.leg.doorToDoorMinutes,240);
 assert.equal(transferTimingLabel(result.leg),'~4h');
 assert.equal(result.diagnostic.selectedCandidateId,'flight:airport-planning');
 assert.equal(result.diagnostic.candidates[0]?.connectionCount,null);
 assert.equal(result.diagnostic.candidates[0]?.evidence,'airport_planning_allowance');
 assert.equal(result.assessment.evidence,'insufficient','airport identity does not establish an operating service between this pair');
 assert.equal(result.leg.provenance,'planning_estimate');assert.equal(result.leg.scheduleNeedsChecking,true);
 assert.equal(result.leg.headlineMinutes,null,'the total is not a confirmed airborne time');
 assert.deepEqual(result.leg.fromEndpoint,source.fromEndpoint);assert.deepEqual(result.leg.toEndpoint,source.toEndpoint);
 assert.equal(result.leg.id,source.id);assert.equal(result.leg.fromStopId,source.fromStopId);assert.equal(result.leg.toStopId,source.toStopId);
 assert.equal(flightAirportAssumptionLabel(result.leg),'Assumed airport: Paris CDG');
 assert.deepEqual(source,before);
});

test('explicit approved airports retain flight planning in either direction',async()=>{
 for(const source of [canonical(cdg,lhr),canonical(lhr,cdg)]){
  const before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
  assert.equal(result.outcome,'resolved');assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,240);
  assert.equal(transferTimingLabel(result.leg),'~4h');assert.deepEqual(source,before);
  if(source.fromEndpoint?.canonicalPlaceId===cdg.canonicalPlaceId||source.fromEndpoint?.canonicalPlaceId===lhr.canonicalPlaceId)assert.equal(flightAirportAssumptionLabel(result.leg),null);
  const repeated=await resolveCanonicalTransferJourney(result.leg);
  assert.deepEqual(repeated.leg,result.leg,'derived flight allowance is stable on a second pass');
 }
});

test('previously unresolved generated legs stay unknown with only a conditional airport tag',async()=>{
 const source:TripLeg={...canonical(),mode:'unknown',durationMinutes:null,doorToDoorMinutes:null,headlineMinutes:null,
  provenance:'unknown',routeMetadata:{source:'multimodal-resolver'}};
 const before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.outcome,'unresolved');assert.equal(result.leg.mode,'unknown');
 assert.equal(result.leg.durationMinutes,null);assert.equal(result.leg.doorToDoorMinutes,null);
 assert.equal(transferTimingLabel(result.leg),'Timing to confirm');
 assert.match(flightAirportAssumptionLabel(result.leg)!,/^If flying, .*Paris CDG/);
 assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:airport-planning'),false);
 assert.deepEqual(source,before);
});

test('maintained and legacy city identities keep canonical city-to-city rail and one-way topology',async()=>{
 for(const from of [paris,selectedTransferPlace('Paris','France','reference:geonames:2988507','endpoint','paris')]){
  const source=canonical(from),before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
  assert.equal(result.leg.mode,'flight');assert.equal(result.leg.doorToDoorMinutes,240);assert.deepEqual(source,before);
 }
 const cityRail=canonical(paris,london),rail=await resolveCanonicalTransferJourney(cityRail);
 assert.equal(rail.leg.mode,'train');assert.equal(rail.leg.durationMinutes,270);
 const oneWay=buildCanonicalTripLegs({tripId:'one-way-control',origin:{...paris,coordinates:paris.coordinates??null},stops:[],journeyEnd:{mode:'unknown'}});
 assert.deepEqual(oneWay,[]);
});

test('nonflight, excluded flight and unverified geography do not acquire airport planning',async()=>{
 const excluded=canonical();excluded.routeMetadata.transportConstraints={excludedModes:['flight']};
 const stale=canonical();stale.fromEndpoint={...stale.fromEndpoint!,coordinates:[2.4,48.9]};
 for(const source of [excluded,stale]){
  const result=await resolveCanonicalTransferJourney(source);
  assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:airport-planning'),false);
 }
 for(const mode of ['train','road','ferry','walk','mixed'] as const){
  const source={...canonical(),mode},result=await resolveCanonicalTransferJourney(source);
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:airport-planning'),false);
 }
});

test('existing generated nonflight modes on the same CDG and LHR pair cannot acquire a flight allowance',async()=>{
 for(const mode of ['train','road'] as const){
  const source={...canonical(cdg,lhr),mode},before=structuredClone(source);
  const result=await resolveCanonicalTransferJourney(source);
  assert.notEqual(result.leg.mode,'flight',`${mode} must not become a flight because airports match`);
  assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:airport-planning'),false);
  if(mode==='train')assert.deepEqual(result.leg,before,'existing train timing remains unchanged');
  assert.deepEqual(source,before);
 }
});

test('traveller-authored own-car journey on the same CDG and LHR pair keeps its mode and timing',async()=>{
 const source:TripLeg={...canonical(cdg,lhr),mode:'road',durationMinutes:390,doorToDoorMinutes:390,
  provider:'Self drive estimate.',routeMetadata:{source:'traveller-authored',transportConstraints:{preferredModes:['road']}}};
 const before=structuredClone(source),result=await resolveCanonicalTransferJourney(source);
 assert.equal(result.outcome,'preserved');assert.deepEqual(result.leg,before);assert.deepEqual(source,before);
 assert.equal(result.diagnostic.candidates.some(item=>item.id==='flight:airport-planning'),false);
});

test('a nearby crossborder city pair without approved airports remains unresolved',async()=>{
 const sanMarino=selectedTransferPlace('San Marino','San Marino','reference:geonames:3168070','endpoint');
 const rome=selectedTransferPlace('Rome','Italy','reference:geonames:3169070','endpoint');
 const result=await resolveCanonicalTransferJourney(canonical(sanMarino,rome),{provider:{provider:'openrouteservice',async route(input){
  return {mode:'road',distanceKm:414,durationMinutes:255,confidence:'medium',provenance:'routed',provider:'openrouteservice',
    providerCheckedAt:'2026-10-21T00:00:00Z',profile:'driving-car',routeGeometry:[input.origin.coordinates,input.destination.coordinates],attribution:'Offline fixture'};
 }}});
 assert.equal(result.leg.mode,'unknown');assert.equal(result.leg.durationMinutes,null);
 assert.equal(result.leg.roadEstimate?.durationMinutes,255);assert.equal(result.leg.roadEstimate?.distanceKm,414);
 assert.equal(transferTimingLabel(result.leg),'Timing to confirm');
});

test('provider, schedule, traveller-confirmed and imported flight facts stay unchanged',async()=>{
 for(const override of [{provenance:'provider' as const},{provenance:'canonical_schedule' as const},
  {routeMetadata:{confirmed:true}},{routeMetadata:{userConfirmed:true}},{routeMetadata:{source:'imported-booking'}}]){
  const source={...canonical(),...override,durationMinutes:333,doorToDoorMinutes:333},before=structuredClone(source);
  const result=await resolveCanonicalTransferJourney(source);
  assert.deepEqual(result.leg,before);assert.deepEqual(source,before);
 }
});

test('actual Transport summary presents a known planning total as Estimated',async()=>{
 const {readFileSync}=await import('node:fs'),ts=await import('typescript');
 const source=readFileSync('components/easyt/trip-transport-workspace.tsx','utf8');
 const ast=ts.createSourceFile('transport.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let summary:import('typescript').JsxElement|undefined;
 function visit(node:import('typescript').Node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='p'
   &&node.openingElement.attributes.getText(ast).includes('styles.mode'))summary=node;
  ts.forEachChild(node,visit);
 }visit(ast);assert(summary);
 const body=ts.transpileModule(`return (${summary.getText(ast)});`,{compilerOptions:{target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
 const render=new Function('React','leg','durationMinutes','transferJourneyModeLabel','transferTimingLabel','language','styles',body);
 const leg=(await resolveCanonicalTransferJourney(canonical())).leg;
 const output=render({createElement:(_type:unknown,_props:unknown,...children:unknown[])=>children.flat(Infinity).join('')},leg,leg.doorToDoorMinutes,transferJourneyModeLabel,transferTimingLabel,'en',{mode:'mode'});
 assert.match(output,/Estimated.*~4h.*total/);assert.doesNotMatch(output,/Timing to confirm/);
});
