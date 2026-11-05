"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {CanonicalPlaceAutocomplete} from './canonical-place-autocomplete';
import {EasyTButton} from './easyt-controls';
import {useTripShellMutation} from './trip-shell-client';
import {airportChoiceFromSuggestion,flightSearchAirportPlan,type FlightSearchAirport} from '@/lib/easyt/flight-search-airport-choice';
import {canEditFlightSearchAirports,setFlightSearchAirports} from '@/lib/easyt/booking-readiness';
import {countryCodeFor} from '@/lib/easyt/country-registry';
import type {EasyTTrip,TripLeg} from '@/lib/easyt/trip';
import styles from './trip-transport-workspace.module.css';

export function TripFlightSearchAirports({trip,leg,language='en'}:{trip:EasyTTrip;leg:TripLeg;language?:'en'|'es'}) {
 const formId=useId(),triggerRef=useRef<HTMLButtonElement>(null);
 const mutation=useTripShellMutation(),plan=flightSearchAirportPlan(trip,leg);
 const [open,setOpen]=useState(false),[from,setFrom]=useState<FlightSearchAirport|null>(null),[to,setTo]=useState<FlightSearchAirport|null>(null);
 const [fromText,setFromText]=useState(''),[toText,setToText]=useState(''),[error,setError]=useState('');
 const preferenceKey=JSON.stringify(plan?.preference??null),basis=plan?.basis;
 const reset=()=>{setFrom(plan?.preference?.from??null);setTo(plan?.preference?.to??null);setFromText(plan?.preference?.from?.endpoint.name??'');setToText(plan?.preference?.to?.endpoint.name??'');setError('');};
 useEffect(()=>{setOpen(false);setError('');},[leg.id,basis,preferenceKey]);
 if(!plan||!canEditFlightSearchAirports(trip,leg))return null;
 const es=language==='es',pendingKey=`flight-search-airports-${leg.id}`,pending=mutation.isPending(pendingKey);
 const selected=plan.from.selected||plan.to.selected;
 const airportSummary=[plan.from,plan.to].map(p=>`${p.endpoint.name} (${p.selected?(es?'elegido por ti':'selected by you'):p.assumed?(es?'previsto':'suggested'):(es?'extremo del trayecto':'route endpoint')})`).join(' → ');
 const invalidChoice=es?'Elige un aeropuerto del país del trayecto con servicio de pasajeros registrado.':'Choose a pinned passenger airport in this journey endpoint’s country.';
 const save=async(value:{from:FlightSearchAirport|null;to:FlightSearchAirport|null}|null)=>{
  const saved=await mutation.mutateTrip(current=>{
   const next=setFlightSearchAirports(current,leg.id,value,plan.basis!);
   if(next===current)throw new Error(es?'Revisa los aeropuertos y vuelve a intentarlo.':'Check the airports and try again.');
   return next;
  },pendingKey);
  if(saved){setOpen(false);setError('');triggerRef.current?.focus();}
 };
 const choose=(side:'from'|'to',suggestion:unknown)=>{
  const choice=airportChoiceFromSuggestion(suggestion),expected=side==='from'?plan.from.endpoint:plan.to.endpoint;
  if(!choice||countryCodeFor(choice.endpoint.country)!==countryCodeFor(expected?.country)){setError(invalidChoice);return;}
  setError('');if(side==='from'){setFrom(choice);setFromText(choice.endpoint.name);}else{setTo(choice);setToText(choice.endpoint.name);}
 };
 return <div className={styles.airportSearch}>
  {selected?<p>{es?'Aeropuertos para buscar vuelos':'Flight-search airports'}: {airportSummary}</p>:null}
  {selected&&!open?<p>{es?'Solo para buscar vuelos. Los traslados y la disponibilidad necesitan confirmación.':'Flight search only. Airport access, onward travel and availability need checking.'}</p>:null}
  {plan.stale?<p>{es?'Revisa las elecciones de aeropuerto anteriores: el trayecto cambió.':'Review previous airport choices: this journey changed.'}</p>:null}
  <EasyTButton ref={triggerRef} aria-expanded={open} aria-controls={formId} size="small" variant="quiet" onClick={()=>{reset();setOpen(!open);}}>{es?'Cambiar aeropuertos de búsqueda':'Change flight-search airports'}</EasyTButton>{open?<form id={formId} aria-label={es?'Aeropuertos para buscar vuelos':'Flight-search airports'} onSubmit={e=>{e.preventDefault();if((fromText&&!from)||(toText&&!to)){setError(invalidChoice);return;}void save({from,to});}}>
   <p>{es?'Solo para buscar vuelos. Los traslados al aeropuerto y al alojamiento, los horarios y la disponibilidad necesitan confirmación.':'Flight search only. Airport access, onward travel, schedules and availability need checking.'}</p>
   <CanonicalPlaceAutocomplete language={language} label={es?'Aeropuerto de salida':'Departure airport'} value={fromText} placeholder={plan.from.assumed?plan.from.endpoint.name:es?'Nombre o código del aeropuerto':'Airport name or code'} contextCountries={[plan.from.endpoint.country??'']} allowedPlaceTypes={['transport_gateway']} requireCoordinates menuPlacement="inline" disabled={pending} onChange={text=>{setFromText(text);setFrom(null);}} onSelect={s=>choose('from',s)} onClear={()=>{setFromText('');setFrom(null);}} />
   <CanonicalPlaceAutocomplete language={language} label={es?'Aeropuerto de llegada':'Arrival airport'} value={toText} placeholder={plan.to.assumed?plan.to.endpoint.name:es?'Nombre o código del aeropuerto':'Airport name or code'} contextCountries={[plan.to.endpoint.country??'']} allowedPlaceTypes={['transport_gateway']} requireCoordinates menuPlacement="inline" disabled={pending} onChange={text=>{setToText(text);setTo(null);}} onSelect={s=>choose('to',s)} onClear={()=>{setToText('');setTo(null);}} />
   {error?<p role="alert">{error}</p>:null}
   <div className={styles.connectionActions}><EasyTButton type="submit" size="small" variant="primary" disabled={pending}>{es?'Guardar aeropuertos':'Save airports'}</EasyTButton><EasyTButton type="button" size="small" variant="quiet" disabled={pending} onClick={()=>{reset();setOpen(false);triggerRef.current?.focus();}}>{es?'Cancelar':'Cancel'}</EasyTButton>
   {trip.brief.flightSearchAirportsByLeg?.[leg.id]?<EasyTButton type="button" size="small" variant="secondary" disabled={pending} onClick={()=>void save(null)}>{es?'Restablecer aeropuertos':'Reset search airports'}</EasyTButton>:null}</div>
  </form>:null}
 </div>;
}
