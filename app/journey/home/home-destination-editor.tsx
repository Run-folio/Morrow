"use client";

import { Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import { homepageDestinationAddTarget, removeHomepageDestination, type HomepageDestinationEntry } from "@/lib/easyt/home-trip-handoff";
import { isOvernightBaseEligible, type CanonicalPlaceSuggestion } from "@/lib/easyt/place-intelligence";
import { MorroviaDestinationField, MorroviaDestinationTag, destinationAddClassName } from "@/components/easyt/morrovia-destination-field";

export function HomeDestinationEditor({ entries, language, disabled = false, focusEntryId, createEntry, onChange }: {
  entries: HomepageDestinationEntry[]; language: EasyTLanguage; disabled?: boolean;
  focusEntryId?: string | null; createEntry?: () => HomepageDestinationEntry;
  onChange: (entries: HomepageDestinationEntry[]) => void;
}) {
  const es = language === "es";
  const [editingId, setEditingId] = useState<string | null>(() => entries.find(entry => !entry.selection)?.id ?? null);
  const nodes = useRef(new Map<string, HTMLElement>());
  const addRef = useRef<HTMLButtonElement>(null);
  const latest = useRef({ entries, disabled, onChange });
  latest.current = { entries, disabled, onChange };
  const focusTarget = useRef<string | null>(null);
  const externalFocus = useRef<string | null>(null);
  useEffect(() => {
    if (focusEntryId && focusEntryId !== externalFocus.current) {
      externalFocus.current = focusEntryId;
      setEditingId(focusEntryId);
      focusTarget.current = focusEntryId;
    }
  }, [focusEntryId]);
  useEffect(() => {
    if (!focusTarget.current) return;
    const id = focusTarget.current;
    focusTarget.current = null;
    const node = nodes.current.get(id);
    (node?.querySelector<HTMLInputElement>('input[role="combobox"]') ?? node?.querySelector<HTMLButtonElement>("button") ?? addRef.current)?.focus();
  }, [entries, editingId]);
  const replace = (id: string, update: (entry: HomepageDestinationEntry) => HomepageDestinationEntry) => {
    const current = latest.current;
    if (current.disabled || !current.entries.some(entry => entry.id === id)) return;
    current.onChange(current.entries.map(entry => entry.id === id ? update(entry) : entry));
  };
  const select = (id: string, selection: CanonicalPlaceSuggestion) => {
    if (latest.current.disabled || !latest.current.entries.some(entry => entry.id === id)) return;
    replace(id, entry => ({ ...entry, text: selection.label, selection }));
    focusTarget.current = id;
    setEditingId(null);
  };
  const unconfirmed = entries.filter(entry => entry.text.trim() && !entry.selection).length;
  const areas = entries.filter(entry => entry.selection?.routability === "planning_area").length;
  const anchors = entries.filter(entry => entry.selection && entry.selection.routability !== "planning_area" && !isOvernightBaseEligible({ placeType: entry.selection.placeType, routability: entry.selection.routability ?? (entry.selection.placeType === "city" || entry.selection.placeType === "town" ? "direct_destination" : "anchor_or_poi") })).length;
  return <MorroviaDestinationField homepage label={es ? "Lugares que quieres visitar" : "Places you want to visit"}
    status={unconfirmed || areas || anchors ? [
      unconfirmed ? `${unconfirmed} ${es ? "sin confirmar" : "unconfirmed"}` : "",
      areas ? `${areas} ${es ? "zonas de planificación" : "planning areas"}` : "",
      anchors ? `${anchors} ${es ? "lugares de interés" : "points of interest"}` : "",
    ].filter(Boolean).join(" · ") : undefined}
    addAction={createEntry ? <EasyTButton className={destinationAddClassName} ref={addRef} icon={Plus} variant="secondary" disabled={disabled}
      aria-label={es ? "Añadir destino" : "Add destination"} onClick={() => {
        const next = homepageDestinationAddTarget(latest.current.entries, createEntry);
        focusTarget.current = next.focusEntryId;
        setEditingId(next.focusEntryId);
        onChange(next.entries);
      }}>{es ? "Añadir destino" : "Add destination"}</EasyTButton> : null}>
    {entries.map((entry,index)=><MorroviaDestinationTag key={entry.id} id={entry.id} homepage
      ref={node=>{if(node)nodes.current.set(entry.id,node);else nodes.current.delete(entry.id)}}
      label={entry.selection?.name ?? (entry.text || (es ? "Destino" : "Destination"))} disabled={disabled}
      editLabel={`${es ? "Editar" : "Edit"} ${entry.text || (es ? "destino" : "destination")}`}
      removeLabel={`${es ? "Eliminar" : "Remove"} ${entry.text || (es ? "destino" : "destination")}`}
      onEdit={()=>{focusTarget.current=entry.id;setEditingId(entry.id)}}
      onRemove={()=>{
        const next=removeHomepageDestination(latest.current.entries,entry.id);
        focusTarget.current=next[Math.min(index,next.length-1)]?.id??"add";
        if(editingId===entry.id)setEditingId(null);
        onChange(next);
      }} editor={editingId===entry.id ? <div onKeyDown={event=>{
        if(event.key==="Enter")event.preventDefault();
        if(event.key==="Escape"){event.preventDefault();focusTarget.current=entry.id;setEditingId(null)}
      }}><CanonicalPlaceAutocomplete language={language} label={es ? "Destino" : "Destination"} value={entry.text}
        placeholder={es ? "Ciudad, país o región" : "City, country or region"} disabled={disabled}
        onChange={value=>replace(entry.id,current=>({...current,text:value,selection:null}))}
        onClear={()=>replace(entry.id,current=>({...current,text:"",selection:null}))}
        onSelect={suggestion=>select(entry.id,suggestion)} /></div> : undefined} />)}
  </MorroviaDestinationField>;
}
