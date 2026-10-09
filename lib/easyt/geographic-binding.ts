import {referenceGeographicAcceptanceMatches} from './place-reference.ts';
import {findCatalogPlaceById,normalizeCatalogPhrase} from './place-catalog.ts';
import {canonicalPlaceFactsMatch,validPlaceCoordinates,type GeographicBounds} from './place-intelligence.ts';
import {routeFamilies} from './route-catalog.ts';
import {adaptedDiscoveryPlaces} from './discovery-evidence-adapter.ts';
import type {EasyTTrip,GeographicBinding,JourneyEndpointPlace,TripStop} from './trip.ts';

type Role='stop'|'endpoint';
type Candidate=JourneyEndpointPlace & {placeType?:string;kind?:string;routability?:string;bounds?:GeographicBounds;referenceSnapshotId?:string};
const normalized=(value:string|undefined)=>normalizeCatalogPhrase(value??'');
const allowed=(type:string,routability:string,role:Role)=>routability==='direct_destination'
 && (type==='city'||type==='town'||role==='endpoint'&&type==='transport_gateway');
const catalogAllowed=(type:string,routability:string,role:Role)=>allowed(type,routability,role)
 ||type==='island'&&routability==='direct_destination';
export const geographicInputKey=(place:JourneyEndpointPlace)=>JSON.stringify([
 place.canonicalPlaceId??null,place.providerId??null,normalized(place.name),normalized(place.country),place.coordinates??null,
]);
export function stopGeographicPlace(stop:TripStop):JourneyEndpointPlace {
 return {name:stop.name,country:stop.country,canonicalPlaceId:stop.canonicalPlaceId,providerId:stop.providerId,
  ...(stop.longitude!==null&&stop.latitude!==null?{coordinates:[stop.longitude,stop.latitude] as [number,number]}:{}),
  ...(stop.geographicBinding===undefined?{}:{geographicBinding:stop.geographicBinding})};
}
function catalogPoint(place:JourneyEndpointPlace,role:Role) {
 const catalog=place.canonicalPlaceId?findCatalogPlaceById(place.canonicalPlaceId):undefined;
 // The compiled Discovery adapter already validates canonical identity,
 // containment, settlement type and reviewed source provenance. Its exact
 // point is geographic evidence; route feasibility confidence stays separate.
 // Never trust geometry copied from an arbitrary caller's Discovery payload.
 const discoveryPoints=catalog?adaptedDiscoveryPlaces().filter(entry=>entry.id===catalog.canonicalPlaceId
  &&normalized(entry.name)===normalized(catalog.canonicalName)
  &&entry.placeType===catalog.placeType
  &&catalog.parentCountries.some(country=>normalized(country)===normalized(entry.country)))
  .map(entry=>entry.coordinates):[];
 const points=catalog?[...(catalog.coordinates?[catalog.coordinates]:[]),...discoveryPoints,...routeFamilies.filter(route=>route.confidence!=='needs-review').flatMap(route=>route.stops.filter(stop=>
  [catalog.canonicalName,...catalog.aliases].some(name=>normalized(name)===normalized(stop.name))
  &&catalog.parentCountries.some(country=>normalized(country)===normalized(stop.country))).map(stop=>stop.coordinates))]:[];
 return catalog&&!place.providerId&&validPlaceCoordinates(place.coordinates)
  &&catalogAllowed(catalog.placeType,catalog.routability,role)
  &&[catalog.canonicalName,...catalog.aliases].some(name=>normalized(name)===normalized(place.name))
  &&catalog.parentCountries.some(country=>normalized(country)===normalized(place.country))
  &&points.some(point=>point.every((coordinate,index)=>Math.abs(coordinate-place.coordinates![index])<0.000001))?catalog:undefined;
}
/** Semantic compatibility precedes any binding. A same-country region is insufficient. */
export function geographicCandidateMatches(expected:JourneyEndpointPlace & {aliases?:string[];bounds?:GeographicBounds},candidate:Candidate,role:Role='stop') {
 if(!referenceGeographicAcceptanceMatches(candidate))return false;
 if(expected.canonicalPlaceId?.startsWith('reference:')&&expected.canonicalPlaceId!==candidate.canonicalPlaceId)return false;
 const type=candidate.placeType??candidate.kind??'';
 const curatedIsland=type==='island'&&candidate.routability==='direct_destination'
  &&Boolean(catalogPoint({...expected,country:candidate.country,coordinates:candidate.coordinates,providerId:candidate.providerId},role));
 if((!allowed(type,candidate.routability??'',role)&&!curatedIsland)||!validPlaceCoordinates(candidate.coordinates)||!candidate.country?.trim())return false;
 if(expected.country&&normalized(expected.country)!==normalized(candidate.country))return false;
 const catalog=expected.canonicalPlaceId?findCatalogPlaceById(expected.canonicalPlaceId):undefined;
 const names=[expected.name,...(expected.aliases??[]),...(catalog?[catalog.canonicalName,...catalog.aliases]:[])];
 if(!names.some(name=>normalized(name)===normalized(candidate.name)))return false;
 if(catalog&&(!catalogAllowed(catalog.placeType,catalog.routability,role)
  ||!canonicalPlaceFactsMatch(catalog.canonicalPlaceId,{country:candidate.country,coordinates:candidate.coordinates})))return false;
 for(const b of [expected.bounds,candidate.bounds])if(b) {
  const [lon,lat]=candidate.coordinates;
  if(![b.south,b.north,b.west,b.east].every(Number.isFinite)||b.south< -90||b.north>90||b.south>b.north
   ||b.west< -180||b.west>180||b.east< -180||b.east>180||lat<b.south||lat>b.north
   ||!(b.west<=b.east?lon>=b.west&&lon<=b.east:lon>=b.west||lon<=b.east))return false;
 }
 return true;
}
export function acceptedGeographicPlace(owner:JourneyEndpointPlace,candidate:Candidate,role:Role='stop'):JourneyEndpointPlace|undefined {
 if(!geographicCandidateMatches(owner,candidate,role))return undefined;
 const place:JourneyEndpointPlace={...owner,country:candidate.country,coordinates:candidate.coordinates,
  canonicalPlaceId:owner.canonicalPlaceId??candidate.canonicalPlaceId,providerId:candidate.providerId};
 const catalog=catalogPoint(place,role);
 if(!catalog&&!candidate.providerId)return undefined;
 place.geographicBinding={version:1,source:catalog?'catalog':'provider',canonicalPlaceId:place.canonicalPlaceId,
  providerId:place.providerId,placeType:catalog?.placeType??candidate.placeType??candidate.kind!,country:place.country!,
  routability:catalog?.routability??candidate.routability!,inputKey:geographicInputKey(place)};
 return place;
}
/** Malformed, future, stale and absent provider evidence remain saveable, but unverified. */
export function geographicallyReady(place:JourneyEndpointPlace|null|undefined,role:Role='stop'):boolean {
 if(!place||!place.name?.trim()||!validPlaceCoordinates(place.coordinates))return false;
 const raw:unknown=place.geographicBinding;
 if(raw===undefined)return Boolean(catalogPoint(place,role));
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false;
 const b=raw as GeographicBinding;
 if(b.version!==1||!['catalog','provider'].includes(b.source)||typeof b.placeType!=='string'||typeof b.country!=='string'
  ||(!allowed(b.placeType,b.routability,role)&&!(b.source==='catalog'&&b.placeType==='island'&&b.routability==='direct_destination'&&catalogPoint(place,role)))||b.inputKey!==geographicInputKey(place)
  ||b.canonicalPlaceId!==place.canonicalPlaceId||b.providerId!==place.providerId||normalized(b.country)!==normalized(place.country))return false;
 if(b.source==='catalog')return Boolean(catalogPoint(place,role));
 if(!b.providerId?.trim())return false;
 const catalog=place.canonicalPlaceId?findCatalogPlaceById(place.canonicalPlaceId):undefined;
 return !catalog||catalogAllowed(catalog.placeType,catalog.routability,role)&&canonicalPlaceFactsMatch(catalog.canonicalPlaceId,place);
}
export const validatedPlaceCoordinates=(place:JourneyEndpointPlace|null|undefined,role:Role='stop')=>geographicallyReady(place,role)?place!.coordinates!:null;
/** A generated activity can inherit its base point. That fallback cannot qualify an unverified base. */
export function validatedActivityCoordinates(base:TripStop|undefined,coordinates:[number,number]|null) {
 if(!coordinates||!validPlaceCoordinates(coordinates))return null;
 if(base&&!geographicallyReady(stopGeographicPlace(base))&&coordinates[0]===base.longitude&&coordinates[1]===base.latitude)return null;
 return coordinates;
}
/** Conditional member preserves pre-evidence work keys byte-for-byte on legacy reads. */
export const geographicDependency=(place:JourneyEndpointPlace,role:Role='stop')=>place.geographicBinding===undefined?{}:
 {geographicBinding:place.geographicBinding,geographicReady:geographicallyReady(place,role)};

/** Presentation/provider projection only. Never pass this copy to a save/export owner. */
export function guardTripRoutingGeometry<T extends EasyTTrip>(trip:T):T {
 const route=trip.brief.intent?.route;
 const origin=route?.origin??{name:trip.brief.origin,country:trip.brief.originCountry,canonicalPlaceId:trip.brief.originCanonicalPlaceId,providerId:trip.brief.originProviderId,coordinates:trip.brief.originCoordinates??undefined};
 const end=route?.journeyEnd??trip.brief.journeyEnd;
 const ready=new Map(trip.stops.map(stop=>[stop.id,geographicallyReady(stopGeographicPlace(stop))]));
 ready.set(`${trip.id}-origin`,geographicallyReady(origin,'endpoint'));
 ready.set(`${trip.id}-end`,end?.mode==='same_as_start'?geographicallyReady(origin,'endpoint'):end?.mode==='explicit'?geographicallyReady(end.place,'endpoint'):false);
 const mask=(leg:T['legs'][number])=>ready.get(leg.fromStopId)&&ready.get(leg.toStopId)?leg:{...leg,mode:'unknown' as const,confidence:'unknown' as const,provenance:'unknown' as const,
  distanceKm:null,straightLineDistanceKm:null,routedDistanceKm:null,durationMinutes:null,headlineMinutes:null,doorToDoorMinutes:null,usableDayLoss:null,
  fromEndpoint:leg.fromEndpoint?{...leg.fromEndpoint,coordinates:ready.get(leg.fromStopId)?leg.fromEndpoint.coordinates:null}:undefined,
  toEndpoint:leg.toEndpoint?{...leg.toEndpoint,coordinates:ready.get(leg.toStopId)?leg.toEndpoint.coordinates:null}:undefined,
  roadEstimate:undefined,routeGeometry:undefined,segments:undefined,routeMetadata:{source:'unverified-geography'},provider:'Confirm the affected location to assess this connection.',scheduleNeedsChecking:true};
 const projectedOrigin=origin&& !ready.get(`${trip.id}-origin`)?{...origin,coordinates:undefined}:origin;
 const projectedEnd=end?.mode==='explicit'&&!ready.get(`${trip.id}-end`)?{...end,place:{...end.place,coordinates:undefined}}:end;
 return {...trip,brief:{...trip.brief,originCoordinates:ready.get(`${trip.id}-origin`)?trip.brief.originCoordinates:null,
  ...(projectedEnd?{journeyEnd:projectedEnd}:{}),...(route?{intent:{...trip.brief.intent!,route:{...route,origin:projectedOrigin,journeyEnd:projectedEnd??route.journeyEnd}}}:{})},
  stops:trip.stops.map(stop=>ready.get(stop.id)?stop:{...stop,longitude:null,latitude:null}),legs:trip.legs.map(mask)};
}

/** Intake absence is superseded only by a current verified occurrence in the canonical projection. */
export function isCurrentVerifiedRouteBase(trip:Pick<EasyTTrip,'stops'> & Partial<Pick<EasyTTrip,'brief'>>,stop:TripStop) {
 const route=trip.brief?.intent?.route;
 return geographicallyReady(stopGeographicPlace(stop)) && (!route || route.orderedStopIds.includes(stop.id)
  && route.destinations.some(intent=>(intent.kind==='overnight_place'||intent.kind==='planning_area')&&intent.stopIds.includes(stop.id)));
}
