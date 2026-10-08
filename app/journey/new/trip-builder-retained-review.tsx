"use client";
import {useState} from 'react';
import {EasyTButton,EasyTSelect} from '@/components/easyt/easyt-controls';
import {MorroviaConfirmationDialog,MorroviaStatusBanner} from '@/components/easyt/morrovia-feedback';
import {authoredContentKey,retainedAuthoredContentForReview,type RetainedContentSelection} from '@/lib/easyt/trip-retained-authored-content';
import {isGooglePlaceReferenceIdea,type CanonicalEasyTTrip} from '@/lib/easyt/trip';
import styles from './trip-builder-retained-review.module.css';
export function TripBuilderRetainedReview({trip,language,onMove,onRemove}:{trip:CanonicalEasyTTrip;language:'en'|'es';onMove:(selection:RetainedContentSelection,target:{stopId:string;dayId:string})=>boolean;onRemove:(selection:RetainedContentSelection)=>boolean}){
 const es=language==='es';const [targets,setTargets]=useState<Record<string,string>>({});const [removal,setRemoval]=useState<{selection:RetainedContentSelection;label:string}|null>(null);const [error,setError]=useState(false);
 const dayPart=(part:string)=>es?({morning:'Mañana',midday:'Mediodía',afternoon:'Tarde',evening:'Noche',anytime:'Cualquier hora'}[part]??part):part;
 const location=(longitude:number,latitude:number)=><p><a href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`} target="_blank" rel="noreferrer">{es?'Ver ubicación guardada':'View saved location'}</a></p>;
 const entries=retainedAuthoredContentForReview(trip);
 if(!entries.length)return null;
 const actions=(selection:RetainedContentSelection,label:string)=>{
  const key=authoredContentKey(selection);const target=trip.planItems.find(day=>day.id===targets[key]);
  return <div className={styles.actions}><EasyTSelect label={`${es?'Mover':'Move'} ${label} ${es?'a':'to'}`} value={target?.id??''} onChange={event=>setTargets(current=>({...current,[key]:event.target.value}))}>
   <option value="">{es?'Elegir un día existente':'Choose an existing day'}</option>{trip.planItems.map(day=><option key={day.id} value={day.id}>{day.date} · {trip.stops.find(stop=>stop.id===day.stopId)?.name} · {day.title}</option>)}
  </EasyTSelect><EasyTButton variant="secondary" disabled={!target} onClick={()=>{setError(!onMove(selection,{stopId:target!.stopId,dayId:target!.id}))}}>{es?'Mover contenido':'Move content'}</EasyTButton><EasyTButton variant="quiet" onClick={()=>setRemoval({selection,label})}>{es?'Eliminar contenido':'Remove content'}<span className="sr-only"> {label}</span></EasyTButton></div>;
 };
 return <section className={styles.root} aria-label={es?'Contenido conservado':'Retained trip content'}>
  <details className={styles.review}><summary>{es?'Revisar contenido guardado':'Review saved content'} ({entries.length})</summary><div>
  <p className={styles.notice}>{es?'El contenido afectado por los cambios de ruta sigue guardado.':'Content affected by route changes is still saved.'}</p>
  {error?<MorroviaStatusBanner tone="warning" title={es?'Este contenido sigue conservado':'This content remains retained'} detail={es?'No se pudo aplicar el cambio. Revisa el contenido y el día elegido antes de volver a intentarlo.':'The change could not be applied. Review the content and selected day before trying again.'}/>:null}
  {entries.map(entry=><details key={entry.id} className={styles.entry}><summary>{entry.sourceStop.name} · {entry.sourceStop.country}{entry.sourceKind==='retired_day'?(es?' · Día retirado':' · Retired day'):null}</summary><div>
   {entry.days.map(({sourceDay:day,dayNotes,customActivities})=><article key={day.id}><h3>{day.title}</h3><p>{day.date} · {es?'Día original':'Original day'} {day.dayNumber}{day.startsAt?` · ${day.startsAt}`:''}{day.endsAt?` – ${day.endsAt}`:''}</p><p>{day.reason}</p>
    <ul>{day.notes.map((note,index)=><li key={index}>{day.noteDayParts?.[index]?`${dayPart(day.noteDayParts[index]!)} · `:''}{note}</li>)}</ul>
    {[...(day.contextNotes??[]),...(dayNotes??[]),...(customActivities??[])].map((note,index)=><p key={index}>{note}</p>)}
    {day.longitude!==null&&day.latitude!==null?location(day.longitude,day.latitude):null}
    {day.bookingUrl?<a href={day.bookingUrl} target="_blank" rel="noreferrer">{es?'Reserva guardada':'Saved booking'}</a>:null}{day.sourceUrl?<p><a href={day.sourceUrl} target="_blank" rel="noreferrer">{es?'Fuente guardada':'Saved source'}</a></p>:null}
    {actions({entryId:entry.id,expectedContentKey:authoredContentKey(entry),dayIds:[day.id]},day.title)}
   </article>)}
   {entry.itineraryIdeas.map(idea=><article key={idea.id}><h3>{isGooglePlaceReferenceIdea(idea)?`${idea.providerReference.provider} · ${idea.providerReference.placeId}`:idea.title}</h3>
    {isGooglePlaceReferenceIdea(idea)?<><p>{idea.userNote}</p><p>{idea.providerReference.lastResolvedAt}</p></>:<><p>{idea.description}</p><p>{idea.area} {idea.placeType} {idea.startsAt}</p><p>{idea.provider} {idea.providerProductId}</p>{idea.providerMetadata?.duration?<p>{idea.providerMetadata.duration.fixedMinutes??[idea.providerMetadata.duration.fromMinutes,idea.providerMetadata.duration.toMinutes].filter(value=>value!==undefined).join('–')} {es?'minutos':'minutes'}</p>:null}{idea.providerMetadata?.price?<p>{idea.providerMetadata.price.amount} {idea.providerMetadata.price.currency}</p>:null}{idea.providerMetadata?.rating!==undefined?<p>{idea.providerMetadata.rating} · {idea.providerMetadata.reviewCount!==undefined?`${idea.providerMetadata.reviewCount} ${es?'opiniones':'reviews'}`:''}</p>:null}{idea.providerMetadata?.provenance?<p>{idea.providerMetadata.provenance.provider} · {idea.providerMetadata.provenance.checkedAt}</p>:null}{idea.sourceUrl?<a href={idea.sourceUrl} target="_blank" rel="noreferrer">{es?'Fuente guardada':'Saved source'}</a>:null}</>}
    {!isGooglePlaceReferenceIdea(idea)&&idea.coordinates?location(idea.coordinates[0],idea.coordinates[1]):null}
    {idea.dayPart?<p>{dayPart(idea.dayPart)}</p>:null}{actions({entryId:entry.id,expectedContentKey:authoredContentKey(entry),ideaIds:[idea.id]},isGooglePlaceReferenceIdea(idea)?idea.providerReference.placeId:idea.title)}
   </article>)}
   {entry.mapPins.map(pin=><article key={pin.id}><h3>{pin.title}</h3><p>{es?'Día original':'Original day'} {pin.dayNumber} · {pin.category}</p>{location(pin.longitude,pin.latitude)}{actions({entryId:entry.id,expectedContentKey:authoredContentKey(entry),pinIds:[pin.id]},pin.title)}</article>)}
  </div></details>)}
  </div></details>
  <MorroviaConfirmationDialog open={Boolean(removal)} title={es?'¿Eliminar este contenido conservado?':'Remove this retained content?'} detail={removal?.label??''} consequences={[es?'Solo se eliminará el contenido seleccionado.':'Only the selected content will be removed.']} cancelLabel={es?'Conservar contenido':'Keep content'} confirmLabel={es?'Eliminar contenido seleccionado':'Remove selected content'} onCancel={()=>setRemoval(null)} onConfirm={()=>{if(removal)setError(!onRemove(removal.selection));setRemoval(null)}}/>
 </section>;
}
