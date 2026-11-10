import type { TripStop } from "./trip.ts";
import { countryCodeFor } from "./country-registry.ts";
import { todayCountryZones } from "./today-timezones.ts";
const normalized = (s:string) => s.normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function todayTimeZone(stop: Pick<TripStop,'name'|'country'|'countryCode'>): string | null {
 const country=countryCodeFor(stop.countryCode??stop.country);if(!country)return null;
 const zones=todayCountryZones[country]??[];
 const exact=zones.filter(zone=>normalized(zone.split('/').at(-1)??'')===normalized(stop.name));
 const choice=exact.length===1?exact[0]:zones.length===1?zones[0]:null;
 try {if(choice){new Intl.DateTimeFormat('en',{timeZone:choice});return choice;}}catch{/* Unsupported zone stays explicit. */}
 return null;
}
export function localDateAt(now:Date,timeZone:string):string|null {
 if(!Number.isFinite(now.getTime()))return null;
 try {const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);return ['year','month','day'].map(key=>parts.find(p=>p.type===key)?.value).join('-');}catch{return null;}
}
