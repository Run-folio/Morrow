"use client";

import { useId, type ReactNode } from "react";
import { EasyTButton } from "@/components/easyt/easyt-controls";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import styles from "./trip-builder.module.css";

// Presentation only. TripBuilderDocument owns endpoint values and mutations.
export function TripBuilderDetailsEditor({
  language, startValue, endSelection, expanded, onExpandedChange, className, children,
}: {
  language: "en" | "es";
  startValue: string;
  endSelection: JourneyEndSelection;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  className?: string;
  children: ReactNode;
}) {
  const contentId = useId();
  const unknown = language === "es" ? "Aún no lo sé" : "Not sure yet";
  const endLabel = endSelection.mode === "explicit" ? endSelection.place.name
    : endSelection.mode === "same_as_start"
      ? `${language === "es" ? "Igual que el inicio" : "Same as start"} · ${startValue || unknown}`
      : unknown;

  return <section id="builder-origin" className={className} aria-label={language === "es" ? "Detalles del viaje" : "Journey details"}>
    <div className={styles.placesSectionHead}>
      <strong>{language === "es" ? "Tu viaje" : "Your journey"}</strong>
      <EasyTButton variant="secondary" size="small" aria-expanded={expanded} aria-controls={contentId} onClick={() => onExpandedChange(!expanded)}>
        {expanded ? (language === "es" ? "Cerrar detalles" : "Close details") : (language === "es" ? "Editar viaje" : "Edit trip")}
      </EasyTButton>
    </div>
    <dl className={styles.detailsSummary}>
      <div><dt>{language === "es" ? "Desde" : "Starting from"}</dt><dd>{startValue || unknown}</dd></div>
      <div><dt>{language === "es" ? "Final del viaje" : "Journey end"}</dt><dd>{endLabel}</dd></div>
    </dl>
    {expanded && <div id={contentId} className={styles.detailsFields}>{children}</div>}
  </section>;
}
