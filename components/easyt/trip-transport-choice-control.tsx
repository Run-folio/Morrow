"use client";
import { EntryReveal } from "@/components/easyt/app-motion";
import {transferTimingLabel} from '@/lib/easyt/transfer-timing-label';

import { useId, useState } from "react";
import { Check, ChevronDown, Plane, TrainFront, CarFront, Ship, Footprints, Route, X } from "lucide-react";
import type { EasyTTrip, TripLeg, TripTransferMode } from "@/lib/easyt/trip";
import {
  effectiveTripLeg,
  selectedTransportChoiceForLeg,
  supportedTransportChoicesForLeg,
} from "@/lib/easyt/transport-mode-choice";
import {useTransportComparison} from './use-transport-comparison';
import {transportGuidanceForLeg,type TransportComparison} from '@/lib/easyt/transport-comparison';
import {authoredContentKey} from '@/lib/easyt/trip-retained-authored-content';
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
  onAdoptComparison,
  pending = false,
  checkOnly = false,
  showCurrentDuration = true,
  presentation = "inline",
  departureDate,
  language = "en",
}: {
  trip: EasyTTrip;
  /** Morrovia's untouched recommended leg. */
  leg: TripLeg;
  onChange: (identity: string | null) => void | Promise<boolean | void>;
  onAdoptComparison?: (comparison: TransportComparison, candidateId: string, isCurrent: () => boolean) => Promise<boolean>;
  pending?: boolean;
  checkOnly?: boolean;
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

  if (!selected && !alternatives.length && !(checkOnly && presentation === "modal" && onAdoptComparison)) return null;
  if (presentation === "modal") return <TransportModeDialog checkOnly={checkOnly} onAdoptComparison={onAdoptComparison} trip={trip} leg={leg} pending={pending} onChange={onChange} departureDate={departureDate} language={language} />;

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
      {!alternatives.length ? <span>We couldn’t confirm another way to travel this route.</span> : null}
    </span> : null}
  </span>;
}

function TransportModeDialog({ checkOnly, trip, leg, onChange, onAdoptComparison, pending, departureDate, language }: {
  checkOnly: boolean;
  onAdoptComparison?: (comparison: TransportComparison, candidateId: string, isCurrent: () => boolean) => Promise<boolean>;
  trip: EasyTTrip; leg: TripLeg; onChange: (identity: string | null) => void | Promise<boolean | void>; pending: boolean; departureDate?: string | null; language: "en" | "es";
}) {
  const [open, setOpen] = useState(false);
  const refresh = useTransportComparison(trip, leg.id);
  const comparison = refresh.state.comparison;
  const [draft, setDraft] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [applyFailed,setApplyFailed] = useState(false);
  const id = useId();
  const selected = selectedTransportChoiceForLeg(trip, leg);
  const currentIdentity = selected?.identity ?? null;
  const recommendationId = (leg.routeMetadata.multimodalResolution as { selectedCandidateId?: unknown } | undefined)?.selectedCandidateId;
  const savedCandidates = (leg.routeMetadata.multimodalResolution as {candidates?: {id:string}[]} | undefined)?.candidates ?? [];
  const fresh = comparison?.candidates.filter(candidate => !savedCandidates.some(saved => saved.id === candidate.id && authoredContentKey(saved) !== authoredContentKey(candidate))) ?? [];
  const choicesLeg = fresh.length ? {...leg, routeMetadata:{...leg.routeMetadata,multimodalResolution:{candidates:[...savedCandidates,...fresh]}}} : leg;
  const supported = supportedTransportChoicesForLeg(trip, choicesLeg).filter((option) => option.candidateId !== recommendationId);
  const baseline = { identity: null as string | null, mode: leg.mode, timing: transferTimingLabel(leg), provenance: leg.provenance, details: leg.warnings ?? [], provider: leg.provider };
  const options = [...(leg.mode === "unknown" && !selected ? [] : [baseline]),
    ...supported.map((option) => ({ identity: option.identity as string | null, mode: option.mode, timing: transferTimingLabel({ ...option, doorToDoorMinutes: option.durationMinutes }), provenance: option.provenance, details: option.reasons, provider: option.segments.map((segment) => segment.provider).filter(Boolean).join(" ") }))];
  const choice = options.find((option) => option.identity === draft) ?? options[0] ?? baseline;
  const from = routeEndpointForLeg(trip, leg, "from");
  const to = routeEndpointForLeg(trip, leg, "to");
  const routeGuidance=transportGuidanceForLeg(trip,leg.id,comparison?.routeGuidance??(leg.routeMetadata.multimodalResolution as {routeGuidance?:unknown})?.routeGuidance);
  const isSpanish = language === "es";
  const canChoose = Boolean(selected || supported.length);
  const checkLabel = isSpanish ? "Comprobar alternativas" : "Check for alternatives";
  const dialogLabel = checkOnly ? checkLabel : isSpanish ? "Cambiar transporte" : "Change transport";
  const label = (mode: TripTransferMode) => isSpanish ? ({ flight: "Vuelo", train: "Tren", road: "Carretera", ferry: "Ferry", walk: "A pie", mixed: "Transporte combinado", unknown: "Transporte por confirmar" }[mode]) : mode === "train" ? "Train" : modeLabels[mode];
  const basis = (provenance: TripLeg["provenance"]) => provenance === "routing_engine" ? (isSpanish ? "Estimación de la ruta" : "Route estimate") : provenance === "canonical_schedule" ? (isSpanish ? "Estimación del horario" : "Schedule estimate") : provenance === "planning_estimate" ? (isSpanish ? "Estimación de planificación" : "Planning estimate") : provenance === "provider" ? (isSpanish ? "Estimación del proveedor" : "Provider estimate") : null;
  const close = () => { if (!pending) {refresh.cancel(); setOpen(false);} };
  const apply = async () => {
    if (draft === currentIdentity || pending || !refresh.allowed || (checkOnly && applyFailed)) return;
    const freshChoice = supported.find(option => option.identity === draft && comparison?.candidates.some(candidate => candidate.id === option.candidateId) && !savedCandidates.some(saved => saved.id === option.candidateId));
    setApplyFailed(false);
    try {
      const saved = freshChoice && comparison && onAdoptComparison ? await onAdoptComparison(comparison, freshChoice.candidateId, () => refresh.isCurrent(comparison)) : await onChange(draft);
      if (saved !== false) {refresh.cancel(); setOpen(false);} else setApplyFailed(true);
    } catch {setApplyFailed(true);}
  };
  const status = refresh.state.status;
  const retrieval = comparison?.assessment.retrieval;
  const empty = checkOnly && status === 'ready' && !canChoose && retrieval !== 'unavailable' && retrieval !== 'blocked';
  const showRetry = checkOnly && (status === 'error' || applyFailed);
  const runCheck = () => {
    setDraft(currentIdentity);
    setApplyFailed(false);
    void refresh.refresh();
  };
  return <>
    <EasyTButton className={styles.dialogTrigger} variant="secondary" disabled={checkOnly && (pending || !refresh.allowed)}
      aria-label={checkOnly ? checkLabel : "Change transport mode"} aria-haspopup="dialog"
      onClick={() => { setDraft(currentIdentity); setDetailsOpen(false); setApplyFailed(false); setOpen(true); if (checkOnly) void refresh.refresh(); }}>{dialogLabel}</EasyTButton>
    <MorroviaContentDialog open={open} onClose={close} className={styles.modeDialog} ariaLabel={dialogLabel} autoFocusSelector='[data-mode-initial="true"]'>
      <div className={styles.dialogContent}>
        <header className={styles.dialogHeader}>
          <div>{departureDate ? <p className={styles.dialogDate}>{formatIsoDate(departureDate, language, { month: "short", day: "numeric", year: "numeric" })}</p> : null}<h2>{from?.name} <span aria-hidden="true">→</span> {to?.name}</h2></div>
          <EasyTButton icon={X} iconOnly size="small" variant="quiet" onClick={close} aria-label={isSpanish ? "Cerrar" : "Close"} data-mode-initial={!canChoose ? "true" : undefined}>Close</EasyTButton>
        </header>
        {!checkOnly && !canChoose ? <p className={styles.prompt}>{isSpanish ? "No pudimos confirmar otra forma de viajar en este trayecto." : "We couldn’t confirm another way to travel this route."}</p> : null}
        {onAdoptComparison ? <div className={styles.comparisonFeedback}>
          {!checkOnly || showRetry ? <EasyTButton size="small" variant="secondary"
            disabled={pending || !refresh.allowed || status === 'checking'}
            loading={!checkOnly && status === 'checking'} onClick={checkOnly ? runCheck : () => void refresh.refresh()}>
            {checkOnly ? (isSpanish ? 'Volver a comprobar' : 'Check again') : (isSpanish ? 'Actualizar opciones' : 'Refresh options')}
          </EasyTButton> : null}
          <p role="status" data-transport-comparison-status={status}>{status === 'checking' ? (isSpanish ? 'Comprobando alternativas…' : 'Checking alternatives…')
            : status === 'error' ? (isSpanish ? 'No se pudo completar la comprobación. Inténtalo de nuevo.' : refresh.state.error === 'timeout' ? 'The check timed out. Try again.' : 'Could not check this connection. Try again.')
            : retrieval === 'unavailable' ? (isSpanish ? 'Algunas opciones no se pudieron comprobar.' : 'Some options could not be checked.')
            : retrieval === 'blocked' ? (isSpanish ? 'Confirma los lugares de este traslado.' : 'Confirm the places for this connection.')
            : empty ? <><strong>{isSpanish ? 'No se confirmaron otras opciones' : 'No other options confirmed'}</strong><span>{isSpanish ? 'Tu plan actual no ha cambiado.' : 'Your current plan is unchanged.'}</span></>
            : status === 'ready' ? (isSpanish ? 'Comprobación terminada. Confirma los horarios antes de reservar.' : 'Check complete. Confirm schedules before booking.')
            : checkOnly ? (isSpanish ? 'El trayecto cambió. Cierra y vuelve a comprobarlo.' : 'This connection changed. Close and check again.') : ''}</p>
        </div> : null}
        {routeGuidance.length ? <div className={styles.estimateDetails} data-reviewed-route-guidance>
          {routeGuidance.map(item=><p key={item.id}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label}</a> — {item.limitation}</p>)}
        </div> : null}
        {canChoose ? <div className={styles.modeCards} role="radiogroup" aria-label={isSpanish ? "Opciones de transporte" : "Transport options"}>
          {options.map((option, index) => {
            const Icon = option.mode === "train" ? TrainFront : option.mode === "flight" ? Plane : option.mode === "road" ? CarFront : option.mode === "ferry" ? Ship : option.mode === "walk" ? Footprints : Route;
            const initialFocus = draft === option.identity || draft === null && index === 0;
            return <EasyTButton key={option.identity ?? "recommendation"} className={styles.modeCard} variant="secondary" role="radio" aria-checked={draft === option.identity} data-mode-initial={initialFocus ? "true" : undefined} tabIndex={initialFocus ? 0 : -1} disabled={pending}
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
        </div> : null}
        <p className={styles.planNote}>{isSpanish ? "Esto cambia tu plan, no una reserva." : "This changes your plan, not a booking."}</p>
        <EasyTButton size="small" variant="quiet" icon={ChevronDown} aria-expanded={detailsOpen} aria-controls={`${id}-estimates`} onClick={() => setDetailsOpen((value) => !value)}>{isSpanish ? "Detalles y estimaciones" : "Journey details and estimates"}</EasyTButton>
        <div id={`${id}-estimates`} hidden={!detailsOpen} className={styles.estimateDetails}><EntryReveal active={detailsOpen} />{choice.provider ? <p>{choice.provider}</p> : null}{choice.details.map((detail, index) => <p key={index}>{detail}</p>)}</div>
        {applyFailed ? <p role="alert">{isSpanish ? 'No se pudo aplicar esta opción. Actualiza las opciones antes de volver a intentarlo.' : 'Could not apply this option. Check again before trying to use it.'}</p> : null}
        <footer className={styles.dialogFooter}><EasyTButton variant="secondary" onClick={close} disabled={pending}>{checkOnly && !canChoose && status !== "checking" ? (isSpanish ? "Listo" : "Done") : (isSpanish ? "Cancelar" : "Cancel")}</EasyTButton>{canChoose ? <EasyTButton variant="primary" disabled={pending || !refresh.allowed || (checkOnly && applyFailed) || !options.some(option => option.identity === draft) || draft === currentIdentity} loading={pending} onClick={() => void apply()}>{isSpanish ? "Usar" : "Use"} {label(choice.mode).toLocaleLowerCase()}</EasyTButton> : null}</footer>
      </div>
    </MorroviaContentDialog>
  </>;
}
