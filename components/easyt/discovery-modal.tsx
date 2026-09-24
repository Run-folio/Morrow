"use client";

import { ArrowLeft, Check } from "lucide-react";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryDraft, DiscoveryDraftAction, DiscoveryStep } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import { discoveryReviewState } from "@/lib/easyt/discovery-review-state";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { BuilderClarificationShell } from "./builder-clarification-shell";
import { DiscoverySteps } from "./discovery-steps";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSkeleton } from "./morrovia-loading-states";
import styles from "./discovery-modal.module.css";

type Search = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: CanonicalPlaceSuggestion) => void;
};

export function DiscoveryModal({ open, entry, mention, projection, draft, onAction, onConfirm, onClose, language = "en", search, existingPlaceIds = [], loading = false }: {
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
}) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const steps: DiscoveryStep[] = entry.kind === "landmark" || entry.kind === "natural-area"
    ? ["bases", "review"] : projection.directions.length ? ["directions", "places", "review"] : ["places", "review"];
  const step = steps.includes(draft.step) ? draft.step : steps[0];
  const stepIndex = steps.indexOf(step);
  const previousStep = steps[stepIndex - 1];
  const nextStep = steps[stepIndex + 1];
  const name = mention.canonicalName || mention.sourceText;
  const review = discoveryReviewState(mention.mentionId, draft, projection, existingPlaceIds);
  const searchElement = search ? <CanonicalPlaceAutocomplete language={language} label={`${copy.searchWithin} ${name}`}
    value={search.value} placeholder={copy.searchPlaceholder}
    contextCountries={mention.parentCountries}
    parentConstraint={entry.kind === "country" || entry.kind === "region" ? { canonicalName: mention.canonicalName, placeType: mention.placeType, parentCountries: mention.parentCountries } : undefined}
    invalid={Boolean(search.error)} onChange={search.onChange} onSelect={search.onSelect} /> : undefined;

  return <BuilderClarificationShell open={open} itemKey={`${mention.mentionId}:${step}`} title={copy.steps[step]}
    description={name}
    progress={`${stepIndex + 1} / ${steps.length}`} closeLabel={copy.accessibility.close}
    onDismiss={onClose} discovery loading={loading}
    footer={<>
      <div>
        {previousStep ? <EasyTButton disabled={loading} icon={ArrowLeft} variant="quiet" onClick={() => onAction({ type: "set-step", step: previousStep })}>{copy.actions.back}</EasyTButton> : null}
        <EasyTButton variant="quiet" disabled={loading} onClick={onClose}>{copy.actions.finishLater}</EasyTButton>
      </div>
      {nextStep ? <EasyTButton disabled={loading} onClick={() => onAction({ type: "set-step", step: nextStep })}>{copy.actions.continue}</EasyTButton>
        : <EasyTButton icon={Check} disabled={loading || !review.canConfirm} onClick={onConfirm}>{copy.actions.confirm}</EasyTButton>}
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
        existingPlaceIds={existingPlaceIds} onAction={onAction} search={searchElement} />}
    {search?.error ? <p role="alert">{search.error}</p> : null}
  </BuilderClarificationShell>;
}
