"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, CarFront, ExternalLink, Map as MapIcon, Plane, Route, Ship, TrainFront, X, type LucideIcon } from "lucide-react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop } from "@/lib/journey";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { transportAffiliateActionForLeg, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { itineraryTransportAgenda, transportJourneyKnowledge, transportPresentationCounts, transportPresentationState, type ItineraryTransportAgendaLeg, type TransportPresentationState } from "@/lib/easyt/itinerary-transport-agenda";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { transferJourneyModeLabel } from "@/lib/easyt/transfer-journey";
import { formatRoadEstimateReference } from "@/lib/easyt/road-estimate-presentation";
import { parseTransportWorkspaceTarget } from "@/lib/easyt/trip-workspace-links";
import type { CanonicalRouteEndpoint, EasyTTrip, TripLeg } from "@/lib/easyt/trip";
import { clearTripLegTransportChoice, selectTripLegTransportChoice, tripWithEffectiveTransportChoices } from "@/lib/easyt/transport-mode-choice";
import { useTripShellMutation } from "./trip-shell-client";
import TripTransportChoiceControl from "./trip-transport-choice-control";
import styles from "./trip-transport-workspace.module.css";

type Language = "en" | "es";

const copyFor = (language: Language) => language === "es" ? {
  eyebrow: "Transporte", heading: "Tus traslados",
  empty: "El transporte aparecerá cuando la ruta incluya un trayecto entre lugares.", journey: "trayecto", journeys: "trayectos",
  bookedCount: "reservados", planningEstimates: "estimaciones de planificación", timetableChecks: "consultar horario", serviceChecks: "confirmar servicio", needsChecking: "necesitan comprobarse",
  viewDetails: "Ver detalles", selectedJourney: "Trayecto seleccionado",
  showMap: "Mostrar mapa de la ruta", hideMap: "Ocultar mapa de la ruta",
  mapUnavailable: "El mapa no está disponible ahora. Tus trayectos siguen accesibles en la lista.",
  booked: "Reservado", planningEstimate: "Estimación de planificación", checkTimetable: "Consultar horario", checkService: "Confirmar servicio", needsCheckingStatus: "Necesita comprobarse", dateUnknown: "Fecha por confirmar",
  modeAndTimeUnknown: "El modo y la duración aún necesitan confirmación.", modeUnknown: "El modo de transporte aún necesita confirmación.",
  timeUnknown: "La duración aún necesita confirmación.", bestOptionNeedsChecking: "La mejor opción de transporte aún necesita comprobarse.",
  approximate: "Aproximadamente ", byRoad: " por carretera", roadEstimateNote: "Reserva tiempo adicional para las paradas y las condiciones de la carretera.", scheduledEstimateNote: "Comprueba el horario actual antes de reservar.", serviceEstimateNote: "Confirma el servicio actual antes de reservar.", bookedJourney: "Transporte reservado para este trayecto.",
  openBooking: "Abrir reserva", compareCarHire: "Comparar alquiler de coche", compareTransport: "Comparar transporte en Omio", checkTransport: "Consultar opciones de transporte en Omio",
} : {
  eyebrow: "Transport", heading: "Your transport",
  empty: "Transport will appear once the route includes a journey between places.", journey: "journey", journeys: "journeys",
  bookedCount: "booked", planningEstimates: "planning estimates", timetableChecks: "check timetable", serviceChecks: "check service", needsChecking: "need checking",
  viewDetails: "View details", selectedJourney: "Selected journey",
  showMap: "Show route map", hideMap: "Hide route map",
  mapUnavailable: "The route map is unavailable right now. Your journeys are still available in the list.",
  booked: "Booked", planningEstimate: "Planning estimate", checkTimetable: "Check timetable", checkService: "Check service", needsCheckingStatus: "Needs checking", dateUnknown: "Date to confirm",
  modeAndTimeUnknown: "Mode and journey time still need checking.", modeUnknown: "Transport mode still needs checking.",
  timeUnknown: "Journey time still needs checking.", bestOptionNeedsChecking: "The best transport option still needs checking.",
  approximate: "Approx. ", byRoad: " by road", roadEstimateNote: "Allow extra time for stops and road conditions.", scheduledEstimateNote: "Check the current timetable before booking.", serviceEstimateNote: "Check the current service before booking.", bookedJourney: "Transport booked for this journey.",
  openBooking: "Open booking", compareCarHire: "Compare car hire", compareTransport: "Compare transport on Omio", checkTransport: "Check transport options on Omio",
};

function presentationLabel(state: TransportPresentationState, leg: TripLeg, copy: ReturnType<typeof copyFor>) {
  if (state === "booked") return copy.booked;
  if (state === "planning-estimate") return copy.planningEstimate;
  if (state === "needs-checking") return copy.needsCheckingStatus;
  return state === "check-service" || leg.mode === "ferry" || leg.mode === "mixed" || (leg.mode === "road" && /\b(bus|coach|shuttle)\b/i.test(leg.provider ?? ""))
    ? copy.checkService
    : copy.checkTimetable;
}

function summaryLabel(state: ReturnType<typeof transportPresentationCounts>[number]["state"], count: number, copy: ReturnType<typeof copyFor>) {
  if (state === "journeys") return count === 1 ? copy.journey : copy.journeys;
  if (state === "booked") return copy.bookedCount;
  if (state === "planning-estimate") return copy.planningEstimates;
  if (state === "check-timetable") return copy.timetableChecks;
  if (state === "needs-checking") return copy.needsChecking;
  return copy.serviceChecks;
}

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

function noteForJourney(item: ItineraryTransportAgendaLeg, copy: ReturnType<typeof copyFor>, language: Language) {
  const duration = item.leg.doorToDoorMinutes ?? item.leg.durationMinutes;
  const state = transportPresentationState(item.leg, item.booking?.type === "transport");
  if (state === "booked") return copy.bookedJourney;
  if (item.leg.roadEstimate) {
    const warnings = item.leg.roadEstimate.warnings.map((warning) => {
      if (language === "en") return warning;
      if (/no passenger service or private-driver availability/i.test(warning)) return "No se ha confirmado un servicio de pasajeros ni la disponibilidad de un conductor privado.";
      if (/border crossing eligibility, waits and stops/i.test(warning)) return "Esta estimación no incluye la elegibilidad para cruzar la frontera, las esperas ni las paradas.";
      if (/stops and road conditions/i.test(warning)) return "No incluye paradas ni condiciones de la carretera, salvo que la fuente indique lo contrario.";
      return warning;
    });
    return [formatRoadEstimateReference(item.leg.roadEstimate, language), ...warnings].join(". ");
  }
  const scheduleWarning = item.leg.mode === "road" ? /\b(schedule|timetable|live service|live transport)\b/i : null;
  const routeWarning = item.leg.warnings?.find((warning) => !scheduleWarning?.test(warning));
  if (routeWarning) return routeWarning;
  if (state === "needs-checking") {
    if (item.leg.mode === "unknown" && !duration) return copy.modeAndTimeUnknown;
    if (item.leg.mode === "unknown") return copy.modeUnknown;
    if (!duration) return copy.timeUnknown;
    return copy.bestOptionNeedsChecking;
  }
  const formattedDuration = formatTripDuration(duration!);
  if (state === "check-timetable" || state === "check-service") {
    const checkCopy = state === "check-service" ? copy.serviceEstimateNote : copy.scheduledEstimateNote;
    return `${copy.approximate}${formattedDuration}. ${checkCopy}`;
  }
  if (item.leg.mode === "road") return `${copy.approximate}${formattedDuration}${copy.byRoad}. ${copy.roadEstimateNote}`;
  return `${copy.approximate}${formattedDuration}.`;
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
  const searchParams = useSearchParams();
  const orientation = parseTransportWorkspaceTarget(trip, searchParams);
  const [selectedLegId, setSelectedLegId] = useState<string | null>(orientation.legId ?? items[0]?.leg.id ?? null);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const selectedDetailRef = useRef<HTMLDivElement>(null);
  const [mapLifecycle, setMapLifecycle] = useState<"ready" | "unavailable" | null>(null);
  const effectiveTrip = useMemo(() => tripWithEffectiveTransportChoices(trip), [trip]);
  const mapLegs = useMemo(() => mapRouteLegsFromTrip(effectiveTrip), [effectiveTrip]);
  const mapStops = useMemo(() => mapStopsForAgenda(items, language), [items, language]);
  const selected = items.find((item) => item.leg.id === selectedLegId) ?? items[0] ?? null;
  const summaryCounts = transportPresentationCounts(items);
  const headingId = "transport-workspace-heading";
  const selectJourney = (id: string) => {
    setSelectedLegId(id);
    const url = new URL(window.location.href);
    if (url.searchParams.get("leg") !== id) {
      url.searchParams.set("leg", id);
      window.history.pushState(window.history.state, "", url);
    }
    if (window.matchMedia("(max-width: 820px)").matches) {
      setMobileMapOpen(true);
      window.requestAnimationFrame(() => selectedDetailRef.current?.scrollIntoView({ block: "start" }));
    }
  };

  useEffect(() => {
    if (!items.length) setSelectedLegId(null);
    else if (!items.some((item) => item.leg.id === selectedLegId)) setSelectedLegId(items[0]!.leg.id);
  }, [items, selectedLegId]);

  useEffect(() => {
    const restoreOrientation = () => {
      const target = parseTransportWorkspaceTarget(trip, new URLSearchParams(window.location.search));
      setSelectedLegId(items.find((item) => item.leg.id === target.legId)?.leg.id ?? items[0]?.leg.id ?? null);
    };
    restoreOrientation();
    window.addEventListener("popstate", restoreOrientation);
    return () => window.removeEventListener("popstate", restoreOrientation);
  }, [items, searchParams, trip]);

  return <section className={styles.workspace} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div className={styles.heading}><span>{copy.eyebrow}</span><h2 id={headingId}>{copy.heading}</h2></div>
      {items.length ? <div className={styles.summaryCounts} aria-label={language === "es" ? "Resumen de traslados" : "Journey summary"}>
        {summaryCounts.map(({ state, count }) => <span key={state} data-tone={state === "booked" ? "booked" : state === "planning-estimate" ? "estimate" : state === "journeys" ? undefined : "attention"}>
          <strong>{count}</strong>{summaryLabel(state, count, copy)}
        </span>)}
      </div> : null}
      {items.length ? <EasyTButton className={styles.mobileMapToggle} icon={mobileMapOpen ? X : MapIcon} size="small" variant="secondary"
        aria-expanded={mobileMapOpen} aria-controls="transport-route-map" onClick={() => setMobileMapOpen((current) => !current)}>
        {mobileMapOpen ? copy.hideMap : copy.showMap}
      </EasyTButton> : null}
    </header>

    {!items.length ? <div className={styles.empty}><Route aria-hidden="true" /><p>{copy.empty}</p></div> : <div className={styles.layout}>
      <div className={styles.list} aria-label={language === "es" ? "Traslados en orden cronológico" : "Journeys in chronological order"}>
        {items.map((item, index) => <TransportCard item={item} index={index} language={language} copy={copy}
          selected={item.leg.id === selected?.leg.id} forReview={orientation.reviewLegIds.includes(item.leg.id)} onSelect={() => selectJourney(item.leg.id)} key={item.leg.id} />)}
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

function TransportCard({ item, index, language, copy, selected, forReview, onSelect }: {
  item: ItineraryTransportAgendaLeg; index: number; language: Language; copy: ReturnType<typeof copyFor>; selected: boolean; forReview: boolean; onSelect: () => void;
}) {
  const { leg } = item;
  const Icon = iconForLeg(leg.mode);
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const state = transportPresentationState(leg, item.booking?.type === "transport");
  const status = presentationLabel(state, leg, copy);
  return <article className={styles.card} data-transport-leg-id={leg.id} data-selected={selected ? "true" : undefined} data-review-target={forReview ? "true" : undefined} data-presentation-state={state} data-knowledge={transportJourneyKnowledge(leg)}>
    <span className={styles.sequence} aria-hidden="true">{index + 1}</span>
    <time className={styles.date} dateTime={item.date ?? undefined}>{displayDate(item.date, language, copy.dateUnknown)}</time>
    <span className={styles.modeIcon}><Icon aria-hidden="true" /></span>
    <div className={styles.cardBody}>
      <h3>{item.from.name}<span className="sr-only"> {language === "es" ? "a" : "to"} </span><ArrowRight aria-hidden="true" />{item.to.name}</h3>
      <p className={styles.mode}>{transferJourneyModeLabel(leg)}{durationMinutes === null ? null : <><i aria-hidden="true">·</i>~{formatTripDuration(durationMinutes)}</>}</p>
      <p className={styles.note}>{noteForJourney(item, copy, language)}</p>
    </div>
    <div className={styles.cardEnd}>
      {forReview ? <span className={styles.status} data-tone="attention">{language === "es" ? "Revisar ruta" : "Route check"}</span> : null}
      <span className={styles.status} data-tone={state === "booked" ? "booked" : state === "planning-estimate" ? "estimate" : "attention"}>{status}</span>
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
  const action = item.booking ? null : transportAffiliateActionForLeg(trip, leg);
  return <section className={styles.selectedDetail} aria-live="polite">
    <span className={styles.detailEyebrow}>{copy.selectedJourney}</span>
    <div className={styles.detailHeading}><span className={styles.modeIcon}><Icon aria-hidden="true" /></span><div>
      <h3>{item.from.name}<span aria-hidden="true"> → </span>{item.to.name}</h3><p>{displayDate(item.date, language, copy.dateUnknown)}</p>
    </div></div>
    <p className={styles.detailNote}>{noteForJourney(item, copy, language)}</p>
    <TripTransportChoiceControl trip={trip} leg={recommendedLeg} pending={mutation.isPending(pendingKey)} showUnavailable
      onChange={(identity) => mutation.mutateTrip((current) => identity
        ? selectTripLegTransportChoice(current, leg.id, identity)
        : clearTripLegTransportChoice(current, leg.id), pendingKey)} />
    {item.booking?.url ? <EasyTLinkButton href={item.booking.url} target="_blank" rel="noopener noreferrer"
      aria-label={`${copy.openBooking}: ${item.booking.title}`} icon={ExternalLink} size="small" variant="secondary">{copy.openBooking}</EasyTLinkButton> : null}
    {action ? <TransportAffiliateAction action={action} trip={trip} leg={leg}
      label={action.category === "car_rental" ? copy.compareCarHire : action.cta.toLocaleLowerCase().startsWith("check") ? copy.checkTransport : copy.compareTransport} /> : null}
  </section>;
}

function TransportAffiliateAction({ action, trip, leg, label }: { action: ResolvedAffiliateAction; trip: EasyTTrip; leg: TripLeg; label: string }) {
  return <div className={styles.omioAction}>
    <MorroviaAffiliateLink action={{ ...action, cta: label }} context={{ placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId }} variant="secondary" />
    <small>{affiliateDisclosure}</small>
  </div>;
}
