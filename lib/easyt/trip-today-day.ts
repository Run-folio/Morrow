import type { EasyTTrip, PlanItem, TripStop } from './trip.ts';
import { parseIsoDate } from './trip-lifecycle.ts';
import { localDateAt, todayTimeZone } from './trip-local-date.ts';
export type TodayState='no-trip'|'dates-needed'|'date-uncertain'|'day-missing'|'outside-trip'|'choose-day'|'invalid-preview'|'today'|'preview';
export type TodayDaySelection={state:TodayState;day:PlanItem|null;stop:TripStop|null;timezone:string|null;choices:PlanItem[]};
type TodayTrip=Pick<EasyTTrip,'status'|'startDate'|'endDate'|'stops'|'planItems'>;
const validDate=(date:string|null|undefined):date is string=>Boolean(parseIsoDate(date));
export function selectTodayDay(trip:TodayTrip|null,now:Date,previewDayId?:string|null):TodayDaySelection {
 const empty:TodayDaySelection={state:'no-trip',day:null,stop:null,timezone:null,choices:[]};
 if(!trip||trip.status==='archived')return empty;
 if(!validDate(trip.startDate)||!validDate(trip.endDate)||trip.endDate<trip.startDate)return {...empty,state:'dates-needed'};
 const choices=[...trip.planItems].filter(d=>validDate(d.date)&&d.date>=trip.startDate&&d.date<=trip.endDate&&trip.stops.some(s=>s.id===d.stopId)).sort((a,b)=>a.dayNumber-b.dayNumber);
 if(!choices.length||new Set(choices.map(d=>d.id)).size!==choices.length)return {...empty,state:'dates-needed'};
 const base={...empty,choices};
 if(!Number.isFinite(now.getTime()))return {...base,state:'date-uncertain'};
 const stopFor=(d:PlanItem)=>trip.stops.find(s=>s.id===d.stopId)!;
 const zones=new Map(choices.map(d=>[d.id,todayTimeZone(stopFor(d))]));
 const candidates=choices.filter(d=>{const zone=zones.get(d.id);return zone&&localDateAt(now,zone)===d.date;});
 const earliest=localDateAt(new Date(now.getTime()-86400000),'UTC')!,latest=localDateAt(new Date(now.getTime()+86400000),'UTC')!;
 const unknown=choices.some(d=>!zones.get(d.id)&&d.date>=earliest&&d.date<=latest)||choices.length!==trip.planItems.length;
 let day:PlanItem|undefined;
 if(previewDayId){day=choices.find(d=>d.id===previewDayId);if(!day)return {...base,state:'invalid-preview'};}
 else {if(unknown)return {...base,state:'date-uncertain'};if(candidates.length>1)return {...base,state:'choose-day'};if(!candidates.length){const dates=[...zones.values()].filter((z):z is string=>Boolean(z)).map(z=>localDateAt(now,z)!);return {...base,state:dates.some(d=>d>=trip.startDate&&d<=trip.endDate)?'day-missing':'outside-trip'};}day=candidates[0];}
 return {...base,state:previewDayId?'preview':'today',day,stop:stopFor(day),timezone:zones.get(day.id)??null};
}
