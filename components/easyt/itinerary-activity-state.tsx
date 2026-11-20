import { BookmarkCheck, CheckCircle2 } from "lucide-react";
import styles from "./itinerary-activity-identity.module.css";

export function itineraryActivityLabels(language: "en" | "es" = "en") {
  return language === "es" ? {
    save: "Guardar para después", saved: "Guardado para después", saving: "Guardando…",
    added: (day: number) => `Añadido al día ${day}`, chooseDay: "Elegir día",
  } : {
    save: "Save for later", saved: "Saved for later", saving: "Saving…",
    added: (day: number) => `Added to Day ${day}`, chooseDay: "Choose day",
  };
}

type ActivityStateProps = { language?: "en" | "es" } & (
  { state: "saved" } | { state: "planned"; dayNumber: number; detail?: string }
);

export function ItineraryActivityState(props: ActivityStateProps) {
  const labels = itineraryActivityLabels(props.language);
  const Icon = props.state === "planned" ? CheckCircle2 : BookmarkCheck;
  return <span className={styles.ideaState} data-activity-state={props.state}>
    <Icon aria-hidden="true" />
    <span>{props.state === "saved" ? labels.saved : <>{labels.added(props.dayNumber)}{props.detail ? ` · ${props.detail}` : ""}</>}</span>
  </span>;
}
