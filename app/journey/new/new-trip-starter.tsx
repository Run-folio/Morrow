"use client";

import { useEffect, useRef, useState } from "react";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { JourneyEndpointsEditor } from "@/components/easyt/journey-endpoints-editor";
import { HomeDestinationEditor } from "@/app/journey/home/home-destination-editor";
import { homepageSnapshotForDescribePrompt, persistHomepageIntakeForImport, readHomepageInput, type HomepageDestinationEntry, type HomepageInputSnapshot } from "@/lib/easyt/home-trip-handoff";
import { homepageInputStorageKey } from "@/lib/easyt/private-browser-context";
import { journeyEndpointPlaceFromSuggestion } from "@/lib/easyt/journey-endpoints";
import { tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import type { JourneyEndSelection } from "@/lib/easyt/trip";
import type { TripInterest } from "@/lib/easyt/trip-interest";
import { resumableNewTripSnapshot } from "./new-trip-entry-state";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
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

function iso(date: Date) { return date.toISOString().slice(0, 10); }

export function NewTripStarter({ ownerId, language, travelProfile, onSubmit }: {
  ownerId: string | null;
  language: EasyTLanguage;
  travelProfile: TravelProfile | null;
  onSubmit: (snapshot: HomepageInputSnapshot) => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<HomepageInputSnapshot>(() => emptyInput(ownerId));
  const snapshotRef = useRef(snapshot);
  const submitInFlightRef = useRef(false);
  const nextEntryId = useRef(2);
  const [ready, setReady] = useState(false);
  const [startInput, setStartInput] = useState("");
  const [endInput, setEndInput] = useState("");
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    submitInFlightRef.current = false;
    let next = emptyInput(ownerId);
    try {
      const stored = readHomepageInput(JSON.parse(window.localStorage.getItem(homepageInputStorageKey(ownerId)) ?? "null"), ownerId);
      const resumable = resumableNewTripSnapshot(stored);
      if (resumable) {
        next = resumable;
        // A materially edited completed intake starts a new handoff identity.
        if (stored?.receipt) window.localStorage.setItem(homepageInputStorageKey(ownerId), JSON.stringify({ snapshot: next }));
      }
    } catch {
      setError(language === "es" ? "No pudimos recuperar lo que escribiste en este dispositivo." : "We couldn't restore the trip input on this device.");
    }
    nextEntryId.current = Math.max(1, ...next.entries.map((entry) => Number(entry.id.match(/^destination-(\d+)$/)?.[1] ?? 0))) + 1;
    snapshotRef.current = next;
    setSnapshot(next);
    if (next.dates.state === "selected") {
      setStartDate(next.dates.value.start);
      setEndDate(next.dates.value.end);
    }
    setStartInput(next.origin.state === "selected" ? next.origin.value.name : "");
    setEndInput(next.journeyEnd.state === "selected" && next.journeyEnd.value.mode === "explicit" ? next.journeyEnd.value.place.name : "");
    setReady(true);
  }, [ownerId, language]);

  const update = (change: (current: HomepageInputSnapshot) => HomepageInputSnapshot) => {
    submitInFlightRef.current = false;
    setLoading(false);
    const next = { ...change(snapshotRef.current), revision: snapshotRef.current.revision + 1 };
    snapshotRef.current = next;
    setSnapshot(next);
    setError("");
    try { window.localStorage.setItem(homepageInputStorageKey(ownerId), JSON.stringify({ snapshot: next })); }
    catch { setError(language === "es" ? "No pudimos guardar estos cambios en este dispositivo." : "We couldn't save these changes on this device."); }
  };
  const submit = async () => {
    if (submitInFlightRef.current || snapshotRef.current.ownerId !== ownerId) return;
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
  if (!ready || snapshot.ownerId !== ownerId) return null;

  const persistBeforeImport = () => {
    const saved = persistHomepageIntakeForImport(window.localStorage, snapshotRef.current);
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

  return <><MorroviaTripCapture
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
      onStartChange={(value) => { setStartInput(value); update((current) => ({ ...current, origin: { state: "cleared" } })); }}
      onStartSelect={(suggestion) => { setStartInput(suggestion.name); update((current) => ({ ...current, origin: { state: "selected", value: journeyEndpointPlaceFromSuggestion(suggestion) } })); }}
      onEndChange={(value) => { setEndInput(value); update((current) => ({ ...current, journeyEnd: value.trim()
        ? { state: "selected", value: { mode: "explicit", place: { name: value.trim() } } } : { state: "cleared" } })); }}
      onEndSelect={(suggestion) => { setEndInput(suggestion.name); update((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode: "explicit", place: journeyEndpointPlaceFromSuggestion(suggestion) } } })); }}
      onEndModeChange={(mode) => { setEndInput(""); update((current) => ({ ...current, journeyEnd: { state: "selected", value: { mode } } })); }}
    />}
    startDate={startDate} endDate={endDate}
    onDatesChange={(range) => { setStartDate(range.start); setEndDate(range.end); update((current) => ({ ...current, dates: { state: "selected", value: range } })); }}
    travellers={travellers} onTravellersChange={(value) => update((current) => ({ ...current, travellers: { state: "selected", value } }))}
    interests={interests} onInterestsChange={(value: TripInterest[]) => update((current) => ({ ...current, interests: { state: "selected", value } }))}
    travelProfile={travelProfile} onSubmit={submit} loading={loading} error={error}
  />
    <div className={styles.importTripEntry}><EasyTLinkButton href="/journey/new/import" variant="secondary" size="small" icon={FileSpreadsheet}
      onClick={(event) => { if (!persistBeforeImport()) event.preventDefault(); }}>{language === "es" ? "Importar un viaje existente" : "Import existing trip"}</EasyTLinkButton></div>
  </>;
}
