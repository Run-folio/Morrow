"use client";

import { ArrowRight, CalendarDays, CarFront, ExternalLink, Plane, Route, Ship, TrainFront, type LucideIcon } from "lucide-react";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTLinkButton } from "./easyt-controls";
import { MorroviaPartnerPromotion } from "./partner-promotion";
import { omioBookingActionForLeg, type ResolvedAffiliateAction } from "@/lib/easyt/booking-readiness";
import { formatTripDuration } from "@/lib/easyt/trip-facts";
import { formatIsoDate } from "@/lib/easyt/trip-lifecycle";
import { itineraryTransportAgenda, type ItineraryTransportAgendaLeg } from "@/lib/easyt/itinerary-transport-agenda";
import { transferJourneyModeLabel, transferJourneySegmentSummary } from "@/lib/easyt/transfer-journey";
import type { EasyTTrip, TripLeg } from "@/lib/easyt/trip";
import styles from "./trip-transport-workspace.module.css";

type Language = "en" | "es";

const copyFor = (language: Language) => language === "es" ? {
  eyebrow: "Transporte",
  heading: "Tus traslados, en orden",
  intro: "Cómo te mueves entre cada lugar y qué necesita confirmación.",
  empty: "El transporte aparecerá cuando la ruta incluya un trayecto entre lugares.",
  routeOrder: "Orden de la ruta",
  booked: "Reservado",
  available: "Estimación de viaje",
  confirm: "Traslado por confirmar",
  details: "Detalles",
  distance: "Distancia",
  confidence: "Confianza",
  source: "Fuente de planificación",
  openBooking: "Abrir reserva",
  findTickets: "Buscar billetes",
} : {
  eyebrow: "Transport",
  heading: "Your transport, in journey order",
  intro: "How you are getting between each place, and what still needs confirming.",
  empty: "Transport will appear once the route includes a journey between places.",
  routeOrder: "Route order",
  booked: "Booked",
  available: "Planning estimate",
  confirm: "Transfer to confirm",
  details: "Details",
  distance: "Distance",
  confidence: "Confidence",
  source: "Planning source",
  openBooking: "Open booking",
  findTickets: "Find tickets",
};

function displayDate(value: string, language: Language) {
  return formatIsoDate(value, language, { month: "short", day: "numeric", year: "numeric" })
    ?? (language === "es" ? "Fecha por confirmar" : "Date to confirm");
}

function iconForLeg(mode: TripLeg["mode"]): LucideIcon {
  if (mode === "flight") return Plane;
  if (mode === "train") return TrainFront;
  if (mode === "road") return CarFront;
  if (mode === "ferry") return Ship;
  return Route;
}

function agendaGroups(items: ItineraryTransportAgendaLeg[]) {
  return items.reduce<Array<{ date: string | null; items: ItineraryTransportAgendaLeg[] }>>((groups, item) => {
    const current = groups.at(-1);
    if (current && current.date === item.date) current.items.push(item);
    else groups.push({ date: item.date, items: [item] });
    return groups;
  }, []);
}

export default function TripTransportWorkspace({ trip, language = "en" }: { trip: EasyTTrip; language?: Language }) {
  const copy = copyFor(language);
  const items = itineraryTransportAgenda(trip);
  const groups = agendaGroups(items);
  const headingId = "transport-workspace-heading";
  return <section className={styles.workspace} aria-labelledby={headingId}>
    <div className={styles.agenda}>
      <header className={styles.header}>
        <div>
          <span>{copy.eyebrow}</span>
          <h2 id={headingId}>{copy.heading}</h2>
          <p>{copy.intro}</p>
        </div>
        {items.length ? <strong>{items.length} {items.length === 1 ? (language === "es" ? "trayecto" : "journey") : (language === "es" ? "trayectos" : "journeys")}</strong> : null}
      </header>
      {!items.length ? <div className={styles.empty}><Route aria-hidden="true" /><p>{copy.empty}</p></div> : null}
      {groups.map((group, groupIndex) => <section className={styles.group} key={`${group.date ?? "route"}-${groupIndex}`} aria-labelledby={`${headingId}-group-${groupIndex}`}>
        <h3 id={`${headingId}-group-${groupIndex}`}>
          <CalendarDays aria-hidden="true" />
          {group.date ? <time dateTime={group.date}>{displayDate(group.date, language)}</time> : copy.routeOrder}
        </h3>
        <div className={styles.list}>
          {group.items.map((item) => <TransportRow trip={trip} item={item} copy={copy} language={language} key={item.leg.id} />)}
        </div>
      </section>)}
    </div>
  </section>;
}

function TransportRow({ trip, item, copy, language }: {
  trip: EasyTTrip;
  item: ItineraryTransportAgendaLeg;
  copy: ReturnType<typeof copyFor>;
  language: Language;
}) {
  const { leg } = item;
  const Icon = iconForLeg(leg.mode);
  const durationMinutes = leg.doorToDoorMinutes ?? leg.durationMinutes;
  const segmentSummary = transferJourneySegmentSummary(leg);
  const omioAction = item.booking ? null : omioBookingActionForLeg(trip, leg);
  const statusLabel = item.status === "booked" ? copy.booked : item.status === "confirm" ? copy.confirm : copy.available;
  const source = leg.provider ?? leg.provenance?.replaceAll("_", " ") ?? null;
  return <article className={styles.card} data-transport-leg-id={leg.id}>
    <span className={styles.modeIcon}><Icon aria-hidden="true" /></span>
    <div className={styles.summary}>
      <div className={styles.route}>
        <h4>{item.from.name}<span className="sr-only"> {language === "es" ? "a" : "to"} </span><ArrowRight aria-hidden="true" /> {item.to.name}</h4>
        <p>{transferJourneyModeLabel(leg)}{durationMinutes === null ? null : <><i aria-hidden="true">·</i>~{formatTripDuration(durationMinutes)}</>}</p>
      </div>
      {segmentSummary ? <p className={styles.segments}>{segmentSummary}</p> : null}
      <span className={styles.status} data-status={item.status}>{statusLabel}</span>
      <details className={styles.details}>
        <summary>{copy.details}</summary>
        <dl>
          {item.dayNumber ? <><dt>{language === "es" ? "Día" : "Day"}</dt><dd>{item.dayNumber}</dd></> : null}
          {leg.distanceKm !== null ? <><dt>{copy.distance}</dt><dd>{Math.round(leg.distanceKm)} km</dd></> : null}
          {leg.confidence ? <><dt>{copy.confidence}</dt><dd>{leg.confidence}</dd></> : null}
          {source ? <><dt>{copy.source}</dt><dd>{source}</dd></> : null}
          {item.booking?.confirmation ? <><dt>{language === "es" ? "Confirmación" : "Confirmation"}</dt><dd>{item.booking.confirmation}</dd></> : null}
        </dl>
        {leg.warnings?.length ? <ul>{leg.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
      </details>
      <div className={styles.actions}>
        {item.booking?.url ? <EasyTLinkButton href={item.booking.url} target="_blank" rel="noopener noreferrer" aria-label={`${copy.openBooking}: ${item.booking.title}`} icon={ExternalLink} size="small" variant="secondary">{copy.openBooking}</EasyTLinkButton> : null}
        {omioAction ? <OmioAction action={omioAction} trip={trip} leg={leg} label={copy.findTickets} /> : null}
      </div>
    </div>
  </article>;
}

function OmioAction({ action, trip, leg, label }: { action: ResolvedAffiliateAction; trip: EasyTTrip; leg: TripLeg; label: string }) {
  return <div className={styles.omioAction}>
    <MorroviaAffiliateLink action={{ ...action, cta: label }} context={{ placement: "itinerary_transfer", tripId: trip.id, transferId: leg.id, originStopId: leg.fromStopId, destinationStopId: leg.toStopId }} variant="secondary" />
    <small>{affiliateDisclosure}</small>
    <MorroviaPartnerPromotion action={action} presentation="compact" />
  </div>;
}
