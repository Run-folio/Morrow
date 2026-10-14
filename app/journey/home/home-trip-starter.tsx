"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { CanonicalPlaceAutocomplete } from "@/components/easyt/canonical-place-autocomplete";
import { EasyTSegmentedControl } from "@/components/easyt/easyt-controls";
import { MorroviaConfirmationDialog, MorroviaRecoveryFeedback } from "@/components/easyt/morrovia-feedback";
import { captureJourneyBrief } from "@/lib/easyt/journey-capture";
import { homepageCapturedRouteEvidence, homepageDescribeSourceKey, homepageRouteChoice, homepageRouteReviewKey, homepageTripTypeRequest, invalidateHomepageRouteReview, type HomepageRouteEvidence } from "@/lib/easyt/home-route-choice";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { markPlanningMilestone, planningAttemptOutcome } from "@/lib/easyt/planning-attempt-performance";
import { authClient } from "@/lib/auth-client";
import { travelProfileFromUnknown, tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import { travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import {
  commitHomepageHandoff,
  homepageCompletedReceiptIsUnchanged,
  homepageHandoffReceiptForOwner,
  homepageHandoffMatchesTrip,
  homepageSemanticInputFingerprint,
  homepageCaptureWithSharedOrigin,
  homepageSnapshotForDescribePrompt,
  homepageVisibleDateRange,
  homepagePreflightIssues,
  type HomepageTripType,
  persistEditableHomepageInput,
  projectHomepageInput,
  reservePendingDescribeHandoff,
  type HomepageDestinationEntry,
  type HomepageInputSnapshot, type HomepageHandoffReceipt,
  type StoredHomepageInput,
  type HomeTripDraft,
} from "@/lib/easyt/home-trip-handoff";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { beginNewTripNavigation, requestNewTripNavigationAsync } from "@/lib/easyt/storage";
import { loadRequestedTrip, loadTripRecovery } from "@/lib/easyt/storage";
import { readDurableHomepageState } from "@/lib/easyt/homepage-persistence";
import { HomeDestinationEditor } from "./home-destination-editor";
import { reportPersistenceOutcome } from "@/lib/easyt/persistence-outcome";

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
  const ownerIdRef = useRef(ownerId);
  ownerIdRef.current = ownerId;
  const sessionPendingRef = useRef(sessionPending);
  sessionPendingRef.current = sessionPending;
  const mountedRef = useRef(false);
  const homepageReadyRef = useRef(false);
  const homepageEditedRef = useRef(false);
  const [recoveryReadAttempt, setRecoveryReadAttempt] = useState(0);
  const retryRecoveryRead = () => setRecoveryReadAttempt(current => current + 1);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; homepageReadyRef.current = false; };
  }, []);
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
  const originFocusRequestedRef = useRef(false);
  const [originFocusRequestKey, setOriginFocusRequestKey] = useState(0);
  useEffect(() => {
    if (!originFocusRequestedRef.current || snapshot.mode !== "stops" || loading) return;
    document.querySelector<HTMLInputElement>('#start-building [data-homepage-origin] input')?.focus();
    originFocusRequestedRef.current = false;
  }, [snapshot.mode, loading, originFocusRequestKey]);
  const [recoveryBlocked, setRecoveryBlocked] = useState(true);
  const [focusEntryId, setFocusEntryId] = useState<string | null>(null);
  const [focusRequestKey, setFocusRequestKey] = useState(0);

  const cancelSubmission = () => {
    submissionGenerationRef.current += 1;
    submitInFlightRef.current = false;
    setLoading(false);
  };
  const persistSnapshot = (next: HomepageInputSnapshot) => {
    const isCurrent = () => mountedRef.current && homepageReadyRef.current && !sessionPendingRef.current
      && ownerIdRef.current === next.ownerId && snapshotRef.current.ownerId === next.ownerId
      && snapshotRef.current.revision === next.revision;
    const failed = () => {
      if (!isCurrent()) return;
      setCaptureError(language === "es" ? "No pudimos guardar esta entrada en este dispositivo." : "We couldn't save this trip input on this device.");
    };
    void (async () => {
      try {
        const result = await persistEditableHomepageInput({ storage: window.localStorage, snapshot: next, preserveCompletedReceipt: true, isCurrent });
        if (!isCurrent()) return;
        if (result.ok) storedInputRef.current = result.stored;
        else if (result.reason !== "stale") {
          reportPersistenceOutcome("homepage-input", {stored:false, acknowledgement: result.reason === "storage" ? "storage" : "stale"});
          failed();
        }
      } catch { failed(); }
    })();
  };
  const updateSnapshot = (update: (current: HomepageInputSnapshot) => HomepageInputSnapshot, reviewedEvidence?: HomepageRouteEvidence) => {
    if (recoveryBlocked || !homepageReadyRef.current || sessionPendingRef.current || ownerIdRef.current !== snapshotRef.current.ownerId) return;
    cancelSubmission();
    let next = { ...invalidateHomepageRouteReview(snapshotRef.current, update(snapshotRef.current)), revision: snapshotRef.current.revision + 1 };
    if (reviewedEvidence && next.tripType?.state === "selected") next = { ...next, routeReview: { version: 1, acceptedTripType: next.tripType.value, reviewedInputKey: homepageRouteReviewKey(next, reviewedEvidence) } };
    snapshotRef.current = next;
    homepageEditedRef.current = true;
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
    let active = true;
    homepageReadyRef.current = false;
    setRecoveryBlocked(true);
    if (sessionPending) return () => { active = false; };
    cancelSubmission();
    setCaptureError("");
    // Do not show another owner's input while that scope is being inspected.
    if (snapshotRef.current.ownerId !== ownerId) {
      const scoped = emptySnapshot(ownerId);
      snapshotRef.current = scoped;
      storedInputRef.current = { snapshot: scoped };
      homepageEditedRef.current = false;
      setSnapshot(scoped);
    }
    setTravelProfile(null);
    setProposedType(null);
    const isCurrent = () => active && mountedRef.current && !sessionPendingRef.current && ownerIdRef.current === ownerId;
    const hydrate = async () => {
      const state = await readDurableHomepageState(ownerId, isCurrent);
      if (!isCurrent()) return;
      if (state.kind !== "ready") {
        setCaptureError(language === "es" ? "No pudimos recuperar esta entrada. Conserva esta pestaña abierta e inténtalo de nuevo." : "We couldn't restore this trip input. Keep this tab open and try again.");
        return;
      }
      const next = homepageEditedRef.current && snapshotRef.current.ownerId === ownerId
        ? snapshotRef.current : state.storedInput?.snapshot ?? emptySnapshot(ownerId);
      storedInputRef.current = state.storedInput ?? { snapshot: next };
      try {
        const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(ownerId)) ?? "null");
        setTravelProfile(ownerId ? travelProfileFromUnknown(savedProfile) : null);
      } catch { setTravelProfile(null); }
      if (!isCurrent()) return;
      destinationIdRef.current = nextDestinationNumber(next.entries);
      snapshotRef.current = next;
      setSnapshot(next);
      homepageReadyRef.current = true;
      setRecoveryBlocked(false);
    };
    void hydrate();
    return () => { active = false; homepageReadyRef.current = false; };
  }, [ownerId, sessionPending, recoveryReadAttempt]);

  const markPromptStarted = (inputMethod: "text" | "voice", value: string) => {
    if (promptStartedRef.current || value.trim().length < 3) return;
    promptStartedRef.current = true;
    trackEvent("homepage_prompt_started", { source: "homepage", input_method: inputMethod, is_authenticated: Boolean(session?.user) });
  };

  const submit = async () => {
    if (recoveryBlocked || !homepageReadyRef.current || sessionPendingRef.current || ownerIdRef.current !== snapshotRef.current.ownerId) return;
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const submittedAt = performance.now();
    const submitted = snapshotRef.current;
    const submittedRevision = submitted.revision;
    const submittedOwner = submitted.ownerId;
    const generation = ++submissionGenerationRef.current;
    const isCurrent = () => mountedRef.current && homepageReadyRef.current && !sessionPendingRef.current
      && ownerIdRef.current === submittedOwner && submissionGenerationRef.current === generation
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
    let supersedeCompletedReceipt: HomepageHandoffReceipt | undefined;
    let supersedeCompletedInputRaw: string | null | undefined;
    try {
      const latestState = await readDurableHomepageState(submittedOwner, isCurrent);
      if (!isCurrent()) return;
      if (latestState.kind !== "ready") {
        homepageReadyRef.current = false;
        setRecoveryBlocked(true);
        setCaptureError(language === "es" ? "No pudimos recuperar esta entrada. Conserva esta pestaña abierta e inténtalo de nuevo." : "We couldn't restore this trip input. Keep this tab open and try again.");
        submitInFlightRef.current = false;
        setLoading(false);
        return;
      }
      const latestStored = latestState.storedInput;
      const sameStoredMeaning = latestStored
        && homepageSemanticInputFingerprint(latestStored.snapshot) === homepageSemanticInputFingerprint(submitted);
      if (sameStoredMeaning && latestStored) storedInputRef.current = latestStored;
      const unchangedReceipt = latestStored?.receipt?.version === 1
        && homepageCompletedReceiptIsUnchanged({ snapshot: submitted, receipt: latestStored.receipt })
        ? latestStored.receipt : undefined;
      if (unchangedReceipt) {
        markPlanningMilestone(unchangedReceipt.handoffId, "submit", submittedAt);
        const existingRecovery = await loadTripRecovery(unchangedReceipt.tripId, submittedOwner);
        if (!isCurrent()) return;
        const existingTrip = existingRecovery?.trip
          ?? await loadRequestedTrip(unchangedReceipt.tripId, submittedOwner);
        if (!isCurrent()) return;
        // The receipt binds the old input, not every later edit to its trip.
        // Plan with stops must continue the currently visible route intent.
        const intended = submitted.mode === "stops"
          ? projectHomepageInput({ snapshot: submitted, profile: travelProfile, handoffId: unchangedReceipt.handoffId }) : null;
        const matchesSubmitted = (trip: NonNullable<typeof existingTrip>) => submitted.mode !== "stops" || Boolean(intended?.ok
          && homepageHandoffMatchesTrip({ ...intended.draft, homepage: { ...intended.draft.homepage!, receipt: unchangedReceipt } }, trip, {allowCanonicalStopIds:true}));
        if (existingTrip && matchesSubmitted(existingTrip)) {
          // Re-read the exact scoped receipt after the asynchronous lookup.
          // A competing tab or changed form cannot redeem this stale action.
          const resumeState = await readDurableHomepageState(submittedOwner, isCurrent);
          if (!isCurrent()) return;
          const currentResumeInput = resumeState.kind === "ready" ? resumeState.storedInput : null;
          const currentReceipt = currentResumeInput?.receipt;
          if (!currentResumeInput || currentReceipt?.version !== 1
            || !homepageCompletedReceiptIsUnchanged(currentResumeInput)
            || homepageSemanticInputFingerprint(currentResumeInput.snapshot) !== homepageSemanticInputFingerprint(submitted)
            || currentReceipt.handoffId !== unchangedReceipt.handoffId || currentReceipt.tripId !== unchangedReceipt.tripId
            || currentReceipt.inputFingerprint !== unchangedReceipt.inputFingerprint
            || currentReceipt.semanticInputFingerprint !== unchangedReceipt.semanticInputFingerprint) {
            reportPersistenceOutcome("homepage-resume", {stored:false, acknowledgement:"stale", receiptPresent:Boolean(currentReceipt)});
            setCaptureError(language === "es" ? "No pudimos recuperar este viaje. Revisa Mis viajes." : "We couldn't recover this trip. Check My Trips.");
            return;
          }
          const preserved = await beginNewTripNavigation(submittedOwner, window);
          if (!isCurrent()) return;
          if (!preserved) {
            reportPersistenceOutcome("homepage-preservation", {stored:false, receiptPresent:true});
            setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
            return;
          }
          const resumeAfterPreservation = await readDurableHomepageState(submittedOwner, isCurrent);
          if (!isCurrent()) return;
          if (resumeAfterPreservation.kind !== "ready" || resumeState.kind !== "ready"
            || resumeAfterPreservation.inputRaw !== resumeState.inputRaw) {
            reportPersistenceOutcome("homepage-resume", {stored:false, acknowledgement:"stale", receiptPresent:true});
            setCaptureError(language === "es" ? "No pudimos recuperar este viaje. Revisa Mis viajes." : "We couldn't recover this trip. Check My Trips.");
            return;
          }
          const currentRecovery = await loadTripRecovery(unchangedReceipt.tripId, submittedOwner);
          if (!isCurrent()) return;
          const currentTrip = currentRecovery?.trip ?? await loadRequestedTrip(unchangedReceipt.tripId, submittedOwner);
          if (!isCurrent()) return;
          if (!currentTrip || !matchesSubmitted(currentTrip)) {
            reportPersistenceOutcome("homepage-resume", {stored:false, acknowledgement:"stale", receiptPresent:true});
            setCaptureError(language === "es" ? "Este viaje ha cambiado. Revisa los datos e inténtalo de nuevo." : "This trip has changed. Review your input and try again.");
            return;
          }
          navigationStarted = true;
          reportPersistenceOutcome("homepage-resume", {stored:Boolean(currentRecovery), receiptPresent:true, scopeMatches:true});
          markPlanningMilestone(unchangedReceipt.handoffId, "durable-intake");
          // Only a validated receipt and this owner's readable recovery grant
          // device resume. A cloud-only trip keeps its authenticated entry path.
          router.push(`/journey/new?trip=${encodeURIComponent(unchangedReceipt.tripId)}${currentRecovery ? "&recover=1" : ""}`);
          return;
        }
        if (!existingTrip) {
          const pendingState = await readDurableHomepageState(submittedOwner, isCurrent);
          if (!isCurrent()) return;
          // The durable reader has validated this versioned draft's scope and codec.
          const pendingDraft = pendingState.kind === "ready" ? pendingState.draft as HomeTripDraft | null : null;
          const pendingReceipt = pendingDraft && homepageHandoffReceiptForOwner(pendingDraft, submittedOwner);
          if (pendingDraft && pendingReceipt?.handoffId === unchangedReceipt.handoffId
            && pendingReceipt.tripId === unchangedReceipt.tripId
            && pendingReceipt.inputFingerprint === unchangedReceipt.inputFingerprint
            && pendingReceipt.semanticInputFingerprint === unchangedReceipt.semanticInputFingerprint) {
            const committed = await commitHomepageHandoff({
              storage: window.localStorage, stored: storedInputRef.current, draft: pendingDraft, isCurrent,
              preserveAndBegin: () => requestNewTripNavigationAsync(window),
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
        // A later edited trip is retained; reserve a new identity for this input.
        supersedeCompletedReceipt = unchangedReceipt;
        supersedeCompletedInputRaw = latestState.inputRaw;

      }
      if (!isCurrent()) return;
      const issues = homepagePreflightIssues(submitted, evidenceFor(submitted));
      if (!isCurrent()) return;
      if (issues.length) {
        setCaptureError(issueMessage(issues[0].field));
        if (issues[0].field === "destinations") {
          const entryId = issues[0].entryId ?? submitted.entries.find(entry => !entry.selection)?.id;
          if (entryId) { setFocusEntryId(entryId); setFocusRequestKey(current => current + 1); }
          return;
        }
        // Reveal the existing origin editor when Describe hides an unresolved raw draft.
        // Changing the tab retains every input; no capture or reservation has begun.
        if (issues[0].field === "origin") {
          originFocusRequestedRef.current = true;
          setOriginFocusRequestKey(current => current + 1);
          if (submitted.mode === "describe") {
            updateSnapshot(current => ({ ...current, mode: "stops" }));
            setCaptureError(issueMessage("origin"));
          }
          return;
        }
        const form = document.getElementById("start-building");
        (issues[0].field === "tripType" ? form?.querySelector<HTMLButtonElement>('[data-homepage-trip-type] button')
          : form?.querySelector<HTMLInputElement>('input[role="combobox"], textarea'))?.focus();
        return;
      }
      if (submitted.mode === "stops" && !projectHomepageInput({
        snapshot: submitted, profile: travelProfile, handoffId: "homepage-preflight",
      }).ok) {
        setCaptureError(language === "es" ? "Revisa los datos del viaje e inténtalo de nuevo." : "Review your trip details and try again.");
        return;
      }
      // Both entry modes reserve frozen input. Only Builder's canonical
      // recovery transaction may complete this receipt and its pointer.
      {
        const committed = await reservePendingDescribeHandoff({
          storage: window.localStorage, snapshot: submitted, isCurrent, supersedeCompletedReceipt, supersedeCompletedInputRaw,
          createIds: () => ({ handoffId: generatedId("handoff"), tripId: generatedId("trip") }),
          preserveAndBegin: () => requestNewTripNavigationAsync(window),
        });
        if (!isCurrent()) return;
        if (!committed.ok) {
          reportPersistenceOutcome(committed.reason === "preservation" ? "homepage-preservation" : "homepage-intake", {stored:false, acknowledgement:committed.reason});
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
    } catch {
      if (!isCurrent()) return;
      reportPersistenceOutcome("homepage-intake", {stored:false});
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
    return homepageCapturedRouteEvidence(input.prompt, homepageCaptureWithSharedOrigin(input, captureJourneyBrief(input.prompt)));
  };
  const issueMessage = (field: string) => language === "es"
    ? field === "tripType" ? "Revisa cómo termina el viaje. Elige y confirma el tipo de viaje." : field === "origin" ? "Selecciona el lugar de salida de los resultados." : field === "destinations" ? "Selecciona cada destino de los resultados." : "Revisa los datos del viaje antes de continuar."
    : field === "tripType" ? "Review how your trip ends. Choose and confirm the trip type." : field === "origin" ? "Select your starting place from the results." : field === "destinations" ? "Select each destination from the results." : "Review your trip details before continuing.";
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
  const originInput = snapshot.originInput ?? (snapshot.origin.state === "selected" ? snapshot.origin.value.name : "");
  const summary = choice.conflict ? issueMessage("tripType") : choice.journeyEnd.mode === "explicit"
    ? `${language === "es" ? "Termina en" : "Finish in"} ${choice.journeyEnd.place.name}`
    : choice.tripType === "return_to_start" ? (snapshot.origin.state === "selected" ? `${language === "es" ? "Vuelves a" : "Return to"} ${snapshot.origin.value.name}` : language === "es" ? "Vuelve al inicio" : "Return to start")
    : choice.tripType === "one_way" ? (language === "es" ? "Solo ida" : "One way") : (language === "es" ? "Final del viaje sin confirmar" : "Journey end unconfirmed");
  const interests = snapshot.interests.state === "selected" ? snapshot.interests.value
    : snapshot.interests.state === "cleared" ? [] : tripInterestsWithProfileDefaults([], travelProfile, false);
  const travellers = snapshot.travellers.state === "selected" ? snapshot.travellers.value : 2;

  return <>
  {recoveryBlocked && captureError ? <MorroviaRecoveryFeedback title={captureError}
    safety={language === "es" ? "Conserva esta pestaña abierta mientras revisamos tu entrada guardada." : "Keep this tab open while we check your saved input."}
    onRetry={retryRecoveryRead} retryLabel={language === "es" ? "Reintentar recuperación" : "Try recovery again"} /> : null}
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
        originEntry: <div data-homepage-origin><span data-morrovia-field-label>{language === "es" ? "Sales desde" : "Start from"}</span><CanonicalPlaceAutocomplete
          language={language} label={language === "es" ? "Sales desde" : "Start from"} value={originInput}
          placeholder={language === "es" ? "Ciudad o aeropuerto" : "City or airport"} allowedPlaceTypes={["city", "town", "transport_gateway"]}
          requireCoordinates disabled={sessionPending || recoveryBlocked || loading}
          onChange={value => updateSnapshot(current => ({ ...current, originInput: value, origin: { state: "cleared" } }))}
          onClear={() => updateSnapshot(current => ({ ...current, originInput: "", origin: { state: "cleared" } }))}
          onSelect={suggestion => {const place=journeyEndpointPlaceFromSuggestion(suggestion);if(place)updateSnapshot(current => ({ ...current, originInput: suggestion.label, origin: { state: "selected", value: place } }));}} /></div>,
        routeSummary: <span>{[summary, `${travellers} ${language === "es" ? "viajeros" : "travellers"}`, snapshot.budget.state === "selected" ? ({ value: language === "es" ? "Económico" : "Value", mid: language === "es" ? "Gama media" : "Mid-range", high: language === "es" ? "Lujo" : "Luxury" })[snapshot.budget.value] : ""].filter(Boolean).join(" · ")}</span>,
      },
      mode: snapshot.mode,
      onModeChange: (mode) => updateSnapshot((current) => ({ ...current, mode })),
      destinationEntry: destinationSummary(snapshot.entries, language),
      destinationEditor: <HomeDestinationEditor
        entries={snapshot.entries} language={language} disabled={loading || sessionPending || recoveryBlocked}
        createEntry={() => ({ id: `destination-${destinationIdRef.current++}`, text: "", selection: null })}
        focusEntryId={focusEntryId} focusRequestKey={focusRequestKey}
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
    travelProfile={travelProfile} onSubmit={submit} loading={loading} error={recoveryBlocked ? "" : captureError}
  />
  <MorroviaConfirmationDialog open={Boolean(proposedType)} onCancel={() => setProposedType(null)} onConfirm={acceptTripType}
    title={language === "es" ? "¿Confirmar el tipo de viaje?" : "Confirm trip type?"}
    detail={language === "es" ? "Tu idea incluye un final diferente. Confirma cómo quieres terminar el viaje." : "Your trip idea includes a different ending. Confirm how you want to finish."}
    consequences={[proposedType?.type === "return_to_start" ? (language === "es" ? "El viaje volverá al inicio." : "The journey will return to its start.") : (language === "es" ? "El viaje será de solo ida." : "The journey will be one way.")]}
    confirmLabel={language === "es" ? "Confirmar" : "Confirm"} cancelLabel={language === "es" ? "Cancelar" : "Cancel"} />
  </>;
}
