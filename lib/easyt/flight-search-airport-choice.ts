import identities from '../../data/place-reference/scheduled-airport-identities.json' with {type:'json'};
import {acceptedGeographicPlace,transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {REFERENCE_SNAPSHOT_ID,referenceGeographicAcceptanceMatches,referenceRecordKey} from './place-reference.ts';
import {countryCodeFor} from './country-registry.ts';
import {flightPlanningAirports} from './flight-airport-assumptions.ts';
import {routeEndpointForLeg} from './trip-legs.ts';
import {sameJourneyPlace} from './journey-endpoints.ts';
import {effectiveTripLeg} from './transport-mode-choice.ts';
import {transportBookingForLeg,travellerTransportBookingMismatchForLeg} from './transport-booking.ts';
import type {CanonicalRouteEndpoint,EasyTTrip,TripLeg} from './trip.ts';

const trustedAirports=new Map((identities.airports as [string,string,string,number,number][]).map(row=>[row[0],row]));
export type FlightSearchAirport = {endpoint:CanonicalRouteEndpoint;referenceSnapshotId:string;scheduledService:true};
export type FlightSearchAirportPreference = {version:1;basis:string;from:FlightSearchAirport|null;to:FlightSearchAirport|null};
function validAirport(value:unknown):value is FlightSearchAirport {
 if(!value||typeof value!=='object')return false;
 const a=value as FlightSearchAirport,e=a.endpoint;
 const known=typeof e?.canonicalPlaceId==='string'?trustedAirports.get(e.canonicalPlaceId.replace(/^reference:ourairports:/,'')):undefined;
 return identities.snapshotId===REFERENCE_SNAPSHOT_ID&&!!known&&e.name===known[1]&&countryCodeFor(e.country)===known[2]
  &&Array.isArray(e.coordinates)&&e.coordinates[0]===known[3]&&e.coordinates[1]===known[4]&& !!e&&typeof e==='object'&&typeof e.name==='string'&&typeof e.country==='string'
  &&typeof e.providerId==='string'&&typeof e.id==='string'&&typeof e.canonicalPlaceId==='string'&&e.canonicalPlaceId.startsWith('reference:ourairports:')
  &&a.scheduledService===true&&a.referenceSnapshotId===REFERENCE_SNAPSHOT_ID
  &&transferEndpointGeographicallyReady(e)
  &&referenceGeographicAcceptanceMatches({...e,placeType:'transport_gateway',coordinates:e.coordinates??undefined,referenceSnapshotId:a.referenceSnapshotId});
}
/** Accept only an explicit current pinned scheduled-airport search result. No service route is inferred. */
export function airportChoiceFromSuggestion(value:unknown):FlightSearchAirport|null {
 if(!value||typeof value!=='object')return null;
 const s=value as {name:string;country:string;canonicalPlaceId:string;coordinates:[number,number];placeType:string;scheduledService:boolean;referenceSnapshotId:string;provenance?:{id:string}[]};
 if(s.placeType!=='transport_gateway'||s.scheduledService!==true||typeof s.canonicalPlaceId!=='string'||!s.canonicalPlaceId.startsWith('reference:ourairports:')||typeof s.name!=='string'||typeof s.country!=='string'||!Array.isArray(s.coordinates))return null;
 const providerId=s.provenance?.[0]?.id;
 const candidate={name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId,coordinates:s.coordinates,providerId,placeType:'transport_gateway',routability:'direct_destination',referenceSnapshotId:s.referenceSnapshotId};
 if(!referenceGeographicAcceptanceMatches(candidate))return null;
 const place=acceptedGeographicPlace({name:s.name,country:s.country,canonicalPlaceId:s.canonicalPlaceId},candidate,'endpoint');
 if(!place)return null;
 const choice:FlightSearchAirport={endpoint:{...place,id:`flight-search:${s.canonicalPlaceId}`,kind:'gateway',coordinates:place.coordinates!},referenceSnapshotId:s.referenceSnapshotId,scheduledService:true};
 return validAirport(choice)?choice:null;
}
// Reviewed metro associations; a municipality is not evidence that it serves these cities.
const major = {
 'reference:geonames:1850147': { country:'JP', city:'Tokyo', airports:[['5627','HND','Haneda'],['5531','NRT','Narita']] },
 'reference:geonames:1816670': { country:'CN', city:'Beijing', airports:[['27188','PEK','Beijing Capital'],['330820','PKX','Beijing Daxing']] },
} as const;
export function majorAirportsForCity(endpoint: Pick<CanonicalRouteEndpoint,'canonicalPlaceId'|'country'|'name'>) {
 const entry=major[endpoint.canonicalPlaceId as keyof typeof major];
 if(!entry||entry.country!==countryCodeFor(endpoint.country)||entry.city.toLowerCase()!==endpoint.name.trim().toLowerCase())return [];
 return entry.airports.flatMap(([id,code,label])=>{
  const row=trustedAirports.get(id);if(!row||row[2]!==entry.country)return [];
  const [,name,country,x,y]=row,coordinates:[number,number]=[x,y];
  const placeType='transport_gateway',providerId=referenceRecordKey({source:'ourairports',sourceId:id,placeType,countryCode:country,coordinates},REFERENCE_SNAPSHOT_ID);
  const choice=airportChoiceFromSuggestion({canonicalPlaceId:'reference:ourairports:'+id,name,country,coordinates,placeType,scheduledService:true,referenceSnapshotId:REFERENCE_SNAPSHOT_ID,provenance:[{id:providerId}]});
  return choice?[{code,label,choice}]:[];
 });
}
function pinnedAirport(endpoint:CanonicalRouteEndpoint) { return endpoint.canonicalPlaceId?.startsWith("reference:ourairports:")||endpoint.geographicBinding?.placeType==="transport_gateway"; }
function searchableEndpoint(endpoint:CanonicalRouteEndpoint) {
 return endpoint.canonicalPlaceId?.startsWith('reference:ourairports:') || transferEndpointGeographicallyReady(endpoint);
}
function validSearchPair(a:CanonicalRouteEndpoint,b:CanonicalRouteEndpoint) {
 return searchableEndpoint(a)&&searchableEndpoint(b)&&!sameJourneyPlace({...a,coordinates:a.coordinates??undefined},{...b,coordinates:b.coordinates??undefined});
}
export function flightSearchAirportBasis(trip:EasyTTrip,leg:TripLeg):string|null {
 const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
 if(!from||!to)return null;
 const key=(e:CanonicalRouteEndpoint)=>[e.id,e.name,e.country,e.canonicalPlaceId,e.providerId,e.coordinates,e.geographicBinding?.inputKey];
 return JSON.stringify([leg.id,key(from),key(to)]);
}
export function hasExplicitSavedFlightAirports(leg:TripLeg):boolean {
 return Array.isArray(leg.segments)&&leg.segments.some(s=>s?.mode==='flight'&&[s.fromEndpoint,s.toEndpoint].some(e=>e?.kind==='gateway'||e?.geographicBinding?.placeType==='transport_gateway'||(typeof e?.canonicalPlaceId==='string'&&e.canonicalPlaceId.startsWith('reference:ourairports:'))));
}
function localFlightSearchAirportPlan(trip:EasyTTrip,leg:TripLeg,returnDefault:FlightSearchAirport|null=null) {
 const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
 if(!from||!to)return null;
 const baseline=flightPlanningAirports({...leg,fromEndpoint:from,toEndpoint:to});
 if(!baseline)return null;
 const stored=trip.brief.flightSearchAirportsByLeg?.[leg.id],basis=flightSearchAirportBasis(trip,leg);
 let current=!hasExplicitSavedFlightAirports(leg)&&stored&&stored.version===1&&stored.basis===basis
  &&(stored.from===null||validAirport(stored.from))&&(stored.to===null||validAirport(stored.to))
  &&(!stored.from||!pinnedAirport(from))&&(!stored.to||!pinnedAirport(to))
  &&(!stored.from||countryCodeFor(stored.from.endpoint.country)===countryCodeFor(from.country))
  &&(!stored.to||countryCodeFor(stored.to.endpoint.country)===countryCodeFor(to.country))?stored:null;
 if(current&&(current.from||current.to)){
  const a=current.from?.endpoint??baseline.from.endpoint,b=current.to?.endpoint??returnDefault?.endpoint??baseline.to.endpoint;
  if(!validSearchPair(a,b))current=null;
 }
 const inherited=returnDefault&&!current?.to&&(!stored||current)?returnDefault:null;
 const fromEndpoint=current?.from?.endpoint??baseline.from.endpoint,toEndpoint=current?.to?.endpoint??inherited?.endpoint??baseline.to.endpoint;
 return {from:{...baseline.from,...(current?.from?{endpoint:current.from.endpoint,assumed:false}:{}),selected:!!current?.from,inherited:false},
  to:{...baseline.to,...(current?.to?{endpoint:current.to.endpoint,assumed:false}:inherited?{endpoint:inherited.endpoint,assumed:false}:{}),selected:!!current?.to,inherited:!!inherited},
  sameAirport:!!fromEndpoint.canonicalPlaceId&&fromEndpoint.canonicalPlaceId===toEndpoint.canonicalPlaceId,preference:current,stale:!!stored&&!current,basis};
}
/** Derived return default only: no choice is copied into the saved trip. */
function originalOutboundSearchAirport(trip:EasyTTrip,leg:TripLeg):FlightSearchAirport|null {
 if(trip.brief.intent?.route?.journeyEnd.mode!=='same_as_start'||leg.mode!=='flight'
  ||trip.legs.at(-1)?.id!==leg.id||hasExplicitSavedFlightAirports(leg))return null;
 const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to'),first=trip.legs[0];
 if(!from||!to||pinnedAirport(to)||to.kind!=='end'||!first||first.id===leg.id||!transferEndpointGeographicallyReady(to)
  ||transportBookingForLeg(trip,leg,from,to)||travellerTransportBookingMismatchForLeg(trip,leg))return null;
 if(!validAirport(trip.brief.flightSearchAirportsByLeg?.[first.id]?.from))return null;
 const outbound=effectiveTripLeg(trip,first),origin=routeEndpointForLeg(trip,outbound,'from');
 if(outbound.segments!==undefined&&(!Array.isArray(outbound.segments)||outbound.segments.some(s=>!s||!s.fromEndpoint||!s.toEndpoint)))return null;
 if(outbound.mode!=='flight'||!origin||!['origin','stop'].includes(origin.kind)||!transferEndpointGeographicallyReady(origin)
  ||!sameJourneyPlace({...origin,coordinates:origin.coordinates??undefined},{...to,coordinates:to.coordinates??undefined}))return null;
 const plan=localFlightSearchAirportPlan(trip,outbound);
 return plan?.from.selected&&!plan.stale?plan.preference?.from??null:null;
}
export function flightSearchAirportPlan(trip:EasyTTrip,leg:TripLeg) {
 return localFlightSearchAirportPlan(trip,leg,originalOutboundSearchAirport(trip,leg));
}
/** Storage projection only. The booking boundary must authorize mutation first. */
export function applyFlightSearchAirports(trip:EasyTTrip,leg:TripLeg,value:{from:FlightSearchAirport|null;to:FlightSearchAirport|null}|null,basis:string):EasyTTrip {
 const plan=flightSearchAirportPlan(trip,leg);if(!plan||plan.basis!==basis)return trip;
 const preferences={...trip.brief.flightSearchAirportsByLeg};
 if(value===null){if(!(leg.id in preferences))return trip;delete preferences[leg.id];}
 else {
  if((value.from!==null&&!validAirport(value.from))||(value.to!==null&&!validAirport(value.to)))return trip;
  const baseline=flightPlanningAirports({...leg,fromEndpoint:routeEndpointForLeg(trip,leg,'from')!,toEndpoint:routeEndpointForLeg(trip,leg,'to')!})!;
  const from=value.from?.endpoint??baseline.from.endpoint,to=value.to?.endpoint??originalOutboundSearchAirport(trip,leg)?.endpoint??baseline.to.endpoint;
  if(!validSearchPair(from,to))return trip;
  const outerFrom=routeEndpointForLeg(trip,leg,'from')!,outerTo=routeEndpointForLeg(trip,leg,'to')!;
  if((value.from&&pinnedAirport(outerFrom))||(value.to&&pinnedAirport(outerTo)))return trip;
  if(countryCodeFor(from.country)!==countryCodeFor(outerFrom.country)||countryCodeFor(to.country)!==countryCodeFor(outerTo.country))return trip;
  preferences[leg.id]={version:1,basis,from:value.from,to:value.to};
 }
 return {...trip,brief:{...trip.brief,flightSearchAirportsByLeg:preferences}};
}
