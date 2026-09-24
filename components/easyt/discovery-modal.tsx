"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryDraft, DiscoveryDraftAction, DiscoveryStep } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { DiscoveryReview } from "@/lib/easyt/discovery-review";
import { discoveryReviewState } from "@/lib/easyt/discovery-review-state";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { discoveryConfirmLabel, easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { BuilderClarificationShell } from "./builder-clarification-shell";
import { DiscoverySteps } from "./discovery-steps";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSkeleton } from "./morrovia-loading-states";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import styles from "./discovery-modal.module.css";

type Search = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: CanonicalPlaceSuggestion) => void;
};

export function DiscoveryModal({ open, entry, mention, projection, draft, onAction, onConfirm, onClose, language = "en", search, existingPlaceIds = [], loading = false, saveError, canonicalReview }: {
  open: boolean;
  entry: DiscoveryEntry;
  mention: ResolvedPlaceMention;
  projection: DiscoveryProjection;
  draft: DiscoveryDraft;
  onAction: (action: DiscoveryDraftAction) => void;
  onConfirm: () => void;
  onClose: () => void;
  language?: EasyTLanguage;
  search?: Search;
  existingPlaceIds?: readonly string[];
  loading?: boolean;
  saveError?: string;
  canonicalReview?: DiscoveryReview;
}) {
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const reviewReachedRef = useRef<string | null>(null);
  const timingRef = useRef<string | null>(null);
  useEffect(() => setHighlightedPlaceId(null), [mention.mentionId, open]);
  const copy = easytCopy[language].builder.visualDiscovery;
  const steps: DiscoveryStep[] = entry.kind === "landmark" || entry.kind === "natural-area"
    ? ["bases", "review"] : projection.directions.length ? ["directions", "places", "review"] : ["places", "review"];
  const step = steps.includes(draft.step) ? draft.step : steps[0];
  const stepIndex = steps.indexOf(step);
  const previousStep = steps[stepIndex - 1];
  const nextStep = steps[stepIndex + 1];
  const name = mention.canonicalName || mention.sourceText;
  const review = discoveryReviewState(mention.mentionId, draft, projection, existingPlaceIds);
  const entryKind = entry.kind === "skip" || entry.kind === "legacy-recovery" ? "clarification" : entry.kind;
  useEffect(() => {
    if (!open) { shownRef.current = null; reviewReachedRef.current = null; timingRef.current = null; return; }
    if (shownRef.current !== mention.mentionId) {
      shownRef.current = mention.mentionId;
      trackEvent("discovery_shown", { entry_kind: entryKind, candidate_count: projection.places.length });
      if (typeof performance !== "undefined") {
        performance.mark("discovery-modal-open");
        timingRef.current = mention.mentionId;
      }
    }
  }, [open, mention.mentionId, entryKind, projection.places.length]);
  useEffect(() => {
    if (!open || loading || timingRef.current !== mention.mentionId) return;
    const frame = requestAnimationFrame(() => {
      if (!document.querySelector('[data-discovery-step] .placeCard, [data-discovery-step] article')) return;
      performance.mark("discovery-first-useful-card");
      performance.measure("discovery-open-to-first-useful-card", "discovery-modal-open", "discovery-first-useful-card");
      timingRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, loading, mention.mentionId, projection.places.length, step]);
  useEffect(() => {
    if (!open || step !== "review" || reviewReachedRef.current === mention.mentionId) return;
    reviewReachedRef.current = mention.mentionId;
    trackEvent("discovery_review_reached", { entry_kind: entryKind, shortlist_count: draft.shortlistIds.length });
  }, [open, step, mention.mentionId, entryKind, draft.shortlistIds.length]);
  const handleAction = (action: DiscoveryDraftAction) => {
    if (action.type === "change-direction") trackEvent("discovery_direction_selected", { entry_kind: entryKind, candidate_count: projection.places.length });
    if (action.type === "add-shortlist" || action.type === "remove-shortlist" || action.type === "choose-base" || action.type === "choose-visit-base") {
      const actionName = action.type === "add-shortlist" ? "add" : action.type === "remove-shortlist" ? "remove" : action.type === "choose-base" ? "choose_base" : "choose_visit_base";
      trackEvent("discovery_place_choice_changed", { entry_kind: entryKind, action: actionName, shortlist_count: draft.shortlistIds.length + (action.type === "add-shortlist" ? 1 : action.type === "remove-shortlist" ? -1 : 0) });
    }
    onAction(action);
  };
  const handleClose = (action: "closed" | "finish_later") => {
    trackEvent("discovery_closed_or_resumed", { entry_kind: entryKind, action, shortlist_count: draft.shortlistIds.length });
    onClose();
  };
  const searchElement = search ? <CanonicalPlaceAutocomplete language={language} label={`${easytCopy[language].builder.countryDiscovery.searchSpecific}: ${name}`}
    value={search.value} placeholder={copy.searchPlaceholder}
    contextCountries={mention.parentCountries}
    includeNonRoutable
    invalid={Boolean(search.error)} onChange={search.onChange} onSelect={search.onSelect} /> : undefined;

  return <BuilderClarificationShell open={open} itemKey={`${mention.mentionId}:${step}`} title={copy.steps[step]}
    description={name}
    progress={`${stepIndex + 1} / ${steps.length}`} closeLabel={copy.accessibility.close}
    onDismiss={() => handleClose("closed")} discovery loading={loading}
    footer={<>
      <div>
        {previousStep ? <EasyTButton disabled={loading} icon={ArrowLeft} variant="quiet" onClick={() => onAction({ type: "set-step", step: previousStep })}>{copy.actions.back}</EasyTButton> : null}
        {(draft.shortlistIds.length || draft.removedIds.length || Object.keys(draft.baseByIntentId).length || Object.keys(draft.visitBaseByIntentId).length || draft.directionId)
          ? <EasyTButton disabled={loading} variant="quiet" onClick={() => {
            onAction({ type: "reset" });
            if (steps[0] !== "directions") onAction({ type: "set-step", step: steps[0] });
          }}>{copy.actions.reset}</EasyTButton> : null}
        <EasyTButton variant="quiet" disabled={loading} onClick={() => handleClose("finish_later")}>{copy.actions.finishLater}</EasyTButton>
      </div>
      {nextStep ? <EasyTButton disabled={loading} onClick={() => onAction({ type: "set-step", step: nextStep })}>{copy.actions.continue}</EasyTButton>
        : <EasyTButton icon={Check} disabled={loading || !(canonicalReview?.canConfirm ?? review.canConfirm)} onClick={() => { trackEvent("discovery_confirmed", { entry_kind: entryKind, shortlist_count: draft.shortlistIds.length }); onConfirm(); }}>{canonicalReview
          ? discoveryConfirmLabel(language, canonicalReview.primaryAction.baseCount, canonicalReview.primaryAction.visitCount)
          : copy.actions.confirm}</EasyTButton>}
    </>}>
    {loading ? <section className={styles.loading} role="status" aria-label={copy.status.loading} aria-busy="true">
      <span className={styles.srAnnouncement}>{copy.status.loading}</span>
      <div className={styles.loadingIntro}><MorroviaSkeleton width="36%" height={18} />
        <MorroviaSkeleton width="58%" height={12} /></div>
      <div className={styles.loadingLayout}>
        <div className={styles.loadingCards}>{[0, 1, 2].map(index => <div className={styles.loadingCard} key={index}>
          <MorroviaSkeleton height={112} radius="card" /><MorroviaSkeleton width="57%" height={22} />
          <MorroviaSkeleton width="82%" height={12} /><MorroviaSkeleton width="42%" height={34} />
        </div>)}</div>
        <div className={styles.loadingShortlist}><MorroviaSkeleton width="55%" height={20} />
          <MorroviaSkeleton width="35%" height={12} /></div>
      </div>
    </section>
      : <DiscoverySteps entry={entry} mention={mention} projection={projection} draft={{ ...draft, step }} language={language}
        canonicalReview={canonicalReview} existingPlaceIds={existingPlaceIds} onAction={handleAction} search={searchElement}
        highlightedPlaceId={highlightedPlaceId} onHighlight={setHighlightedPlaceId} />}
    {search?.error ? <p role="alert">{search.error}</p> : null}
    {saveError ? <MorroviaStatusBanner tone="warning" title={copy.status.saveBlocked} detail={saveError} /> : null}
  </BuilderClarificationShell>;
}
