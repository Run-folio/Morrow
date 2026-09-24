"use client";

import { ArrowLeft, Check } from "lucide-react";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryDraft, DiscoveryDraftAction, DiscoveryStep } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { CanonicalPlaceSuggestion, ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { findCatalogPlaceById } from "@/lib/easyt/place-catalog";
import { CanonicalPlaceAutocomplete } from "./canonical-place-autocomplete";
import { BuilderClarificationShell } from "./builder-clarification-shell";
import { EasyTButton } from "./easyt-controls";

type Search = {
  value: string;
  error?: string;
  onChange: (value: string) => void;
  onSelect: (suggestion: CanonicalPlaceSuggestion) => void;
};

export function DiscoveryModal({ open, entry, mention, projection, draft, onAction, onConfirm, onClose, language = "en", search }: {
  open: boolean;
  entry: DiscoveryEntry;
  mention: ResolvedPlaceMention;
  projection: DiscoveryProjection;
  draft: DiscoveryDraft;
  onAction: (action: DiscoveryDraftAction) => void;
  onConfirm: () => void;
  onClose: () => void;
  language?: "en" | "es";
  search?: Search;
}) {
  const spanish = language === "es";
  const step = draft.step;
  const steps: DiscoveryStep[] = entry.kind === "landmark" || entry.kind === "natural-area"
    ? ["bases", "review"] : projection.directions.length ? ["directions", "places", "review"] : ["places", "review"];
  const stepIndex = Math.max(0, steps.indexOf(step));
  const previousStep = steps[stepIndex - 1];
  const nextStep = steps[stepIndex + 1];
  const name = mention.canonicalName || mention.sourceText;
  const title = spanish ? `Explorar ${name}` : `Explore ${name}`;
  const description = spanish ? `Tu idea original: ${mention.sourceText}. Revisa las opciones antes de cambiar la ruta.`
    : `Your original idea: ${mention.sourceText}. Review choices before changing the route.`;
  const selectedNames = draft.shortlistIds.map(id => projection.places.find(place => place.id === id)?.name ?? findCatalogPlaceById(id)?.canonicalName ?? id);
  const baseId = draft.baseByIntentId[mention.mentionId] ?? draft.visitBaseByIntentId[mention.mentionId];
  const baseName = baseId ? projection.places.find(place => place.id === baseId)?.name ?? findCatalogPlaceById(baseId)?.canonicalName ?? baseId : null;
  return <BuilderClarificationShell open={open} itemKey={`${mention.mentionId}:${step}`} title={title} description={description}
    progress={`${stepIndex + 1} / ${steps.length}`} closeLabel={spanish ? "Cerrar Discovery" : "Close Discovery"}
    onDismiss={onClose} discovery
    footer={<>
      <div>
        {previousStep ? <EasyTButton icon={ArrowLeft} variant="quiet" onClick={() => onAction({ type: "set-step", step: previousStep })}>{spanish ? "Atrás" : "Back"}</EasyTButton> : null}
        <EasyTButton variant="quiet" onClick={onClose}>{spanish ? "Terminar más tarde" : "Finish later"}</EasyTButton>
      </div>
      {nextStep ? <EasyTButton onClick={() => onAction({ type: "set-step", step: nextStep })}>{spanish ? "Continuar" : "Continue"}</EasyTButton>
        : <EasyTButton icon={Check} disabled={!draft.shortlistIds.length && !baseId}
          onClick={onConfirm}>{spanish ? "Confirmar lugares" : "Confirm places"}</EasyTButton>}
    </>}>
    {step === "directions" ? <section aria-label={spanish ? "Direcciones" : "Directions"}>
      {projection.directions.map(direction => <EasyTButton key={direction.id} variant="secondary"
        aria-pressed={draft.directionId === direction.id}
        onClick={() => { onAction({ type: "change-direction", directionId: direction.id }); onAction({ type: "set-step", step: "places" }); }}>
        {direction.id.replace(/^australia-/, "").replaceAll("-", " ")}
      </EasyTButton>)}
    </section> : null}
    {step === "places" || step === "bases" ? <section aria-label={spanish ? "Lugares" : "Places"}>
      {projection.places.slice(0, 6).map(place => <div key={place.id}>
        <strong>{place.name}</strong> · {place.country}
        <p>{spanish ? place.relevance.es : place.relevance.en}</p>
        {place.actionability === "overnight-base" ? <EasyTButton variant="secondary" aria-pressed={step === "bases" ? baseId === place.id : draft.shortlistIds.includes(place.id)}
          onClick={() => step === "bases"
            ? onAction({ type: entry.kind === "landmark" ? "choose-visit-base" : "choose-base", intentId: mention.mentionId, baseId: place.id })
            : onAction({ type: draft.shortlistIds.includes(place.id) ? "remove-shortlist" : "add-shortlist", placeId: place.id })}>
          {step === "bases" && baseId === place.id || step !== "bases" && draft.shortlistIds.includes(place.id) ? spanish ? "Elegido" : "Selected" : spanish ? "Seleccionar" : "Select"}
        </EasyTButton> : <small>{spanish ? "Explorar; aún no es una base verificada" : "Explore; not a verified overnight base"}</small>}
      </div>)}
      {!projection.places.length ? <p>{spanish ? "Aún no hay lugares revisados aquí. Busca un lugar específico." : "No reviewed places here yet. Search for a specific place."}</p> : null}
      {baseName ? <p aria-live="polite">{spanish ? "Base elegida" : "Chosen base"}: {baseName}</p> : null}
      {search ? <CanonicalPlaceAutocomplete language={language} label={spanish ? `Buscar dentro de ${name}` : `Search within ${name}`}
        value={search.value} placeholder={spanish ? "Buscar un lugar" : "Search for a place"}
        contextCountries={mention.parentCountries}
        parentConstraint={entry.kind === "country" || entry.kind === "region" ? { canonicalName: mention.canonicalName, placeType: mention.placeType, parentCountries: mention.parentCountries } : undefined}
        invalid={Boolean(search.error)} onChange={search.onChange} onSelect={search.onSelect} /> : null}
    </section> : null}
    {step === "review" ? <section aria-label={spanish ? "Revisar selección" : "Review selection"}>
      <p>{spanish ? "Tu idea original sigue guardada. Solo se añadirán lugares confirmados." : "Your original idea is preserved. Only confirmed places will be added."}</p>
      {selectedNames.length ? <ul>{selectedNames.map((selectedName, index) => <li key={draft.shortlistIds[index]}>{selectedName}</li>)}</ul>
        : baseName ? <p>{spanish ? "Base elegida" : "Chosen base"}: {baseName}</p>
          : <p>{spanish ? "Todavía no has elegido una base verificada." : "You have not chosen a verified base yet."}</p>}
    </section> : null}
    {search?.error ? <p role="alert">{search.error}</p> : null}
  </BuilderClarificationShell>;
}
