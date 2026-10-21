import defaults from '../../data/place-reference/flight-airport-defaults.json' with {type:'json'};
import {REFERENCE_SNAPSHOT_ID,referenceCountrySeeds,referenceRecordKey,referenceGeographicAcceptanceMatches,type ReferencePlaceRecord} from './place-reference.ts';
import {countryCodeFor,countryFor} from './country-registry.ts';
import {acceptedGeographicPlace,geographicallyReady} from './geographic-binding.ts';
import type {CanonicalRouteEndpoint,TripLeg} from './trip.ts';

/** Small projection from the pinned snapshot. The city preference is a planning
 * default, not an inference of service, a timetable or a saved destination. */
export const FLIGHT_AIRPORT_DEFAULTS=defaults;
export type FlightPlanningEndpoint={endpoint:CanonicalRouteEndpoint;assumed:boolean;cityName?:string;airportCode?:string};
const normalized=(name:string)=>name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
const isAirport=(endpoint:CanonicalRouteEndpoint)=>endpoint.canonicalPlaceId?.startsWith('reference:ourairports:')
 ||endpoint.geographicBinding?.placeType==='transport_gateway';
function planningEndpoint(source:CanonicalRouteEndpoint):FlightPlanningEndpoint {
 const unchanged={endpoint:source,assumed:false};
 if(isAirport(source)||defaults.snapshotId!==REFERENCE_SNAPSHOT_ID
  ||!geographicallyReady({...source,coordinates:source.coordinates??undefined},'endpoint'))return unchanged;
 const mapping=defaults.entries.find(row=>[row.cityId,row.legacyCityId].includes(source.canonicalPlaceId??''));
 if(!mapping||countryCodeFor(source.country)!==mapping.airport.countryCode)return unchanged;
 const city=referenceCountrySeeds(mapping.airport.countryCode).find(row=>row.canonicalPlaceId===mapping.cityId);
 if(!city||city.placeType!=='city'||![city.canonicalName,...city.aliases].some(name=>normalized(name)===normalized(source.name)))return unchanged;
 if(source.providerId){
  if(source.providerId!==city.referenceProviderId||!source.coordinates?.every((value,i)=>value===city.coordinates?.[i]))return unchanged;
  if(!referenceGeographicAcceptanceMatches({canonicalPlaceId:city.canonicalPlaceId,providerId:source.providerId,
   referenceSnapshotId:defaults.snapshotId,country:source.country,placeType:'city',coordinates:source.coordinates}))return unchanged;
 }
 const rawAirport=mapping.airport;
 if(rawAirport.source!=='ourairports'||rawAirport.placeType!=='transport_gateway'||rawAirport.status!=='active'
  ||rawAirport.coordinates.length!==2||!rawAirport.coordinates.every(Number.isFinite))return unchanged;
 const airport:ReferencePlaceRecord={...rawAirport,source:rawAirport.source,placeType:rawAirport.placeType,
  status:rawAirport.status,coordinates:[rawAirport.coordinates[0],rawAirport.coordinates[1]]};
 if(airport.status!=='active'||!airport.scheduledService||airport.airportType!=='large_airport'
  ||airport.providerId!==referenceRecordKey(airport,defaults.snapshotId))return unchanged;
 const country=countryFor(airport.countryCode)?.name;if(!country)return unchanged;
 const owner={name:airport.canonicalName,country,canonicalPlaceId:airport.canonicalPlaceId};
 const place=acceptedGeographicPlace(owner,{...owner,providerId:airport.providerId,coordinates:[...airport.coordinates],
  placeType:'transport_gateway',routability:'direct_destination',referenceSnapshotId:defaults.snapshotId},'endpoint');
 if(!place)return unchanged;
 return {endpoint:{...place,id:`assumed-airport:${airport.canonicalPlaceId}`,kind:'gateway',coordinates:place.coordinates!},
  assumed:true,cityName:mapping.cityName,airportCode:airport.iataCode};
}

/** Derived only. Callers retain canonical city endpoints and all service/timing
 * evidence. Unknown mode is a conditional "if flying" view, never a new mode. */
export function flightPlanningAirports(leg:TripLeg):{from:FlightPlanningEndpoint;to:FlightPlanningEndpoint}|null {
 if(!['flight','unknown'].includes(leg.mode)||['provider','canonical_schedule'].includes(leg.provenance??'')
  ||leg.routeMetadata.confirmed===true||leg.routeMetadata.userConfirmed===true||leg.routeMetadata.source==='imported-booking')return null;
 const constraints=leg.routeMetadata.transportConstraints as {excludedModes?:unknown}|undefined;
 if(Array.isArray(constraints?.excludedModes)&&constraints.excludedModes.includes('flight'))return null;
 const airSegments=leg.segments?.filter(segment=>segment.mode==='flight')??[];
 const first=airSegments[0]?.fromEndpoint,last=airSegments.at(-1)?.toEndpoint;
 const from=first&&isAirport(first)?first:leg.fromEndpoint,to=last&&isAirport(last)?last:leg.toEndpoint;
 if(!from||!to)return null;
 return {from:planningEndpoint(from),to:planningEndpoint(to)};
}
export function flightAirportAssumptionLabel(leg:TripLeg,language:'en'|'es'='en'):string|null {
 const plan=flightPlanningAirports(leg);if(!plan)return null;
 const assumed=[plan.from,plan.to].filter(endpoint=>endpoint.assumed);
 if(!assumed.length)return null;
 const airports=assumed.map(endpoint=>`${endpoint.cityName}: ${endpoint.airportCode}`).join(' · ');
 return language==='es'
  ? `${leg.mode==='unknown'?'Si vuelas, aeropuertos previstos':'Aeropuertos previstos'}: ${airports}. Servicio y traslados al aeropuerto por comprobar.`
  : `${leg.mode==='unknown'?'If flying, assumed airports':'Assumed airports'}: ${airports}. Flight service and airport transfers need checking.`;
}
