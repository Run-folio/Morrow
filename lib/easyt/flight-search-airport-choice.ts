import identities from '../../data/place-reference/scheduled-airport-identities.json' with {type:'json'};
import {acceptedGeographicPlace,transferEndpointGeographicallyReady} from './geographic-binding.ts';
import {REFERENCE_SNAPSHOT_ID,referenceGeographicAcceptanceMatches} from './place-reference.ts';
import {countryCodeFor} from './country-registry.ts';
import {flightPlanningAirports} from './flight-airport-assumptions.ts';
import {routeEndpointForLeg} from './trip-legs.ts';
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
export function flightSearchAirportBasis(trip:EasyTTrip,leg:TripLeg):string|null {
 const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
 if(!from||!to)return null;
 const key=(e:CanonicalRouteEndpoint)=>[e.id,e.name,e.country,e.canonicalPlaceId,e.providerId,e.coordinates,e.geographicBinding?.inputKey];
 return JSON.stringify([leg.id,key(from),key(to)]);
}
export function hasExplicitSavedFlightAirports(leg:TripLeg):boolean {
 return Array.isArray(leg.segments)&&leg.segments.some(s=>s?.mode==='flight'&&[s.fromEndpoint,s.toEndpoint].some(e=>e?.kind==='gateway'||e?.geographicBinding?.placeType==='transport_gateway'||(typeof e?.canonicalPlaceId==='string'&&e.canonicalPlaceId.startsWith('reference:ourairports:'))));
}
export function flightSearchAirportPlan(trip:EasyTTrip,leg:TripLeg) {
 const from=routeEndpointForLeg(trip,leg,'from'),to=routeEndpointForLeg(trip,leg,'to');
 if(!from||!to)return null;
 const baseline=flightPlanningAirports({...leg,fromEndpoint:from,toEndpoint:to});
 if(!baseline)return null;
 const stored=trip.brief.flightSearchAirportsByLeg?.[leg.id],basis=flightSearchAirportBasis(trip,leg);
 let current=!hasExplicitSavedFlightAirports(leg)&&stored&&stored.version===1&&stored.basis===basis
  &&(stored.from===null||validAirport(stored.from))&&(stored.to===null||validAirport(stored.to))
  &&(!stored.from||countryCodeFor(stored.from.endpoint.country)===countryCodeFor(from.country))
  &&(!stored.to||countryCodeFor(stored.to.endpoint.country)===countryCodeFor(to.country))?stored:null;
 if(current&&(current.from||current.to)){
  const a=current.from?.endpoint??baseline.from.endpoint,b=current.to?.endpoint??baseline.to.endpoint;
  if(!a.canonicalPlaceId?.startsWith('reference:ourairports:')||!b.canonicalPlaceId?.startsWith('reference:ourairports:')||a.canonicalPlaceId===b.canonicalPlaceId)current=null;
 }
 return {from:{...baseline.from,...(current?.from?{endpoint:current.from.endpoint,assumed:false}:{}),selected:!!current?.from},
  to:{...baseline.to,...(current?.to?{endpoint:current.to.endpoint,assumed:false}:{}),selected:!!current?.to},preference:current,stale:!!stored&&!current,basis};
}
/** Storage projection only. The booking boundary must authorize mutation first. */
export function applyFlightSearchAirports(trip:EasyTTrip,leg:TripLeg,value:{from:FlightSearchAirport|null;to:FlightSearchAirport|null}|null,basis:string):EasyTTrip {
 const plan=flightSearchAirportPlan(trip,leg);if(!plan||plan.basis!==basis)return trip;
 const preferences={...trip.brief.flightSearchAirportsByLeg};
 if(value===null){if(!(leg.id in preferences))return trip;delete preferences[leg.id];}
 else {
  if((value.from!==null&&!validAirport(value.from))||(value.to!==null&&!validAirport(value.to)))return trip;
  const baseline=flightPlanningAirports({...leg,fromEndpoint:routeEndpointForLeg(trip,leg,'from')!,toEndpoint:routeEndpointForLeg(trip,leg,'to')!})!;
  const from=value.from?.endpoint??baseline.from.endpoint,to=value.to?.endpoint??baseline.to.endpoint;
  if(!from.canonicalPlaceId?.startsWith('reference:ourairports:')||!to.canonicalPlaceId?.startsWith('reference:ourairports:')||from.canonicalPlaceId===to.canonicalPlaceId)return trip;
  const outerFrom=routeEndpointForLeg(trip,leg,'from')!,outerTo=routeEndpointForLeg(trip,leg,'to')!;
  if(countryCodeFor(from.country)!==countryCodeFor(outerFrom.country)||countryCodeFor(to.country)!==countryCodeFor(outerTo.country))return trip;
  preferences[leg.id]={version:1,basis,from:value.from,to:value.to};
 }
 return {...trip,brief:{...trip.brief,flightSearchAirportsByLeg:preferences}};
}
