"use client";

import { ArrowLeft, Check } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryDraft, DiscoveryDraftAction, DiscoveryStep } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { DiscoveryReview } from "@/lib/easyt/discovery-review";
import { discoveryReviewState } from "@/lib/easyt/discovery-review-state";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { discoveryAddPlacesLabel, discoveryAddToTripLabel, easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
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
  onClose: (action: "closed" | "finish_later") => void;
  language?: EasyTLanguage;
  search?: Search;
  existingPlaceIds?: readonly string[];
  loading?: boolean;
  saveError?: string;
  canonicalReview?: DiscoveryReview;
}) {
  const [highlightedPlaceId, setHighlightedPlaceId] = useState<string | null>(null);
  const shownRef = useRef<string | null>(null);
  const timingRef = useRef<string | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  useEffect(() => setHighlightedPlaceId(null), [mention.mentionId, open]);
  const copy = easytCopy[language].builder.visualDiscovery;
  const specialResolution = entry.kind === "landmark" || entry.kind === "natural-area";
  const steps: DiscoveryStep[] = specialResolution
    ? ["bases"] : projection.directions.length ? ["directions", "places"] : ["places"];
  const fallbackStep = projection.directions.length && draft.directionId ? "places" : steps[0];
  const step = steps.includes(draft.step) ? draft.step : fallbackStep;
  const effectiveDraft = useMemo(() => ({ ...draft, step }), [draft, step]);
  const stepIndex = steps.indexOf(step);
  const previousStep = steps[stepIndex - 1];
  const name = mention.canonicalName || mention.sourceText;
  const review = discoveryReviewState(mention.mentionId, draft, projection, existingPlaceIds);
  const entryKind = entry.kind === "skip" || entry.kind === "legacy-recovery" ? "clarification" : entry.kind;
  useEffect(() => {
    if (!open) { shownRef.current = null; timingRef.current = null; return; }
    if (shownRef.current !== mention.mentionId) {
      shownRef.current = mention.mentionId;
      trackEvent("discovery_shown", { entry_kind: entryKind, candidate_count: projection.places.length });
      if (typeof performance !== "undefined") {
        performance.mark("discovery-modal-mounted");
        timingRef.current = mention.mentionId;
      }
    }
  }, [open, mention.mentionId, entryKind, projection.places.length]);
  useEffect(() => {
    if (!open || loading || timingRef.current !== mention.mentionId) return;
    const frame = requestAnimationFrame(() => {
      if (!modalRef.current?.querySelector('[data-discovery-card="true"]')) return;
      performance.mark("discovery-first-useful-card");
      performance.measure("discovery-mounted-to-first-card-paint", "discovery-modal-mounted", "discovery-first-useful-card");
      timingRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [open, loading, mention.mentionId, projection.places.length, step]);
  const searchElement = search ? <CanonicalPlaceAutocomplete language={language} label={`${easytCopy[language].builder.countryDiscovery.searchSpecific}: ${name}`}
    value={search.value} placeholder={copy.searchPlaceholder}
    contextCountries={mention.parentCountries}
    includeNonRoutable
    invalid={Boolean(search.error)} onChange={search.onChange} onSelect={search.onSelect} /> : undefined;

  return <BuilderClarificationShell open={open} itemKey={`${mention.mentionId}:${step}`} title={copy.steps[step]}
    description={name}
    progress={steps.length > 1 ? `${stepIndex + 1} / ${steps.length}` : undefined} closeLabel={copy.accessibility.close}
    onDismiss={() => onClose("closed")} discovery loading={loading}
    footer={<>
      <div>
        {previousStep ? <EasyTButton disabled={loading} icon={ArrowLeft} variant="quiet" onClick={() => onAction({ type: "set-step", step: previousStep })}>{copy.actions.back}</EasyTButton> : null}
        {(draft.shortlistIds.length || draft.removedIds.length || Object.keys(draft.baseByIntentId).length || Object.keys(draft.visitBaseByIntentId).length || draft.directionId)
          ? <EasyTButton disabled={loading} variant="quiet" onClick={() => {
            onAction({ type: "reset" });
            if (steps[0] !== "directions") onAction({ type: "set-step", step: steps[0] });
          }}>{copy.actions.reset}</EasyTButton> : null}
        <EasyTButton variant="quiet" disabled={loading} onClick={() => onClose("finish_later")}>{copy.actions.finishLater}</EasyTButton>
      </div>
      {step === "directions" ? null : <EasyTButton icon={Check} disabled={loading || !(canonicalReview?.canConfirm ?? review.canConfirm)} onClick={onConfirm}>
        {specialResolution ? discoveryAddToTripLabel(language) : discoveryAddPlacesLabel(language, canonicalReview
          ? canonicalReview.primaryAction.baseCount + canonicalReview.primaryAction.visitCount
          : review.choices.filter(choice => choice.confirmable && !choice.existing).length)}
      </EasyTButton>}
    </>}>
    <div ref={modalRef} className={styles.modalContent} data-discovery-mention-id={mention.mentionId}>
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
      : <DiscoverySteps entry={entry} mention={mention} projection={projection} draft={effectiveDraft} language={language}
        existingPlaceIds={existingPlaceIds} onAction={onAction} search={searchElement}
        highlightedPlaceId={highlightedPlaceId} onHighlight={setHighlightedPlaceId} />}
    {!loading && step !== "directions" && (canonicalReview ? !canonicalReview.canConfirm : !review.canConfirm)
      && (draft.shortlistIds.length > 0 || Object.keys(draft.baseByIntentId).length > 0 || Object.keys(draft.visitBaseByIntentId).length > 0)
      ? <MorroviaStatusBanner tone="warning" title={copy.reviewStatus.resolveTitle} detail={copy.reviewStatus.resolveDetail} /> : null}
    {search?.error ? <p role="alert">{search.error}</p> : null}
    {saveError ? <MorroviaStatusBanner tone="warning" title={copy.status.saveBlocked} detail={saveError} /> : null}
    </div>
  </BuilderClarificationShell>;
}
