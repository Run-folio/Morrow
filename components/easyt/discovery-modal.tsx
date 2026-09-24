"use client";

import { ArrowLeft, Check } from "lucide-react";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryDraft, DiscoveryDraftAction, DiscoveryStep } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { BuilderClarificationShell } from "./builder-clarification-shell";
import { DiscoverySteps } from "./discovery-steps";
import { EasyTButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";

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
  const selectedBaseId = draft.baseByIntentId[mention.mentionId] ?? draft.visitBaseByIntentId[mention.mentionId];
  const hasCommittableChoice = Boolean(selectedBaseId || draft.shortlistIds.some(id =>
    projection.places.find(place => place.id === id && place.actionability === "overnight-base")));
  const searchElement = search ? <CanonicalPlaceAutocomplete language={language} label={`${copy.searchWithin} ${name}`}
    value={search.value} placeholder={copy.searchPlaceholder}
    contextCountries={mention.parentCountries}
    parentConstraint={entry.kind === "country" || entry.kind === "region" ? { canonicalName: mention.canonicalName, placeType: mention.placeType, parentCountries: mention.parentCountries } : undefined}
    invalid={Boolean(search.error)} onChange={search.onChange} onSelect={search.onSelect} /> : undefined;

  return <BuilderClarificationShell open={open} itemKey={`${mention.mentionId}:${step}`} title={copy.steps[step]}
    description={`${mention.sourceText}. ${copy.intro}`}
    progress={`${stepIndex + 1} / ${steps.length}`} closeLabel={copy.accessibility.close}
    onDismiss={onClose} discovery
    footer={<>
      <div>
        {previousStep ? <EasyTButton icon={ArrowLeft} variant="quiet" onClick={() => onAction({ type: "set-step", step: previousStep })}>{copy.actions.back}</EasyTButton> : null}
        <EasyTButton variant="quiet" onClick={onClose}>{copy.actions.finishLater}</EasyTButton>
      </div>
      {nextStep ? <EasyTButton disabled={loading} onClick={() => onAction({ type: "set-step", step: nextStep })}>{copy.actions.continue}</EasyTButton>
        : <EasyTButton icon={Check} disabled={loading || !hasCommittableChoice} onClick={onConfirm}>{copy.actions.confirm}</EasyTButton>}
    </>}>
    {loading ? <MorroviaStatusBanner role="status" title={copy.status.loading} detail={copy.intro} />
      : <DiscoverySteps entry={entry} mention={mention} projection={projection} draft={{ ...draft, step }} language={language}
        existingPlaceIds={existingPlaceIds} onAction={onAction} search={searchElement} />}
    {search?.error ? <p role="alert">{search.error}</p> : null}
  </BuilderClarificationShell>;
}
