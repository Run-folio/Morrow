"use client";

import { ArrowRight } from "lucide-react";
import { useId } from "react";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import type { CanonicalPlaceSuggestion, PlaceType } from "@/lib/easyt/place-intelligence";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { EasyTButton } from "./easyt-controls";
import styles from "./journey-endpoints-editor.module.css";

const ROUTABLE_ENDPOINT_TYPES: PlaceType[] = ["city", "town", "transport_gateway"];

export function JourneyEndpointsEditor({
  language = "en",
  startValue,
  endValue,
  endSelection,
  startInvalid = false,
  startDescribedBy,
  endInvalid = false,
  endDescribedBy,
  heading,
  hint,
  showHeading = true,
  showHint = true,
  onStartChange,
  onStartSelect,
  onEndChange,
  onEndSelect,
  onEndModeChange,
}: {
  language?: "en" | "es";
  startValue: string;
  endValue: string;
  endSelection: JourneyEndSelection;
  startInvalid?: boolean;
  startDescribedBy?: string;
  endInvalid?: boolean;
  endDescribedBy?: string;
  heading?: string;
  hint?: string;
  showHeading?: boolean;
  showHint?: boolean;
  onStartChange: (value: string) => void;
  onStartSelect: (suggestion: CanonicalPlaceSuggestion) => void;
  onEndChange: (value: string) => void;
  onEndSelect: (suggestion: CanonicalPlaceSuggestion) => void;
  onEndModeChange: (mode: "same_as_start" | "unknown") => void;
}) {
  const hintId = useId();
  const text = language === "es" ? {
    heading: "TU VIAJE", start: "Desde", startPlaceholder: "Ciudad o aeropuerto de salida",
    end: "Termina en", endPlaceholder: "Aún no lo sé", same: "Igual que el inicio",
    hint: "Indicar el final ayuda a Morrovia a ordenar mejor la ruta.",
  } : {
    heading: "YOUR JOURNEY", start: "Starting from", startPlaceholder: "City or airport you are leaving from",
    end: "Ending at", endPlaceholder: "Not sure yet", same: "Same as start",
    hint: "Adding an end point helps Morrovia compare route order.",
  };
  const visibleEndValue = endSelection.mode === "same_as_start" ? startValue : endSelection.mode === "explicit" ? endValue : "";

  return <section className={styles.root} aria-label={heading ?? text.heading}>
    {showHeading ? <strong className={styles.heading}>{heading ?? text.heading}</strong> : null}
    <div className={styles.fields}>
      <label className={styles.field}>
        <span>{text.start}</span>
        <CanonicalPlaceAutocomplete
          label={text.start}
          value={startValue}
          placeholder={text.startPlaceholder}
          allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
          showPlaceType={false}
          invalid={startInvalid}
          describedBy={startDescribedBy}
          onChange={onStartChange}
          onSelect={onStartSelect}
        />
      </label>
      <span className={styles.arrowSlot}><ArrowRight className={styles.arrow} aria-hidden="true" /></span>
      <div className={styles.endGroup}>
        <label className={styles.field}>
          <span>{text.end}</span>
          <CanonicalPlaceAutocomplete
            label={text.end}
            value={visibleEndValue}
            placeholder={text.endPlaceholder}
            allowedPlaceTypes={ROUTABLE_ENDPOINT_TYPES}
            showPlaceType={false}
            invalid={endInvalid}
            describedBy={endDescribedBy ?? (showHint ? hintId : undefined)}
            onClear={() => onEndModeChange("unknown")}
            clearLabel={language === "es" ? "Borrar el final del viaje" : "Clear journey end"}
            onChange={onEndChange}
            onSelect={onEndSelect}
          />
        </label>
        <div className={styles.shortcuts} role="group" aria-label={language === "es" ? "Opciones del final del viaje" : "Journey end options"}>
          <EasyTButton variant="quiet" size="small" aria-pressed={endSelection.mode === "same_as_start"} onClick={() => onEndModeChange("same_as_start")}>{text.same}</EasyTButton>
        </div>
      </div>
    </div>
    {showHint ? <small id={hintId} className={styles.hint}>{hint ?? text.hint}</small> : null}
  </section>;
}
