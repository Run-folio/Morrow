"use client";

import { useEffect, useMemo, useState } from "react";
import { BedDouble, CalendarCheck2, Copy, MailCheck, Plane, RotateCcw, TicketCheck, TrainFront } from "lucide-react";

import { trackEvent } from "@/lib/analytics";
import type { BookingCandidateType } from "@/lib/easyt/booking-candidate";
import type { BookingCandidateView, BookingImportPayload } from "@/lib/easyt/booking-import-view";
import { EasyTButton, EasyTField, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import { MorroviaConfirmationDialog, MorroviaStatusBanner } from "./morrovia-feedback";
import styles from "./imported-bookings.module.css";

const iconByType = {
  accommodation: BedDouble,
  flight: Plane,
  activity: TicketCheck,
  ground_transport: TrainFront,
  car_rental: CalendarCheck2,
  other: CalendarCheck2,
} satisfies Record<BookingCandidateType, typeof BedDouble>;

function dateLabel(startDate: string | null, endDate: string | null, language: "en" | "es") {
  if (!startDate) return language === "es" ? "Fechas por confirmar" : "Dates need checking";
  const locale = language === "es" ? "es" : "en-GB";
  const format = (value: string) => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T00:00:00Z`));
  return endDate && endDate !== startDate ? `${format(startDate)} – ${format(endDate)}` : format(startDate);
}

export default function ImportedBookings({ language = "en", initialData }: { language?: "en" | "es"; initialData?: BookingImportPayload }) {
  const [data, setData] = useState<BookingImportPayload | null>(initialData ?? null);
  const [loading, setLoading] = useState(!initialData);
  const [error, setError] = useState<string | null>(null);
  const [address, setAddress] = useState<string | null>(null);
  const [addressBusy, setAddressBusy] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [selectedTrip, setSelectedTrip] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ title: string; detail: string; tone: "success" | "danger" } | null>(null);

  const copy = language === "es" ? {
    eyebrow: "Reservas importadas", title: "Revisa antes de añadir.", detail: "Reenvía una confirmación cada vez desde el correo verificado de tu cuenta. Morrovia nunca añadirá nada al viaje sin tu aprobación.",
    create: "Crear dirección privada", replace: "Reemplazar dirección privada", address: "Tu dirección privada de reenvío", copyAddress: "Copiar dirección", copied: "Dirección copiada.",
    hidden: "Tu dirección actual termina en", hiddenDetail: "Por seguridad, el token completo solo se muestra cuando se crea. Reemplázala si ya no la tienes.",
    notConfigured: "El reenvío aún no está activo", notConfiguredDetail: "La integración está preparada, pero el dominio receptor y el webhook deben configurarse antes de mostrar una dirección.",
    loading: "Buscando reservas reenviadas…", empty: "Aún no hay reservas para revisar.", emptyDetail: "Cuando el reenvío esté activo, las confirmaciones compatibles aparecerán aquí.",
    strong: "Posible reserva encontrada para", ambiguous: "¿A qué viaje corresponde?", none: "No pudimos asociar esta reserva con confianza.", trip: "Viaje", choose: "Elige un viaje", add: "Añadir reserva", dismiss: "No es esta", found: "Encontrada en un correo que reenviaste", reference: "Referencia", added: "Añadida", ignored: "Ignorada", confidence: "confianza",
    createTrip: "Crear un viaje", addressHelp: "Solo correo reenviado deliberadamente. Los adjuntos no se procesan. El mensaje nunca cambia un viaje directamente.",
    confirmRotate: "¿Reemplazar tu dirección privada?", confirmRotateDetail: "La dirección actual dejará de reconocer tu cuenta.", confirmRotateAction: "Reemplazar dirección", cancel: "Cancelar",
  } : {
    eyebrow: "Imported bookings", title: "Review before you add.", detail: "Forward one confirmation at a time from your verified account email. Morrovia never adds anything to a trip without your approval.",
    create: "Create private address", replace: "Replace private address", address: "Your private forwarding address", copyAddress: "Copy address", copied: "Address copied.",
    hidden: "Your current address ends in", hiddenDetail: "For safety, the full token is shown only when it is created. Replace it if you no longer have it.",
    notConfigured: "Email forwarding is not live yet", notConfiguredDetail: "The integration boundary is ready, but the receiving domain and signed webhook must be configured before an address is shown.",
    loading: "Checking for forwarded bookings…", empty: "No bookings are waiting for review.", emptyDetail: "Once forwarding is enabled, supported confirmations will appear here.",
    strong: "Possible booking found for", ambiguous: "Which trip is this for?", none: "We couldn't confidently match this booking to a trip.", trip: "Trip", choose: "Choose a trip", add: "Add booking", dismiss: "Not this", found: "Found from an email you forwarded", reference: "Reference", added: "Added", ignored: "Ignored", confidence: "confidence",
    createTrip: "Create a trip", addressHelp: "Deliberate forwards only. Attachments are not processed, and an email can never change a trip directly.",
    confirmRotate: "Replace your private address?", confirmRotateDetail: "Your current forwarding address will stop resolving to your account.", confirmRotateAction: "Replace address", cancel: "Cancel",
  };

  useEffect(() => {
    if (initialData) return;
    let active = true;
    fetch("/api/easyt/booking-import", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("load_failed");
        return response.json() as Promise<BookingImportPayload>;
      })
      .then((payload) => { if (active) setData(payload); })
      .catch(() => { if (active) setError(language === "es" ? "No pudimos cargar las reservas importadas." : "We couldn't load imported bookings."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [initialData, language]);

  useEffect(() => {
    if (!data) return;
    setSelectedTrip((current) => Object.fromEntries(data.candidates.map((candidate) => [
      candidate.id,
      current[candidate.id] ?? candidate.canonicalTripId ?? candidate.match.suggestedTripId ?? "",
    ])));
  }, [data]);

  const pending = useMemo(() => data?.candidates.filter((candidate) => candidate.status === "pending") ?? [], [data]);
  const reviewed = useMemo(() => data?.candidates.filter((candidate) => candidate.status !== "pending") ?? [], [data]);

  const createAddress = async () => {
    setAddressBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/easyt/booking-import", { method: "POST" });
      const payload = await response.json() as { address?: string; hint?: string };
      if (!response.ok || !payload.address || !payload.hint) throw new Error("address_failed");
      setAddress(payload.address);
      setData((current) => current ? { ...current, alias: { hint: payload.hint!, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } } : current);
      setRotateOpen(false);
    } catch {
      setError(language === "es" ? "No pudimos crear una dirección privada ahora." : "We couldn't create a private address just now.");
    } finally {
      setAddressBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setMessage({ title: copy.copied, detail: copy.addressHelp, tone: "success" });
    } catch {
      setError(language === "es" ? "Copia la dirección directamente desde el campo." : "Copy the address directly from the field.");
    }
  };

  const reviewCandidate = async (candidate: BookingCandidateView, action: "confirm" | "dismiss") => {
    const tripId = selectedTrip[candidate.id];
    if (action === "confirm" && !tripId) {
      setError(language === "es" ? "Elige un viaje antes de añadir la reserva." : "Choose a trip before adding the booking.");
      return;
    }
    setWorkingId(candidate.id);
    setError(null);
    try {
      const response = await fetch(`/api/easyt/booking-import/${encodeURIComponent(candidate.id)}`, action === "confirm"
        ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tripId }) }
        : { method: "PATCH" });
      if (!response.ok) throw new Error("review_failed");
      setData((current) => current ? { ...current, candidates: current.candidates.map((item) => item.id === candidate.id ? { ...item, status: action === "confirm" ? "added" : "ignored", canonicalTripId: action === "confirm" ? tripId : item.canonicalTripId } : item) } : current);
      if (candidate.source === "forwarded_email") trackEvent("booking_import_reviewed", {
        source: "forwarded_email",
        type: candidate.type,
        confidence: candidate.confidence,
        result: action === "confirm" ? "confirmed" : candidate.match.status === "none" ? "unmatched" : "dismissed",
      });
      setMessage(action === "confirm"
        ? { title: language === "es" ? "Reserva añadida" : "Booking added", detail: language === "es" ? "La reserva ya forma parte del viaje que elegiste." : "The booking is now part of the trip you chose.", tone: "success" }
        : { title: language === "es" ? "Sugerencia ignorada" : "Suggestion dismissed", detail: language === "es" ? "No se cambió ningún viaje." : "No trip was changed.", tone: "success" });
    } catch {
      setError(language === "es" ? "No pudimos guardar esa decisión. Ningún otro viaje ha cambiado." : "We couldn't save that choice. No other trip was changed.");
    } finally {
      setWorkingId(null);
    }
  };

  return <section className={styles.imports} aria-labelledby="imported-bookings-title">
    <header className={styles.header}>
      <div><p>{copy.eyebrow}</p><h2 id="imported-bookings-title">{copy.title}</h2><span>{copy.detail}</span></div>
      <MailCheck aria-hidden="true" />
    </header>

    {loading ? <MorroviaStatusBanner title={copy.loading} detail={copy.addressHelp} /> : null}
    {error ? <MorroviaStatusBanner tone="danger" title={error} detail={language === "es" ? "Inténtalo de nuevo. No se ha cambiado ningún viaje." : "Try again. No trip has been changed."} /> : null}
    {message ? <MorroviaStatusBanner tone={message.tone} title={message.title} detail={message.detail} /> : null}

    {data && !data.configured ? <MorroviaStatusBanner tone="warning" title={copy.notConfigured} detail={copy.notConfiguredDetail} /> : null}
    {data?.configured ? <div className={styles.aliasPanel}>
      <div>
        <strong>{data.alias ? `${copy.hidden} ••••${data.alias.hint}` : copy.create}</strong>
        <span>{data.alias ? copy.hiddenDetail : copy.addressHelp}</span>
      </div>
      {address ? <div className={styles.addressRow}>
        <EasyTField fieldClassName={styles.addressField} label={copy.address} value={address} readOnly />
        <EasyTButton icon={Copy} variant="secondary" onClick={copyAddress}>{copy.copyAddress}</EasyTButton>
      </div> : null}
      <EasyTButton icon={data.alias ? RotateCcw : MailCheck} variant="secondary" loading={addressBusy} onClick={() => data.alias ? setRotateOpen(true) : void createAddress()}>{data.alias ? copy.replace : copy.create}</EasyTButton>
    </div> : null}

    {!loading && data ? <div className={styles.candidateArea}>
      {pending.length ? <div className={styles.candidateList}>{pending.map((candidate) => {
        const Icon = iconByType[candidate.type];
        const selected = selectedTrip[candidate.id] ?? "";
        const suggested = candidate.match.matches.find((match) => match.tripId === selected);
        const matchTitle = candidate.match.status === "strong" && candidate.match.suggestedTripId
          ? `${copy.strong} ${candidate.match.matches.find((match) => match.tripId === candidate.match.suggestedTripId)?.tripTitle ?? ""}`
          : candidate.match.status === "ambiguous" ? copy.ambiguous : copy.none;
        const addLabel = candidate.type === "accommodation" && suggested?.stopName ? `${copy.add} · ${suggested.stopName}` : copy.add;
        return <article className={styles.candidate} key={candidate.id}>
          <div className={styles.candidateIcon}><Icon aria-hidden="true" /></div>
          <div className={styles.candidateCopy}>
            <p>{matchTitle}</p>
            <h3>{candidate.title}</h3>
            <span>{[candidate.location, dateLabel(candidate.startDate, candidate.endDate, language), candidate.provider].filter(Boolean).join(" · ")}</span>
            {candidate.referenceMasked ? <small>{copy.reference} {candidate.referenceMasked}</small> : null}
            <em>{copy.found} · {candidate.confidence} {copy.confidence}</em>
          </div>
          <div className={styles.candidateActions}>
            {data.trips.length ? <EasyTSelect label={copy.trip} value={selected} onChange={(event) => setSelectedTrip((current) => ({ ...current, [candidate.id]: event.target.value }))}>
              <option value="">{copy.choose}</option>
              {data.trips.map((trip) => <option value={trip.id} key={trip.id}>{trip.title}</option>)}
            </EasyTSelect> : <EasyTLinkButton href="/journey/new" variant="secondary">{copy.createTrip}</EasyTLinkButton>}
            <div><EasyTButton size="small" loading={workingId === candidate.id} disabled={!selected} onClick={() => void reviewCandidate(candidate, "confirm")}>{addLabel}</EasyTButton><EasyTButton size="small" variant="quiet" disabled={workingId === candidate.id} onClick={() => void reviewCandidate(candidate, "dismiss")}>{copy.dismiss}</EasyTButton></div>
          </div>
        </article>;
      })}</div> : <div className={styles.empty}><CalendarCheck2 aria-hidden="true" /><div><strong>{copy.empty}</strong><span>{copy.emptyDetail}</span></div></div>}
      {reviewed.length ? <div className={styles.reviewed} aria-label={language === "es" ? "Reservas revisadas" : "Reviewed bookings"}>{reviewed.map((candidate) => <span key={candidate.id}><b>{candidate.status === "added" ? copy.added : copy.ignored}</b>{candidate.title}</span>)}</div> : null}
    </div> : null}

    <MorroviaConfirmationDialog
      open={rotateOpen}
      title={copy.confirmRotate}
      detail={copy.confirmRotateDetail}
      consequences={[copy.hiddenDetail, copy.addressHelp]}
      cancelLabel={copy.cancel}
      confirmLabel={copy.confirmRotateAction}
      confirming={addressBusy}
      onCancel={() => setRotateOpen(false)}
      onConfirm={() => void createAddress()}
    />
  </section>;
}
