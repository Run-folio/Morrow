"use client";
import {transferTimingLabel} from '@/lib/easyt/transfer-timing-label';

import { useId, useState } from "react";
import { Check, ChevronDown, Plane, TrainFront, CarFront, Ship, Footprints, Route, X } from "lucide-react";
import type { EasyTTrip, TripLeg, TripTransferMode } from "@/lib/easyt/trip";
import {
  effectiveTripLeg,
  selectedTransportChoiceForLeg,
  supportedTransportChoicesForLeg,
} from "@/lib/easyt/transport-mode-choice";
import { EasyTButton } from "./easyt-controls";
import { MorroviaContentDialog } from "./morrovia-feedback";
import { routeEndpointForLeg } from "@/lib/easyt/trip-legs";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import styles from "./trip-transport-choice-control.module.css";

const modeLabels: Record<TripTransferMode, string> = {
  flight: "Flight",
  train: "Rail",
  road: "Road",
  ferry: "Ferry",
  walk: "Walk",
  mixed: "Mixed transport",
  unknown: "Transport to confirm",
};

export default function TripTransportChoiceControl({
  trip,
  leg,
  onChange,
  pending = false,
  showUnavailable = false,
  showCurrentDuration = true,
  presentation = "inline",
  departureDate,
  language = "en",
}: {
  trip: EasyTTrip;
  /** Morrovia's untouched recommended leg. */
  leg: TripLeg;
  onChange: (identity: string | null) => void | Promise<boolean | void>;
  pending?: boolean;
  showUnavailable?: boolean;
  showCurrentDuration?: boolean;
  presentation?: "inline" | "modal";
  departureDate?: string | null;
  language?: "en" | "es";
}) {
  const [open, setOpen] = useState(false);
  const optionsId = useId();
  const effective = effectiveTripLeg(trip, leg);
  const selected = selectedTransportChoiceForLeg(trip, leg);
  const supported = supportedTransportChoicesForLeg(trip, leg);
  const recommendationId = (leg.routeMetadata.multimodalResolution as { selectedCandidateId?: unknown } | undefined)?.selectedCandidateId;
  const alternatives = supported.filter((candidate) => candidate.identity !== selected?.identity
    && candidate.candidateId !== recommendationId);
  const effectiveMinutes = effective.doorToDoorMinutes ?? effective.durationMinutes;

  if (!selected && !alternatives.length && !showUnavailable) return null;
  if (presentation === "modal") return <TransportModeDialog trip={trip} leg={leg} pending={pending} onChange={onChange} departureDate={departureDate} language={language} />;

  return <span className={styles.control} data-transport-choice-leg={leg.id}>
    <span className={styles.current}>
      <span><b>{modeLabels[effective.mode]}</b>{showCurrentDuration && effectiveMinutes !== null ? ` · ${transferTimingLabel(effective)} total` : ""}</span>
      <small>{selected ? "Your choice" : "Morrovia recommendation"}</small>
      <EasyTButton
        aria-controls={optionsId}
        aria-expanded={open}
        aria-label="Change transport mode"
        icon={ChevronDown}
        size="small"
        variant="quiet"
        onClick={() => setOpen((current) => !current)}
      >Change</EasyTButton>
    </span>
    {open ? <span className={styles.options} id={optionsId} aria-label="Supported transport modes">
      {selected ? <EasyTButton size="small" variant="secondary" disabled={pending} onClick={() => onChange(null)}>
        Use Morrovia recommendation
      </EasyTButton> : null}
      {alternatives.map((candidate) => <EasyTButton
        key={candidate.identity}
        size="small"
        variant="secondary"
        disabled={pending}
        onClick={() => onChange(candidate.identity)}
      >
        {candidate.mode === effective.mode ? <Check aria-hidden="true" /> : null}
        {modeLabels[candidate.mode]} · {transferTimingLabel({...candidate,doorToDoorMinutes:candidate.durationMinutes})} total
      </EasyTButton>)}
      {!alternatives.length ? <span>No other evidence-backed mode is currently supported for this leg.</span> : null}
    </span> : null}
  </span>;
}

function TransportModeDialog({ trip, leg, onChange, pending, departureDate, language }: {
  trip: EasyTTrip; leg: TripLeg; onChange: (identity: string | null) => void | Promise<boolean | void>; pending: boolean; departureDate?: string | null; language: "en" | "es";
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const id = useId();
  const selected = selectedTransportChoiceForLeg(trip, leg);
  const currentIdentity = selected?.identity ?? null;
  const recommendationId = (leg.routeMetadata.multimodalResolution as { selectedCandidateId?: unknown } | undefined)?.selectedCandidateId;
  const supported = supportedTransportChoicesForLeg(trip, leg).filter((option) => option.candidateId !== recommendationId);
  const baseline = { identity: null as string | null, mode: leg.mode, timing: transferTimingLabel(leg), provenance: leg.provenance, details: leg.warnings ?? [], provider: leg.provider };
  const options = [...(leg.mode === "unknown" ? [] : [baseline]),
    ...supported.map((option) => ({ identity: option.identity as string | null, mode: option.mode, timing: transferTimingLabel({ ...option, doorToDoorMinutes: option.durationMinutes }), provenance: option.provenance, details: option.reasons, provider: option.segments.map((segment) => segment.provider).filter(Boolean).join(" ") }))];
  const choice = options.find((option) => option.identity === draft) ?? options[0] ?? baseline;
  const from = routeEndpointForLeg(trip, leg, "from");
  const to = routeEndpointForLeg(trip, leg, "to");
  const isSpanish = language === "es";
  const label = (mode: TripTransferMode) => isSpanish ? ({ flight: "Vuelo", train: "Tren", road: "Carretera", ferry: "Ferry", walk: "A pie", mixed: "Transporte combinado", unknown: "Transporte por confirmar" }[mode]) : mode === "train" ? "Train" : modeLabels[mode];
  const basis = (provenance: TripLeg["provenance"]) => provenance === "routing_engine" ? (isSpanish ? "Estimación de la ruta" : "Route estimate") : provenance === "canonical_schedule" ? (isSpanish ? "Estimación del horario" : "Schedule estimate") : provenance === "planning_estimate" ? (isSpanish ? "Estimación de planificación" : "Planning estimate") : provenance === "provider" ? (isSpanish ? "Estimación del proveedor" : "Provider estimate") : null;
  const close = () => { if (!pending) setOpen(false); };
  const apply = async () => { if (draft === currentIdentity || pending) return; const saved = await onChange(draft); if (saved !== false) setOpen(false); };
  return <>
    <EasyTButton size="small" variant="quiet" aria-label="Change transport mode" aria-haspopup="dialog" onClick={() => { setDraft(currentIdentity); setDetailsOpen(false); setOpen(true); }}>{isSpanish ? "Cambiar transporte" : "Change transport"}</EasyTButton>
    <MorroviaContentDialog open={open} onClose={close} className={styles.modeDialog} ariaLabel={isSpanish ? "Cambiar transporte" : "Change transport"} autoFocusSelector='[data-mode-initial="true"]'>
      <div className={styles.dialogContent}>
        <header className={styles.dialogHeader}>
          <div>{departureDate ? <p className={styles.dialogDate}>{formatIsoDate(departureDate, language, { month: "short", day: "numeric", year: "numeric" })}</p> : null}<h2>{from?.name} <span aria-hidden="true">→</span> {to?.name}</h2></div>
          <EasyTButton icon={X} iconOnly size="small" variant="quiet" onClick={close} aria-label={isSpanish ? "Cerrar" : "Close"} data-mode-initial={!options.length ? "true" : undefined}>Close</EasyTButton>
        </header>
        <p className={styles.prompt}>{isSpanish ? "¿Cómo quieres viajar?" : "How would you like to travel?"}</p>
        {!options.length ? <p className={styles.prompt}>{isSpanish ? "No hay otro modo de transporte verificado para este trayecto." : "No other evidence-backed mode is currently supported for this leg."}</p> : null}
        <div className={styles.modeCards} role="radiogroup" aria-label={isSpanish ? "Opciones de transporte" : "Transport options"}>
          {options.map((option, index) => {
            const Icon = option.mode === "train" ? TrainFront : option.mode === "flight" ? Plane : option.mode === "road" ? CarFront : option.mode === "ferry" ? Ship : option.mode === "walk" ? Footprints : Route;
            return <EasyTButton key={option.identity ?? "recommendation"} className={styles.modeCard} variant="secondary" role="radio" aria-checked={draft === option.identity} data-mode-initial={draft === option.identity ? "true" : undefined} tabIndex={draft === option.identity ? 0 : -1} disabled={pending}
              onClick={() => setDraft(option.identity)} onKeyDown={(event) => {
                if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                event.preventDefault();
                const next = event.key === "Home" ? 0 : event.key === "End" ? options.length - 1 : (index + (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1) + options.length) % options.length;
                setDraft(options[next].identity);
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
              }}>
              <Icon aria-hidden="true" /><span className={styles.modeText}><strong>{label(option.mode)}</strong><span>{option.timing === "Timing to confirm" || !option.timing ? (isSpanish ? "Duración por confirmar" : "Duration to confirm") : `${option.timing} ${isSpanish ? "en total" : "total"}`}</span>{basis(option.provenance) ? <small>{basis(option.provenance)}</small> : null}</span>
              {option.identity === currentIdentity ? <span className={styles.currentBadge}>{isSpanish ? "Opción actual" : "Current choice"}</span> : null}
            </EasyTButton>;
          })}
        </div>
        <p className={styles.planNote}>{isSpanish ? "Esto cambia tu plan, no una reserva." : "This changes your plan, not a booking."}</p>
        <EasyTButton size="small" variant="quiet" icon={ChevronDown} aria-expanded={detailsOpen} aria-controls={`${id}-estimates`} onClick={() => setDetailsOpen((value) => !value)}>{isSpanish ? "Detalles y estimaciones" : "Journey details and estimates"}</EasyTButton>
        <div id={`${id}-estimates`} hidden={!detailsOpen} className={styles.estimateDetails}>{choice.provider ? <p>{choice.provider}</p> : null}{choice.details.map((detail, index) => <p key={index}>{detail}</p>)}</div>
        <footer className={styles.dialogFooter}><EasyTButton variant="secondary" onClick={close} disabled={pending}>{isSpanish ? "Cancelar" : "Cancel"}</EasyTButton><EasyTButton variant="primary" disabled={pending || !options.length || draft === currentIdentity} loading={pending} onClick={() => void apply()}>{isSpanish ? "Usar" : "Use"} {label(choice.mode).toLocaleLowerCase()}</EasyTButton></footer>
      </div>
    </MorroviaContentDialog>
  </>;
}
