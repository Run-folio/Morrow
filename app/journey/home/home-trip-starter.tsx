"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { JourneyEndpointsEditor } from "@/components/easyt/journey-endpoints-editor";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { travelProfileFromUnknown, tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import { homepageInputStorageKey, travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { createLatestJourneyCaptureRequestGate, journeyCaptureFailureMessage, requestJourneyCapture } from "@/lib/easyt/journey-capture-client";
import {
  commitHomepageHandoff,
  homepageSubmissionFingerprint,
  projectHomepageInput,
  readHomepageInput,
  reusableHomepageReceipt,
  type HomepageDestinationEntry,
  type HomepageHandoffReceipt,
  type HomepageInputSnapshot,
  type StoredHomepageInput,
} from "@/lib/easyt/home-trip-handoff";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { beginNewTripNavigation } from "@/lib/easyt/storage";
import { HomeDestinationEditor } from "./home-destination-editor";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function generatedId(prefix: string) {
  try { return `${prefix}-${crypto.randomUUID()}`; }
  catch { return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
}
function emptySnapshot(ownerId: string | null): HomepageInputSnapshot {
  return {
    version: 1, ownerId, revision: 0, mode: "stops",
    entries: [{ id: "destination-1", text: "", selection: null }], prompt: "",
    dates: { state: "untouched" }, budget: { state: "untouched" }, interests: { state: "untouched" },
    travellers: { state: "untouched" }, origin: { state: "untouched" }, journeyEnd: { state: "untouched" },
  };
}
function nextDestinationNumber(entries: readonly HomepageDestinationEntry[]) {
  return Math.max(1, ...entries.map((entry) => Number(entry.id.match(/^destination-(\d+)$/)?.[1] ?? 0))) + 1;
}

function destinationSummary(entries: readonly HomepageDestinationEntry[], language: EasyTLanguage) {
  const labels = entries.map((entry) => entry.selection?.name ?? entry.text.trim()).filter(Boolean);
  if (!labels.length) return language === "es" ? "¿Adónde quieres ir?" : "Where do you want to go?";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} · +${labels.length - 1} ${language === "es" ? "más" : "more"}`;
}

export default function HomeTripStarter() {
  const router = useRouter();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const ownerId = session?.user?.id ?? null;
  const promptStartedRef = useRef(false);
  const captureRequestGateRef = useRef<ReturnType<typeof createLatestJourneyCaptureRequestGate> | null>(null);
  if (!captureRequestGateRef.current) captureRequestGateRef.current = createLatestJourneyCaptureRequestGate();
  const submitInFlightRef = useRef(false);
  const destinationIdRef = useRef(2);
  const initialSnapshot = useRef(emptySnapshot(ownerId));
  const snapshotRef = useRef<HomepageInputSnapshot>(initialSnapshot.current);
  const storedInputRef = useRef<StoredHomepageInput>({ snapshot: initialSnapshot.current });
  const [snapshot, setSnapshot] = useState<HomepageInputSnapshot>(initialSnapshot.current);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [startInput, setStartInput] = useState("");
  const [journeyEndInput, setJourneyEndInput] = useState("");
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");

  const cancelSubmission = () => {
    captureRequestGateRef.current?.cancel();
    submitInFlightRef.current = false;
    setLoading(false);
  };
  const persistSnapshot = (next: HomepageInputSnapshot, receipt = storedInputRef.current.receipt) => {
    const stored: StoredHomepageInput = receipt ? { snapshot: next, receipt } : { snapshot: next };
    storedInputRef.current = stored;
    try {
      window.localStorage.setItem(homepageInputStorageKey(next.ownerId), JSON.stringify(stored));
      return true;
    } catch {
      setCaptureError(language === "es" ? "No pudimos guardar esta entrada en este dispositivo." : "We couldn't save this trip input on this device.");
      return false;
    }
  };
  const updateSnapshot = (update: (current: HomepageInputSnapshot) => HomepageInputSnapshot) => {
    cancelSubmission();
    const next = { ...update(snapshotRef.current), revision: snapshotRef.current.revision + 1 };
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
    try {
      const raw = JSON.parse(window.localStorage.getItem(homepageInputStorageKey(ownerId)) ?? "null");
      const stored = readHomepageInput(raw, ownerId);
      if (stored) {
        next = stored.snapshot;
        storedInputRef.current = stored;
      } else storedInputRef.current = { snapshot: next };
      const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(ownerId)) ?? "null");
      setTravelProfile(ownerId ? travelProfileFromUnknown(savedProfile) : null);
    } catch {
      storedInputRef.current = { snapshot: next };
      setTravelProfile(null);
    }
    destinationIdRef.current = nextDestinationNumber(next.entries);
    snapshotRef.current = next;
    setSnapshot(next);
    if (next.dates.state === "selected") {
      setStartDate(next.dates.value.start);
      setEndDate(next.dates.value.end);
    }
    setStartInput(next.origin.state === "selected" ? next.origin.value.name : "");
    setJourneyEndInput(next.journeyEnd.state === "selected" && next.journeyEnd.value.mode === "explicit" ? next.journeyEnd.value.place.name : "");
  }, [ownerId, sessionPending]);
  useEffect(() => () => captureRequestGateRef.current?.cancel(), []);

  const markPromptStarted = (inputMethod: "text" | "voice", value: string) => {
    if (promptStartedRef.current || value.trim().length < 3) return;
    promptStartedRef.current = true;
    trackEvent("homepage_prompt_started", { source: "homepage", input_method: inputMethod, is_authenticated: Boolean(session?.user) });
  };

  const submit = async () => {
    if (submitInFlightRef.current) return;
    submitInFlightRef.current = true;
    const submitted = snapshotRef.current;
    const submittedRevision = submitted.revision;
    const submittedOwner = submitted.ownerId;
    const request = captureRequestGateRef.current!.begin();
    const isCurrent = () => request.isCurrent()
      && snapshotRef.current.revision === submittedRevision
      && snapshotRef.current.ownerId === submittedOwner;
    trackEvent("trip_generation_started", {
      trip_source: "homepage", has_dates: submitted.dates.state === "selected",
      traveller_count: submitted.travellers.state === "selected" ? submitted.travellers.value : 2,
      is_authenticated: Boolean(submittedOwner),
    });
    setLoading(true);
    setCaptureError("");
    let responseReceived = false;
    let navigationStarted = false;
    try {
      const capture = submitted.mode === "describe"
        ? await requestJourneyCapture(submitted.prompt, { signal: request.signal, onResponse: () => { responseReceived = true; } })
        : undefined;
      if (!isCurrent()) return;
      const priorReceipt = storedInputRef.current.receipt;
      const initialHandoffId = priorReceipt?.handoffId ?? generatedId("handoff");
      let projected = projectHomepageInput({ snapshot: submitted, capture, profile: travelProfile, handoffId: initialHandoffId });
      if (!projected.ok) {
        setCaptureError(language === "es" ? "Revisa los datos del viaje e inténtalo de nuevo." : "Review your trip details and try again.");
        return;
      }
      let receipt = reusableHomepageReceipt(storedInputRef.current, projected.draft);
      if (!receipt) {
        const handoffId = priorReceipt ? generatedId("handoff") : initialHandoffId;
        if (handoffId !== projected.draft.handoffId) {
          projected = projectHomepageInput({ snapshot: submitted, capture, profile: travelProfile, handoffId });
          if (!projected.ok) return;
        }
        receipt = {
          version: 1, ownerId: submittedOwner, handoffId: projected.draft.handoffId!,
          inputFingerprint: homepageSubmissionFingerprint(projected.draft), tripId: generatedId("trip"),
        } satisfies HomepageHandoffReceipt;
      }
      const stored: StoredHomepageInput = { snapshot: submitted, receipt };
      const draft = { ...projected.draft, homepage: { ...projected.draft.homepage!, receipt } };
      if (!isCurrent()) return;
      const committed = await commitHomepageHandoff({
        storage: window.localStorage, stored, draft, isCurrent,
        preserveAndBegin: () => beginNewTripNavigation(submittedOwner, window),
      });
      if (!isCurrent()) return;
      if (!committed.ok) {
        setCaptureError(language === "es" ? "No pudimos conservar tu trabajo actual. Inténtalo de nuevo." : "We couldn't preserve your current work. Try again.");
        trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: "unknown", is_authenticated: Boolean(submittedOwner) });
        return;
      }
      storedInputRef.current = stored;
      navigationStarted = true;
      router.push(committed.href);
    } catch {
      if (!isCurrent()) return;
      setCaptureError(journeyCaptureFailureMessage(responseReceived ? "interpretation" : "network", language));
      trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: responseReceived ? "capture" : "network", is_authenticated: Boolean(submittedOwner) });
    } finally {
      if (isCurrent() && !navigationStarted) {
        submitInFlightRef.current = false;
        setLoading(false);
      }
      request.finish();
    }
  };

  const interests = snapshot.interests.state === "selected" ? snapshot.interests.value
    : snapshot.interests.state === "cleared" ? [] : tripInterestsWithProfileDefaults([], travelProfile, false);
  const travellers = snapshot.travellers.state === "selected" ? snapshot.travellers.value : 2;
  const journeyEnd: JourneyEndSelection = snapshot.journeyEnd.state === "selected" ? snapshot.journeyEnd.value : { mode: "unknown" };

  return <MorroviaTripCapture
    formId="start-building" progressiveDetails disabled={sessionPending} language={language} value={snapshot.prompt}
    onValueChange={(prompt) => updateSnapshot((current) => ({ ...current, prompt }))}
    onPromptStarted={markPromptStarted}
    homepageEntry={{
      mode: snapshot.mode,
      onModeChange: (mode) => updateSnapshot((current) => ({ ...current, mode })),
      destinationEntry: destinationSummary(snapshot.entries, language),
      destinationEditor: <HomeDestinationEditor
        entries={snapshot.entries} language={language} disabled={loading}
        createEntry={() => ({ id: `destination-${destinationIdRef.current++}`, text: "", selection: null })}
        onChange={(entries: HomepageDestinationEntry[]) => updateSnapshot((current) => ({ ...current, entries }))}
      />,
      budget: snapshot.budget.state === "selected" ? snapshot.budget.value : null,
      onBudgetChange: (budget) => updateSnapshot((current) => ({ ...current, budget: budget ? { state: "selected", value: budget } : { state: "cleared" } })),
      datesChosen: snapshot.dates.state === "selected",
      onDatesClear: () => updateSnapshot((current) => ({ ...current, dates: { state: "cleared" } })),
    }}
    endpointEntry={<JourneyEndpointsEditor
      language={language} startValue={startInput} endValue={journeyEndInput} endSelection={journeyEnd}
      showHeading={false} showHint={false}
      onStartChange={(value) => { setStartInput(value); updateSnapshot((current) => ({ ...current, origin: { state: "cleared" } })); }}
      onStartSelect={(suggestion) => { setStartInput(suggestion.name); updateSnapshot((current) => ({ ...current, origin: { state: "selected", value: journeyEndpointPlaceFromSuggestion(suggestion) } })); }}
      onEndChange={(value) => {
        setJourneyEndInput(value);
        updateSnapshot((current) => ({ ...current, journeyEnd: value.trim()
          ? { state: "selected", value: { mode: "explicit", place: { name: value.trim() } } }
          : { state: "cleared" } }));
      }}
      onEndSelect={(suggestion) => { setJourneyEndInput(suggestion.name); updateSnapshot((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode: "explicit", place: journeyEndpointPlaceFromSuggestion(suggestion) } } })); }}
      onEndModeChange={(mode) => { setJourneyEndInput(""); updateSnapshot((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode } } })); }}
    />}
    startDate={startDate} endDate={endDate}
    onDatesChange={(range) => { setStartDate(range.start); setEndDate(range.end); updateSnapshot((current) => ({ ...current, dates: { state: "selected", value: range } })); }}
    travellers={travellers}
    onTravellersChange={(value) => updateSnapshot((current) => ({ ...current, travellers: { state: "selected", value } }))}
    interests={interests}
    onInterestsChange={(value: TripInterest[]) => updateSnapshot((current) => ({ ...current, interests: { state: "selected", value } }))}
    travelProfile={travelProfile} onSubmit={submit} loading={loading} error={captureError}
  />;
}
