import {knownKnowledgeFact,unknownKnowledgeFact,type DestinationTransferKnowledge,type KnowledgeSource} from './destination-knowledge.ts';
import {REFERENCE_SNAPSHOT_ID} from './place-reference.ts';
import {estimateFlightPlanningMinutes,haversineKm} from './planner.ts';
import type {CanonicalRouteEndpoint} from './trip.ts';

type ReviewedCity={catalogId?:string;name:string;country:string;countryCode:string;referenceId:string;point:readonly [number,number];catalogPoint?:readonly [number,number]};
// Explicit physical tuples, not name/country aliases. The two Cusco records
// must remain distinct even though the generic catalog binding accepts both.
const cities={
 lima:{catalogId:'lima',name:'Lima',country:'Peru',countryCode:'PE',referenceId:'3936456',point:[-77.02824,-12.04318],catalogPoint:[-77.0428,-12.0464]},
 cusco:{catalogId:'cusco',name:'Cusco',country:'Peru',countryCode:'PE',referenceId:'3941584',point:[-71.96701,-13.53188],catalogPoint:[-71.9785,-13.517]},
 quito:{catalogId:'quito',name:'Quito',country:'Ecuador',countryCode:'EC',referenceId:'3652462',point:[-78.52495,-0.22985],catalogPoint:[-78.4678,-0.1807]},
 bogota:{catalogId:'bogota',name:'Bogotá',country:'Colombia',countryCode:'CO',referenceId:'3688689',point:[-74.08175,4.60971],catalogPoint:[-74.0721,4.711]},
 cartagena:{name:'Cartagena',country:'Colombia',countryCode:'CO',referenceId:'3687238',point:[-75.49328,10.39817]},
 osaka:{catalogId:'osaka',name:'Osaka',country:'Japan',countryCode:'JP',referenceId:'1853909',point:[135.50107,34.69379],catalogPoint:[135.5023,34.6937]},
 seoul:{catalogId:'seoul',name:'Seoul',country:'South Korea',countryCode:'KR',referenceId:'1835848',point:[126.9784,37.566],catalogPoint:[126.978,37.5665]},
} as const satisfies Record<string,ReviewedCity>;
type CityId=keyof typeof cities;
const normalized=(value:string|undefined)=>value?.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function matches(endpoint:CanonicalRouteEndpoint,city:ReviewedCity){
 if(normalized(endpoint.name)!==normalized(city.name)||normalized(endpoint.country)!==normalized(city.country)||!endpoint.coordinates)return false;
 const referenceId=`reference:geonames:${city.referenceId}`;
 if(endpoint.canonicalPlaceId!==referenceId&&endpoint.canonicalPlaceId!==city.catalogId)return false;
 const samePoint=(point:readonly [number,number])=>point.every((value,index)=>value===endpoint.coordinates![index]);
 if(endpoint.providerId)return samePoint(city.point)
  &&endpoint.providerId===`${referenceId}@${REFERENCE_SNAPSHOT_ID}:${city.countryCode}:city:${city.point[0]}:${city.point[1]}`;
 return endpoint.canonicalPlaceId===city.catalogId&&!!city.catalogPoint&&samePoint(city.catalogPoint);
}
const allowanceSource:KnowledgeSource={id:'morrovia:reviewed-air-allowance-v1',label:'Morrovia existing flight planning rule',kind:'curated',reviewedAt:'2026-10-17',supports:'Existing estimateFlightPlanningMinutes rule: 180 minutes airport/access allowance plus distance at 760 km/h with a one-hour transport floor; rounded up to a whole-hour planning allocation after directional service feasibility is established. Not reviewed airline timing, a measured range, timetable or date-specific itinerary. Any required connection must be checked.'};
const route=(id:string,label:string,url:string,supports:string,reviewedAt='2026-10-17'):KnowledgeSource=>({id,label,url,supports,kind:'official',reviewedAt});
const journeys:readonly {from:CityId;to:CityId;source:KnowledgeSource}[]=[
 {from:'lima',to:'cusco',source:route('latam:lima-cusco','LATAM — Lima to Cusco','https://www.latamairlines.com/us/en/destinations/peru/flights-from-lima-to-cusco','Directional LIM–CUZ route, with nonstop offers on published sample dates; not availability or timing for the traveller’s dates.')},
 {from:'quito',to:'bogota',source:route('quito-airport:bogota-departures','Quito Airport — Bogotá departures','https://www.aeropuertoquito.aero/itinerarios-internacionales/','Directional Bogotá departures in the airport international itinerary, corroborated by the 2026-10-16 board; not a date-specific booking or journey duration.')},
 {from:'bogota',to:'cartagena',source:route('latam:bogota-cartagena','LATAM — Bogotá to Cartagena','https://www.latamairlines.com/us/en/destinations/colombia/flights-from-bogota-to-cartagena','Directional BOG–CTG route, with nonstop offers on published sample dates; not availability or timing for the traveller’s dates.')},
 {from:'osaka',to:'seoul',source:route('korean-air:osaka-seoul','Korean Air — Osaka to Seoul','https://www.koreanair.com/flights/en/flights-from-osaka-to-seoul','Published directional Osaka (KIX) to Seoul (ICN/GMP) route offers support this city corridor, not nonstop service, journey timing or availability for the traveller’s dates.','2026-10-21')},
 {from:'seoul',to:'osaka',source:route('korean-air:seoul-osaka','Korean Air — Seoul to Osaka','https://www.koreanair.com/flights/en/flights-from-seoul-to-osaka','Published directional Seoul (ICN/GMP) to Osaka (KIX) route offers support this city corridor, not nonstop service, journey timing or availability for the traveller’s dates.','2026-10-21')},
];

/** Called only after the shared geographic guard; never relabels a saved place. */
export function reviewedAirJourney(from:CanonicalRouteEndpoint,to:CanonicalRouteEndpoint):{id:string;transfer:DestinationTransferKnowledge}|undefined {
 const journey=journeys.find(item=>matches(from,cities[item.from])&&matches(to,cities[item.to]));
 if(!journey)return undefined;
 const distance=haversineKm(from.coordinates??undefined,to.coordinates??undefined);
 if(distance===null)return undefined;
 const planningMinutes=Math.ceil(estimateFlightPlanningMinutes(distance).totalMinutes/60)*60;
 return {id:`${journey.from}-${journey.to}`,transfer:{
  fromCanonicalId:from.canonicalPlaceId!,toCanonicalId:to.canonicalPlaceId!,
  mode:knownKnowledgeFact('flight','static',journey.source),
  planningMinutes:knownKnowledgeFact(planningMinutes,'estimated',allowanceSource),
  durationBasis:knownKnowledgeFact('door-to-door','static',allowanceSource),
  realisticRangeMinutes:unknownKnowledgeFact('No defensible minimum/maximum interval is reviewed for this planning allowance.'),
  borderFriction:unknownKnowledgeFact('Airport and border processing are included in the broad total, not separately measured.'),
  note:knownKnowledgeFact(`About ${planningMinutes/60}h door to door as a Morrovia planning allowance, including airport access and processing; not an airline duration. Check the full flight and any connection for your dates. ${journey.source.label} (${journey.source.url}).`,'static',[journey.source,allowanceSource]),
 }};
}
