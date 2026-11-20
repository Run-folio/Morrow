"use client";

import { useState, type RefObject } from "react";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaConfirmationDialog } from "@/components/easyt/morrovia-feedback";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { homepageTripTypeRequest, homepageRouteChoice, homepageRouteReviewKey, type HomepageRouteEvidence } from "@/lib/easyt/home-route-choice";
import type { HomepageInputSnapshot, HomepageTripType } from "@/lib/easyt/home-trip-handoff";
import type { EasyTLanguage } from "@/lib/easyt/i18n";

// Both entry surfaces use the same route controls, but retain their own persistence and submission owners.
export function useSharedPlannerRoute({ snapshot, snapshotRef, evidenceFor, updateSnapshot, language, disabled }: {
  snapshot: HomepageInputSnapshot;
  snapshotRef: RefObject<HomepageInputSnapshot>;
  evidenceFor: (input: HomepageInputSnapshot) => HomepageRouteEvidence | undefined;
  updateSnapshot: (change: (current: HomepageInputSnapshot) => HomepageInputSnapshot, evidence?: HomepageRouteEvidence) => void;
  language: EasyTLanguage;
  disabled: boolean;
}) {
  const [proposedType, setProposedType] = useState<{ snapshot: HomepageInputSnapshot; evidence: HomepageRouteEvidence; type: HomepageTripType } | null>(null);
  const chosenSnapshot = (current: HomepageInputSnapshot, type: HomepageTripType, evidence?: HomepageRouteEvidence): HomepageInputSnapshot => ({
    ...current, tripType: { state: "selected", value: type }, journeyEnd: { state: "selected", value: type === "return_to_start" ? { mode: "same_as_start" }
      : evidence?.journeyEnd.mode === "explicit" ? evidence.journeyEnd
      : current.journeyEnd.state === "selected" && current.journeyEnd.value.mode === "explicit" ? current.journeyEnd.value : { mode: "unknown" } },
  });
  const requestTripType = (type: HomepageTripType) => {
    const current = snapshotRef.current;
    const request = homepageTripTypeRequest(current,type,evidenceFor(current));
    const {snapshot:next,evidence}=request;
    if (request.conflict) {
      setProposedType({ snapshot: current, evidence: evidence ?? { tripType: null, journeyEnd: current.journeyEnd.state === "selected" ? current.journeyEnd.value : { mode: "unknown" }, source: "legacy", status: "clear" }, type });
    } else updateSnapshot(() => next);
  };
  const acceptTripType = () => {
    if (!proposedType) return;
    const current = snapshotRef.current;
    if (current.ownerId !== proposedType.snapshot.ownerId || current.revision !== proposedType.snapshot.revision
      || homepageRouteReviewKey(current, evidenceFor(current) ?? proposedType.evidence) !== homepageRouteReviewKey(proposedType.snapshot, proposedType.evidence)) { setProposedType(null); return; }
    updateSnapshot(() => chosenSnapshot(current, proposedType.type, proposedType.evidence), proposedType.evidence);
    setProposedType(null);
  };
  const choice = homepageRouteChoice(snapshot, evidenceFor(snapshot));
  const proposedEnd = proposedType?.evidence.journeyEnd;
  const currentEnd = proposedType?.snapshot.journeyEnd;
  const namedFinish = proposedEnd?.mode === "explicit" ? proposedEnd.place.name
    : currentEnd?.state === "selected" && currentEnd.value.mode === "explicit" ? currentEnd.value.place.name : null;
  const returning = proposedType?.type === "return_to_start";
  const originInput = snapshot.originInput ?? (snapshot.origin.state === "selected" ? snapshot.origin.value.name : "");
  const planner = {
        tripTypeControl: <div data-homepage-trip-type><EasyTSegmentedControl ariaLabel={language === "es" ? "Tipo de viaje" : "Trip type"} disabled={disabled}
          value={choice.tripType} options={[{ value: "return_to_start", label: language === "es" ? "Ida y vuelta" : "Return" }, { value: "one_way", label: language === "es" ? "Solo ida" : "One way" }]}
          onChange={type => { if (type !== "unknown_legacy") requestTripType(type); }} /></div>,
        originEntry: <div data-homepage-origin><span data-morrovia-field-label>{language === "es" ? "Sales desde" : "Start from"}</span><CanonicalPlaceAutocomplete
          language={language} label={language === "es" ? "Sales desde" : "Start from"} value={originInput}
          placeholder={language === "es" ? "Ciudad o aeropuerto" : "City or airport"} allowedPlaceTypes={["city", "town", "transport_gateway"]}
          requireCoordinates disabled={disabled}
          onChange={value => updateSnapshot(current => ({ ...current, originInput: value, origin: { state: "cleared" } }))}
          onClear={() => updateSnapshot(current => ({ ...current, originInput: "", origin: { state: "cleared" } }))}
          onSelect={suggestion => {const place=journeyEndpointPlaceFromSuggestion(suggestion);if(place)updateSnapshot(current => ({ ...current, originInput: suggestion.label, origin: { state: "selected", value: place } }));}} /></div>,
        routeSummary: null,
      };
  const confirmation = <MorroviaConfirmationDialog open={Boolean(proposedType)} onCancel={() => setProposedType(null)} onConfirm={acceptTripType}
    eyebrow=""
    title={returning ? (language === "es" ? "¿Volver al punto de salida?" : "Return to your starting point?") : (language === "es" ? "¿Hacer un viaje de solo ida?" : "Make this a one-way trip?")}
    detail={namedFinish
      ? returning
        ? (language === "es" ? `El viaje ya no terminará en ${namedFinish}.` : `Your trip will no longer end in ${namedFinish}.`)
        : (language === "es" ? `El viaje terminará en ${namedFinish}.` : `Your trip will end in ${namedFinish}.`)
      : language === "es" ? "Tu plan indica un final diferente." : "Your plan gives a different ending."}
    consequences={[]}
    confirmLabel={returning ? (language === "es" ? "Elegir ida y vuelta" : "Use return trip") : (language === "es" ? "Elegir solo ida" : "Use one-way trip")}
    cancelLabel={language === "es" ? "Conservar plan actual" : "Keep current plan"} />;
  return {planner, confirmation, setProposedType};
}
