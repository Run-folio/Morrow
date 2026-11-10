import type { EasyTTrip, PlanItem, TripStop } from './trip.ts';
import { selectTodayDay, type TodayState } from './trip-today-day.ts';
export type { TodayState } from './trip-today-day.ts';
export { localDateAt, todayTimeZone } from "./trip-local-date.ts";
import { parseIsoDate } from './trip-lifecycle.ts';
import { composeItineraryDay, itineraryDayParts, type ComposedItineraryActivity, type ItineraryDayComposition } from './itinerary-day-composition.ts';
import { itineraryStayPresentation, type ItineraryStayPresentation } from './itinerary-stay-presentation.ts';
import { itineraryTransportAgenda, type ItineraryTransportAgendaLeg } from './itinerary-transport-agenda.ts';

export type TripToday = {
 state:TodayState; day:PlanItem|null; stop:TripStop|null; timezone:string|null;
 choices:PlanItem[]; composition:ItineraryDayComposition|null; activities:ComposedItineraryActivity[];
 stay:ItineraryStayPresentation|null; transport:ItineraryTransportAgendaLeg|null; overnightTransport:ItineraryTransportAgendaLeg|null;
};
const validDate=(date:string|null|undefined):date is string=>Boolean(parseIsoDate(date));
export function transportDate(entry:ItineraryTransportAgendaLeg):string|null{return validDate(entry.booking?.date)?entry.booking.date:validDate(entry.date)?entry.date:null;}
function transportEnd(entry:ItineraryTransportAgendaLeg):string|null {const end=entry.booking?.endDate??entry.booking?.importDetails?.endDate;return validDate(end)?end:null;}
/** A read-only projection. No wall-clock comparison marks an item completed or a traveller present. */
export function tripToday(trip:EasyTTrip|null,now:Date,previewDayId?:string|null):TripToday {
 const selection=selectTodayDay(trip,now,previewDayId);
 const empty:TripToday={...selection,composition:null,activities:[],stay:null,transport:null,overnightTransport:null};
 const day=selection.day;if(!trip||!day)return empty;
 const composition=composeItineraryDay(trip,day.id);if(!composition)return {...empty,state:'dates-needed'};
 const activities=[...itineraryDayParts.flatMap(part=>composition.planned[part]),...composition.unslotted].filter((a,i,all)=>all.findIndex(b=>b.id===a.id)===i);
 const agenda=itineraryTransportAgenda(trip);
 const overnightTransport=agenda.find(e=>{const start=transportDate(e),end=transportEnd(e);return start&&end&&start<=day.date&&end>day.date;})??null;
 const future=agenda.filter(e=>{const date=transportDate(e);return date&&date>=day.date;}).sort((a,b)=>transportDate(a)!.localeCompare(transportDate(b)!));
 return {...selection,composition,activities,stay:itineraryStayPresentation(composition.tonight),transport:overnightTransport??future[0]??agenda.find(e=>!transportDate(e))??null,overnightTransport};
}
