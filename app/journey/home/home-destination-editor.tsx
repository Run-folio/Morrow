"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import { moveHomepageEntry, type HomepageDestinationEntry } from "@/lib/easyt/home-trip-handoff";
import { isOvernightBaseEligible, type CanonicalPlaceSuggestion, type PlaceRoutability } from "@/lib/easyt/place-intelligence";
import styles from "./home-destination-editor.module.css";

const MAX_ENTRIES = 5;

const copy = {
  en: {
    first: "First stop", next: "Next stop", placeholder: "City, country or region", add: "Add another stop", clear: "Clear", remove: "Remove", earlier: "Move earlier", later: "Move later",
    stop: "stop", stops: "stops", area: "planning area", areas: "planning areas", unconfirmed: "unconfirmed",
  },
  es: {
    first: "Primera parada", next: "Siguiente parada", placeholder: "Ciudad, país o región", add: "Añadir otra parada", clear: "Borrar", remove: "Eliminar", earlier: "Mover antes", later: "Mover después",
    stop: "parada", stops: "paradas", area: "zona de planificación", areas: "zonas de planificación", unconfirmed: "sin confirmar",
  },
} as const;

function selectionRoutability(selection: CanonicalPlaceSuggestion): PlaceRoutability {
  if (selection.routability) return selection.routability;
  if (selection.placeType === "city" || selection.placeType === "town") return "direct_destination";
  if (["continent", "country", "macro_region", "region", "sub_region", "island", "archipelago", "natural_area", "coast", "mountain_range", "valley", "travel_corridor"].includes(selection.placeType)) return "planning_area";
  return "anchor_or_poi";
}

export function HomeDestinationEditor({
  entries,
  language,
  disabled = false,
  createEntry,
  onChange,
}: {
  entries: HomepageDestinationEntry[];
  language: EasyTLanguage;
  disabled?: boolean;
  createEntry: () => HomepageDestinationEntry;
  onChange: (entries: HomepageDestinationEntry[]) => void;
}) {
  const text = copy[language];
  const entryNodes = useRef(new Map<string, HTMLElement>());
  const pendingFocusId = useRef<string | null>(null);

  useEffect(() => {
    const id = pendingFocusId.current;
    if (!id) return;
    pendingFocusId.current = null;
    entryNodes.current.get(id)?.querySelector<HTMLInputElement>('input[role="combobox"]')?.focus();
  }, [entries]);

  const commitWithFocus = (next: HomepageDestinationEntry[], focusId: string) => {
    pendingFocusId.current = focusId;
    onChange(next);
  };
  const replace = (id: string, update: (entry: HomepageDestinationEntry) => HomepageDestinationEntry) => {
    onChange(entries.map((entry) => entry.id === id ? update(entry) : entry));
  };
  const select = (id: string, selection: CanonicalPlaceSuggestion) => replace(id, (entry) => ({ ...entry, text: selection.label, selection }));
  const confirmed = entries.flatMap((entry) => entry.selection ? [{ selection: entry.selection, routability: selectionRoutability(entry.selection) }] : []);
  const stopCount = confirmed.filter(({ selection, routability }) => isOvernightBaseEligible({ placeType: selection.placeType, routability })).length;
  const planningAreaCount = confirmed.filter(({ routability }) => routability === "planning_area").length;
  const unconfirmedCount = entries.length - stopCount - planningAreaCount;
  const statusParts = [
    stopCount ? `${stopCount} ${stopCount === 1 ? text.stop : text.stops}` : "",
    planningAreaCount ? `${planningAreaCount} ${planningAreaCount === 1 ? text.area : text.areas}` : "",
    unconfirmedCount ? `${unconfirmedCount} ${text.unconfirmed}` : "",
  ].filter(Boolean);

  return <section className={styles.root} aria-label={language === "es" ? "Destinos del viaje" : "Trip destinations"}>
    <ol className={styles.entries}>
      {entries.map((entry, index) => <li
        className={styles.entry}
        data-home-destination-entry={entry.id}
        key={entry.id}
        ref={(node) => { if (node) entryNodes.current.set(entry.id, node); else entryNodes.current.delete(entry.id); }}
      >
        <span className={styles.index} aria-hidden="true">{index + 1}</span>
        <div className={styles.field}>
          <CanonicalPlaceAutocomplete
            language={language}
            label={index === 0 ? text.first : `${text.next} ${index + 1}`}
            value={entry.text}
            placeholder={text.placeholder}
            disabled={disabled}
            clearLabel={`${text.clear} ${index === 0 ? text.first.toLocaleLowerCase() : `${text.next.toLocaleLowerCase()} ${index + 1}`}`}
            onChange={(value) => replace(entry.id, (current) => ({ ...current, text: value, selection: null }))}
            onClear={() => replace(entry.id, (current) => ({ ...current, text: "", selection: null }))}
            onSelect={(suggestion) => select(entry.id, suggestion)}
          />
        </div>
        <div className={styles.actions}>
          <EasyTButton icon={ArrowUp} iconOnly size="small" variant="quiet" disabled={disabled || index === 0} aria-label={`${text.earlier.replace(/^./, (value) => value.toUpperCase())} ${language === "es" ? "la parada" : "stop"} ${index + 1}`} onClick={() => commitWithFocus(moveHomepageEntry(entries, entry.id, -1), entry.id)}>{text.earlier}</EasyTButton>
          <EasyTButton icon={ArrowDown} iconOnly size="small" variant="quiet" disabled={disabled || index === entries.length - 1} aria-label={`${text.later.replace(/^./, (value) => value.toUpperCase())} ${language === "es" ? "la parada" : "stop"} ${index + 1}`} onClick={() => commitWithFocus(moveHomepageEntry(entries, entry.id, 1), entry.id)}>{text.later}</EasyTButton>
          <EasyTButton icon={Trash2} iconOnly size="small" variant="quiet" disabled={disabled || entries.length === 1} aria-label={`${text.remove} ${language === "es" ? "la parada" : "stop"} ${index + 1}`} onClick={() => {
            const next = entries.filter((candidate) => candidate.id !== entry.id);
            const focus = next[Math.min(index, next.length - 1)];
            if (focus) commitWithFocus(next, focus.id);
          }}>{text.remove}</EasyTButton>
        </div>
      </li>)}
    </ol>
    <div className={styles.footer}>
      <p aria-live="polite">{statusParts.join(" · ")}</p>
      {entries.length < MAX_ENTRIES ? <EasyTButton icon={Plus} size="small" variant="secondary" disabled={disabled} aria-label={text.add} onClick={() => {
        const entry = createEntry();
        commitWithFocus([...entries, entry], entry.id);
      }}>{text.add}</EasyTButton> : null}
    </div>
  </section>;
}
