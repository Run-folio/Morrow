import type {EasyTTrip,TripLeg,TripStop} from './trip.ts';
import {endEndpointForTrip,originEndpointForTrip,stopEndpoint,tripRouteDisplayEndpoints} from './trip-legs.ts';
import {sameJourneyPlace} from './journey-endpoints.ts';
export type OverviewRouteStep={id:string;kind:'origin'|'stay'|'end';name:string;country?:string;number:number;label:string|null;stop:TripStop|null;leg:TripLeg|null;isJourneyEnd:boolean};
/** View-only sequence. Endpoint roles change presentation, never saved stops or legs. */
export function overviewRouteSteps(trip:Pick<EasyTTrip,'id'|'brief'|'stops'|'legs'>,language:'en'|'es'='en'):OverviewRouteStep[]{
 const stops=[...trip.stops].sort((a,b)=>a.order-b.order);if(!stops.length)return[];
 const origin=originEndpointForTrip(trip),end=endEndpointForTrip(trip),last=stopEndpoint(stops.at(-1)!);
 const endIsLast=Boolean(end&&sameJourneyPlace({...end,coordinates:end.coordinates??undefined},{...last,coordinates:last.coordinates??undefined}));
 const rows:OverviewRouteStep[]=[];
 if(tripRouteDisplayEndpoints(trip)[0]?.kind==='origin')rows.push({id:origin.id,kind:'origin',name:origin.name,country:origin.country,number:1,label:`${language==='es'?'Desde':'From'} ${origin.name}`,stop:null,leg:trip.legs.find(leg=>leg.classification==='arrival'||leg.fromEndpoint?.kind==='origin')??null,isJourneyEnd:false});
 for(const [index,stop] of stops.entries()){
  const next=stops[index+1];const leg=next?trip.legs.find(leg=>leg.fromStopId===stop.id&&leg.toStopId===next.id):end?trip.legs.find(leg=>leg.fromStopId===stop.id&&leg.toStopId===end.id):null;
  rows.push({id:stop.id,kind:'stay',name:stop.name,country:stop.country,number:rows.length+1,label:null,stop,leg:leg??null,isJourneyEnd:endIsLast&&index===stops.length-1});
 }
 if(end&&!endIsLast){const returning=trip.brief.journeyEnd?.mode==='same_as_start';rows.push({id:end.id,kind:'end',name:end.name,country:end.country,number:rows.length+1,label:`${returning?(language==='es'?'Regreso a':'Return to'):(language==='es'?'Hasta':'To')} ${end.name}`,stop:null,leg:null,isJourneyEnd:true});}
 return rows;
}
