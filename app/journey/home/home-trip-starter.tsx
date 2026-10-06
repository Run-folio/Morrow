"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaConfirmationDialog } from "@/components/easyt/morrovia-feedback";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { homepageCapturedRouteEvidence, homepageDescribeSourceKey, homepageRouteChoice, homepageRouteReviewKey, invalidateHomepageRouteReview, type HomepageRouteEvidence } from "@/lib/easyt/home-route-choice";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { markPlanningMilestone, planningAttemptOutcome } from "@/lib/easyt/planning-attempt-performance";
import { authClient } from "@/lib/auth-client";
import { travelProfileFromUnknown, tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import { homepageInputStorageKey, travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import {
  commitHomepageHandoff,
  HOME_TRIP_DRAFT_KEY,
  homepageCompletedReceiptIsUnchanged,
  homepageHandoffReceiptForOwner,
  homepageReceiptForProjection,
  homepageSemanticInputFingerprint,
  homepageSnapshotForDescribePrompt,
  homepageVisibleDateRange,
  homepagePreflightIssues,
  type HomepageTripType,
  persistEditableHomepageInput,
  projectHomepageInput,
  reservePendingDescribeHandoff,
  readHomepageInput,
  reusableHomepageReceipt,
  type HomepageDestinationEntry,
  type HomepageInputSnapshot,
  type StoredHomepageInput,
} from "@/lib/easyt/home-trip-handoff";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { beginNewTripNavigation } from "@/lib/easyt/storage";
import { loadRequestedTrip, loadTripRecovery } from "@/lib/easyt/storage";
import { HomeDestinationEditor } from "./home-destination-editor";

function generatedId(prefix: string) {
  try { return `${prefix}-${crypto.randomUUID()}`; }
  catch { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function emptySnapshot(ownerId: string | null): HomepageInputSnapshot {
  return {
    version: 1, ownerId, revision: 0, mode: "stops",
    entries: [{ id: "destination-1", text: "", selection: null }], prompt: "",
    dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" },
    tripType: { state: "untouched" }, originInput: "",
    travellers: { state: "untouched" }, origin: { state: "untouched" }, journeyEnd: { state: "untouched" },
  };
}
function nextDestinationNumber(entries: readonly HomepageDestinationEntry[]) {
  return Math.max(1, ...entries.map((entry) => Number(entry.id.match(/^destination-(\d+)$/)?.[1] ?? 0))) + 1;
}

function destinationSummary(entries: readonly HomepageDestinationEntry[], language: EasyTLanguage) {
  const labels = entries.map((entry) => entry.selection?.name ?? entry.text.trim()).filter(Boolean);
  if (!labels.length) return language === "es" ? "Añade tu primera parada" : "Add your first stop";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} · +${labels.length - 1} ${language === "es" ? "más" : "more"}`;
}

export default function HomeTripStarter() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const ownerId = session?.user?.id ?? null;
  const promptStartedRef = useRef(false);
  const submissionGenerationRef = useRef(0);
  const submitInFlightRef = useRef(false);
  const destinationIdRef = useRef(2);
  const initialSnapshot = useRef(emptySnapshot(ownerId));
  const snapshotRef = useRef<HomepageInputSnapshot>(initialSnapshot.current);
  const storedInputRef = useRef<StoredHomepageInput>({ snapshot: initialSnapshot.current });
  const [snapshot, setSnapshot] = useState<HomepageInputSnapshot>(initialSnapshot.current);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [proposedType, setProposedType] = useState<{ snapshot: HomepageInputSnapshot; evidence: HomepageRouteEvidence; type: HomepageTripType } | null>(null);
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);
  const { start: startDate, end: endDate } = homepageVisibleDateRange(snapshot);
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);

  const cancelSubmission = () => {
    submissionGenerationRef.current += 1;
    submitInFlightRef.current = false;
    setLoading(false);
  };
  const persistSnapshot = (next: HomepageInputSnapshot) => {
    void persistEditableHomepageInput({ storage: window.localStorage, snapshot: next, preserveCompletedReceipt: true,
      isCurrent: () => snapshotRef.current.ownerId === next.ownerId && snapshotRef.current.revision === next.revision })
      .then((result) => {
        if (snapshotRef.current.ownerId !== next.ownerId || snapshotRef.current.revision !== next.revision) return;
        if (result.ok) storedInputRef.current = result.stored;
        else if (result.reason !== "stale") setCaptureError(language === "es" ? "No pudimos guardar esta entrada en este dispositivo." : "We couldn't save this trip input on this device.");
      });
  };
  const updateSnapshot = (update: (current: HomepageInputSnapshot) => HomepageInputSnapshot, reviewedEvidence?: HomepageRouteEvidence) => {
    if (recoveryBlocked) return;
    cancelSubmission();
    let next = { ...invalidateHomepageRouteReview(snapshotRef.current, update(snapshotRef.current)), revision: snapshotRef.current.revision + 1 };
    if (reviewedEvidence && next.tripType?.state === "selected") next = { ...next, routeReview: { version: 1, acceptedTripType: next.tripType.value, reviewedInputKey: homepageRouteReviewKey(next, reviewedEvidence) } };
    snapshotRef.current = next;
    setSnapshot(next);
    setCaptureError("");
    persistSnapshot(next);
  };

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    cancelSubmission();
    let next = emptySnapshot(ownerId);
    setRecoveryBlocked(false);
    setCaptureError("");
    try {
      const raw = JSON.parse(window.localStorage.getItem(homepageInputStorageKey(ownerId)) ?? "null");
      const stored = readHomepageInput(raw, ownerId);
      if (stored) {
        next = stored.snapshot;
        storedInputRef.current = stored;
      } else {
        const recoverable = readHomepageInput({ snapshot: raw?.snapshot }, ownerId);
        if (recoverable) next = recoverable.snapshot;
        storedInputRef.current = { snapshot: next };
        if (raw !== null) {
          setRecoveryBlocked(true);
          setCaptureError(language === "es" ? "No pudimos recuperar esta entrada. La copia guardada sigue en este dispositivo." : "We couldn't restore this trip input. Your saved recovery copy is still on this device.");
        }
      }
      try {
        const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(ownerId)) ?? "null");
        setTravelProfile(ownerId ? travelProfileFromUnknown(savedProfile) : null);
      } catch { setTravelProfile(null); }
    } catch {
      storedInputRef.current = { snapshot: next };
      setTravelProfile(null);
      setRecoveryBlocked(true);
      setCaptureError(language === "es" ? "No pudimos recuperar esta entrada. La copia guardada sigue en este dispositivo." : "We couldn't restore this trip input. Your saved recovery copy is still on this device.");
    }
    destinationIdRef.current = nextDestinationNumber(next.entries);
    snapshotRef.current = next;
    setSnapshot(next);
    setProposedType(null);
  }, [ownerId, sessionPending]);

  const markPromptStarted = (inputMethod: "text" | "voice", value: string) => {
    if (promptStartedRef.current || value.trim().length < 3) return;
    promptStartedRef.current = true;
    trackEvent("homepage_prompt_started", { source: "homepage", input_method: inputMethod, is_authenticated: Boolean(session?.user) });
  };

  const submit = async () => {
    if (recoveryBlocked) return;
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const submittedAt = performance.now();
    const submitted = snapshotRef.current;
    const submittedRevision = submitted.revision;
    const submittedOwner = submitted.ownerId;
    const generation = ++submissionGenerationRef.current;
    const isCurrent = () => submissionGenerationRef.current === generation
      && snapshotRef.current.revision === submittedRevision
      && snapshotRef.current.ownerId === submittedOwner;
    trackEvent("trip_generation_started", {
      trip_source: "homepage", has_dates: submitted.dates.state === "selected",
      traveller_count: submitted.travellers.state === "selected" ? submitted.travellers.value : 2,
      is_authenticated: Boolean(submittedOwner),
    });
    setLoading(true);
    setCaptureError("");
    let navigationStarted = false;
    try {
      let latestStored: StoredHomepageInput | null = null;
      try { latestStored = readHomepageInput(JSON.parse(window.localStorage.getItem(homepageInputStorageKey(submittedOwner)) ?? "null"), submittedOwner); }
      catch { /* The staged handoff still validates and reports storage failure. */ }
      const sameStoredMeaning = latestStored
        && homepageSemanticInputFingerprint(latestStored.snapshot) === homepageSemanticInputFingerprint(submitted);
      if (sameStoredMeaning && latestStored) storedInputRef.current = latestStored;
      const unchangedReceipt = storedInputRef.current.receipt?.version === 1
        && homepageCompletedReceiptIsUnchanged({ snapshot: submitted, receipt: storedInputRef.current.receipt })
        ? storedInputRef.current.receipt : undefined;
      if (unchangedReceipt) {
        markPlanningMilestone(unchangedReceipt.handoffId, "submit", submittedAt);
        const existingTrip = loadTripRecovery(unchangedReceipt.tripId, submittedOwner)?.trip
          ?? await loadRequestedTrip(unchangedReceipt.tripId, submittedOwner);
        if (!isCurrent()) return;
        if (existingTrip) {
          if (!beginNewTripNavigation(submittedOwner, window)) {
            setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
            return;
          }
          navigationStarted = true;
          markPlanningMilestone(unchangedReceipt.handoffId, "durable-intake");
          router.push(`/journey/new?trip=${encodeURIComponent(unchangedReceipt.tripId)}`);
          return;
        }
        let pendingDraft = null;
        try { pendingDraft = JSON.parse(window.localStorage.getItem(HOME_TRIP_DRAFT_KEY) ?? "null"); } catch { /* fail closed */ }
        const pendingReceipt = pendingDraft && homepageHandoffReceiptForOwner(pendingDraft, submittedOwner);
        if (pendingReceipt?.handoffId === unchangedReceipt.handoffId
          && pendingReceipt.tripId === unchangedReceipt.tripId
          && pendingReceipt.inputFingerprint === unchangedReceipt.inputFingerprint
          && pendingReceipt.semanticInputFingerprint === unchangedReceipt.semanticInputFingerprint) {
          const committed = await commitHomepageHandoff({
            storage: window.localStorage, stored: storedInputRef.current, draft: pendingDraft, isCurrent,
            preserveAndBegin: () => beginNewTripNavigation(submittedOwner, window),
          });
          if (!isCurrent()) return;
          if (committed.ok) {
            navigationStarted = true;
            markPlanningMilestone(unchangedReceipt.handoffId, "durable-intake");
            router.push(committed.href);
            return;
          }
        }
        // A completed receipt is never reprojected just because capture has
        // changed or the old draft is missing.
        setCaptureError(language === "es" ? "No pudimos recuperar este viaje. Revisa Mis viajes." : "We couldn't recover this trip. Check My Trips.");
        return;
      }
      if (!isCurrent()) return;
      const issues = homepagePreflightIssues(submitted, evidenceFor(submitted));
      if (!isCurrent()) return;
      if (issues.length) {
        setCaptureError(issueMessage(issues[0].field));
        const form = document.getElementById("start-building");
        (issues[0].field === "origin" ? form?.querySelector<HTMLInputElement>('[data-homepage-origin] input')
          : issues[0].field === "tripType" ? form?.querySelector<HTMLButtonElement>('[data-homepage-trip-type] button')
          : form?.querySelector<HTMLInputElement>('input[role="combobox"], textarea'))?.focus();
        return;
      }
      if (submitted.mode === "describe") {
        const committed = await reservePendingDescribeHandoff({
          storage: window.localStorage, snapshot: submitted, isCurrent,
          createIds: () => ({ handoffId: generatedId("handoff"), tripId: generatedId("trip") }),
          preserveAndBegin: () => beginNewTripNavigation(submittedOwner, window),
        });
        if (!isCurrent()) return;
        if (!committed.ok) {
          setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
          trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: "unknown", is_authenticated: Boolean(submittedOwner) });
          return;
        }
        storedInputRef.current = committed.stored;
        markPlanningMilestone(committed.receipt.handoffId, "submit", submittedAt);
        markPlanningMilestone(committed.receipt.handoffId, "durable-intake");
        navigationStarted = true;
        router.push(committed.href);
        return;
      }
      if (!isCurrent()) return;
      const priorReceipt = storedInputRef.current.receipt;
      const initialHandoffId = priorReceipt?.handoffId ?? generatedId("handoff");
      let projected = projectHomepageInput({ snapshot: submitted, profile: travelProfile, handoffId: initialHandoffId });
      if (!projected.ok) {
        setCaptureError(language === "es" ? "Revisa los datos del viaje e inténtalo de nuevo." : "Review your trip details and try again.");
        return;
      }
      let receipt = reusableHomepageReceipt(storedInputRef.current, projected.draft);
      if (!receipt) {
        const handoffId = priorReceipt ? generatedId("handoff") : initialHandoffId;
        if (handoffId !== projected.draft.handoffId) {
          projected = projectHomepageInput({ snapshot: submitted, profile: travelProfile, handoffId });
          if (!projected.ok) return;
        }
        receipt = homepageReceiptForProjection(submitted, projected.draft, generatedId("trip"));
      }
      const stored: StoredHomepageInput = { snapshot: submitted, receipt };
      markPlanningMilestone(receipt.handoffId, "submit", submittedAt);
      const draft = { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } };
      if (!isCurrent()) return;
      const committed = await commitHomepageHandoff({
        storage: window.localStorage, stored, draft, isCurrent,
        preserveAndBegin: () => beginNewTripNavigation(submittedOwner, window),
      });
      if (!isCurrent()) return;
      if (!committed.ok) {
        planningAttemptOutcome(receipt.handoffId, "error");
        setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
        trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: "unknown", is_authenticated: Boolean(submittedOwner) });
        return;
      }
      storedInputRef.current = stored;
      markPlanningMilestone(receipt.handoffId, "durable-intake");
      navigationStarted = true;
      router.push(committed.href);
    } catch {
      if (!isCurrent()) return;
      setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
      trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: "unknown", is_authenticated: Boolean(submittedOwner) });
    } finally {
      if (isCurrent() && !navigationStarted) {
        submitInFlightRef.current = false;
        setLoading(false);
      }
    }
  };

  const evidenceFor = (input: HomepageInputSnapshot): HomepageRouteEvidence | undefined => {
    const review = storedInputRef.current.review;
    if (input.mode !== "describe") return undefined;
    if (review?.sourceKey === homepageDescribeSourceKey(input)) return review.evidence;
    return homepageCapturedRouteEvidence(input.prompt, captureJourneyBrief(input.prompt));
  };
  const issueMessage = (field: string) => language === "es"
    ? field === "tripType" ? "Revisa cómo termina el viaje. Elige y confirma el tipo de viaje." : field === "origin" ? "Selecciona el lugar de salida de los resultados." : "Revisa los datos del viaje antes de continuar."
    : field === "tripType" ? "Review how your trip ends. Choose and confirm the trip type." : field === "origin" ? "Select your starting place from the results." : "Review your trip details before continuing.";
  const chosenSnapshot = (current: HomepageInputSnapshot, type: HomepageTripType, evidence?: HomepageRouteEvidence): HomepageInputSnapshot => ({
    ...current, tripType: { state: "selected", value: type }, journeyEnd: { state: "selected", value: type === "return_to_start" ? { mode: "same_as_start" }
      : evidence?.journeyEnd.mode === "explicit" ? evidence.journeyEnd
      : current.journeyEnd.state === "selected" && current.journeyEnd.value.mode === "explicit" ? current.journeyEnd.value : { mode: "unknown" } },
  });
  const requestTripType = (type: HomepageTripType) => {
    const current = snapshotRef.current;
    const knownEnd = current.journeyEnd.state === "selected" ? current.journeyEnd.value : { mode: "unknown" as const };
    const evidence = evidenceFor(current) ?? { tripType: knownEnd.mode === "explicit" ? "one_way" as const : knownEnd.mode === "same_as_start" ? "return_to_start" as const : null,
      journeyEnd: knownEnd, source: "legacy" as const, status: knownEnd.mode === "unknown" ? "unknown" as const : "clear" as const };
    const next = chosenSnapshot(current, type, evidence);
    if (homepageRouteChoice(next, evidence).conflict) {
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
  const originInput = snapshot.originInput ?? (snapshot.origin.state === "selected" ? snapshot.origin.value.name : "");
  const summary = choice.conflict ? issueMessage("tripType") : choice.journeyEnd.mode === "explicit"
    ? `${language === "es" ? "Termina en" : "Finish in"} ${choice.journeyEnd.place.name}`
    : choice.tripType === "return_to_start" ? (snapshot.origin.state === "selected" ? `${language === "es" ? "Vuelves a" : "Return to"} ${snapshot.origin.value.name}` : language === "es" ? "Vuelve al inicio" : "Return to start")
    : choice.tripType === "one_way" ? (language === "es" ? "Solo ida" : "One way") : (language === "es" ? "Final del viaje sin confirmar" : "Journey end unconfirmed");
  const interests = snapshot.interests.state === "selected" ? snapshot.interests.value
    : snapshot.interests.state === "cleared" ? [] : tripInterestsWithProfileDefaults([], travelProfile, false);
  const travellers = snapshot.travellers.state === "selected" ? snapshot.travellers.value : 2;

  return <>
  <MorroviaTripCapture
    formId="start-building" progressiveDetails disabled={sessionPending || recoveryBlocked} language={language} value={snapshot.prompt}
    onValueChange={(prompt) => {
      const next = homepageSnapshotForDescribePrompt(snapshotRef.current, prompt);
      updateSnapshot(() => next);
    }}
    onPromptStarted={markPromptStarted}
    homepageEntry={{
      planner: {
        tripTypeControl: <div data-homepage-trip-type><EasyTSegmentedControl ariaLabel={language === "es" ? "Tipo de viaje" : "Trip type"} disabled={sessionPending || recoveryBlocked || loading}
          value={choice.tripType} options={[{ value: "return_to_start", label: language === "es" ? "Volver al inicio" : "Return to start" }, { value: "one_way", label: language === "es" ? "Solo ida" : "One way" }]}
          onChange={type => { if (type !== "unknown_legacy") requestTripType(type); }} /></div>,
        originEntry: <div data-homepage-origin><span>{language === "es" ? "Sales desde" : "Start from"}</span><CanonicalPlaceAutocomplete
          language={language} label={language === "es" ? "Sales desde" : "Start from"} value={originInput}
          placeholder={language === "es" ? "Ciudad o aeropuerto" : "City or airport"} allowedPlaceTypes={["city", "town", "transport_gateway"]}
          requireCoordinates showPlaceType={false} disabled={sessionPending || recoveryBlocked || loading}
          onChange={value => updateSnapshot(current => ({ ...current, originInput: value, origin: { state: "cleared" } }))}
          onClear={() => updateSnapshot(current => ({ ...current, originInput: "", origin: { state: "cleared" } }))}
          onSelect={suggestion => updateSnapshot(current => ({ ...current, originInput: suggestion.label, origin: { state: "selected", value: journeyEndpointPlaceFromSuggestion(suggestion) } }))} /></div>,
        routeSummary: <span>{[summary, `${travellers} ${language === "es" ? "viajeros" : "travellers"}`, snapshot.budget.state === "selected" ? ({ value: language === "es" ? "Económico" : "Value", mid: language === "es" ? "Gama media" : "Mid-range", high: language === "es" ? "Lujo" : "Luxury" })[snapshot.budget.value] : ""].filter(Boolean).join(" · ")}</span>,
      },
      mode: snapshot.mode,
      onModeChange: (mode) => updateSnapshot((current) => ({ ...current, mode })),
      destinationEntry: destinationSummary(snapshot.entries, language),
      destinationEditor: <HomeDestinationEditor
        entries={snapshot.entries} language={language} disabled={loading || sessionPending || recoveryBlocked}
        createEntry={() => ({ id: `destination-${destinationIdRef.current++}`, text: "", selection: null })}
        focusEntryId={focusEntryId}
        onChange={(entries: HomepageDestinationEntry[]) => updateSnapshot((current) => ({ ...current, entries }))}
      />,
      budget: snapshot.budget.state === "selected" ? snapshot.budget.value : null,
      onBudgetChange: (budget) => updateSnapshot((current) => ({ ...current, budget: budget ? { state: "selected", value: budget } : { state: "cleared" } })),
      datesChosen: snapshot.dates.state === "selected",
      onDatesClear: () => updateSnapshot((current) => ({ ...current, dates: { state: "cleared" } })),
    }}
    startDate={startDate} endDate={endDate}
    onDatesChange={(range) => updateSnapshot((current) => ({ ...current, dates: { state: "selected", value: range } }))}
    travellers={travellers}
    onTravellersChange={(value) => updateSnapshot((current) => ({ ...current, travellers: { state: "selected", value } }))}
    interests={interests}
    onInterestsChange={(value: TripInterest[]) => updateSnapshot((current) => ({ ...current, interests: { state: "selected", value } }))}
    travelProfile={travelProfile} onSubmit={submit} loading={loading} error={captureError}
  />
  <MorroviaConfirmationDialog open={Boolean(proposedType)} onCancel={() => setProposedType(null)} onConfirm={acceptTripType}
    title={language === "es" ? "¿Confirmar el tipo de viaje?" : "Confirm trip type?"}
    detail={language === "es" ? "Tu idea incluye un final diferente. Confirma cómo quieres terminar el viaje." : "Your trip idea includes a different ending. Confirm how you want to finish."}
    consequences={[proposedType?.type === "return_to_start" ? (language === "es" ? "El viaje volverá al inicio." : "The journey will return to its start.") : (language === "es" ? "El viaje será de solo ida." : "The journey will be one way.")]}
    confirmLabel={language === "es" ? "Confirmar" : "Confirm"} cancelLabel={language === "es" ? "Cancelar" : "Cancel"} />
  </>;
}
