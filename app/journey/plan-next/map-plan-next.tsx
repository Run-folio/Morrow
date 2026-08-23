"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CalendarDays, ChevronRight, CircleAlert, MapPin, Route, Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import EasyTNavigation from "../easyt-navigation";
import { loadActiveTrip, loadTripFromEasyT } from "@/lib/easyt/storage";
import type { EasyTTrip, PlannerMapPin } from "@/lib/easyt/trip";
import type { JourneyLeg, JourneyStop } from "@/lib/journey";
import { tripHealth } from "@/lib/easyt/review";
import styles from "./map-plan-next.module.css";
import editorial from "../surface-editorial.module.css";

type FinderTab = "plan" | "stay" | "eat" | "see";

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function formatDuration(minutes: number | null) {
  if (!minutes) return "Timing to confirm";
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `${hours}h ` : ""}${remainder ? `${remainder}m` : ""}`.trim();
}

function mapData(trip: EasyTTrip, resolvedCoordinates: Record<string, [number, number]>): { stops: JourneyStop[]; legs: JourneyLeg[] } {
  const stops = [...trip.stops]
    .sort((a, b) => a.order - b.order)
    .map((stop): JourneyStop => ({
      id: stop.id,
      city: stop.name,
      country: stop.country,
      date: stop.arrivalDate ? formatDate(stop.arrivalDate) : "Dates to confirm",
      coordinates: stop.longitude !== null && stop.latitude !== null ? [stop.longitude, stop.latitude] : resolvedCoordinates[stop.id] ?? null,
      theme: "city",
      marker: "skyline",
      description: `${stop.nights ?? 0} night${stop.nights === 1 ? "" : "s"} planned in ${stop.name}.`,
      highlights: [],
      aiPrompt: "",
    }));
  const stopById = new Map(stops.map((stop) => [stop.id, stop]));
  const legs = [...trip.legs].map((leg): JourneyLeg => ({
    from: leg.fromStopId,
    to: leg.toStopId,
    mode: leg.mode === "train" ? "rail" : leg.mode === "flight" ? "flight" : leg.mode === "road" ? "road" : leg.mode === "ferry" ? "ferry" : "unknown",
    label: `${stopById.get(leg.fromStopId)?.city ?? "Previous stop"} → ${stopById.get(leg.toStopId)?.city ?? "Next stop"}`,
    detail: leg.provider ?? "Planning estimate",
    duration: formatDuration(leg.durationMinutes),
  }));
  return { stops, legs };
}

export default function MapPlanNext() {
  const searchParams = useSearchParams();
  const tripId = searchParams.get("trip");
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedStopId, setSelectedStopId] = useState("");
  const [resolvedCoordinates, setResolvedCoordinates] = useState<Record<string, [number, number]>>({});
  const [finderTab, setFinderTab] = useState<FinderTab>("plan");
  const [showDecisions, setShowDecisions] = useState(true);

  useEffect(() => {
    let active = true;
    void (async () => {
      let next = loadActiveTrip();
      if (tripId) {
        try { next = await loadTripFromEasyT(tripId) ?? next; } catch { /* retain the local canonical copy */ }
      }
      if (!active) return;
      setTrip(next);
      setSelectedStopId(next?.stops.slice().sort((a, b) => a.order - b.order)[0]?.id ?? "");
      setLoading(false);
    })();
    return () => { active = false; };
  }, [tripId]);

  useEffect(() => {
    if (!trip) return;
    const missingStops = trip.stops.filter((stop) => stop.longitude === null || stop.latitude === null);
    if (!missingStops.length) return;
    let active = true;
    void Promise.all(missingStops.map(async (stop) => {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(stop.name)}&country=${encodeURIComponent(stop.country)}`);
      const payload = await response.json() as { result?: { coordinates?: [number, number] } | null };
      return [stop.id, payload.result?.coordinates] as const;
    })).then((results) => {
      if (!active) return;
      setResolvedCoordinates(Object.fromEntries(results.filter((entry): entry is [string, [number, number]] => Boolean(entry[1]))));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [trip]);

  const map = useMemo(() => trip ? mapData(trip, resolvedCoordinates) : { stops: [], legs: [] }, [resolvedCoordinates, trip]);
  const selectedStop = map.stops.find((stop) => stop.id === selectedStopId) ?? map.stops[0];
  const selectedTripStop = trip?.stops.find((stop) => stop.id === selectedStop?.id);
  const selectedItems = useMemo(() => trip?.planItems.filter((item) => item.stopId === selectedStop?.id).sort((a, b) => a.dayNumber - b.dayNumber) ?? [], [selectedStop?.id, trip?.planItems]);
  const selectedLeg = trip?.legs.find((leg) => leg.toStopId === selectedStop?.id);
  const health = useMemo(() => trip ? tripHealth(trip) : null, [trip]);
  const currentHref = `/journey/plan${trip ? `?trip=${encodeURIComponent(trip.id)}` : ""}`;
  const onSelect = useCallback((id: string) => setSelectedStopId(id), []);
  const noopPin = useCallback((_pin: PlannerMapPin) => undefined, []);
  const noopDrop = useCallback((_coordinates: [number, number]) => undefined, []);

  if (loading) return <main className={styles.page}><EasyTNavigation current="trips" /><div className={styles.loading}>Loading your map plan…</div></main>;
  if (!trip || !selectedStop || !selectedTripStop) return <main className={styles.page}><EasyTNavigation current="trips" /><section className={styles.empty}><p className={styles.eyebrow}>New map view</p><h1>Open a trip first.</h1><p>This comparison view reads the same saved plan as the current map planner.</p><Link href="/journey/dashboard">Go to trips <ChevronRight aria-hidden="true" /></Link></section></main>;

  const transferLabel = selectedLeg ? `${selectedLeg.mode === "train" ? "Train" : selectedLeg.mode === "flight" ? "Flight" : selectedLeg.mode === "road" ? "Road" : selectedLeg.mode === "ferry" ? "Ferry" : "Mode to confirm"} · ${formatDuration(selectedLeg.durationMinutes)}` : "Arrival details to confirm";
  const decisions = (health?.issues ?? []).filter((issue) => issue.status === "open").slice(0, 3);

  return <main className={`${styles.page} ${editorial.surface} ${editorial.map} morrovia-editorial-page`}>
    <EasyTNavigation current="trips" />
    <header className={styles.header}>
      <Link href={currentHref} className={styles.switch}>← Current map planner</Link>
      <div><strong>{trip.title}</strong><small>{formatDate(trip.startDate)} – {formatDate(trip.endDate)} · {trip.travellers} travellers</small></div>
      <Link href={`/journey/prep?trip=${encodeURIComponent(trip.id)}`} className={styles.prep}>Trip prep</Link>
    </header>

    <section className={styles.timeline} aria-label="Route stops">
      {map.stops.map((stop, index) => <button key={stop.id} type="button" className={stop.id === selectedStop.id ? styles.activeStop : ""} onClick={() => onSelect(stop.id)}>
        <span>{String(index + 1).padStart(2, "0")}</span><b>{stop.city}</b><small>{stop.date} · {trip.stops.find((item) => item.id === stop.id)?.nights ?? 0} nights</small>
      </button>)}
    </section>

    <div className={styles.workspace}>
      <aside className={styles.stopPanel}>
        <p className={styles.eyebrow}><MapPin aria-hidden="true" /> Stop {String(map.stops.findIndex((stop) => stop.id === selectedStop.id) + 1).padStart(2, "0")}</p>
        <h1>{selectedStop.city}</h1>
        <p className={styles.stopMeta}>{selectedStop.country} · {selectedTripStop.nights ?? 0} nights</p>
        <div className={styles.stopReason}><Sparkles aria-hidden="true" /><p>{selectedItems[0]?.reason ?? "An editable base in your current route."}</p></div>
        <dl>
          <div><dt><Route aria-hidden="true" /> Arrival</dt><dd>{transferLabel}</dd></div>
          <div><dt><CalendarDays aria-hidden="true" /> Dates</dt><dd>{selectedTripStop.arrivalDate ? `${formatDate(selectedTripStop.arrivalDate)} – ${selectedTripStop.departureDate ? formatDate(selectedTripStop.departureDate) : "confirm"}` : "To confirm"}</dd></div>
        </dl>
        <Link href={currentHref} className={styles.editLink}>Edit route, dates or places in the current planner <ChevronRight aria-hidden="true" /></Link>
      </aside>

      <section className={styles.mapSurface} aria-label="Interactive trip map">
        <JourneyPlannerMap stops={map.stops} legs={map.legs} selectedId={selectedStop.id} plannerPins={trip.brief.mapPins ?? []} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode onMapPinDrop={noopDrop} onPlannerPinSelect={noopPin} onSelect={onSelect} />
      </section>

      <aside className={styles.decisions}>
        <div className={styles.decisionsHeading}><div><p className={styles.eyebrow}>Trip decisions</p><h2>{decisions.length ? `${decisions.length} to review` : "Route looks clear"}</h2></div><button type="button" onClick={() => setShowDecisions((value) => !value)}>{showDecisions ? "Hide" : "Show"}</button></div>
        {showDecisions && <div className={styles.decisionList}>{decisions.length ? decisions.map((issue) => <article key={issue.id} className={issue.severity === "critical" ? styles.critical : ""}><CircleAlert aria-hidden="true" /><div><b>{issue.message}</b><p>{issue.evidence}</p></div><Link href={currentHref} aria-label="Resolve in current planner"><ChevronRight aria-hidden="true" /></Link></article>) : <p className={styles.clear}>No blocking route decisions. Confirm live timings before booking.</p>}</div>}
      </aside>
    </div>

    <section className={styles.daySheet}>
      <div className={styles.sheetHeading}><div><p className={styles.eyebrow}>At {selectedStop.city}</p><h2>Shape the day</h2></div><span>{selectedItems.length || 1} day{selectedItems.length === 1 ? "" : "s"}</span></div>
      <div className={styles.finderTabs} role="tablist" aria-label="Plan options">
        {(["plan", "stay", "eat", "see"] as FinderTab[]).map((tab) => <button key={tab} type="button" role="tab" aria-selected={finderTab === tab} className={finderTab === tab ? styles.activeTab : ""} onClick={() => setFinderTab(tab)}>{tab === "plan" ? "Plan" : tab === "stay" ? "Stay" : tab === "eat" ? "Eat" : "See"}</button>)}
      </div>
      {finderTab === "plan" ? <div className={styles.planList}>{selectedItems.length ? selectedItems.map((item) => <article key={item.id}><span>Day {item.dayNumber}</span><div><b>{item.title}</b><p>{item.reason}</p></div></article>) : <p>No day detail yet. Use the current planner to shape this stop.</p>}</div> : <div className={styles.finderPrompt}><p>{finderTab === "stay" ? "Accommodation" : finderTab === "eat" ? "Food nearby" : "Places to see"}</p><strong>Open the current planner to search and save {finderTab === "stay" ? "stays" : finderTab === "eat" ? "restaurants" : "places"} for this stop.</strong><Link href={currentHref}>Open current planner <ChevronRight aria-hidden="true" /></Link></div>}
    </section>
  </main>;
}
