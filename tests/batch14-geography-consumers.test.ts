import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {build} from 'esbuild';
import {canonicalRouteFixture} from './fixtures/batch14-route-documents.ts';
import {requireReadableTripDocument} from '../lib/easyt/trip-document.ts';
import {acceptedGeographicPlace,guardTripRoutingGeometry,stopGeographicPlace,validatedPlaceCoordinates,validatedActivityCoordinates} from '../lib/easyt/geographic-binding.ts';
import {deriveTripDateFacts,orderedTripPlanItems,incomingLegForPlanItem} from '../lib/easyt/trip-facts.ts';
import {parseIsoDate,formatIsoDate} from '../lib/easyt/trip-lifecycle.ts';
import {tripDisplayTitle} from '../lib/easyt/trip-display.ts';
import {originPlaceFromBrief} from '../lib/easyt/journey-endpoints.ts';
import {mapRouteLegsFromTrip} from '../lib/easyt/map-spatial-context.ts';
import type {CanonicalEasyTTrip} from '../lib/easyt/trip.ts';

const require=createRequire(import.meta.url),ts=require('typescript');
const source=readFileSync(new URL('../components/journey-map-planner-workspace.tsx',import.meta.url),'utf8');
const compile=(code:string,scope:any)=>new Function('scope',`with(scope){${ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText}}`)(scope);
const modeAt=source.indexOf('function journeyTransportMode(');
const mode=source.slice(modeAt,source.indexOf('\n}',modeAt)+2);
const customDate=source.slice(source.indexOf('function customDate('),source.indexOf('const planningBases'));
const make=source.slice(source.indexOf('export function makeEasyTJourney('),source.indexOf('export type JourneyMapPlannerWorkspaceProps')).replace('export function','function');
const placesAt=source.indexOf('    const places = (customTrip ?');
const effect=source.slice(source.lastIndexOf('  useEffect(() => {',placesAt),source.indexOf('  }, [customBrief, customTrip]);',placesAt)+'  }, [customBrief, customTrip]);'.length);
const memo=source.slice(source.indexOf('  const journey = useMemo('),source.indexOf('  const isCustomJourney',source.indexOf('  const journey = useMemo(')));

function mapHarness(trip:CanonicalEasyTTrip|null,cache:Record<string,[number,number]>={}){
 let requests=0,cleanup:(()=>void)|undefined;
 const scope:any={originPlaceFromBrief,guardTripRoutingGeometry,stopGeographicPlace,validatedPlaceCoordinates,validatedActivityCoordinates,deriveTripDateFacts,orderedTripPlanItems,incomingLegForPlanItem,parseIsoDate,formatIsoDate,tripDisplayTitle,
  customTrip:trip,customBrief:{},resolvedCoordinates:cache,placeMedia:{},useMemo:(fn:any)=>fn(),useEffect:(fn:any)=>{cleanup=fn()},
  fetch:async()=>{requests++;return {json:async()=>({result:{coordinates:[-76.285,-12.2]}})}},
  setResolvedCoordinates:(fn:any)=>{scope.resolvedCoordinates=fn(scope.resolvedCoordinates)},
  // Editorial control supplies legacy display data; effect and overlay remain production code.
  makeCustomJourney:()=>({stops:[{id:'custom-day-1',city:'Editorial city',country:'Peru',coordinates:null}],legs:[],calendar:[]})};
 scope.makeEasyTJourney=compile(`${mode}\n${customDate}\n${make}\nreturn makeEasyTJourney;`,scope);
 return {scope,requests:()=>requests,start:()=>compile(effect,scope),stop:()=>cleanup?.(),flush:()=>new Promise<void>(resolve=>setImmediate(resolve)),journey:()=>compile(`${memo}\nreturn journey;`,scope)};
}

function saved(){
 const trip=requireReadableTripDocument(canonicalRouteFixture()),stop=trip.stops[0]!;
 stop.name='Lima';stop.country='Peru';stop.canonicalPlaceId='lima';stop.providerId='nominatim:node:4289361265';stop.longitude=-77.0305912;stop.latitude=-12.0459808;
 delete stop.geographicBinding;
 const day=trip.planItems.find(item=>item.stopId===stop.id)!;
 day.type='open';day.latitude=null;day.longitude=null;
 return {trip,stop,dayId:`${trip.id}-day-${day.dayNumber}`};
}

test('actual full-map effect cannot geocode an unverified canonical base or overlay a coordinate-only response',async()=>{
 const {trip,dayId}=saved(),before=JSON.stringify(trip),h=mapHarness(trip);
 assert.equal(h.journey().stops.find((s:any)=>s.id===dayId).coordinates,null);
 h.start();await h.flush();assert.equal(h.requests(),0,'canonical recovery requires accepted entity evidence');
 assert.equal(h.journey().stops.find((s:any)=>s.id===dayId).coordinates,null);
 assert.equal(JSON.stringify(trip),before);h.stop();
});

test('actual canonical map memo ignores old fallback cache before and after accepted verification',()=>{
 const {trip,stop,dayId}=saved(),h=mapHarness(trip,{[dayId]:[-76.285,-12.2]});
 assert.equal(h.journey().stops.find((s:any)=>s.id===dayId).coordinates,null);
 const accepted=acceptedGeographicPlace(stopGeographicPlace(stop),{name:'Lima',country:'Peru',providerId:stop.providerId,coordinates:[-77.025,-12.04],placeType:'city',routability:'direct_destination'});assert.ok(accepted);
 const corrected=structuredClone(trip);Object.assign(corrected.stops[0],{longitude:accepted.coordinates![0],latitude:accepted.coordinates![1],geographicBinding:accepted.geographicBinding});h.scope.customTrip=corrected;
 assert.deepEqual(h.journey().stops.find((s:any)=>s.id===dayId).coordinates,[-77.025,-12.04]);
 assert.deepEqual(h.scope.resolvedCoordinates[dayId],[-76.285,-12.2],'cache remains legacy-owned but cannot override canonical geometry');
});

test('canonical full-map keeps independent activity geometry and saved authored pins',async()=>{
 const {trip,stop}=saved(),day=trip.planItems.find(item=>item.stopId===stop.id)!;
 day.type='activity';day.longitude=-77.04;day.latitude=-12.06;
 trip.brief.mapPins=[{id:'authored-point',title:'My pin',dayNumber:day.dayNumber,type:'activity',longitude:-77.05,latitude:-12.07} as any];
 const before=JSON.stringify(trip),h=mapHarness(trip);h.start();await h.flush();
 assert.deepEqual(h.journey().stops.find((s:any)=>s.id===`${trip.id}-day-${day.dayNumber}`).coordinates,[-77.04,-12.06]);
 assert.equal(h.requests(),0);assert.equal(JSON.stringify(trip),before);h.stop();
});

test('legacy editorial effect and memo retain their coordinate fallback',async()=>{
 const h=mapHarness(null);h.start();await h.flush();assert.equal(h.requests(),1);
 assert.deepEqual(h.journey().stops[0].coordinates,[-76.285,-12.2]);h.stop();
});

async function actualWorkspace(){
 const bundle=await build({stdin:{contents:"export {TripBuilderRouteWorkspace} from './app/journey/new/trip-builder-route-workspace';",resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,platform:'node',format:'cjs',jsx:'automatic',external:['react','react-dom/server','react/jsx-runtime'],loader:{'.css':'empty','.module.css':'empty'},logLevel:'silent',plugins:[{name:'unused-server-map-boundary',setup(b){b.onResolve({filter:/journey-planner-map$/},()=>({path:'map',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:'export const JourneyPlannerMap=()=>null'}));}}]});
 const module={exports:{} as any};new Function('require','module','exports',bundle.outputFiles[0].text)(require,module,module.exports);return module.exports.TripBuilderRouteWorkspace;
}
function renderWorkspace(Component:any,trip:CanonicalEasyTTrip){
 const noop=()=>{};
 return renderToStaticMarkup(React.createElement(Component,{canonicalTrip:trip,previewStopIds:null,selectedStopId:null,lockedStopIds:[],fixedOrder:false,routeCheckProposalStopIds:null,nightStatus:{complete:true,total:9,language:'en'},onSelectStop:noop,onPreviewOrder:noop,onCommitOrder:()=>false,onEditNights:noop,onRemoveStop:noop,onTransportChoiceChange:noop}));
}
test('actual Builder table and map suppress cached road data on incident unverified legs but retain a verified sibling',async()=>{
 const {trip,stop}=saved();
 for(const sibling of trip.stops.slice(1)){
  const place=acceptedGeographicPlace(stopGeographicPlace(sibling),{...stopGeographicPlace(sibling),providerId:`synthetic:${sibling.id}`,placeType:'city',routability:'direct_destination'});assert.ok(place);
  sibling.providerId=place.providerId;sibling.geographicBinding=place.geographicBinding;
 }
 const incident=trip.legs.find(l=>l.fromStopId===stop.id||l.toStopId===stop.id)!,sibling=trip.legs.find(l=>l.fromStopId===trip.stops[1]!.id&&l.toStopId===trip.stops[2]!.id)!;assert.ok(sibling);
 const reference={provider:'openrouteservice' as const,profile:'driving-car' as const,provenance:'routed' as const,checkedAt:'2026-10-08',distanceKm:1234,durationMinutes:321,confidence:'medium' as const,routeGeometry:[[10,10],[11,11]] as Array<[number,number]>,attribution:'Synthetic cached route',warnings:[]};
 incident.mode='unknown';incident.roadEstimate=reference;incident.routeGeometry=reference.routeGeometry;
 sibling.mode='unknown';sibling.roadEstimate={...reference,distanceKm:42,durationMinutes:60};
 const before=JSON.stringify(trip),Component=await actualWorkspace();
 const html=renderWorkspace(Component,trip),derived=guardTripRoutingGeometry(trip),masked=derived.legs.find(l=>l.id===incident.id)!;
 assert.doesNotMatch(html,/Road estimate only · 1,234 km · about 5h 21m driving/);
 assert.match(html,/Road estimate only · 42 km · about 1h driving/);
 assert.equal(masked.roadEstimate,undefined);assert.equal(masked.routeGeometry,undefined);
 const mapLegs=mapRouteLegsFromTrip(derived);assert.ok(mapLegs.every(l=>l.fromStopId!==stop.id&&l.toStopId!==stop.id));
 assert.ok(mapLegs.some(l=>l.id===sibling.id&&l.roadEstimate?.distanceKm===42),'verified sibling still projects to the map');
 assert.deepEqual(derived.legs.find(l=>l.id===sibling.id),sibling);
 assert.equal(JSON.stringify(trip),before,'derived masks must never modify the saved owner');
});
