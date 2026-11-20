"use client";

import { useWorkspaceOrientationTarget } from "./workspace-orientation";

import { useEffect, useMemo, useState } from 'react';
import { BedDouble, CalendarDays, ChevronRight, Compass, Route } from 'lucide-react';
import type { EasyTTrip } from '@/lib/easyt/trip';
import { tripToday, transportDate } from '@/lib/easyt/trip-today';
import { formatIsoDate } from '@/lib/easyt/trip-lifecycle';
import { exploreWorkspaceHref, itineraryWorkspaceHref, stayWorkspaceHref, transportWorkspaceHref } from '@/lib/easyt/trip-workspace-links';
import { itineraryActivityImage, itineraryPresentationImages } from '@/lib/easyt/itinerary-presentation-images';
import { activityStartTimeLabel, isFullDayActivity } from '@/lib/easyt/itinerary-schedule-awareness';
import { languageFromStorage, EASYT_LANGUAGE_CHANGE_EVENT } from '@/lib/easyt/i18n';
import { EasyTLinkButton, EasyTSelect } from './easyt-controls';
import ItineraryDayPhoto from './itinerary-day-photo';
import { MorroviaSectionStatus } from './morrovia-loading-states';
import heading from './trip-workspace-heading.module.css';
import styles from './trip-today-workspace.module.css';

export type TripTodayWorkspaceProps={trip:EasyTTrip|null;now?:Date;previewDayId?:string|null;onPreviewDay?:(id:string|null)=>void;language?:'en'|'es'};
const labels={en:{today:'Today',preview:'Day preview',day:'Day',plans:'Your plans',tonight:'Tonight',transport:'Next transport',itinerary:'View itinerary',stay:'Open Stay',openTransport:'Open Transport',flexible:'Flexible',savedDate:'Saved date',noPlans:'No plans saved for this day',findActivity:'Find activity',noTransport:'No upcoming transport saved',choose:'Choose a trip day',noTrip:'No active trip selected',trips:'My trips',itineraryNeeded:'No itinerary saved',dates:'Trip dates to confirm',dateUnknown:'Local date to confirm',chooseDay:'Choose a trip day',dayMissing:'No itinerary day saved for today',noStay:'No stay selected',outside:'No trip day today',invalid:'This day is not available',overnight:'Overnight transport recorded',timing:'Timing to confirm',overnightAlso:'Transport also spans this night',noNight:'No overnight stay planned',booked:'Booked',marked:'Marked booked',saved:'Saved booking · check details',allDay:'Full day',notes:'Notes'},es:{today:'Hoy',preview:'Vista del día',day:'Día',plans:'Tus planes',tonight:'Esta noche',transport:'Próximo transporte',itinerary:'Ver itinerario',stay:'Abrir alojamiento',openTransport:'Abrir transporte',flexible:'Flexible',savedDate:'Fecha guardada',noPlans:'No hay planes guardados para este día',findActivity:'Buscar actividad',noTransport:'No hay próximo transporte guardado',choose:'Elige un día del viaje',noTrip:'Ningún viaje activo seleccionado',trips:'Mis viajes',itineraryNeeded:'No hay un itinerario guardado',dates:'Fechas por confirmar',dateUnknown:'Fecha local por confirmar',chooseDay:'Elige un día del viaje',dayMissing:'No hay un día de itinerario guardado para hoy',noStay:'Ningún alojamiento seleccionado',outside:'Hoy no hay un día de viaje',invalid:'Este día no está disponible',overnight:'Transporte nocturno registrado',timing:'Horario por confirmar',overnightAlso:'El transporte también abarca esta noche',noNight:'No hay alojamiento nocturno previsto',booked:'Reservado',marked:'Marcado como reservado',saved:'Reserva guardada · revisa los datos',allDay:'Día completo',notes:'Notas'}};
const parts={en:{morning:'Morning',midday:'Midday',afternoon:'Afternoon',evening:'Evening'},es:{morning:'Mañana',midday:'Mediodía',afternoon:'Tarde',evening:'Noche'}};

/** Only display state and clock state live here; all trip edits belong to the linked workspaces. */
export default function TripTodayWorkspace({trip,now,previewDayId,onPreviewDay,language:suppliedLanguage}:TripTodayWorkspaceProps){
  const headerGuideRef = useWorkspaceOrientationTarget("today", "today-header");
  const locationGuideRef = useWorkspaceOrientationTarget("today", "today-content");
 const [clock,setClock]=useState<Date|null>(now??null);
 const [localPreview,setLocalPreview]=useState<string|null>(null);
 const [language,setLanguage]=useState<'en'|'es'>(suppliedLanguage??'en');
 useEffect(()=>{if(suppliedLanguage)return;const update=()=>setLanguage(languageFromStorage());update();window.addEventListener(EASYT_LANGUAGE_CHANGE_EVENT,update);return()=>window.removeEventListener(EASYT_LANGUAGE_CHANGE_EVENT,update);},[suppliedLanguage]);
 useEffect(()=>{if(now){setClock(now);return;}const update=()=>setClock(new Date());update();const timer=window.setInterval(update,60000);document.addEventListener('visibilitychange',update);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',update);};},[now]);
 const selected=previewDayId===undefined?localPreview:previewDayId;
 const choose=(id:string|null)=>{if(onPreviewDay)onPreviewDay(id);else setLocalPreview(id);};
 const model=useMemo(()=>tripToday(trip,clock??new Date(NaN),selected),[trip,clock,selected]);
 const images=useMemo(()=>trip?itineraryPresentationImages(trip):null,[trip]);
 const copy=labels[language];
 const isPreview=model.state==='preview';
 const date=(value:string|null|undefined)=>formatIsoDate(value,language,{weekday:'short',day:'numeric',month:'short'})??copy.timing;
 if(trip&&!clock)return <MorroviaSectionStatus title={language==='es'?'Abriendo Hoy':'Opening Today'} />;
 const day=model.day,stop=model.stop,active=Boolean(day&&stop);
 const itineraryHref=trip?itineraryWorkspaceHref(trip.id,day?.dayNumber):'/journey/dashboard';
 const fallback=model.state==='no-trip'?copy.noTrip:model.state==='dates-needed'?copy.dates:model.state==='itinerary-needed'?copy.itineraryNeeded:model.state==='date-uncertain'?copy.dateUnknown:model.state==='choose-day'?copy.chooseDay:model.state==='invalid-preview'?copy.invalid:model.state==='day-missing'?copy.dayMissing:copy.outside;
 const transport=model.transport;
 const nextTransportDate=transport?transportDate(transport):null;
 const transportStatus=transport?.booking?.confirmation?copy.booked:transport?.manualBooking?.travellerMarkedBooked?copy.marked:transport?.booking?copy.saved:null;
 const notes=trip&&day?trip.brief.dayNotes?.[day.dayNumber]:undefined;
 const activityRows=model.activities.map((activity,index)=>({activity,index,time:activityStartTimeLabel(activity.startsAt)})).sort((a,b)=>a.time&&b.time?a.time.localeCompare(b.time):a.time?-1:b.time?1:a.index-b.index);
 return <section className={styles.workspace} aria-labelledby="today-heading" data-today-state={model.state}>
   <header ref={headerGuideRef} className={`${styles.header} ${isPreview?styles.previewHeader:''}`}>
     <div><h2 id="today-heading" className={isPreview?'sr-only':undefined}>{isPreview?copy.preview:copy.today}</h2>{day?<p><time dateTime={day.date}>{date(day.date)}</time></p>:null}</div>
     {day?<span className={styles.dayLabel}>{copy.day} {day.dayNumber}</span>:null}
   </header>
   {active&&trip&&day&&stop?<>
     <section ref={locationGuideRef} className={styles.location} aria-label={stop.name}>
       <div className={styles.locationIdentity}>
         <h3>{stop.name}</h3>
         <EasyTLinkButton href={itineraryHref} icon={CalendarDays} variant="secondary" size="small">{copy.itinerary}</EasyTLinkButton>
       </div>
       <ItineraryDayPhoto image={images?.stopById[stop.id]??null} destination={stop.name} language={language} className={styles.locationPhoto} sizes="(max-width: 380px) calc(100vw - 24px), (max-width: 392px) calc(100vw - 32px), 360px" />
     </section>
     <div className={styles.columns}>
       <section className={styles.plans} aria-labelledby="today-plans"><h3 id="today-plans" className={heading.sectionTitle}>{copy.plans}</h3>
         {activityRows.length?<ol className={styles.agenda}>{activityRows.map(({activity,time})=><li key={activity.id} data-start-time={time||undefined}>
           <div className={styles.activityText}><EasyTLinkButton className={styles.activityLink} href={itineraryHref} variant="quiet" aria-label={`${language==='es'?'Ver plan':'View plan'}: ${activity.title}`}><span className={styles.schedule}>{isFullDayActivity(activity.providerMetadata?.duration)?[copy.allDay,time].filter(Boolean).join(' · '):time??(activity.dayPart?parts[language][activity.dayPart]:copy.flexible)}</span><h4>{activity.title}</h4>{activity.booking?<p>{activity.booking.confirmation?copy.booked:copy.saved}</p>:null}</EasyTLinkButton></div>
           <ItineraryDayPhoto compact image={itineraryActivityImage(activity,stop)} destination={stop.name} language={language} className={styles.activityPhoto} sizes="(max-width: 760px) 32vw, 220px" />
         </li>)}</ol>:<div className={styles.emptyPlans}>
           <p className={styles.empty}>{copy.noPlans}</p>
           <EasyTLinkButton href={exploreWorkspaceHref(trip.id,stop.id,day.dayNumber)} icon={Compass} variant="secondary" size="small">{copy.findActivity}</EasyTLinkButton>
         </div>}
         {notes?<section className={styles.notes} aria-label={copy.notes}><h4>{copy.notes}</h4><ul>{notes.map((note,index)=><li key={index}>{note}</li>)}</ul></section>:null}
       </section>
       <aside className={styles.context}>
         <section className={styles.contextSection} aria-labelledby="today-stay"><h3 id="today-stay" className={heading.sectionTitle}><BedDouble aria-hidden="true"/>{copy.tonight}</h3>
           <div className={styles.contextContent}>{model.overnightTransport&&model.composition?.tonight.booking==null?<><h4>{copy.overnight}</h4><p>{date(transportDate(model.overnightTransport))} – {date(model.overnightTransport.booking?.endDate??model.overnightTransport.booking?.importDetails?.endDate)}</p><p>{copy.timing}</p><EasyTLinkButton href={transportWorkspaceHref(trip.id,model.overnightTransport.leg.id)} size="small" variant="secondary">{copy.openTransport}<ChevronRight aria-hidden="true"/></EasyTLinkButton></>:<>
             <h4>{model.stay?.state==='missing'||model.stay?.state==='unknown'?copy.noStay:model.stay?.title??copy.noNight}</h4>{model.stay?.detail?<p>{language==='es'?(model.stay.state==='booked'?copy.booked:model.stay.state==='selected'?'Seleccionado · sin reservar':'Datos por confirmar'):model.stay.detail}</p>:null}
             {model.overnightTransport?<p>{copy.overnightAlso}</p>:null}
             {model.composition?.tonight.stopId?<EasyTLinkButton href={stayWorkspaceHref(trip.id,stop.id)} variant="secondary" size="small">{copy.stay}<ChevronRight aria-hidden="true"/></EasyTLinkButton>:null}
           </>}</div>
         </section>
         <section className={styles.contextSection} aria-labelledby="today-transport"><h3 id="today-transport" className={heading.sectionTitle}><Route aria-hidden="true"/>{nextTransportDate&&!model.overnightTransport?copy.transport:language==='es'?'Transporte':'Transport'}</h3>
           <div className={styles.contextContent}>{transport?<><h4>{transport.from.name} → {transport.to.name}</h4>{nextTransportDate?<p>{transport.booking?`${copy.savedDate} · `:''}{date(nextTransportDate)}{model.overnightTransport?` – ${date(transport.booking?.endDate??transport.booking?.importDetails?.endDate)}`:''}</p>:null}{transportStatus?<p>{transportStatus}</p>:null}<EasyTLinkButton href={transportWorkspaceHref(trip.id,transport.leg.id)} variant="secondary" size="small">{copy.openTransport}<ChevronRight aria-hidden="true"/></EasyTLinkButton></>:<p className={styles.empty}>{copy.noTransport}</p>}</div>
         </section>
       </aside>
     </div>
   </>:<section className={styles.fallback} aria-label={fallback}><h3 className={heading.sectionTitle}>{fallback}</h3>
       {model.choices.length?<EasyTSelect label={copy.choose} aria-label={copy.choose} labelClassName={model.state==='choose-day'?'sr-only':undefined} value="" onChange={event=>choose(event.target.value||null)}><option value="">{copy.choose}</option>{model.choices.map(d=><option key={d.id} value={d.id}>{date(d.date)} · {copy.day} {d.dayNumber} · {trip?.stops.find(s=>s.id===d.stopId)?.name}</option>)}</EasyTSelect>:null}
       <EasyTLinkButton href={itineraryHref} variant="secondary">{trip?copy.itinerary:copy.trips}<ChevronRight aria-hidden="true"/></EasyTLinkButton>
   </section>}
 </section>;
}
