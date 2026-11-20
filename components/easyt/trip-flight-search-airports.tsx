"use client";
import {useEffect,useId,useRef,useState} from 'react';
import {CanonicalPlaceAutocomplete} from './canonical-place-autocomplete';
import {EasyTButton} from './easyt-controls';
import {useTripShellMutation} from './trip-shell-client';
import {airportChoiceFromSuggestion,flightSearchAirportPlan,majorAirportsForCity,type FlightSearchAirport} from '@/lib/easyt/flight-search-airport-choice';
import {canEditFlightSearchAirports,setFlightSearchAirports} from '@/lib/easyt/booking-readiness';
import {routeEndpointForLeg} from '@/lib/easyt/trip-legs';
import {countryCodeFor} from '@/lib/easyt/country-registry';
import type {EasyTTrip,TripLeg} from '@/lib/easyt/trip';
import styles from './trip-transport-workspace.module.css';

export function TripFlightSearchAirports({trip,leg,language='en'}:{trip:EasyTTrip;leg:TripLeg;language?:'en'|'es'}) {
 const returnFocus=useRef(false);
 const formId=useId(),triggerRef=useRef<HTMLButtonElement>(null),fromRef=useRef<HTMLInputElement>(null),toRef=useRef<HTMLInputElement>(null);
 const mutation=useTripShellMutation(),plan=flightSearchAirportPlan(trip,leg);
 const [open,setOpen]=useState(false),[from,setFrom]=useState<FlightSearchAirport|null>(null),[to,setTo]=useState<FlightSearchAirport|null>(null);
 const [fromText,setFromText]=useState(''),[toText,setToText]=useState(''),[error,setError]=useState('');
 const [fallback,setFallback]=useState({from:false,to:false});
 const preferenceKey=JSON.stringify([plan?.preference??null,plan?.to.inherited?plan.to.endpoint:null]),basis=plan?.basis;
 const reset=()=>{setFallback({from:false,to:false});setFrom(plan?.preference?.from??null);setTo(plan?.preference?.to??null);setFromText(plan?.preference?.from?.endpoint.name??'');setToText(plan?.preference?.to?.endpoint.name??'');setError('');};
 useEffect(()=>{setOpen(false);setError('');},[leg.id,basis,preferenceKey]);
 const pendingKey=`flight-search-airports-${leg.id}`,pending=!mutation.canMutate||mutation.isPending(pendingKey);
 useEffect(()=>{
  if(!open&&!pending&&returnFocus.current){returnFocus.current=false;triggerRef.current?.focus();}
  if(open){const form=document.getElementById(formId);if(form&&!form.contains(document.activeElement))form.querySelector<HTMLInputElement>('input[type=radio]:checked:not(:disabled)')?.focus();}
 },[open,pending,formId]);
 if(!plan||!canEditFlightSearchAirports(trip,leg))return null;
 const es=language==='es';
 const endpointFor=(side:'from'|'to')=>routeEndpointForLeg(trip,leg,side)??plan[side].endpoint;
 const choices=(side:'from'|'to')=>majorAirportsForCity(endpointFor(side));
 const summaryFor=(side:'from'|'to')=>{
  const current=plan[side],known=choices(side).find(a=>a.choice.endpoint.canonicalPlaceId===current.endpoint.canonicalPlaceId);
  return known?`${known.label} (${known.code})`:current.assumed?`${current.cityName} (${es?'predeterminado':'default'}: ${current.airportCode})`:current.endpoint.name;
 };
 const airportSummary=`${summaryFor('from')} → ${summaryFor('to')}${plan.to.inherited?(es?' (igual que en la ida)':' (same as outbound)'):''}`;
 const invalidChoice=es?'Elige un aeropuerto del país del trayecto con servicio de pasajeros registrado.':'Choose a pinned passenger airport in this journey endpoint’s country.';
 const save=async(value:{from:FlightSearchAirport|null;to:FlightSearchAirport|null}|null)=>{
  const saved=await mutation.mutateTrip(current=>{
   const next=setFlightSearchAirports(current,leg.id,value,plan.basis!);
   if(next===current)throw new Error(es?'Revisa los aeropuertos y vuelve a intentarlo.':'Check the airports and try again.');
   return next;
  },pendingKey);
  if(saved){returnFocus.current=true;setOpen(false);setError('');if(!triggerRef.current?.disabled)triggerRef.current?.focus();}
 };
 const choose=(side:'from'|'to',suggestion:unknown)=>{
  const choice=airportChoiceFromSuggestion(suggestion),expected=side==='from'?plan.from.endpoint:plan.to.endpoint;
  if(!choice||countryCodeFor(choice.endpoint.country)!==countryCodeFor(expected?.country)){setError(invalidChoice);return;}
  setError('');setFallback(a=>({...a,[side]:false}));(side==='from'?fromRef:toRef).current?.focus();if(side==='from'){setFrom(choice);setFromText(choice.endpoint.name);}else{setTo(choice);setToText(choice.endpoint.name);}
 };
 const field=(side:'from'|'to')=>{
  const departure=side==='from',value=departure?from:to,text=departure?fromText:toText,endpoint=endpointFor(side),curated=choices(side);
  const label=departure?(es?'Aeropuerto de salida':'Departure airport'):(es?'Aeropuerto de llegada':'Arrival airport');
  const baseline=plan[side].inherited?`${plan[side].endpoint.name} (${es?'igual que en la ida':'same as outbound'})`:plan[side].assumed?`${endpoint.name} (${es?'predeterminado':'default'}: ${plan[side].airportCode})`:endpoint.canonicalPlaceId?.startsWith('reference:ourairports:')?endpoint.name:`${endpoint.name} (${es?'búsqueda por ciudad':'city search'})`;
  const valueId=value?.endpoint.canonicalPlaceId??'';
  return <div className={styles.airportField}>
   <fieldset className={styles.airportChoices} disabled={pending||endpoint.canonicalPlaceId?.startsWith('reference:ourairports:')||endpoint.geographicBinding?.placeType==='transport_gateway'}>
    <legend>{label} · {endpoint.name}</legend>
    {[{id:'',label:baseline},...curated.map(a=>({id:a.choice.endpoint.canonicalPlaceId!,label:`${a.label} (${a.code})`})),
      ...(value&&!curated.some(a=>a.choice.endpoint.canonicalPlaceId===valueId)?[{id:valueId,label:value.endpoint.name}]:[]),
      {id:'other',label:es?'Buscar otro aeropuerto…':'Search another airport…'}].map(option=><label key={option.id} className={styles.airportChoice}>
     {/* morrovia-ui-audit-allow-next-line native-control -- Native radio semantics with a Morrovia-styled visible option. */}
     <input type="radio" name={`${formId}-${side}`} ref={option.id===''?(departure?fromRef:toRef):undefined} value={option.id} checked={(fallback[side]?'other':valueId)===option.id} onChange={()=>{
      const id=option.id;setError('');setFallback(prev=>({...prev,[side]:id==='other'}));
      const picked=curated.find(a=>a.choice.endpoint.canonicalPlaceId===id)?.choice??(id===valueId?value:null);
      if(departure){setFrom(picked);setFromText('');}else{setTo(picked);setToText('');}
     }}/>{option.label}
    </label>)}
   </fieldset>
   {fallback[side]?<CanonicalPlaceAutocomplete autoFocus language={language} label={label} value={text} placeholder={es?'Nombre o código del aeropuerto':'Airport name or code'} contextCountries={[endpoint.country??'']} allowedPlaceTypes={['transport_gateway']} requireCoordinates menuPlacement="inline" disabled={pending} onChange={value=>{if(departure){setFromText(value);setFrom(null);}else{setToText(value);setTo(null);}}} onSelect={value=>choose(side,value)} onClear={()=>{if(departure){setFromText('');setFrom(null);}else{setToText('');setTo(null);}}} />:null}
  </div>;
 };
 const cancel=()=>{reset();setOpen(false);triggerRef.current?.focus();};
 return <div className={styles.airportSearch} data-airport-editor-open={open?'true':undefined}>
  <div className={styles.airportSummary}><div><strong>{es?'Aeropuertos para esta búsqueda':'Airports for this search'}</strong><p>{airportSummary}</p></div>
  <EasyTButton ref={triggerRef} disabled={pending} aria-expanded={open} aria-controls={formId} size="small" variant="quiet" onClick={()=>{reset();setOpen(!open);}}>{es?'Editar aeropuertos':'Edit airports'}</EasyTButton></div>
  {plan.sameAirport?<p role="alert">{es?'La búsqueda usa el mismo aeropuerto en ambos extremos. Revisa los aeropuertos de este trayecto.':'This search uses the same airport at both ends. Review this journey’s airports.'}</p>:null}
  {plan.stale?<p>{es?'Revisa las elecciones de aeropuerto anteriores: el trayecto cambió.':'Review previous airport choices: this journey changed.'}</p>:null}
  {open?<form id={formId} aria-label={es?'Aeropuertos para buscar vuelos':'Flight-search airports'} onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented&&!(e.target as HTMLElement).closest('[role=combobox][aria-expanded=true]')){e.preventDefault();cancel();}}} onSubmit={e=>{
   e.preventDefault();
   if((fallback.from&&!from)||(fallback.to&&!to)){setError(invalidChoice);return;}
   if(!from&&!to&&!trip.brief.flightSearchAirportsByLeg?.[leg.id]){cancel();return;}
   void save(from||to?{from,to}:null);
  }}>
   <p>{es?'Solo cambia tu búsqueda de vuelos. Tu viaje no cambia.':'Only changes your flight search. Your trip stays the same.'}</p>
   <div className={styles.airportFields}>{field('from')}{field('to')}</div>
   {error?<p role="alert">{error}</p>:null}
   <div className={styles.connectionActions}><EasyTButton type="submit" size="small" variant="primary" disabled={pending}>{es?'Usar estos aeropuertos':'Use these airports'}</EasyTButton><EasyTButton type="button" size="small" variant="quiet" disabled={pending} onClick={cancel}>{es?'Cancelar':'Cancel'}</EasyTButton>
   {trip.brief.flightSearchAirportsByLeg?.[leg.id]?<EasyTButton type="button" size="small" variant="secondary" disabled={pending} onClick={()=>void save(null)}>{es?'Restablecer aeropuertos':'Reset search airports'}</EasyTButton>:null}</div>
  </form>:null}
 </div>;
}
