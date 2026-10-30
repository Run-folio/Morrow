import {transferEndpointGeographicallyReady} from './geographic-binding.ts';
import type {CanonicalRouteEndpoint} from './trip.ts';
export type ReviewedPhysicalRepresentation={canonicalPlaceId:string;providerId:string;name:string;country:string;coordinates:readonly [number,number];placeType:'city'|'town'};
/** Explicit admitted representations; never name/radius matching or a saved identity rewrite. */
export function matchesReviewedRepresentation(endpoint:CanonicalRouteEndpoint,representations:readonly ReviewedPhysicalRepresentation[]){
 if(!transferEndpointGeographicallyReady(endpoint))return false;
 return representations.some(p=>endpoint.canonicalPlaceId===p.canonicalPlaceId&&endpoint.providerId===p.providerId&&endpoint.name===p.name&&endpoint.country===p.country
  &&endpoint.coordinates?.[0]===p.coordinates[0]&&endpoint.coordinates?.[1]===p.coordinates[1]&&endpoint.geographicBinding?.placeType===p.placeType);
}
const place=(canonicalPlaceId:string,providerId:string,name:string,coordinates:readonly [number,number],placeType:'city'|'town'='city',country='Philippines'):ReviewedPhysicalRepresentation=>({canonicalPlaceId,providerId,name,country,coordinates,placeType});
const places={
 manila:[place('manila','photon:R:103703','Manila',[120.9803621,14.5904492]),place('reference:geonames:1701668','reference:geonames:1701668@699b595afdba9be6994e:PH:city:120.9822:14.6042','Manila',[120.9822,14.6042])],
 elnido:[place('el-nido','photon:R:16029725','El Nido',[119.390496,11.1800395],'town')],
 tagbilaran:[place('reference:geonames:1684497','reference:geonames:1684497@699b595afdba9be6994e:PH:city:123.85219:9.65556','Tagbilaran City',[123.85219,9.65556])],
 siquijor:[place('open-world:photon:R:3604064','photon:R:3604064','Siquijor',[123.5138212,9.2155864],'town')],
 cebu:[place('cebu-city','photon:R:12455830','Cebu City',[123.9018183,10.2934946]),place('reference:geonames:1717512','reference:geonames:1717512@699b595afdba9be6994e:PH:city:123.89071:10.31672','Cebu City',[123.89071,10.31672])],
 london:[place('reference:geonames:2643743','reference:geonames:2643743@699b595afdba9be6994e:GB:city:-0.12574:51.50853','London',[-0.12574,51.50853],'city','United Kingdom')],
 paris:[place('reference:geonames:2988507','reference:geonames:2988507@699b595afdba9be6994e:FR:city:2.3488:48.85341','Paris',[2.3488,48.85341],'city','France')],
 seattle:[place('reference:geonames:5809844','reference:geonames:5809844@699b595afdba9be6994e:US:city:-122.33207:47.60621','Seattle',[-122.33207,47.60621],'city','United States')],
 bainbridge:[place('reference:geonames:5816320','reference:geonames:5816320@699b595afdba9be6994e:US:town:-122.52124:47.62621','Bainbridge Island',[-122.52124,47.62621],'town','United States')],
} as const;
export type ReviewedRouteGuidance={id:string;mode:'flight'|'ferry'|'train';label:string;url:string;limitation:string};
type PilotRecord=ReviewedRouteGuidance&{from:keyof typeof places;to:keyof typeof places;timing:'existing-air-allowance'|null};
/** One-day local qualification window, NOT an operator validity promise or approved production maintenance policy. */
export const PILOT_REVIEW={reviewedAt:'2026-10-27',reviewBy:'2026-10-28',owner:null} as const;
const records:readonly PilotRecord[]=[
 {id:'cebu-manila',from:'cebu',to:'manila',mode:'flight',timing:'existing-air-allowance',label:'Philippine Airlines',url:'https://flights.philippineairlines.com/en/flights-from-cebu-to-manila',limitation:'Planning allowance includes airport access and processing; confirm the actual service and travel time.'},
 {id:'manila-elnido-clark',from:'manila',to:'elnido',mode:'flight',timing:null,label:'Cebgo via Clark',url:'https://help.cebupacificair.com/article/air-swift-transitions-into-cebgo-operations-247334',limitation:'Clark–El Nido service is documented. Manila–Clark access and the total time need checking.'},
 {id:'elnido-bohol',from:'elnido',to:'tagbilaran',mode:'flight',timing:null,label:'Cebgo: El Nido–Bohol',url:'https://help.cebupacificair.com/article/air-swift-transitions-into-cebgo-operations-247334',limitation:'Airport access and the full journey time need checking.'},
 {id:'tagbilaran-siquijor',from:'tagbilaran',to:'siquijor',mode:'ferry',timing:null,label:'OceanJet',url:'https://www.oceanjet.net/news-and-updates/oceanjet-daily-schedule-month-of-february-2026',limitation:'The operator lists this corridor, but the publication dates conflict. Confirm current sailings, ports and access.'},
 {id:'siquijor-cebu',from:'siquijor',to:'cebu',mode:'flight',timing:null,label:'Sunlight Air',url:'https://www.sunlightair.ph/news-releases/sunlight-air-lands-first-commercial-flight-in-siquijor',limitation:'Siquijor–Cebu airport service is documented. City access and the total time need checking.'},
 {id:'london-paris-rail',from:'london',to:'paris',mode:'train',timing:null,label:'Eurostar',url:'https://www.eurostar.com/us-en/train/london-to-paris',limitation:'St Pancras–Gare du Nord service is documented. Station access, check-in and the total time need checking.'},
 {id:'seattle-bainbridge-ferry',from:'seattle',to:'bainbridge',mode:'ferry',timing:null,label:'Washington State Ferries',url:'https://wsdot.wa.gov/ferries/schedule/scheduledetailbyroute.aspx?route=sea-bi',limitation:'The Seattle–Bainbridge crossing is documented. Terminal access, boarding and the total time need checking.'},
];
export function reviewedPilotRecords(from:CanonicalRouteEndpoint,to:CanonicalRouteEndpoint,asOf=new Date().toISOString().slice(0,10)){
 if(asOf<PILOT_REVIEW.reviewedAt||asOf>PILOT_REVIEW.reviewBy)return [];
 return records.filter(r=>matchesReviewedRepresentation(from,places[r.from])&&matchesReviewedRepresentation(to,places[r.to]));
}
/** Gate NEW pilot offers; callers retain already selected/booked facts independently. */
export function reviewedPilotCandidateIsCurrent(candidateId:string,from:CanonicalRouteEndpoint|undefined,to:CanonicalRouteEndpoint|undefined){
 if(!candidateId.startsWith('flight:reviewed:pilot:'))return true;
 return !!from&&!!to&&reviewedPilotRecords(from,to).some(r=>r.timing==='existing-air-allowance'&&candidateId===`flight:reviewed:pilot:${r.id}`);
}
export function reviewedRouteGuidance(from:CanonicalRouteEndpoint,to:CanonicalRouteEndpoint,excludedModes:ReadonlySet<string>=new Set()):ReviewedRouteGuidance[]{
 return reviewedPilotRecords(from,to).filter(r=>!r.timing&&!excludedModes.has(r.mode)).map(({id,mode,label,url,limitation})=>({id,mode,label,url,limitation}));
}
/** Only accept exact static reviewed guidance; untrusted responses cannot inject link URLs or runnable choices. */
export function validateReviewedRouteGuidance(raw:unknown,from:CanonicalRouteEndpoint,to:CanonicalRouteEndpoint,excludedModes:ReadonlySet<string>=new Set()):ReviewedRouteGuidance[]{
 if(!Array.isArray(raw))return [];
 const allowed=reviewedRouteGuidance(from,to,excludedModes);
 return allowed.filter(a=>raw.some(r=>r&&typeof r==='object'&&r.id===a.id&&r.mode===a.mode&&r.label===a.label&&r.url===a.url&&r.limitation===a.limitation));
}
