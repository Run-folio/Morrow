"use client";

import { useId, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import type { EasyTTrip, TripLeg, TripTransferMode } from "@/lib/easyt/trip";
import {
  effectiveTripLeg,
  selectedTransportChoiceForLeg,
  supportedTransportChoicesForLeg,
} from "@/lib/easyt/transport-mode-choice";
import { EasyTButton } from "./easyt-controls";
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
}: {
  trip: EasyTTrip;
  /** Morrovia's untouched recommended leg. */
  leg: TripLeg;
  onChange: (identity: string | null) => void;
  pending?: boolean;
  showUnavailable?: boolean;
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

  return <span className={styles.control} data-transport-choice-leg={leg.id}>
    <span className={styles.current}>
      <span><b>{modeLabels[effective.mode]}</b>{effectiveMinutes !== null ? ` · ~${formatTripDuration(effectiveMinutes)}` : ""}</span>
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
        {modeLabels[candidate.mode]} · ~{formatTripDuration(candidate.durationMinutes)}
      </EasyTButton>)}
      {!alternatives.length ? <span>No other evidence-backed mode is currently supported for this leg.</span> : null}
    </span> : null}
  </span>;
}
