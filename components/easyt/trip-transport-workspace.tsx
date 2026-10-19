"use client";
import {transferTimingLabel} from '@/lib/easyt/transfer-timing-label';

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import workspaceHeading from "./trip-workspace-heading.module.css";
import { AlertCircle, ArrowRight, CarFront, ChevronDown, ChevronUp, ExternalLink, Map as MapIcon, Plane, Route, Ship, TrainFront, X, type LucideIcon } from "lucide-react";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import type { JourneyStop } from "@/lib/journey";
import { affiliateDisclosure, visibleAffiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTField, EasyTLinkButton } from "./easyt-controls";
import { affiliatePartners, transportAffiliateActionForLeg, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { itineraryTransportAgenda, transportJourneyKnowledge, transportPresentationState, unmatchedTravellerTransportBookings, type ItineraryTransportAgendaLeg, type TransportPresentationState } from "@/lib/easyt/itinerary-transport-agenda";
import { mapRouteLegsFromTrip } from "@/lib/easyt/map-spatial-context";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { transferJourneyModeLabel } from "@/lib/easyt/transfer-journey";
import { formatRoadEstimateReference } from "@/lib/easyt/road-estimate-presentation";
import { parseTransportWorkspaceTarget } from "@/lib/easyt/trip-workspace-links";
import type { CanonicalRouteEndpoint, EasyTTrip, TripLeg } from "@/lib/easyt/trip";
import { clearTripLegTransportChoice, selectTripLegTransportChoice, tripWithEffectiveTransportChoices } from "@/lib/easyt/transport-mode-choice";
import { useTripShellMutation } from "./trip-shell-client";
import TripTransportChoiceControl from "./trip-transport-choice-control";
import { isPassengerServiceLeg, markTransportLegBooked, transportBookingMarkedByTraveller, unmarkTransportBooking, updateTravellerTransportBookingDetails } from "@/lib/easyt/transport-booking.ts";
import styles from "./trip-transport-workspace.module.css";

type Language = "en" | "es";

const copyFor = (language: Language) => language === "es" ? {
  eyebrow: "Transporte", heading: "Tus conexiones", journeyDetails: "Detalles del trayecto", findTrains: "Buscar trenes", findFlights: "Buscar vuelos", findTransport: "Buscar transporte",
  empty: "El transporte aparecerá cuando la ruta incluya un trayecto entre lugares.", journey: "trayecto", journeys: "trayectos",
  bookedCount: "reservados", planningEstimates: "estimaciones de planificación", timetableChecks: "consultar horario", serviceChecks: "confirmar servicio", needsChecking: "necesitan comprobarse",
  viewDetails: "Ver detalles", hideDetails: "Ocultar detalles", selectedJourney: "Trayecto seleccionado",
  showMap: "Mostrar mapa", hideMap: "Ocultar mapa",
  mapUnavailable: "El mapa no está disponible ahora. Tus trayectos siguen accesibles en la lista.",
  booked: "Reservado", notBooked: "No reservado", planningEstimate: "Estimación de planificación", checkTimetable: "Consultar horario", checkService: "Confirmar servicio", needsCheckingStatus: "Necesita comprobarse", dateUnknown: "Fecha por confirmar",
  modeAndTimeUnknown: "El modo y la duración aún necesitan confirmación.", modeUnknown: "El modo de transporte aún necesita confirmación.",
  timeUnknown: "La duración aún necesita confirmación.", bestOptionNeedsChecking: "La mejor opción de transporte aún necesita comprobarse.",
  roadEstimateNote: "Reserva tiempo adicional para las paradas y las condiciones de la carretera.", scheduledEstimateNote: "Comprueba el horario actual antes de reservar.", serviceEstimateNote: "Confirma el servicio actual antes de reservar.",
  markBooked: "Marcar como reservado", unmarkBooked: "Deshacer marca de reserva", undoClarification: "Solo quita la marca de Morrovia; no cancela una reserva externa.", editBookingDetails: "Editar detalles", saveBookingDetails: "Guardar detalles", cancelEdit: "Cancelar edición", confirmation: "Referencia de reserva", bookingLink: "Enlace de reserva", bookingNote: "Nota", optionalDetails: "Detalles opcionales", markedByYou: "Reservado · marcado por ti", notMarkedByYou: "No reservado", routeMismatch: "La ruta o el modo cambió. Los detalles de esta reserva se conservaron para que los revises.", missingLegMismatch: "Una reserva de transporte guardada ya no coincide con un trayecto de la ruta. Sus datos se conservaron.", existingBooking: "Se conservó la reserva de transporte existente.",
  openBooking: "Abrir reserva", compareCarHire: "Comparar alquiler de coche", generalOmioSearch: "Abrir búsqueda general de Omio", omioFlightSearch: "Abrir búsqueda de vuelos en Omio", omioTrainSearch: "Abrir búsqueda de trenes en Omio",
  omioDetailsNotCarried: "Abre una búsqueda general de Omio. No se transfieren la ruta, la fecha ni el número de viajeros.",
  omioFlightDetailsCarried: "Abre una búsqueda de vuelos con esta ruta y fecha. No se transfiere el número de viajeros; la disponibilidad puede variar.",
  omioTrainDetailsCarried: "Abre una búsqueda de trenes con esta ruta y fecha. No se transfiere el número de viajeros; la disponibilidad puede variar.",
} : {
  eyebrow: "Transport", heading: "Your connections", journeyDetails: "Journey details", findTrains: "Find trains", findFlights: "Find flights", findTransport: "Find transport",
  empty: "Transport will appear once the route includes a journey between places.", journey: "journey", journeys: "journeys",
  bookedCount: "booked", planningEstimates: "planning estimates", timetableChecks: "check timetable", serviceChecks: "check service", needsChecking: "need checking",
  viewDetails: "View details", hideDetails: "Hide details", selectedJourney: "Selected journey",
  showMap: "Show map", hideMap: "Hide map",
  mapUnavailable: "The route map is unavailable right now. Your journeys are still available in the list.",
  booked: "Booked", notBooked: "Not booked", planningEstimate: "Planning estimate", checkTimetable: "Check timetable", checkService: "Check service", needsCheckingStatus: "Needs checking", dateUnknown: "Date to confirm",
  modeAndTimeUnknown: "Mode and journey time still need checking.", modeUnknown: "Transport mode still needs checking.",
  timeUnknown: "Journey time still needs checking.", bestOptionNeedsChecking: "The best transport option still needs checking.",
  roadEstimateNote: "Allow extra time for stops and road conditions.", scheduledEstimateNote: "Check the current timetable before booking.", serviceEstimateNote: "Check the current service before booking.",
  markBooked: "Mark as booked", unmarkBooked: "Undo booked mark", undoClarification: "Removes only the Morrovia mark; it does not cancel an external booking.", editBookingDetails: "Edit details", saveBookingDetails: "Save details", cancelEdit: "Cancel edit", confirmation: "Booking reference", bookingLink: "Booking link", bookingNote: "Note", optionalDetails: "Optional details", markedByYou: "Booked · marked by you", notMarkedByYou: "Not booked", routeMismatch: "The route or mode changed. These booking details were kept for you to review.", missingLegMismatch: "A saved transport booking no longer matches a journey on this route. Its details were kept.", existingBooking: "Existing transport booking preserved.",
  openBooking: "Open booking", compareCarHire: "Compare car hire", generalOmioSearch: "Open general Omio search", omioFlightSearch: "Open Omio flight search", omioTrainSearch: "Open Omio train search",
  omioDetailsNotCarried: "Opens a general Omio search. Your route, date and traveller count aren't carried over.",
  omioFlightDetailsCarried: "Opens a flight search with this route and date. Traveller count isn't carried over; availability can vary.",
  omioTrainDetailsCarried: "Opens a train search with this route and date. Traveller count isn't carried over; availability can vary.",
};

function presentationLabel(state: TransportPresentationState, leg: TripLeg, copy: ReturnType<typeof copyFor>, markedByTraveller = false) {
  if (state === "booked") return markedByTraveller ? copy.markedByYou : copy.booked;
  if (state === "planning-estimate") return copy.planningEstimate;
  if (state === "needs-checking") return copy.needsCheckingStatus;
  return state === "check-service" || leg.mode === "ferry" || leg.mode === "mixed" || (leg.mode === "road" && /\b(bus|coach|shuttle)\b/i.test(leg.provider ?? ""))
    ? copy.checkService
    : copy.checkTimetable;
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

function noteForJourney(item: ItineraryTransportAgendaLeg, copy: ReturnType<typeof copyFor>, language: Language): string | null {
  const duration = item.leg.doorToDoorMinutes ?? item.leg.durationMinutes;
  const state = transportPresentationState(item.leg, item.booking?.type === "transport");
  if (state === "booked") return null;
  if (item.leg.roadEstimate) {
    const hasHeadlineEstimate = (item.leg.doorToDoorMinutes ?? item.leg.durationMinutes) !== null;
    const distance = Math.round(item.leg.roadEstimate.distanceKm).toLocaleString(language === "es" ? "es" : "en-GB");
    const reference = hasHeadlineEstimate
      ? language === "es" ? `Estimación por carretera · ${distance} km` : `Road estimate only · ${distance} km`
      : formatRoadEstimateReference(item.leg.roadEstimate, language);
    return reference;
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
  if (state === "check-timetable" || state === "check-service") {
    return state === "check-service" ? copy.serviceEstimateNote : copy.scheduledEstimateNote;
  }
  if (item.leg.mode === "road") return copy.roadEstimateNote;
  return null;
}

function detailNoteForJourney(item: ItineraryTransportAgendaLeg, copy: ReturnType<typeof copyFor>, language: Language) {
  if (item.manualBooking || item.booking?.type === "transport") return null;
  if (item.leg.roadEstimate?.warnings.length) {
    return item.leg.roadEstimate.warnings.map((warning) => {
      if (language === "en") return warning;
      if (/no passenger service or private-driver availability/i.test(warning)) return "No se ha confirmado un servicio de pasajeros ni la disponibilidad de un conductor privado.";
      if (/border crossing eligibility, waits and stops/i.test(warning)) return "Esta estimación no incluye la elegibilidad para cruzar la frontera, las esperas ni las paradas.";
      if (/stops and road conditions/i.test(warning)) return "No incluye paradas ni condiciones de la carretera, salvo que la fuente indique lo contrario.";
      return warning;
    }).join(". ");
  }
  return null;
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
  const mutation = useTripShellMutation();
  const copy = copyFor(language);
  const items = useMemo(() => itineraryTransportAgenda(trip), [trip]);
  const searchParams = useSearchParams();
  const orientation = parseTransportWorkspaceTarget(trip, searchParams);
  const [selectedLegId, setSelectedLegId] = useState<string | null>(orientation.legId ?? null);
  const [mapOpen, setMapOpen] = useState(false);
  const [mapLifecycle, setMapLifecycle] = useState<"ready" | "unavailable" | null>(null);
  const effectiveTrip = useMemo(() => tripWithEffectiveTransportChoices(trip), [trip]);
  const mapLegs = useMemo(() => mapRouteLegsFromTrip(effectiveTrip), [effectiveTrip]);
  const mapStops = useMemo(() => mapStopsForAgenda(items, language), [items, language]);
  const unmatchedBookings = useMemo(() => unmatchedTravellerTransportBookings(trip), [trip]);
  const selected = items.find((item) => item.leg.id === selectedLegId) ?? null;
  const headingId = "transport-workspace-heading";
  const selectJourney = (id: string, toggle = false) => {
    const nextId = toggle && selectedLegId === id ? null : id;
    setSelectedLegId(nextId);
    const url = new URL(window.location.href);
    if (url.searchParams.get("leg") !== nextId) {
      if (nextId) url.searchParams.set("leg", nextId);
      else url.searchParams.delete("leg");
      window.history.pushState(window.history.state, "", url);
    }
  };

  useEffect(() => {
    if (!items.length) setSelectedLegId(null);
    else if (selectedLegId && !items.some((item) => item.leg.id === selectedLegId)) setSelectedLegId(null);
  }, [items, selectedLegId]);

  useEffect(() => {
    const restoreOrientation = () => {
      const target = parseTransportWorkspaceTarget(trip, new URLSearchParams(window.location.search));
      setSelectedLegId(items.find((item) => item.leg.id === target.legId)?.leg.id ?? null);
    };
    restoreOrientation();
    window.addEventListener("popstate", restoreOrientation);
    return () => window.removeEventListener("popstate", restoreOrientation);
  }, [items, searchParams, trip]);

  return <section className={styles.workspace} aria-labelledby={headingId}>
    <header className={styles.header}>
      <div className={styles.heading}><span>{copy.eyebrow}</span><h2 id={headingId} className={workspaceHeading.sectionTitle}>{copy.heading}</h2></div>
      {items.length ? <EasyTButton className={styles.mapToggle} icon={mapOpen ? X : MapIcon} size="small" variant="secondary"
        aria-expanded={mapOpen} aria-controls="transport-route-map" onClick={() => setMapOpen((current) => !current)}>
        {mapOpen ? copy.hideMap : copy.showMap}
      </EasyTButton> : null}
    </header>

    {unmatchedBookings.map((booking) => <div className={styles.bookingMismatch} role="alert" key={booking.id}>
      <p>{copy.missingLegMismatch} <strong>{booking.title}</strong></p>
      <EasyTButton size="small" variant="quiet" disabled={mutation.isPending(`transport-unmark-${booking.id}`)} onClick={() => mutation.mutateTrip((current) => unmarkTransportBooking(current, booking.id), `transport-unmark-${booking.id}`)}>{copy.unmarkBooked}</EasyTButton>
    </div>)}

    {!items.length ? <div className={styles.empty}><Route aria-hidden="true" /><p>{copy.empty}</p></div> : <div className={styles.layout}>
      <div className={styles.list} role="list" aria-label={language === "es" ? "Traslados en orden cronológico" : "Journeys in chronological order"}>
        {items.map((item) => <TransportCard trip={trip} item={item} language={language} copy={copy}
          selected={item.leg.id === selected?.leg.id} forReview={orientation.reviewLegIds.includes(item.leg.id)} onSelect={() => selectJourney(item.leg.id, true)} key={item.leg.id} />)}
      </div>

      <aside className={styles.mapPanel} id="transport-route-map" data-open={mapOpen ? "true" : "false"}
        aria-label={language === "es" ? "Mapa contextual de la ruta" : "Contextual route map"}>
        <div className={styles.mapFrame}>
          {mapLifecycle === "unavailable" ? <div className={styles.mapUnavailable} role="status"><AlertCircle aria-hidden="true" /><p>{copy.mapUnavailable}</p></div> : <JourneyPlannerMap
            stops={mapStops} legs={mapLegs} selectedId={selected?.to.id ?? mapStops[0]?.id ?? ""} selectedLegId={selectedLegId} stopSelectionEnabled={false} contextCardsHidden
            plannerPins={[]} focusCoordinates={null} draftPinCoordinates={null} pinPlacementMode={false} overviewMode surface={{ variant: "workspace" }}
            cameraSafeEdge={42} onLifecycleChange={setMapLifecycle}
            onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onLegSelect={(leg) => selectJourney(leg.id)} onSelect={() => undefined}
          />}
        </div>
      </aside>
    </div>}
  </section>;
}

function TransportCard({ trip, item, language, copy, selected, forReview, onSelect }: {
  trip: EasyTTrip; item: ItineraryTransportAgendaLeg; language: Language; copy: ReturnType<typeof copyFor>; selected: boolean; forReview: boolean; onSelect: () => void;
}) {
  const { leg } = item;
  const Icon = iconForLeg(leg.mode);
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const state = transportPresentationState(leg, item.booking?.type === "transport");
  const status = !item.booking && isPassengerServiceLeg(leg) ? copy.notBooked : presentationLabel(state, leg, copy, transportBookingMarkedByTraveller(item.manualBooking));
  const Chevron = selected ? ChevronUp : ChevronDown;
  return <article className={styles.card} role="listitem" data-transport-leg-id={leg.id} data-selected={selected ? "true" : undefined} data-review-target={forReview ? "true" : undefined} data-presentation-state={state} data-knowledge={transportJourneyKnowledge(leg)}>
    <div className={styles.summary} data-transport-summary>
      <time className={styles.date} dateTime={item.date ?? undefined}>{displayDate(item.date, language, copy.dateUnknown)}</time>
      <span className={styles.modeIcon}><Icon aria-hidden="true" /></span>
      <div className={styles.cardBody}>
        <h3>{item.from.name}<span className="sr-only"> {language === "es" ? "a" : "to"} </span><ArrowRight aria-hidden="true" />{item.to.name}</h3>
        <p className={styles.mode}>{transferJourneyModeLabel(leg)}{durationMinutes === null ? null : <><i aria-hidden="true">·</i>{transferTimingLabel(leg)} total</>}</p>
      </div>
      <div className={styles.cardEnd}>
        {forReview ? <span className={styles.status} data-tone="attention">{language === "es" ? "Revisar ruta" : "Route check"}</span> : null}
        <span className={styles.status} data-tone={state === "booked" ? "booked" : state === "planning-estimate" ? "estimate" : "attention"}>{status}</span>
        <span className={styles.chevron} aria-hidden="true"><Chevron /></span>
      </div>
      <EasyTButton className={styles.summaryToggle} size="small" variant="quiet" iconOnly aria-expanded={selected}
        aria-label={`${selected ? copy.hideDetails : copy.viewDetails}: ${item.from.name} ${language === "es" ? "a" : "to"} ${item.to.name}`}
        aria-controls={`transport-detail-${leg.id}`} onClick={onSelect}>{selected ? copy.hideDetails : copy.viewDetails}</EasyTButton>
    </div>
    <div className={styles.detailWrap} id={`transport-detail-${leg.id}`} hidden={!selected}>
      {selected ? <SelectedJourneyDetail trip={trip} item={item} language={language} copy={copy} /> : null}
    </div>
  </article>;
}

function SelectedJourneyDetail({ trip, item, language, copy }: { trip: EasyTTrip; item: ItineraryTransportAgendaLeg; language: Language; copy: ReturnType<typeof copyFor> }) {
  const mutation = useTripShellMutation();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { leg } = item;
  const recommendedLeg = trip.legs.find((candidate) => candidate.id === leg.id) ?? leg;
  const pendingKey = `transport-choice-${leg.id}`;
  const action = item.booking || item.bookingMismatch || !isFutureDate(item.date) ? null : transportAffiliateActionForLeg(trip, leg, new Date(), item.date);
  const detailNotes = [...new Set([noteForJourney(item, copy, language), detailNoteForJourney(item, copy, language)].filter((value): value is string => Boolean(value)))];
  const actionDetail = action?.category === "car_rental" ? null : action?.href === affiliatePartners.omio.transportUrl ? copy.omioDetailsNotCarried : leg.mode === "train" ? copy.omioTrainDetailsCarried : copy.omioFlightDetailsCarried;
  return <section className={styles.selectedDetail} aria-live="polite" aria-label={copy.journeyDetails}>
    <div className={styles.connectionActions}>
      {action ? <TransportAffiliateAction action={action} trip={trip} leg={leg}
        label={action.category === "car_rental" ? copy.compareCarHire : leg.mode === "train" ? copy.findTrains : leg.mode === "flight" ? copy.findFlights : copy.findTransport} /> : null}
      {item.bookingMismatch ? null : item.manualBooking ? <TransportManualBookingEditor booking={item.manualBooking} isMarked={transportBookingMarkedByTraveller(item.manualBooking)} leg={leg} copy={copy}
        pending={mutation.isPending(`transport-booking-${leg.id}`)}
        onMark={() => mutation.mutateTrip((current) => markTransportLegBooked(current, leg.id), `transport-booking-${leg.id}`)}
        onUnmark={() => mutation.mutateTrip((current) => unmarkTransportBooking(current, item.manualBooking!.id), `transport-booking-${leg.id}`)}
        onSave={(details) => mutation.mutateTrip((current) => updateTravellerTransportBookingDetails(current, leg.id, details), `transport-booking-${leg.id}`)} />
        : item.booking?.url ? <EasyTLinkButton href={item.booking.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.openBooking}: ${item.booking.title}`} icon={ExternalLink} size="small" variant="primary">{copy.openBooking}</EasyTLinkButton>
          : !item.booking && isPassengerServiceLeg(leg) ? <EasyTButton size="small" variant="secondary" disabled={mutation.isPending(`transport-booking-${leg.id}`)} onClick={() => mutation.mutateTrip((current) => markTransportLegBooked(current, leg.id), `transport-booking-${leg.id}`)}>{copy.markBooked}</EasyTButton> : null}
      <TripTransportChoiceControl trip={trip} leg={recommendedLeg} presentation="modal" departureDate={item.date} language={language} pending={mutation.isPending(pendingKey)} showUnavailable showCurrentDuration={false}
        onChange={(identity) => mutation.mutateTrip((current) => identity
          ? selectTripLegTransportChoice(current, leg.id, identity)
          : clearTripLegTransportChoice(current, leg.id), pendingKey)} />
    </div>
    {item.bookingMismatch ? <div className={styles.bookingMismatch} role="alert"><p>{copy.routeMismatch}</p>
      <EasyTButton size="small" variant="secondary" aria-description={copy.undoClarification} disabled={mutation.isPending(`transport-unmark-${item.bookingMismatch.id}`)} onClick={() => mutation.mutateTrip((current) => unmarkTransportBooking(current, item.bookingMismatch!.id), `transport-unmark-${item.bookingMismatch!.id}`)}>{copy.unmarkBooked}</EasyTButton>
    </div> : null}
    {action ? <small className={styles.partnerNote}>{visibleAffiliateDisclosure}</small> : null}
    <EasyTButton className={styles.journeyDetailsToggle} size="small" variant="quiet" icon={ChevronDown} aria-expanded={detailsOpen} aria-controls={`journey-estimates-${leg.id}`} onClick={() => setDetailsOpen((open) => !open)}>{copy.journeyDetails}</EasyTButton>
    <div id={`journey-estimates-${leg.id}`} hidden={!detailsOpen} className={styles.journeyDetails}>
      {detailNotes.map((note) => <p key={note}>{note}</p>)}
      {leg.provider ? <p>{leg.provider}</p> : null}
      {action && actionDetail ? <p>{actionDetail}</p> : null}
      {action ? <small>{affiliateDisclosure}</small> : null}
    </div>
  </section>;
}

function TransportManualBookingEditor({ booking, isMarked, leg, copy, pending, onMark, onUnmark, onSave }: {
  booking: NonNullable<ItineraryTransportAgendaLeg["manualBooking"]>; isMarked: boolean; leg: TripLeg; copy: ReturnType<typeof copyFor>; pending: boolean;
  onMark: () => Promise<boolean>; onUnmark: () => Promise<boolean>; onSave: (details: { confirmation: string; url: string; note: string }) => Promise<boolean>;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(booking.confirmation ?? "");
  const [url, setUrl] = useState(booking.url ?? "");
  const [note, setNote] = useState(booking.notes?.[0] ?? "");
  const resetDraft = () => { setConfirmation(booking.confirmation ?? ""); setUrl(booking.url ?? ""); setNote(booking.notes?.[0] ?? ""); };
  useEffect(() => { setConfirmation(booking.confirmation ?? ""); setUrl(booking.url ?? ""); setNote(booking.notes?.[0] ?? ""); }, [booking.id, booking.confirmation, booking.url, booking.notes]);
  return <div className={styles.manualBooking} data-booked-by-traveller={isMarked ? "true" : "false"} data-booking-leg-id={leg.id}>
    {!editing ? <div className={styles.bookingActions}>
      {booking.url ? <EasyTLinkButton href={booking.url} target="_blank" rel="noopener noreferrer" icon={ExternalLink} variant="primary" size="small">{copy.openBooking}</EasyTLinkButton> : null}
      {isMarked ? <EasyTButton size="small" variant="secondary" aria-description={copy.undoClarification} disabled={pending} onClick={() => void onUnmark()}>{copy.unmarkBooked}</EasyTButton>
        : <EasyTButton size="small" variant="secondary" disabled={pending} onClick={() => void onMark()}>{copy.markBooked}</EasyTButton>}
      <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => { resetDraft(); setEditing(true); }}>{copy.editBookingDetails}</EasyTButton>
    </div> : null}
    {!editing && (booking.confirmation || booking.notes?.length) ? <div className={styles.bookingSummary}>
      {booking.confirmation ? <span>{copy.confirmation}: {booking.confirmation}</span> : null}
      {booking.notes?.map((value, index) => <span key={`${index}:${value}`}>{value}</span>)}
    </div> : null}
    {editing ? <form className={styles.bookingForm} onSubmit={(event) => { event.preventDefault(); void onSave({ confirmation, url, note }).then((saved) => { if (saved) setEditing(false); }); }}>
      <EasyTField label={copy.confirmation} optional value={confirmation} onChange={(event) => setConfirmation(event.target.value)} maxLength={120} />
      <EasyTField label={copy.bookingLink} optional type="url" value={url} onChange={(event) => setUrl(event.target.value)} maxLength={1000} />
      <EasyTField label={copy.bookingNote} optional value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} />
      <div className={styles.bookingActions}><EasyTButton size="small" variant="primary" type="submit" loading={pending}>{copy.saveBookingDetails}</EasyTButton><EasyTButton size="small" variant="quiet" onClick={() => { resetDraft(); setEditing(false); }}>{copy.cancelEdit}</EasyTButton></div>
    </form> : null}
  </div>;
}

function isFutureDate(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  return parsed >= todayUtc;
}

function TransportAffiliateAction({ action, trip, leg, label }: { action: ResolvedAffiliateAction; trip: EasyTTrip; leg: TripLeg; label: string }) {
  return <div className={styles.omioAction}>
    <MorroviaAffiliateLink action={{ ...action, cta: label }} context={{ placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId }} variant="primary" />
  </div>;
}
