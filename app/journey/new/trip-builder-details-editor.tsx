"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { EasyTButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import { MorroviaDatePicker } from "@/components/easyt/morrovia-date-picker";
import { MorroviaQuantitySelector } from "@/components/easyt/morrovia-quantity-selector";
import type { BudgetBand, JourneyEndpointPlace, JourneyEndSelection } from "@/lib/easyt/trip";
import styles from "./trip-builder.module.css";

export type TripBuilderDetailsDraft = {
  journeyOrigin: JourneyEndpointPlace;
  journeyEnd: JourneyEndSelection;
  journeyEndInput: string;
  startDate: string;
  endDate: string;
  travellers: number;
  budget: BudgetBand;
};

export type TripBuilderDetailsDraftControls = {
  draft: TripBuilderDetailsDraft;
  setDraft: (next: TripBuilderDetailsDraft | ((current: TripBuilderDetailsDraft) => TripBuilderDetailsDraft)) => void;
};

// Presentation and draft ownership only. TripBuilderDocument remains the sole canonical owner.
export function TripBuilderDetailsEditor({
  language,
  startPlace,
  endSelection,
  startDate,
  endDate,
  travellers,
  budget,
  sourceFingerprint,
  busy = false,
  error,
  onCommit,
  className,
  children,
}: {
  language: "en" | "es";
  startPlace: JourneyEndpointPlace;
  endSelection: JourneyEndSelection;
  startDate: string;
  endDate: string;
  travellers: number;
  budget: BudgetBand;
  sourceFingerprint: string;
  busy?: boolean;
  error?: string | null;
  onCommit: (draft: TripBuilderDetailsDraft, sourceFingerprint: string) => Promise<boolean> | boolean;
  className?: string;
  children: (controls: TripBuilderDetailsDraftControls) => ReactNode;
}) {
  const canonicalDraft: TripBuilderDetailsDraft = {
    journeyOrigin: startPlace,
    journeyEnd: endSelection,
    journeyEndInput: endSelection.mode === "explicit" ? endSelection.place.name : "",
    startDate,
    endDate,
    travellers,
    budget,
  };
  const canonicalDraftRef = useRef(canonicalDraft);
  canonicalDraftRef.current = canonicalDraft;
  const [draft, setDraft] = useState<TripBuilderDetailsDraft>(canonicalDraft);
  const [draftFingerprint, setDraftFingerprint] = useState(sourceFingerprint);
  useEffect(() => {
    setDraft(canonicalDraftRef.current);
    setDraftFingerprint(sourceFingerprint);
  }, [sourceFingerprint]);

  const cancel = () => {
    setDraft(canonicalDraftRef.current);
    setDraftFingerprint(sourceFingerprint);
  };

  const save = async () => {
    if (busy) return;
    await onCommit(draft, draftFingerprint);
  };

  return <section id="builder-origin" className={className} aria-label={language === "es" ? "Detalles del viaje" : "Journey details"}>
    <div className={styles.placesSectionHead}>
      <strong>{language === "es" ? "Tu viaje" : "Your journey"}</strong>
    </div>
    <div className={styles.detailsFields}>
      {children({ draft, setDraft })}
      <div className={styles.detailsCompactGrid}>
        <MorroviaDatePicker
          mode="range"
          locale={language}
          startLabel={language === "es" ? "Fecha de inicio" : "Start date"}
          endLabel={language === "es" ? "Fecha final" : "End date"}
          startValue={draft.startDate}
          endValue={draft.endDate}
          onChange={(range) => setDraft((current) => ({ ...current, startDate: range.start, endDate: range.end }))}
        />
        <MorroviaQuantitySelector
          compact
          label={language === "es" ? "Viajeros" : "Travellers"}
          locale={language}
          noun={language === "es" ? "viajero" : "traveller"}
          nounPlural={language === "es" ? "viajeros" : "travellers"}
          value={draft.travellers}
          min={1}
          max={12}
          onChange={(value) => setDraft((current) => ({ ...current, travellers: value }))}
        />
        <EasyTSelect
          label={language === "es" ? "Presupuesto" : "Budget"}
          value={draft.budget}
          onChange={(event) => setDraft((current) => ({ ...current, budget: event.target.value as BudgetBand }))}
        >
          <option value="value">{language === "es" ? "Ajustado" : "Value"}</option>
          <option value="mid">{language === "es" ? "Medio" : "Mid"}</option>
          <option value="high">{language === "es" ? "Alto" : "High"}</option>
        </EasyTSelect>
      </div>
      {error ? <p className={styles.hintError} role="alert">{error}</p> : null}
      <div className={styles.detailsActions}>
        <EasyTButton variant="secondary" size="small" disabled={busy} onClick={cancel}>{language === "es" ? "Cancelar" : "Cancel"}</EasyTButton>
        <EasyTButton size="small" disabled={busy} onClick={() => { void save(); }}>{busy ? (language === "es" ? "Guardando…" : "Saving…") : (language === "es" ? "Guardar cambios" : "Save changes")}</EasyTButton>
      </div>
    </div>
  </section>;
}
