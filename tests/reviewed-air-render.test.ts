import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {dirname} from 'node:path';
import {itineraryCalendarDays} from '../lib/easyt/itinerary-calendar.ts';
import {build} from 'esbuild';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {selectedTransferPlace} from './fixtures/accepted-transfer-place.ts';
import {buildCanonicalTripLegs} from '../lib/easyt/trip-legs.ts';
import {resolveCanonicalTransferJourney} from '../lib/easyt/multimodal-transfer-resolution.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {selectTripLegTransportChoice,supportedTransportChoicesForLeg} from '../lib/easyt/transport-mode-choice.ts';
import {saveTripRecoveryToStorage,loadTripRecoveryFromStorage,type EasyTBrowserStorage} from '../lib/easyt/storage.ts';
import type {EasyTTrip} from '../lib/easyt/trip.ts';

const require=createRequire(import.meta.url);
const from=selectedTransferPlace('Bogotá','Colombia','reference:geonames:3688689','endpoint','bogota');
const to=selectedTransferPlace('Cartagena','Colombia','reference:geonames:3687238','stop','reference:geonames:3687238');
const template=JSON.parse(readFileSync(new URL('./fixtures/main-staging-africa-control.json',import.meta.url),'utf8'));
const stop={...template.stops[0],id:'disposable-cartagena',name:to.name,country:to.country,canonicalPlaceId:to.canonicalPlaceId,providerId:to.providerId,geographicBinding:to.geographicBinding,latitude:to.coordinates![1],longitude:to.coordinates![0],arrivalDate:'2027-05-01',departureDate:'2027-05-04',nights:3,order:0};
const initial=buildCanonicalTripLegs({tripId:'disposable-air-render',origin:{...from,coordinates:from.coordinates!},stops:[stop]})[0]!;
initial.routeMetadata.source='morrovia-planner';
const result=await resolveCanonicalTransferJourney(initial,{provider:{provider:'openrouteservice',route:async request=>({mode:'road',distanceKm:730,durationMinutes:825,confidence:'medium',provenance:'routed',provider:'openrouteservice',providerCheckedAt:'2026-10-17T00:00:00Z',profile:'driving-car',routeGeometry:[request.origin.coordinates,request.destination.coordinates],attribution:'Synthetic offline road boundary'})}});
assert.equal(result.leg.mode,'flight');
const trip=requireReadableTripDocument({...template,schemaVersion:1,id:'disposable-air-render',ownerId:null,title:'Disposable air rendering',startDate:'2027-05-01',endDate:'2027-05-04',brief:{origin:from.name,originCountry:from.country,originCanonicalPlaceId:from.canonicalPlaceId,originProviderId:from.providerId,originCoordinates:from.coordinates,mustDo:'',pace:'slow',hotelChanges:'few',budgetBand:'mid',selectedPlaces:{}},stops:[stop],legs:[result.leg],planItems:[],recommendations:[]});
trip.planItems=[{...template.planItems[0],id:'disposable-day',stopId:stop.id,dayNumber:1,date:'2027-05-01',location:stop.name}];
trip.brief.intent!.route!.origin=structuredClone(from);

const bundle=await build({stdin:{contents:`export {TripBuilderRouteWorkspace as Builder} from './app/journey/new/trip-builder-route-workspace';export {default as Overview} from './components/easyt/trip-overview-workspace';export {default as Map} from './components/easyt/trip-map-workspace';export {default as Itinerary} from './components/easyt/trip-itinerary-workspace';export {default as Transport} from './components/easyt/trip-transport-workspace';export {default as Choice} from './components/easyt/trip-transport-choice-control';export {CalendarItemButton as CalendarItem,itineraryCopy as calendarCopy} from './components/easyt/trip-itinerary-workspace';`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',packages:'external',plugins:[{name:'render-boundaries',setup(b){
 b.onLoad({filter:/trip-itinerary-workspace\.tsx$/},({path})=>({resolveDir:dirname(path),loader:'tsx',contents:readFileSync(path,'utf8')+'\nexport {CalendarItemButton,itineraryCopy};'}));
 b.onResolve({filter:/\.css$/},()=>({path:'css',namespace:'fixture'}));
 b.onResolve({filter:/^next\/(link|image|navigation)$/},({path})=>({path,namespace:'fixture'}));
 b.onResolve({filter:/auth-client$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/trip-shell-client$/},()=>({path:'shell',namespace:'fixture'}));
 b.onResolve({filter:/journey-planner-map$/},()=>({path:'map',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},({path})=>({resolveDir:process.cwd(),contents:path==='css'?'export default {};':path==='auth'?`export const authClient={useSession:()=>({data:null,isPending:false,error:null})};`:path==='shell'?`export const useTripShellMutation=()=>({trip:globalThis.__airRenderTrip,isPending:()=>false,mutateTrip:()=>{throw Error('Render must not mutate')}});export const useOptionalTripShellMutation=useTripShellMutation;` :path==='map'?'export const JourneyPlannerMap=()=>null;export const DeferredJourneyPlannerMap=()=>null;':path.endsWith('navigation')?`export const useSearchParams=()=>new URLSearchParams(globalThis.__airRenderQuery??'');export const usePathname=()=>'/journey/disposable-air-render/map';export const useRouter=()=>({push(){throw Error('No navigation')},replace(){throw Error('No navigation')}});export const useSelectedLayoutSegment=()=>null;`:`import {createElement} from 'react';export default function Framework({children,fill,priority,unoptimized,...props}){return createElement('${path.endsWith('link')?'a':'img'}',props,children);}`}));
}}]});
const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);
const noop=()=>{};
function render(name:string,value:EasyTTrip,extra:Record<string,unknown>={}) {
 (globalThis as any).__airRenderTrip=value;
 const calendar=name==='CalendarItem'?itineraryCalendarDays(value)[0]:undefined;
 const calendarTransfer=calendar?.items.find(item=>item.kind==='transfer');
 const props=name==='CalendarItem'?{item:calendarTransfer,day:calendar,copy:module.exports.calendarCopy('en'),language:'en',draggable:false,dragging:false,onDragStart:noop,onDragEnd:noop,onSelect:noop}:name==='Builder'?{canonicalTrip:value,previewStopIds:null,selectedStopId:null,lockedStopIds:[],fixedOrder:false,routeCheckProposalStopIds:null,nightStatus:{complete:true,total:3,allocated:3,language:'en'},onSelectStop:noop,onPreviewOrder:noop,onCommitOrder:()=>false,onEditNights:noop,onRemoveStop:noop,onTransportChoiceChange:noop}:name==='Overview'?{trip:value,initialPrepActions:[],initialPrepReadinessCards:[],initialPrepProviderStatus:'available'}:name==='Choice'?{trip:value,leg:value.legs[0],onChange:noop,showUnavailable:true}:{trip:value};
 return renderToStaticMarkup(createElement(module.exports[name],{...props,...extra}));
}
for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem'])test(`${surface} renders reviewed timing as an approximate total, not airborne duration`,()=>{
 const html=render(surface,trip,surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:trip.legs[0]!.id}}:{});
 assert.match(html,/~4h/);
 assert.doesNotMatch(html,/(?<!~)4h by air/);
 if(surface==='Map')assert.match(html,/Road estimate driving time<\/dt><dd>~13h 45m/);
 if(['Builder','Overview'].includes(surface))assert.match(html,/~4h total/);
});
test('Map keeps unknown airborne time when no separate road reference exists',()=>{
 const value=structuredClone(trip);delete value.legs[0]!.roadEstimate;
 assert.match(render('Map',value,{storyState:{mapMode:'detail',selectedRouteLegId:value.legs[0]!.id}}),/Flight time<\/dt><dd>Not available/);
});
test('Map overview and visible day transfer retain approximate totals',()=>{
 for(const mapMode of ['overview','detail']){
  const html=render('Map',trip,{storyState:{mapMode,mobileDrawerOpen:true}});
  assert.match(html,mapMode==='overview'?/Travel time<\/dt><dd>~4h/:/<small>~4h total<\/small>/);
 }
});
test('known ranges and unknown totals remain distinct on every timing surface',()=>{
 const ranged=structuredClone(trip),unknown=structuredClone(trip);
 const impact=ranged.legs[0]!.routeMetadata.transferImpact as any;
 impact.doorToDoor.value.rangeMinutes={minimum:210,maximum:270};impact.doorToDoor.value.precision='estimated-range';
 const unknownLeg=unknown.legs[0]!;unknownLeg.durationMinutes=null;unknownLeg.doorToDoorMinutes=null;unknownLeg.routeMetadata.transferImpact={...(unknownLeg.routeMetadata.transferImpact as any),doorToDoor:{status:'unknown',value:null,confidence:'unknown',sources:[],reason:'No timing'}};
 for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem']){
  const extra=surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:trip.legs[0]!.id}}:{};
  const html=render(surface,ranged,extra);assert.match(html,/~3h 30m–4h 30m/,surface);
  const unresolved=render(surface,unknown,extra);assert.doesNotMatch(unresolved,/~4h/,surface);
 }
});

function reopen(value:EasyTTrip):EasyTTrip {
 const entries=new Map<string,string>();
 const storage:EasyTBrowserStorage={get length(){return entries.size},key:index=>[...entries.keys()][index]??null,getItem:key=>entries.get(key)??null,setItem:(key,value)=>{entries.set(key,value)},removeItem:key=>{entries.delete(key)}};
 assert.equal(saveTripRecoveryToStorage(storage,value,{writeId:'disposable-render-readback'}).stored,true);
 const saved=loadTripRecoveryFromStorage(storage,value.id,null);assert.ok(saved);
 return requireReadableTripDocument(JSON.parse(JSON.stringify(saved.trip)));
}
test('explicit road and air choices retain honest total labels after real recovery readback across six surfaces',()=>{
 const road=supportedTransportChoicesForLeg(trip,trip.legs[0]!).find(option=>option.mode==='road');assert.ok(road);
 const roadTrip=reopen(selectTripLegTransportChoice(trip,trip.legs[0]!.id,road.identity));
 for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem']){
  const extra=surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:trip.legs[0]!.id}}:{};
  const html=render(surface,roadTrip,extra);assert.match(html,/~13h 45m/,surface);
 }
 const air=supportedTransportChoicesForLeg(roadTrip,roadTrip.legs[0]!).find(option=>option.evidence==='reviewed_air_journey');assert.ok(air);
 const airTrip=reopen(selectTripLegTransportChoice(roadTrip,roadTrip.legs[0]!.id,air.identity));
 for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem']){
  const extra=surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:trip.legs[0]!.id}}:{};
  assert.match(render(surface,airTrip,extra),/~4h/,surface);
 }
});
test('accepted two-stop Quito–Bogotá–Cartagena journey survives model, recovery and all six rendered surfaces without authored changes',async()=>{
 const origin=selectedTransferPlace('Quito','Ecuador','reference:geonames:3652462','endpoint','quito');
 const bogota=selectedTransferPlace('Bogotá','Colombia','reference:geonames:3688689','stop','bogota');
 const first={...stop,id:'disposable-bogota',name:bogota.name,country:bogota.country!,canonicalPlaceId:bogota.canonicalPlaceId,providerId:bogota.providerId,geographicBinding:bogota.geographicBinding,latitude:bogota.coordinates![1],longitude:bogota.coordinates![0],departureDate:'2027-05-04',order:0};
 const second={...stop,order:1,arrivalDate:'2027-05-04',departureDate:'2027-05-07'};
 const value=structuredClone(trip);value.stops=[first,second];value.endDate='2027-05-07';
 value.legs=await Promise.all(buildCanonicalTripLegs({tripId:value.id,origin:{...origin,coordinates:origin.coordinates!},stops:value.stops}).map(async leg=>(await resolveCanonicalTransferJourney({...leg,routeMetadata:{...leg.routeMetadata,source:'morrovia-planner'}},{provider:{provider:'openrouteservice',route:async()=>{throw Error('Offline fixture')}}})).leg));
 const route=value.brief.intent!.route!;route.origin=origin;route.orderedStopIds=value.stops.map(stop=>stop.id);
 const destination=route.destinations[0]!;route.destinations=[{...destination,id:'disposable-bogota-intent',sourceText:bogota.name,selectedPlace:bogota,stopIds:[first.id]},{...destination,id:'disposable-cartagena-intent',stopIds:[second.id]}];
 if(route.explicitIntentIds)route.explicitIntentIds=route.destinations.map(destination=>destination.id);
 value.planItems=[{...value.planItems[0]!,stopId:first.id,notes:['Keep my museum visit']},{...value.planItems[0]!,id:'disposable-day-two',stopId:second.id,date:'2027-05-04',dayNumber:4,notes:['Keep my beach walk']}];
 assert.deepEqual(value.legs.map(leg=>leg.mode),['flight','flight']);
 const restored=reopen(value),before=JSON.stringify(restored);
 assert.deepEqual(restored.stops.map(stop=>[stop.id,stop.nights]),value.stops.map(stop=>[stop.id,stop.nights]));
 assert.deepEqual(restored.planItems.map(day=>day.notes),value.planItems.map(day=>day.notes));
 for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem']){
  const extra=surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:restored.legs[0]!.id}}:{};
  assert.match(render(surface,restored,extra),/~4h/,surface);
 }
 assert.equal(JSON.stringify(restored),before);
});

test('Map aggregate preserves an unknown total and a single known range',()=>{
 const ranged=structuredClone(trip),unknown=structuredClone(trip);
 const impact=ranged.legs[0]!.routeMetadata.transferImpact as any;impact.doorToDoor.value.rangeMinutes={minimum:210,maximum:270};impact.doorToDoor.value.precision='estimated-range';
 (unknown.legs[0]!.routeMetadata.transferImpact as any).doorToDoor={status:'unknown',value:null,confidence:'unknown',sources:[]};
 assert.match(render('Map',ranged,{storyState:{mapMode:'overview'}}),/Travel time<\/dt><dd>~3h 30m–4h 30m/);
 assert.match(render('Map',unknown,{storyState:{mapMode:'overview'}}),/Travel time<\/dt><dd>Timing to confirm/);
});
test('malformed optional raw leg timing cannot crash any rendered consumer',()=>{
 const value=structuredClone(trip);value.legs[0]!.routeMetadata.transferImpact={version:1,mode:'flight',headline:{status:'known'},doorToDoor:{status:'known'},components:[]};
 for(const surface of ['Builder','Overview','Map','Itinerary','Transport','Choice','CalendarItem'])assert.doesNotThrow(()=>render(surface,value,surface==='Map'?{storyState:{mapMode:'detail',selectedRouteLegId:value.legs[0]!.id}}:{}),surface);
});
