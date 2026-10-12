"use client";

import { CalendarCheck2, CircleAlert, LockKeyhole, MapPinned, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { explicitVisitDayOptions, explicitVisitIntentsForTrip, fixedCommitmentPlansForTrip } from "@/lib/easyt/trip-explicit-plans";
import { preferredItineraryIdeaDay } from "@/lib/easyt/itinerary-ideas";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import { MorroviaConfirmationDialog } from "./morrovia-feedback";
import styles from "./trip-explicit-plans.module.css";

type RemoveTarget = { kind: "visit" | "commitment"; id: string; name: string } | null;
type RemovalScope = { identity: string };

export default function TripExplicitPlans({
  trip,
  variant,
  pending,
  onSchedule,
  onRemoveVisit,
  onRemoveCommitment,
}: {
  trip: EasyTTrip;
  variant: "overview" | "itinerary";
  pending?: (key: string) => boolean;
  onSchedule?: (mentionId: string, dayId: string) => boolean | Promise<boolean>;
  onRemoveVisit?: (mentionId: string) => boolean | Promise<boolean>;
  onRemoveCommitment?: (commitmentId: string) => boolean | Promise<boolean>;
}) {
  const visits = useMemo(() => explicitVisitIntentsForTrip(trip), [trip]);
  const commitments = useMemo(() => fixedCommitmentPlansForTrip(trip), [trip]);
  const identity = JSON.stringify([trip.ownerId, trip.id]);
  const removalScopeRef = useRef<RemovalScope>({ identity });
  if (removalScopeRef.current.identity !== identity) removalScopeRef.current = { identity };
  const renderScope = removalScopeRef.current;
  const [daySelection, setDaySelection] = useState<{ scope: RemovalScope; days: Record<string, string> }>(() => ({ scope: renderScope, days: {} }));
  const selectedDays = daySelection.scope === renderScope ? daySelection.days : {};
  const setSelectedDays = (update: (current: Record<string, string>) => Record<string, string>) => {
    if (removalScopeRef.current !== renderScope) return;
    setDaySelection((current) => ({ scope: renderScope, days: update(current.scope === renderScope ? current.days : {}) }));
  };
  const [removalIntent, setRemovalIntent] = useState<{ scope: RemovalScope; target: NonNullable<RemoveTarget> } | null>(null);
  const removeTarget = removalIntent?.scope === renderScope ? removalIntent.target : null;
  const setRemoveTarget = (target: RemoveTarget) => {
    if (removalScopeRef.current !== renderScope) return;
    setRemovalIntent(target ? { scope: renderScope, target } : null);
    if (target) setRemovalError("");
  };
  const [confirming, setConfirming] = useState(false);
  const [removalError, setRemovalError] = useState("");
  const removalPendingRef = useRef(false);
  const removeTargetRef = useRef(removeTarget);
  removeTargetRef.current = removeTarget;
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  if (!visits.length && !commitments.length) return null;

  const confirmRemoval = async () => {
    if (!removeTarget || removalPendingRef.current || removalScopeRef.current !== renderScope) return;
    const target = removeTarget, scope = renderScope;
    const isCurrent = () => mountedRef.current && removalScopeRef.current === scope && removeTargetRef.current === target;
    removalPendingRef.current = true;
    setConfirming(true);
    setRemovalError("");
    try {
      const changed = await (target.kind === "visit" ? onRemoveVisit?.(target.id) : onRemoveCommitment?.(target.id));
      if (!isCurrent()) return;
      if (changed === true) setRemoveTarget(null);
      else setRemovalError("This plan could not be removed safely. Try again.");
    } catch { if (isCurrent()) setRemovalError("This plan could not be removed safely. Try again."); }
    finally {
      removalPendingRef.current = false;
      if (mountedRef.current) setConfirming(false);
    }
  };

  const content = <>
    <header className={styles.heading}>
      <div><p>Kept from your brief</p><h2 id={variant === "overview" ? "explicit-plans-title" : undefined}>Plans you asked us to keep</h2></div>
      <span>{visits.length + commitments.length}</span>
    </header>
    <div className={styles.list}>
      {visits.map((visit) => {
        const options = explicitVisitDayOptions(trip, visit);
        const firstBase = visit.bases[0]?.stop;
        const preferred = firstBase ? preferredItineraryIdeaDay(trip, firstBase.id) : null;
        const selectedDayId = selectedDays[visit.mentionId] ?? preferred?.id ?? options[0]?.day.id ?? "";
        const scheduledDay = visit.scheduledIdea?.dayId ? trip.planItems.find((day) => day.id === visit.scheduledIdea?.dayId) : null;
        const scheduledStop = scheduledDay ? trip.stops.find((stop) => stop.id === scheduledDay.stopId) : null;
        const baseNames = visit.bases.map(({ stop }) => stop.name);
        return <article className={styles.item} key={visit.mentionId}>
          <MapPinned aria-hidden="true" />
          <div className={styles.itemBody}>
            <div className={styles.itemTitle}><strong>{visit.name}</strong><span>You asked to visit this</span></div>
            {scheduledDay ? <p><b>Scheduled</b> · Day {scheduledDay.dayNumber} from {scheduledStop?.name ?? "your route"}</p>
              : baseNames.length ? <p>Could fit while you’re in {baseNames.join(baseNames.length > 1 ? " or " : "")}.</p>
                : <p>Unassigned visit · choose a route base before scheduling it.</p>}
            {variant === "itinerary" && !scheduledDay && options.length && onSchedule ? <div className={styles.actions}>
              <EasyTSelect fieldClassName={styles.daySelect} label={`Day for ${visit.name}`} labelClassName="sr-only" value={selectedDayId} onChange={(event) => setSelectedDays((current) => ({ ...current, [visit.mentionId]: event.target.value }))}>
                {options.map(({ day, protectedDay }) => <option key={day.id} value={day.id}>Day {day.dayNumber} · {trip.stops.find((stop) => stop.id === day.stopId)?.name}{protectedDay ? " · travel day" : ""}</option>)}
              </EasyTSelect>
              <EasyTButton size="small" onClick={() => {
                if (removalScopeRef.current === renderScope) void onSchedule(visit.mentionId, selectedDayId);
              }} loading={pending?.(`explicit-visit-${visit.mentionId}`)}>Add to day</EasyTButton>
            </div> : variant === "overview" && !scheduledDay ? <EasyTLinkButton size="small" variant="quiet" href={`/journey/${encodeURIComponent(trip.id)}/itinerary`}>Schedule in itinerary</EasyTLinkButton> : null}
          </div>
          {variant === "itinerary" && onRemoveVisit ? <EasyTButton className={styles.remove} icon={Trash2} iconOnly size="small" variant="quiet" aria-label={`Remove requested visit ${visit.name}`} onClick={() => setRemoveTarget({ kind: "visit", id: visit.mentionId, name: visit.name })}>Remove requested visit</EasyTButton> : null}
        </article>;
      })}
      {commitments.map((plan) => <article className={`${styles.item} ${plan.state !== "protected" ? styles.conflict : ""}`} key={plan.commitment.id}>
        {plan.state === "protected" ? <LockKeyhole aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
        <div className={styles.itemBody}>
          <div className={styles.itemTitle}><strong>{plan.displayLabel}</strong><span>{plan.state === "protected" ? "Fixed plan · protected" : "Fixed plan · protected · needs attention"}</span></div>
          <p>{plan.message}</p>
          {plan.state !== "protected" ? <EasyTLinkButton href={`/journey/new?trip=${encodeURIComponent(trip.id)}`} size="small" variant="secondary" icon={CalendarCheck2}>Adjust route or commitment</EasyTLinkButton> : null}
        </div>
        {variant === "itinerary" && onRemoveCommitment ? <EasyTButton className={styles.remove} icon={Trash2} iconOnly size="small" variant="quiet" aria-label={`Remove fixed commitment ${plan.displayLabel}`} onClick={() => setRemoveTarget({ kind: "commitment", id: plan.commitment.id, name: plan.displayLabel })}>Remove fixed commitment</EasyTButton> : null}
      </article>)}
    </div>
  </>;

  return <>
    {variant === "overview" ? <section className={styles.overview} aria-labelledby="explicit-plans-title">{content}</section> : <section className={styles.itinerary} aria-label="Plans kept from your trip brief">{content}</section>}
    <MorroviaConfirmationDialog
      open={Boolean(removeTarget)}
      title={removeTarget ? `Remove ${removeTarget.name}?` : "Remove this plan?"}
      detail="This removes an explicit request from the saved trip."
      consequences={["It will no longer appear as a plan Morrovia should preserve.", "Any itinerary activity created for this requested visit will also be removed."]}
      cancelLabel="Keep plan"
      confirmLabel="Remove plan"
      confirming={confirming}
      error={removalError || undefined}
      onCancel={() => { if (!removalPendingRef.current) { setRemoveTarget(null); setRemovalError(""); } }}
      onConfirm={() => void confirmRemoval()}
    />
  </>;
}
