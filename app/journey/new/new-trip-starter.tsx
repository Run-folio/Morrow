"use client";

import { useEffect, useRef, useState } from "react";
import { reportQaPersistenceBoundary, qaNativeFailureCategory } from "@/lib/easyt/persistence-outcome";
import { useRouter } from "next/navigation";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { JourneyEndpointsEditor } from "@/components/easyt/journey-endpoints-editor";
import { HomeDestinationEditor } from "@/app/journey/home/home-destination-editor";
import { homepageSnapshotForDescribePrompt, homepageVisibleDateRange, persistEditableHomepageInput, persistHomepageIntakeForImport, type HomepageDestinationEntry, type HomepageInputSnapshot, pendingHomepageSubmissionForOwner, pendingHomepageHandoffForOwner, homepageSemanticInputFingerprint, type PendingIntakeReceipt, pendingIntakeContinuation } from "@/lib/easyt/home-trip-handoff";
import { readDurableHomepageState } from "@/lib/easyt/homepage-persistence";
import { deferNewTripNavigation, EASYT_BEFORE_NEW_TRIP_EVENT, EASYT_NEW_TRIP_INPUT_CHANGE_EVENT, loadCurrentDraftRecovery } from "@/lib/easyt/storage";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { resumableNewTripSnapshot } from "./new-trip-entry-state";
import { MorroviaRecoveryFeedback } from "@/components/easyt/morrovia-feedback";
import { EasyTButton, EasyTLinkButton } from "@/components/easyt/easyt-controls";
import { FileSpreadsheet } from "lucide-react";
import styles from "./trip-builder.module.css";

function emptyInput(ownerId: string | null): HomepageInputSnapshot {
  return {
    version: 1, ownerId, revision: 0, mode: "stops",
    entries: [{ id: "destination-1", text: "", selection: null }], prompt: "",
    dates: { state: "untouched" }, budget: { state: "untouched" },
    interests: { state: "untouched" }, travellers: { state: "untouched" },
    origin: { state: "untouched" }, journeyEnd: { state: "untouched" },
  };
}

export function NewTripStarter({ ownerId, language, travelProfile, onSubmit }: {
  ownerId: string | null;
  language: EasyTLanguage;
  travelProfile: TravelProfile | null;
  onSubmit: (snapshot: HomepageInputSnapshot) => Promise<void>;
}) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<HomepageInputSnapshot>(() => emptyInput(ownerId));
  const snapshotRef = useRef(snapshot);
  const submitInFlightRef = useRef(false);
  const nextEntryId = useRef(2);
  const [ready, setReady] = useState(false);
  const readyRef = useRef(false);
  const mountedRef = useRef(false);
  const ownerRef = useRef(ownerId);
  ownerRef.current = ownerId;
  const generationRef = useRef(0);
  const writeRef = useRef<Promise<void>>(Promise.resolve());
  type PendingSubmission = { receipt: PendingIntakeReceipt; inputRaw: string | null; draftRaw: string | null };
  const [pendingSubmission, setPendingSubmission] = useState<PendingSubmission | null>(null);
  const pendingSubmissionRef = useRef<PendingSubmission | null>(null);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const { start: startDate, end: endDate } = homepageVisibleDateRange(snapshot);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    mountedRef.current = true;
    readyRef.current = false;
    setReady(false);
    submitInFlightRef.current = false;
    const generation = ++generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation && ownerRef.current === ownerId;
    void (async () => {
      const state = await readDurableHomepageState(ownerId, isCurrent);
      if (!isCurrent()) return;
      reportQaPersistenceBoundary("intake", "intake-restore", {accepted:state.kind === "ready",writeAttempted:false,receiptPresent:state.kind === "ready" && Boolean(state.storedInput?.receipt)});
      if (state.kind !== "ready") {
        setError(language === "es" ? "No pudimos recuperar esta entrada. Mantén esta pestaña abierta." : "We couldn't restore this trip input. Keep this tab open.");
        return;
      }
      const pending = pendingHomepageSubmissionForOwner(state.storedInput, state.draft, ownerId);
      // Keep the editable branch, including raw input, rather than substituting
      // the frozen reservation. Resume must independently validate both.
      const next = (pending ? state.storedInput?.snapshot : resumableNewTripSnapshot(state.storedInput)) ?? emptyInput(ownerId);
      pendingSubmissionRef.current = pending ? {receipt:pending,inputRaw:state.inputRaw,draftRaw:state.draftRaw} : null;
      setPendingSubmission(pendingSubmissionRef.current);
      nextEntryId.current = Math.max(1, ...next.entries.map((entry) => Number(entry.id.match(/^destination-(\d+)$/)?.[1] ?? 0))) + 1;
      snapshotRef.current = next;
      setSnapshot(next);
      setStartInput(next.origin.state === "selected" ? next.origin.value.name : next.originInput ?? "");
      setEndInput(next.journeyEnd.state === "selected" && next.journeyEnd.value.mode === "explicit" ? next.journeyEnd.value.place.name : "");
      readyRef.current = true;
      setReady(true);
    })().catch(error => {
      if (!isCurrent()) return;
      reportQaPersistenceBoundary("intake", "intake-restore", {accepted:false,writeAttempted:false,nativeFailure:qaNativeFailureCategory(error)});
      setError(language === "es" ? "No pudimos recuperar esta entrada. Mantén esta pestaña abierta." : "We couldn't restore this trip input. Keep this tab open.");
    });
    return () => { mountedRef.current = false; readyRef.current = false; generationRef.current++; };
  }, [ownerId]);

  useEffect(() => {
    const generation = generationRef.current;
    const preserveBeforeNewTrip = (event: Event) => {
      const current = snapshotRef.current;
      const isCurrent = () => mountedRef.current && readyRef.current && ownerRef.current === ownerId
        && generationRef.current === generation && snapshotRef.current === current;
      deferNewTripNavigation(event, (async () => {
        await writeRef.current;
        if (!isCurrent()) return false;
        const state = await readDurableHomepageState(ownerId, isCurrent);
        if (!isCurrent()) return false;
        if (state.kind === "ready" && JSON.stringify(state.storedInput?.snapshot ?? emptyInput(ownerId)) === JSON.stringify(current)) return true;
        setError(language === "es" ? "Mantén esta pestaña abierta: tus cambios actuales aún no están guardados." : "Keep this tab open: your current changes have not been saved.");
        return false;
      })());
    };
    window.addEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
    return () => window.removeEventListener(EASYT_BEFORE_NEW_TRIP_EVENT, preserveBeforeNewTrip);
  }, [ownerId, language]);

  const resumePendingSubmission = async () => {
    const retained = pendingSubmissionRef.current;
    const current = snapshotRef.current;
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && readyRef.current && ownerRef.current === ownerId
      && generationRef.current === generation && snapshotRef.current === current;
    if (!retained || loading || !isCurrent()) return;
    setLoading(true);
    try {
      await writeRef.current;
      if (!isCurrent()) return;
      const state = await readDurableHomepageState(ownerId, isCurrent);
      const pending = state.kind === "ready" && pendingHomepageSubmissionForOwner(state.storedInput, state.draft, ownerId);
      if (!isCurrent()) return;
      if (state.kind !== "ready" || !pending || state.inputRaw !== retained.inputRaw || state.draftRaw !== retained.draftRaw
        || pending.tripId !== retained.receipt.tripId || pending.handoffId !== retained.receipt.handoffId
        || pending.semanticInputFingerprint !== retained.receipt.semanticInputFingerprint
        || JSON.stringify(state.storedInput?.snapshot) !== JSON.stringify(current)
        || homepageSemanticInputFingerprint(current) !== pending.semanticInputFingerprint) {
        setError(language === "es" ? "Mantén esta pestaña abierta para conservar tus cambios actuales. La entrada guardada necesita revisión." : "Keep this tab open to preserve your current changes. The saved submission needs review.");
        return;
      }
      const home = pendingHomepageHandoffForOwner(state.draft, ownerId, pending.handoffId);
      router.push(home
        ? `/journey/new?homeDraft=1&handoff=${encodeURIComponent(pending.handoffId)}&resumePending=1`
        : `/journey/new?handoff=${encodeURIComponent(pending.handoffId)}&resumePending=1`);
    } catch {
      if (isCurrent()) setError(language === "es" ? "No pudimos reanudar la entrada guardada. Mantén esta pestaña abierta." : "We couldn't resume the saved submission. Keep this tab open.");
    } finally { if (isCurrent()) setLoading(false); }
  };

  const update = (change: (current: HomepageInputSnapshot) => HomepageInputSnapshot) => {
    if (!readyRef.current || ownerRef.current !== ownerId) return;
    submitInFlightRef.current = false;
    setLoading(false);
    const next = { ...change(snapshotRef.current), revision: snapshotRef.current.revision + 1 };
    snapshotRef.current = next;
    // Retire the navigation request synchronously, including the window after
    // this child's ACK while another listener or pointer checkpoint is pending.
    window.dispatchEvent(new Event(EASYT_NEW_TRIP_INPUT_CHANGE_EVENT));
    setSnapshot(next);
    setError("");
    if (pendingSubmissionRef.current) {
      // Current raw controls and the frozen intake are separate branches. Only
      // the explicit guarded release below may replace their predecessor.
      setError(language === "es" ? "Una entrada anterior sigue guardada. Mantén esta pestaña abierta para conservar tus cambios actuales." : "An earlier submission is still saved. Keep this tab open to preserve your current changes.");
      return;
    }
    let intakeStorage: Storage;
    try { intakeStorage = window.localStorage; }
    catch (error) {
      reportQaPersistenceBoundary("intake", "intake-storage-access", {accepted:false,writeAttempted:false,nativeFailure:qaNativeFailureCategory(error)});
      setError(language === "es" ? "No pudimos guardar estos cambios en este dispositivo." : "We couldn't save these changes on this device.");
      return;
    }
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && generationRef.current === generation && ownerRef.current === next.ownerId
      && snapshotRef.current === next;
    writeRef.current = (async () => {
      try {
        const result = await persistEditableHomepageInput({ storage: intakeStorage, snapshot: next, isCurrent });
        if (!isCurrent() || !result.ok && result.reason === "stale") return;
        const state = await readDurableHomepageState(ownerId, isCurrent);
        if (!isCurrent()) return;
        const pending = state.kind === "ready" && pendingHomepageSubmissionForOwner(state.storedInput, state.draft, ownerId);
        if (result.ok) {
          if (state.kind === "ready" && !pending && JSON.stringify(state.storedInput?.snapshot) === JSON.stringify(next)) {
            pendingSubmissionRef.current = null;
            setPendingSubmission(null);
          }
          return;
        }
        if (pending && state.kind === "ready") {
          pendingSubmissionRef.current = {receipt:pending,inputRaw:state.inputRaw,draftRaw:state.draftRaw};
          setPendingSubmission(pendingSubmissionRef.current);
        }
        setError(result.reason === "reserved"
          ? (language === "es" ? "Una entrada anterior sigue guardada. Mantén esta pestaña abierta para conservar tus cambios actuales." : "An earlier submission is still saved. Keep this tab open to preserve your current changes.")
          : (language === "es" ? "No pudimos guardar estos cambios en este dispositivo." : "We couldn't save these changes on this device."));
      } catch {
        if (isCurrent()) setError(language === "es" ? "No pudimos guardar estos cambios en este dispositivo." : "We couldn't save these changes on this device.");
      }
    })();
  };
  const saveCurrentChanges = async () => {
    const retained = pendingSubmissionRef.current;
    const current = snapshotRef.current;
    const generation = generationRef.current;
    const isCurrent = () => mountedRef.current && readyRef.current && ownerRef.current === ownerId
      && generationRef.current === generation && snapshotRef.current === current && pendingSubmissionRef.current === retained;
    if (!retained || loading || !isCurrent()) return;
    setLoading(true);
    try {
      await writeRef.current;
      if (!isCurrent()) return;
      const state = await readDurableHomepageState(ownerId, isCurrent);
      if (!isCurrent()) return;
      const completed = state.kind === "ready" && state.storedInput?.receipt;
      const recovery = state.kind === "ready" ? await loadCurrentDraftRecovery(ownerId) : null;
      if (!isCurrent()) return;
      const checkpoint = state.kind === "ready" && recovery && pendingIntakeContinuation({ownerId,
        inputRaw:state.inputRaw,draftRaw:state.draftRaw,recovery,fromHomepage:state.draftRaw !== null});
      if (state.kind !== "ready" || !completed || completed.version !== 1
        || pendingHomepageSubmissionForOwner(state.storedInput, state.draft, ownerId)
        || completed.handoffId !== retained.receipt.handoffId || completed.tripId !== retained.receipt.tripId
        || completed.semanticInputFingerprint !== retained.receipt.semanticInputFingerprint || !checkpoint || checkpoint.pending) {
        setError(language === "es" ? "La entrada guardada aún necesita revisión. Mantén esta pestaña abierta para conservar tus cambios actuales." : "The saved submission still needs review. Keep this tab open to preserve your current changes.");
        return;
      }
      const saved = await persistEditableHomepageInput({storage:window.localStorage,snapshot:current,isCurrent,
        expectedPrevious:{inputRaw:state.inputRaw,draftRaw:state.draftRaw}});
      if (!isCurrent()) return;
      const verified = saved.ok && await readDurableHomepageState(ownerId, isCurrent);
      if (!isCurrent()) return;
      if (!verified || verified.kind !== "ready" || verified.storedInput?.receipt
        || JSON.stringify(verified.storedInput?.snapshot) !== JSON.stringify(current)) {
        setError(language === "es" ? "No pudimos guardar estos cambios. Mantén esta pestaña abierta." : "We couldn't save these changes. Keep this tab open.");
        return;
      }
      pendingSubmissionRef.current = null;
      setPendingSubmission(null);
      setError("");
    } catch {
      if (isCurrent()) setError(language === "es" ? "No pudimos guardar estos cambios. Mantén esta pestaña abierta." : "We couldn't save these changes. Keep this tab open.");
    } finally { if (mountedRef.current && ownerRef.current === ownerId && generationRef.current === generation) setLoading(false); }
  };

  const submit = async () => {
    if (!readyRef.current || pendingSubmissionRef.current) return;
    if (submitInFlightRef.current || snapshotRef.current.ownerId !== ownerId) {
      reportQaPersistenceBoundary("intake", "intake-guard", {accepted:submitInFlightRef.current ? undefined : false,phase:submitInFlightRef.current ? "probe" : "result",scopeMatches:snapshotRef.current.ownerId === ownerId,writeAttempted:false,acknowledgement:submitInFlightRef.current ? "pending" : undefined});
      return;
    }
    submitInFlightRef.current = true;
    const submitted = snapshotRef.current;
    const isCurrent = () => snapshotRef.current.revision === submitted.revision
      && snapshotRef.current.ownerId === submitted.ownerId
      && snapshotRef.current.mode === submitted.mode;
    setLoading(true);
    try {
      if (!isCurrent()) return;
      await onSubmit(submitted);
    } catch {
      if (isCurrent()) setError(language === "es" ? "No pudimos conservar tu idea. Inténtalo de nuevo." : "We couldn't save your trip idea. Try again.");
    } finally {
      if (isCurrent()) {
        submitInFlightRef.current = false;
        setLoading(false);
      }
    }
  };


  const persistBeforeImport = async () => {
    if (!mountedRef.current || !readyRef.current || ownerRef.current !== ownerId || pendingSubmissionRef.current) {
      setError(language === "es" ? "Guarda tus cambios actuales antes de abrir la importación. Mantén esta pestaña abierta." : "Save your current changes before opening Import. Keep this tab open.");
      return false;
    }
    const current = snapshotRef.current;
    const saved = await persistHomepageIntakeForImport(window.localStorage, current, undefined,
      () => snapshotRef.current.ownerId === current.ownerId && snapshotRef.current.revision === current.revision);
    if (!saved) setError(language === "es" ? "No pudimos guardar tu idea antes de abrir la importación." : "We couldn't save your trip idea before opening Import.");
    return saved;
  };

  const interests = snapshot.interests.state === "selected" ? snapshot.interests.value
    : snapshot.interests.state === "cleared" ? [] : tripInterestsWithProfileDefaults([], travelProfile, false);
  const travellers = snapshot.travellers.state === "selected" ? snapshot.travellers.value : 2;
  const journeyEnd: JourneyEndSelection = snapshot.journeyEnd.state === "selected" ? snapshot.journeyEnd.value : { mode: "unknown" };
  const labels = snapshot.entries.map((entry) => entry.selection?.name ?? entry.text.trim()).filter(Boolean);
  const destinationSummary = labels.length === 0 ? (language === "es" ? "Añade tu primera parada" : "Add your first stop")
    : labels.length === 1 ? labels[0] : `${labels[0]} · +${labels.length - 1} ${language === "es" ? "más" : "more"}`;

  const pendingHasCurrentChanges = Boolean(pendingSubmission && (() => {
    try { return JSON.stringify(snapshot) !== JSON.stringify(JSON.parse(pendingSubmission.inputRaw ?? "null")?.snapshot); }
    catch { return true; }
  })());
  const savedSubmissionHref = pendingSubmission ? (() => {
    const receipt = pendingSubmission.receipt;
    let home = false;
    try { home = Boolean(pendingHomepageHandoffForOwner(JSON.parse(pendingSubmission.draftRaw ?? "null"), ownerId, receipt.handoffId)); } catch { /* Receiver still refuses invalid sources. */ }
    return `/journey/new?${home ? "homeDraft=1&" : ""}handoff=${encodeURIComponent(receipt.handoffId)}&resumePending=1`;
  })() : "";

  if (!ready || snapshot.ownerId !== ownerId) return error ? <MorroviaRecoveryFeedback title={language === "es" ? "Entrada no disponible" : "Trip input unavailable"} detail={error} safety={language === "es" ? "Mantén esta pestaña abierta." : "Keep this tab open."} /> : null;

  return <>{pendingSubmission ? <MorroviaRecoveryFeedback
    title={language === "es" ? "Entrada guardada pendiente" : "Saved submission waiting"}
    detail={pendingHasCurrentChanges
      ? (language === "es" ? "Abre la entrada guardada en otra pestaña. Después vuelve aquí y guarda tus cambios actuales." : "Open the saved submission in a new tab. Then return here and save your current changes.")
      : (language === "es" ? "Reanuda la entrada guardada sin sustituir tus cambios actuales." : "Resume the saved submission without replacing your current changes.")}
    safety={pendingHasCurrentChanges
      ? (language === "es" ? "Tus cambios actuales solo están en esta pestaña hasta que los guardes. Mantén esta pestaña abierta." : "Your current changes are only in this tab until you save them. Keep this tab open.")
      : (language === "es" ? "Mantén esta pestaña abierta si tienes cambios sin guardar." : "Keep this tab open if you have unsaved changes.")}
    actions={pendingHasCurrentChanges ? <>
      <EasyTLinkButton href={savedSubmissionHref} target="_blank" rel="noopener noreferrer" variant="secondary">{language === "es" ? "Abrir entrada guardada en otra pestaña" : "Open saved submission in a new tab"}</EasyTLinkButton>
      <EasyTButton variant="secondary" disabled={loading} onClick={() => { void saveCurrentChanges(); }}>{language === "es" ? "Guardar cambios actuales" : "Save current changes"}</EasyTButton>
    </> : <EasyTButton variant="secondary" disabled={loading} onClick={() => { void resumePendingSubmission(); }}>{language === "es" ? "Reanudar entrada guardada" : "Resume saved submission"}</EasyTButton>}
  /> : null}<MorroviaTripCapture
    formId="new-trip-planner" progressiveDetails language={language} value={snapshot.prompt}
    onValueChange={(prompt) => update((current) => {
      const next = homepageSnapshotForDescribePrompt(current, prompt);
      if (next.origin.state !== "selected") setStartInput("");
      if (next.journeyEnd.state !== "selected") setEndInput("");
      return next;
    })}
    homepageEntry={{
      mode: snapshot.mode,
      onModeChange: (mode) => update((current) => ({ ...current, mode })),
      destinationEntry: destinationSummary,
      destinationEditor: <HomeDestinationEditor entries={snapshot.entries} language={language} disabled={loading}
        createEntry={() => ({ id: `destination-${nextEntryId.current++}`, text: "", selection: null })}
        onChange={(entries: HomepageDestinationEntry[]) => update((current) => ({ ...current, entries }))} />,
      budget: snapshot.budget.state === "selected" ? snapshot.budget.value : null,
      onBudgetChange: (budget) => update((current) => ({ ...current, budget: budget ? { state: "selected", value: budget } : { state: "cleared" } })),
      datesChosen: snapshot.dates.state === "selected",
      onDatesClear: () => update((current) => ({ ...current, dates: { state: "cleared" } })),
    }}
    endpointEntry={<JourneyEndpointsEditor
      language={language} startValue={startInput} endValue={endInput} endSelection={journeyEnd}
      showHeading={false} showHint={false}
      onStartChange={(value) => { setStartInput(value); update((current) => ({ ...current, originInput: value, origin: { state: "cleared" } })); }}
      onStartSelect={(suggestion) => { const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return;setStartInput(suggestion.name); update((current) => ({ ...current, originInput: suggestion.name, origin: { state: "selected", value: place } })); }}
      onEndChange={(value) => { setEndInput(value); update((current) => ({ ...current, journeyEnd: value.trim()
        ? { state: "selected", value: { mode: "explicit", place: { name: value.trim() } } } : { state: "cleared" } })); }}
      onEndSelect={(suggestion) => { const place=journeyEndpointPlaceFromSuggestion(suggestion);if(!place)return;setEndInput(suggestion.name); update((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode: "explicit", place } } })); }}
      onEndModeChange={(mode) => { setEndInput(""); update((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode } } })); }}
    />}
    startDate={startDate} endDate={endDate}
    onDatesChange={(range) => update((current) => ({ ...current, dates: { state: "selected", value: range } }))}
    travellers={travellers} onTravellersChange={(value) => update((current) => ({ ...current, travellers: { state: "selected", value } }))}
    interests={interests} onInterestsChange={(value: TripInterest[]) => update((current) => ({ ...current, interests: { state: "selected", value } }))}
    travelProfile={travelProfile} onSubmit={submit} loading={loading} error={error}
  />
    <div className={styles.importTripEntry}><EasyTLinkButton href="/journey/new/import" variant="secondary" size="small" icon={FileSpreadsheet}
      onClick={(event) => { event.preventDefault(); void persistBeforeImport().then((saved) => { if (saved) router.push("/journey/new/import"); }); }}>{language === "es" ? "Importar un viaje existente" : "Import existing trip"}</EasyTLinkButton></div>
  </>;
}
