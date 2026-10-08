"use client";
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, GripVertical, Plus, SlidersHorizontal } from 'lucide-react';
import { EasyTButton, EasyTSelect, EasyTSegmentedControl } from '@/components/easyt/easyt-controls';
import { CanonicalPlaceAutocomplete } from '@/components/easyt/canonical-place-autocomplete';
import { MorroviaDatePicker } from '@/components/easyt/morrovia-date-picker';
import { MorroviaQuantitySelector } from '@/components/easyt/morrovia-quantity-selector';
import { MorroviaDestinationField, MorroviaDestinationTag, destinationAddClassName } from '@/components/easyt/morrovia-destination-field';
import type { CanonicalEasyTTrip, DestinationIntent } from '@/lib/easyt/trip';
import type { BuilderInputDraft } from '@/lib/easyt/trip-builder-input-draft';
import type { CanonicalPlaceSuggestion } from '@/lib/easyt/place-intelligence';
import styles from './trip-builder-top-controls.module.css';
import { builderChipOccurrenceOrder } from '@/lib/easyt/trip-builder-order';
import { useBuilderStopReorder } from './use-builder-stop-reorder';

type Type= 'return_to_start'|'one_way';
const noChipPreview=()=>{};
export function TripBuilderTopControls({trip,draft,language,disabled=false,onType,onOriginInput,onOriginSelect,onOriginClear,onDates,onDateInput,onTravellers,onBudget,onAdd,onEditIntent,onRemoveIntent,onIntentInput,onIntentSelect,personalize,originReview,destinationReview,dateReview,onUpdateRoute,updatingRoute=false,onReorder,fixedOrder=false,onConfirmSavedFinish}:{
 trip:CanonicalEasyTTrip;draft:BuilderInputDraft;language:'en'|'es';disabled?:boolean;
 onType:(type:Type)=>void;onOriginInput:(raw:string)=>void;onOriginSelect:(place:CanonicalPlaceSuggestion)=>void;onOriginClear:()=>void;
 onDates:(start:string,end:string)=>void;onDateInput:(field:"startDate"|"endDate",raw:string)=>void;onTravellers:(n:number)=>void;onBudget:(budget:CanonicalEasyTTrip['brief']['budgetBand'])=>void;
 onAdd:()=>void;onEditIntent:(intent:DestinationIntent)=>boolean;onRemoveIntent:(intent:DestinationIntent)=>void;
 onIntentInput:(id:string,raw:string)=>void;onIntentSelect:(intent:DestinationIntent,place:CanonicalPlaceSuggestion)=>boolean;
 personalize:ReactNode;originReview?:ReactNode;destinationReview?:ReactNode;dateReview?:ReactNode;onUpdateRoute?:()=>void;updatingRoute?:boolean;onReorder?:(ids:readonly string[])=>boolean;fixedOrder?:boolean;onConfirmSavedFinish?:()=>void;
}) {
 const es=language==='es';const route=trip.brief.intent.route;
 const [editingId,setEditingId]=useState<string|null>(()=>draft.fields.find(f=>f.binding.kind==='destination'&&f.status==='editable')?.binding.kind==='destination' ? (draft.fields.find(f=>f.binding.kind==='destination'&&f.status==='editable')!.binding as {intentId:string}).intentId:null);
 const nodes=useRef(new Map<string,HTMLLIElement>());const focusId=useRef<string|null>(null);
 const chipOccurrences=builderChipOccurrenceOrder(route,route.destinations.map(intent=>intent.id));
 const canReorder=Boolean(chipOccurrences&&onReorder&&!disabled&&!fixedOrder&&!editingId);
 const sourceIds=chipOccurrences?route.orderedStopIds:[];
 const reorder=useBuilderStopReorder({stopIds:sourceIds,lockedStopIds:trip.brief.scheduleLocks?.stopIds??[],fixedOrder:!canReorder,onPreview:noChipPreview,onCommit:ids=>Boolean(onReorder?.(ids)),targetAttribute:'data-builder-chip-index'});
 // Stable drop targets avoid moving the native drag source under the pointer.
 const displayedIntents=chipOccurrences?sourceIds.map(id=>route.destinations.find(intent=>intent.stopIds[0]===id)!):route.destinations;
 useEffect(()=>{if(focusId.current){const node=nodes.current.get(focusId.current);(node?.querySelector<HTMLInputElement>('input[role="combobox"]')??node?.querySelector<HTMLButtonElement>('button'))?.focus();focusId.current=null}},[editingId,trip]);
 const originField=draft.fields.find(f=>f.binding.kind==='origin'&&f.status==='editable');
 const days=Math.round((Date.parse(trip.endDate)-Date.parse(trip.startDate))/86400000)+1;
 return <section className={styles.root} aria-label={es?'Detalles del viaje':'Journey details'} data-builder-top-controls>
  <EasyTSegmentedControl<Type|"unknown_legacy"> ariaLabel={es?'Tipo de viaje':'Trip type'} value={route.tripType} onChange={type=>{if(type!=='unknown_legacy')onType(type)}} disabled={disabled}
    options={[{value:'return_to_start',label:es?'Volver al inicio':'Return to start'},{value:'one_way',label:es?'Solo ida':'One way'}]} />
  {route.tripType==='unknown_legacy'?<p className={styles.context}>{es?'El final de este viaje guardado no está confirmado.':'This saved trip’s ending is unconfirmed.'}</p>:route.journeyEnd.mode==='explicit'?<p className={styles.context}>{es?'Final guardado':'Saved finish'}: <strong>{route.journeyEnd.place.name}</strong>{!route.journeyEnd.place.coordinates&&onConfirmSavedFinish?<EasyTButton variant="quiet" size="small" disabled={disabled} onClick={onConfirmSavedFinish}>{es?'Confirmar final guardado':'Confirm saved finish'}</EasyTButton>:null}</p>:null}
  <div id="builder-origin" className={styles.origin}><span className={styles.label}>{es?"Salida desde":"Starting from"}</span><CanonicalPlaceAutocomplete language={language} label={es?'Salida desde':'Starting from'} placeholder={es?'Ciudad o lugar de salida':'City or departure place'} value={originField?.raw??route.origin?.name??''}
    disabled={disabled} requireCoordinates showPlaceType={false}
    onChange={onOriginInput} onSelect={onOriginSelect} onClear={onOriginClear} /></div>
  {originReview}
  <MorroviaDestinationField label={es?'Lugares que quieres visitar':'Places you want to visit'}
    status={route.destinations.some(intent=>intent.resolution!=='resolved')?(es?'Algunos lugares necesitan confirmación.':'Some places need confirmation.'):undefined}
    addAction={<EasyTButton className={destinationAddClassName} icon={Plus} variant="secondary" disabled={disabled} onClick={onAdd}>{es?'Añadir destino':'Add destination'}</EasyTButton>}>
    {displayedIntents.map((intent,index)=>{
      const field=draft.fields.find(f=>f.binding.kind==='destination'&&f.binding.intentId===intent.id);
      const label=intent.selectedPlace?.name??intent.sourceText;
      const repeated=route.destinations.filter(other=>(other.selectedPlace?.name??other.sourceText)===label).length>1;
      const reorderLabel=`${es?'Reordenar':'Reorder'} ${label}${repeated?`, ${es?'parada':'stop'} ${route.orderedStopIds.indexOf(intent.stopIds[0])+1}`:''}`;
      return <MorroviaDestinationTag key={intent.id} id={intent.id} ref={node=>{if(node)nodes.current.set(intent.id,node);else nodes.current.delete(intent.id)}}
        label={label} disabled={disabled} removeDisabled={intent.stopIds.some(id=>trip.brief.scheduleLocks?.stopIds.includes(id))}
        reorderGrip={canReorder?<EasyTButton variant="quiet" icon={GripVertical} iconOnly className={`${styles.grip} ${reorder.previewIds?.[index]===reorder.draggingId?styles.dropTarget:''}`} disabled={trip.brief.scheduleLocks?.stopIds.includes(intent.stopIds[0])} aria-label={reorderLabel} {...reorder.gripProps(intent.stopIds[0])}>{reorderLabel}</EasyTButton>:undefined}
        reorderProps={canReorder?{'data-builder-chip-index':index,onDragOver:event=>{event.preventDefault();reorder.previewActiveAt(index)},onDrop:event=>{event.preventDefault();reorder.drop()}}:undefined}
        editLabel={`${es?'Editar':'Edit'} ${label}`} removeLabel={`${es?'Quitar':'Remove'} ${label}`}
        onEdit={()=>{if(onEditIntent(intent)){focusId.current=intent.id;setEditingId(intent.id)}}} onRemove={()=>onRemoveIntent(intent)}
        editor={editingId===intent.id?<div onKeyDown={event=>{if(event.key==='Escape'){event.preventDefault();focusId.current=intent.id;setEditingId(null)}}}>
          <CanonicalPlaceAutocomplete autoFocus language={language} label={es?'Destino':'Destination'} placeholder={es?'Ciudad o lugar':'City or place'} value={field?.status==='editable'?field.raw:label}
            disabled={disabled||field?.status==='binding-conflict'} requireCoordinates searchIntent="route-stop"
            onChange={raw=>onIntentInput(intent.id,raw)} onSelect={place=>{if(onIntentSelect(intent,place)){focusId.current=intent.id;setEditingId(null)}}} />
        </div>:undefined} />;
    })}
  </MorroviaDestinationField>
  <span className="sr-only" aria-live="polite">{reorder.draggingId ? `${es?'Moviendo':'Moving'} ${trip.stops.find(stop=>stop.id===reorder.draggingId)?.name} ${es?'a la parada':'to stop'} ${(reorder.previewIds??sourceIds).indexOf(reorder.draggingId)+1}` : ''}</span>
  {destinationReview}
  <div className={styles.details}>
   <div><MorroviaDatePicker mode="range" locale={language} combinedLabel={es?'Fechas del viaje':'Travel dates'} startLabel={es?'Fecha de inicio':'Start date'} endLabel={es?'Fecha final':'End date'}
    startValue={trip.startDate} endValue={trip.endDate} disabled={disabled}
    typedDraft={{start:draft.fields.find(f=>f.binding.kind==="date"&&f.binding.field==="startDate"&&f.status==="editable")?.raw??"",end:draft.fields.find(f=>f.binding.kind==="date"&&f.binding.field==="endDate"&&f.status==="editable")?.raw??""}}
    onTypedDraftChange={(boundary,raw)=>onDateInput(boundary==="start"?"startDate":"endDate",raw)} onChange={range=>onDates(range.start,range.end)} />{dateReview}</div>
   <MorroviaQuantitySelector compact label={es?'Viajeros':'Travellers'} locale={language} noun={es?'viajero':'traveller'} nounPlural={es?'viajeros':'travellers'} value={trip.travellers} min={1} max={12} disabled={disabled} onChange={onTravellers} />
   <EasyTSelect label={es?'Presupuesto':'Budget'} value={trip.brief.budgetBand} disabled={disabled} onChange={event=>onBudget(event.target.value as CanonicalEasyTTrip['brief']['budgetBand'])}>
    <option value="value">{es?'Ajustado':'Value'}</option><option value="mid">{es?'Medio':'Mid-range'}</option><option value="high">{es?'Alto':'High'}</option>
   </EasyTSelect>
  </div>
  <details className={styles.personalize}><summary><SlidersHorizontal aria-hidden="true"/><span><strong>{es?'Personalizar':'Personalize'} <small>({es?'opcional':'optional'})</small></strong><small>{es?'Intereses, ritmo y preferencias':'Interests, pace and preferences'}</small></span><ChevronDown aria-hidden="true"/></summary><div>{personalize}</div></details>
  <div className={styles.actions}><span>{days} {es?'días':'days'}</span><EasyTButton icon={ArrowRight} loading={updatingRoute} disabled={disabled||!onUpdateRoute} onClick={onUpdateRoute}>{es?'Actualizar ruta':'Update route'}</EasyTButton></div>
 </section>;
}
