"use client";
import { forwardRef, type ReactNode, type HTMLAttributes } from 'react';
import { MapPin, X } from 'lucide-react';
import { EasyTButton } from './easyt-controls';
import styles from './morrovia-destination-field.module.css';

/** Shared accepted homepage presentation. Callers retain input, identity and focus ownership. */
export function MorroviaDestinationField({label,children,addAction,status,homepage=false}:{label:string;children:ReactNode;addAction?:ReactNode;status?:ReactNode;homepage?:boolean}) {
 return <section className={styles.root} aria-label={label}>
  <span data-morrovia-field-label className={styles.label}>{label}</span>
  <div className={styles.destinationField} data-home-destination-field={homepage?true:undefined}>
   <ul className={styles.entries}>{children}</ul>{addAction}
  </div>
  {status?<p className={styles.status} aria-live="polite">{status}</p>:null}
 </section>;
}
export const MorroviaDestinationTag=forwardRef<HTMLLIElement,{id:string;stopId?:string;label:string;editor?:ReactNode;disabled?:boolean;removeDisabled?:boolean;onEdit:()=>void;onRemove:()=>void;editLabel:string;removeLabel:string;homepage?:boolean;reorderGrip?:ReactNode;reorderProps?:HTMLAttributes<HTMLLIElement> & {'data-builder-chip-index'?:number}}>(function MorroviaDestinationTag({id,stopId,label,editor,disabled,removeDisabled,onEdit,onRemove,editLabel,removeLabel,homepage,reorderGrip,reorderProps},ref){
 return <li {...reorderProps} ref={ref} className={`${styles.entry} ${editor?styles.editing:''}`} data-destination-stop-id={stopId} data-home-destination-entry={homepage?id:undefined} data-destination-intent-id={homepage?undefined:id}>
  {reorderGrip}
  {editor?<div className={styles.field}>{editor}</div>:<EasyTButton className={styles.chip} icon={MapPin} variant="secondary" disabled={disabled} aria-label={editLabel} onClick={onEdit}>{label}</EasyTButton>}
  <EasyTButton icon={X} iconOnly variant="quiet" className={styles.remove} disabled={disabled||removeDisabled} aria-label={removeLabel} onClick={onRemove}>{removeLabel}</EasyTButton>
 </li>;
});
export const destinationAddClassName=styles.add;
