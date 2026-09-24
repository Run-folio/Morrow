"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowRight, CarFront, ExternalLink, Map as MapIcon, Plane, Route, Ship, TrainFront, X, type LucideIcon } from "lucide-react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop } from "@/lib/journey";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { omioBookingActionForLeg, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { itineraryTransportAgenda, transportJourneyKnowledge, type ItineraryTransportAgendaLeg } from "@/lib/easyt/itinerary-transport-agenda";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { transferJourneyModeLabel, transferJourneySegmentSummary } from "@/lib/easyt/transfer-journey";
import type { CanonicalRouteEndpoint, EasyTTrip, TripLeg } from "@/lib/easyt/trip";
import { clearTripLegTransportChoice, selectTripLegTransportChoice, tripWithEffectiveTransportChoices } from "@/lib/easyt/transport-mode-choice";
import { useTripShellMutation } from "./trip-shell-client";
import TripTransportChoiceControl from "./trip-transport-choice-control";
import styles from "./trip-transport-workspace.module.css";

type Language = "en" | "es";

const copyFor = (language: Language) => language === "es" ? {
  eyebrow: "Transporte", heading: "Tus traslados, en orden", intro: "Cómo te mueves entre cada lugar y qué necesita atención.",
  empty: "El transporte aparecerá cuando la ruta incluya un trayecto entre lugares.", journey: "trayecto", journeys: "trayectos",
  needsAttention: "necesita atención", ready: "listos para revisar", viewDetails: "Ver detalles", selectedJourney: "Trayecto seleccionado",
  showMap: "Mostrar mapa de la ruta", hideMap: "Ocultar mapa de la ruta",
  mapUnavailable: "El mapa no está disponible ahora. Tus trayectos siguen accesibles en la lista.",
  booked: "Reservado", attention: "Necesita atención", dateUnknown: "Fecha por confirmar",
  modeAndTimeUnknown: "El modo y la duración aún necesitan confirmación.", modeUnknown: "El modo de transporte aún necesita confirmación.",
  timeUnknown: "La duración aún necesita confirmación.", planningEstimate: "Estimación de planificación; comprueba horarios antes de reservar.",
  openBooking: "Abrir reserva", findTickets: "Buscar opciones",
} : {
  eyebrow: "Transport", heading: "Your transport, in journey order", intro: "How you are getting between each place, and what still needs attention.",
  empty: "Transport will appear once the route includes a journey between places.", journey: "journey", journeys: "journeys",
  needsAttention: "needs attention", ready: "ready to review", viewDetails: "View details", selectedJourney: "Selected journey",
  showMap: "Show route map", hideMap: "Hide route map",
  mapUnavailable: "The route map is unavailable right now. Your journeys are still available in the list.",
  booked: "Booked", attention: "Needs attention", dateUnknown: "Date to confirm",
  modeAndTimeUnknown: "Mode and journey time still need checking.", modeUnknown: "Transport mode still needs checking.",
  timeUnknown: "Journey time still needs checking.", planningEstimate: "Planning estimate; check live schedules before booking.",
  openBooking: "Open booking", findTickets: "Find options",
};

function displayDate(value: string | null, language: Language, fallback: string) {
  return value ? formatIsoDate(value, language, { month: "short", day: "numeric", year: "numeric" }) ?? fallback : fallback;
}

function iconForLeg(mode: TripLeg["mode"]): LucideIcon {
  if (mode === "flight") return Plane;
  if (mode === "train") return TrainFront;
  if (mode === "road") return CarFront;
  if (mode === "ferry") return Ship;
  return Route;
}

function noteForJourney(item: ItineraryTransportAgendaLeg, copy: ReturnType<typeof copyFor>) {
  const duration = item.leg.doorToDoorMinutes ?? item.leg.durationMinutes;
  if (item.leg.mode === "unknown" && duration === null) return copy.modeAndTimeUnknown;
  if (item.leg.mode === "unknown") return copy.modeUnknown;
  if (duration === null) return copy.timeUnknown;
  return item.leg.warnings?.[0] || transferJourneySegmentSummary(item.leg) || copy.planningEstimate;
}

function endpointMapStop(endpoint: CanonicalRouteEndpoint, item: ItineraryTransportAgendaLeg, language: Language): JourneyStop | null {
  if (!endpoint.coordinates) return null;
  return {
    id: endpoint.id, city: endpoint.name, country: endpoint.country ?? "", date: displayDate(item.date, language, ""), coordinates: endpoint.coordinates,
    theme: endpoint.kind === "origin" || endpoint.kind === "end" ? "transit" : "city", marker: item.leg.mode === "flight" ? "plane" : "town",
    description: "", highlights: [], aiPrompt: "",
  };
}

function mapStopsForAgenda(items: ItineraryTransportAgendaLeg[], language: Language) {
  const stops = new Map<string, JourneyStop>();
  for (const item of items) {
    const from = endpointMapStop(item.from, item, language);
    const to = endpointMapStop(item.to, item, language);
    if (from && !stops.has(from.id)) stops.set(from.id, from);
    if (to && !stops.has(to.id)) stops.set(to.id, to);
  }
  return [...stops.values()];
}

export default function TripTransportWorkspace({ trip, language = "en" }: { trip: EasyTTrip; language?: Language }) {
  const copy = copyFor(language);
  const items = useMemo(() => itineraryTransportAgenda(trip), [trip]);
  const [selectedLegId, setSelectedLegId] = useState<string | null>(items[0]?.leg.id ?? null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const selectedDetailRef = useRef<HTMLDivElement>(null);
  const [mapLifecycle, setMapLifecycle] = useState<"ready" | "unavailable" | null>(null);
  const effectiveTrip = useMemo(() => tripWithEffectiveTransportChoices(trip), [trip]);
  const mapLegs = useMemo(() => mapRouteLegsFromTrip(effectiveTrip), [effectiveTrip]);
  const mapStops = useMemo(() => mapStopsForAgenda(items, language), [items, language]);
  const selected = items.find((item) => item.leg.id === selectedLegId) ?? items[0] ?? null;
  const needsAttention = items.filter((item) => transportJourneyKnowledge(item.leg) !== "known").length;
  const ready = items.length - needsAttention;
  const headingId = "transport-workspace-heading";
  const selectJourney = (id: string) => {
    setSelectedLegId(id);
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileMapOpen(true);
      window.requestAnimationFrame(() => selectedDetailRef.current?.scrollIntoView({ block: "start" }));
    }
  };

  useEffect(() => {
    if (!items.length) setSelectedLegId(null);
    else if (!items.some((item) => item.leg.id === selectedLegId)) setSelectedLegId(items[0]!.leg.id);
  }, [items, selectedLegId]);

  return <section className={styles.workspace} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div className={styles.heading}><span>{copy.eyebrow}</span><h2 id={headingId}>{copy.heading}</h2><p>{copy.intro}</p></div>
      {items.length ? <div className={styles.summaryCounts} aria-label={language === "es" ? "Resumen de traslados" : "Journey summary"}>
        <span><strong>{items.length}</strong>{items.length === 1 ? copy.journey : copy.journeys}</span>
        <span data-tone={needsAttention ? "attention" : undefined}><strong>{needsAttention}</strong>{copy.needsAttention}</span>
        <span data-tone="ready"><strong>{ready}</strong>{copy.ready}</span>
      </div> : null}
      {items.length ? <EasyTButton className={styles.mobileMapToggle} icon={mobileMapOpen ? X : MapIcon} size="small" variant="secondary"
        aria-expanded={mobileMapOpen} aria-controls="transport-route-map" onClick={() => setMobileMapOpen((current) => !current)}>
        {mobileMapOpen ? copy.hideMap : copy.showMap}
      </EasyTButton> : null}
    </header>

    {!items.length ? <div className={styles.empty}><Route aria-hidden="true" /><p>{copy.empty}</p></div> : <div className={styles.layout}>
      <div className={styles.list} aria-label={language === "es" ? "Traslados en orden cronológico" : "Journeys in chronological order"}>
        {items.map((item, index) => <TransportCard item={item} index={index} language={language} copy={copy}
          selected={item.leg.id === selected?.leg.id} onSelect={() => selectJourney(item.leg.id)} key={item.leg.id} />)}
      </div>

      <aside className={styles.mapPanel} id="transport-route-map" data-mobile-open={mobileMapOpen ? "true" : "false"}
        aria-label={language === "es" ? "Mapa contextual de la ruta" : "Contextual route map"}>
        <div className={styles.mapFrame}>
          {mapLifecycle === "unavailable" ? <div className={styles.mapUnavailable} role="status"><AlertCircle aria-hidden="true" /><p>{copy.mapUnavailable}</p></div> : <JourneyPlannerMap
            stops={mapStops} legs={mapLegs} selectedId={selected?.to.id ?? mapStops[0]?.id ?? ""} selectedLegId={selectedLegId} stopSelectionEnabled={false} contextCardsHidden
            plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode surface={{ variant: "workspace" }}
            cameraSafeEdge={42} onLifecycleChange={setMapLifecycle}
            onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onLegSelect={(leg) => selectJourney(leg.id)} onSelect={() => undefined}
          />}
        </div>
        {selected ? <div ref={selectedDetailRef}><SelectedJourneyDetail trip={trip} item={selected} language={language} copy={copy} /></div> : null}
      </aside>
    </div>}
  </section>;
}

function TransportCard({ item, index, language, copy, selected, onSelect }: {
  item: ItineraryTransportAgendaLeg; index: number; language: Language; copy: ReturnType<typeof copyFor>; selected: boolean; onSelect: () => void;
}) {
  const { leg } = item;
  const Icon = iconForLeg(leg.mode);
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const knowledge = transportJourneyKnowledge(leg);
  const status = item.status === "booked" ? copy.booked : knowledge !== "known" ? copy.attention : null;
  return <article className={styles.card} data-transport-leg-id={leg.id} data-selected={selected ? "true" : undefined} data-knowledge={knowledge}>
    <span className={styles.sequence} aria-hidden="true">{index + 1}</span>
    <time className={styles.date} dateTime={item.date ?? undefined}>{displayDate(item.date, language, copy.dateUnknown)}</time>
    <span className={styles.modeIcon}><Icon aria-hidden="true" /></span>
    <div className={styles.cardBody}>
      <h3>{item.from.name}<span className="sr-only"> {language === "es" ? "a" : "to"} </span><ArrowRight aria-hidden="true" />{item.to.name}</h3>
      <p className={styles.mode}>{transferJourneyModeLabel(leg)}{durationMinutes === null ? null : <><i aria-hidden="true">·</i>~{formatTripDuration(durationMinutes)}</>}</p>
      <p className={styles.note}>{noteForJourney(item, copy)}</p>
    </div>
    <div className={styles.cardEnd}>
      {status ? <span className={styles.status} data-tone={knowledge === "known" ? "booked" : "attention"}>{status}</span> : null}
      <EasyTButton size="small" variant="secondary" aria-pressed={selected} onClick={onSelect}>{copy.viewDetails}</EasyTButton>
    </div>
  </article>;
}

function SelectedJourneyDetail({ trip, item, language, copy }: { trip: EasyTTrip; item: ItineraryTransportAgendaLeg; language: Language; copy: ReturnType<typeof copyFor> }) {
  const mutation = useTripShellMutation();
  const { leg } = item;
  const recommendedLeg = trip.legs.find((candidate) => candidate.id === leg.id) ?? leg;
  const pendingKey = `transport-choice-${leg.id}`;
  const Icon = iconForLeg(leg.mode);
  const omioAction = item.booking ? null : omioBookingActionForLeg(trip, leg);
  return <section className={styles.selectedDetail} aria-live="polite">
    <span className={styles.detailEyebrow}>{copy.selectedJourney}</span>
    <div className={styles.detailHeading}><span className={styles.modeIcon}><Icon aria-hidden="true" /></span><div>
      <h3>{item.from.name}<span aria-hidden="true"> → </span>{item.to.name}</h3><p>{displayDate(item.date, language, copy.dateUnknown)}</p>
    </div></div>
    <p className={styles.detailNote}>{noteForJourney(item, copy)}</p>
    <TripTransportChoiceControl trip={trip} leg={recommendedLeg} pending={mutation.isPending(pendingKey)} showUnavailable
      onChange={(identity) => mutation.mutateTrip((current) => identity
        ? selectTripLegTransportChoice(current, leg.id, identity)
        : clearTripLegTransportChoice(current, leg.id), pendingKey)} />
    {item.booking?.url ? <EasyTLinkButton href={item.booking.url} target="_blank" rel="noopener noreferrer"
      aria-label={`${copy.openBooking}: ${item.booking.title}`} icon={ExternalLink} size="small" variant="secondary">{copy.openBooking}</EasyTLinkButton> : null}
    {omioAction ? <OmioAction action={omioAction} trip={trip} leg={leg} label={copy.findTickets} /> : null}
  </section>;
}

function OmioAction({ action, trip, leg, label }: { action: ResolvedAffiliateAction; trip: EasyTTrip; leg: TripLeg; label: string }) {
  return <div className={styles.omioAction}>
    <MorroviaAffiliateLink action={{ ...action, cta: label }} context={{ placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId }} variant="secondary" />
    <small>{affiliateDisclosure}</small>
  </div>;
}
