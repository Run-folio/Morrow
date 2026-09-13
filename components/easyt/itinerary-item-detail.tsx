"use client";

import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Map as MapIcon,
  MapPin,
  NotebookPen,
  Sparkles,
  Tag,
  Trash2,
  Utensils,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { ItineraryDayPart } from "@/lib/easyt/trip";
import type { RecommendationDetailModel } from "@/lib/easyt/recommendation-detail";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import ResilientImage from "./resilient-image";
import styles from "./itinerary-item-detail.module.css";

export type ItineraryItemDetailModel = RecommendationDetailModel;

type Props = {
  detail: ItineraryItemDetailModel;
  mapHref?: string | null;
  pending?: boolean;
  onClose: () => void;
  onDayPartChange?: (part: ItineraryDayPart | null) => void;
  onAddNote?: () => void;
  onRemove?: () => void;
  onManage?: () => void;
  manageLabel?: string;
  primaryActions?: ReactNode;
  embedded?: boolean;
};

const partLabels: Record<ItineraryDayPart, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

export default function RecommendationDetail({
  detail,
  mapHref,
  pending = false,
  onClose,
  onDayPartChange,
  onAddNote,
  onRemove,
  onManage,
  manageLabel = "Manage",
  primaryActions,
  embedded = false,
}: Props) {
  const headingId = useId();
  const shellRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mobileSheet, setMobileSheet] = useState(false);
  const [mapPending, setMapPending] = useState(false);
  const KindIcon = detail.kind === "restaurant" ? Utensils : detail.kind === "accommodation" ? BedDouble : Sparkles;

  useEffect(() => {
    if (embedded) return;
    const frame = window.requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab" || !shellRef.current || !window.matchMedia("(max-width: 900px)").matches) return;
      const focusable = [...shellRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    const mobile = window.matchMedia("(max-width: 900px)").matches;
    setMobileSheet(mobile);
    const previousOverflow = document.body.style.overflow;
    if (mobile) document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      if (mobile) document.body.style.overflow = previousOverflow;
    };
  }, [detail.id, embedded, onClose]);

  useEffect(() => setMapPending(false), [detail.id, mapHref]);

  return <>
    {!embedded ? <EasyTButton className={styles.scrim} iconOnly variant="quiet" aria-label="Close recommendation details" onClick={onClose}>Close recommendation details</EasyTButton> : null}
    <section
      ref={shellRef}
      className={`${styles.shell} ${embedded ? styles.embedded : ""}`}
      role={embedded ? undefined : "dialog"}
      aria-modal={!embedded && mobileSheet || undefined}
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      data-recommendation-detail-kind={detail.kind}
      data-recommendation-context-key={detail.contextKey}
    >
      {!embedded ? <><div className={styles.handle} aria-hidden="true" /><EasyTButton ref={closeRef} className={styles.close} icon={X} iconOnly variant="secondary" aria-label={`Close details for ${detail.title}`} onClick={onClose}>Close</EasyTButton></> : null}

      {detail.image ? <div className={styles.hero}><ResilientImage src={detail.image} alt={detail.imageAlt ?? ""} fallback={<span><KindIcon aria-hidden="true" /></span>} /></div> : <div className={`${styles.hero} ${styles.heroFallback}`}><KindIcon aria-hidden="true" /><span>{detail.kind === "restaurant" ? "No sourced image available" : detail.kind === "accommodation" ? "No sourced property image available" : detail.location ?? "Recommendation"}</span></div>}

      <div className={styles.content}>
        <header className={styles.header}>
          <span><KindIcon aria-hidden="true" />{detail.kind === "accommodation" ? "Your stay" : detail.kind === "restaurant" ? "Restaurant" : detail.kind === "tour" ? "Bookable experience" : "Activity"}</span>
          <h2 id={headingId}>{detail.title}</h2>
          {detail.location ? <p><MapPin aria-hidden="true" />{detail.location}</p> : null}
          {detail.summary ? <div className={styles.description}>{detail.summary}</div> : null}
        </header>

        <dl className={styles.facts}>
          {detail.category ? <div><Tag aria-hidden="true" /><dt>Category</dt><dd>{detail.category}</dd></div> : null}
          {detail.duration ? <div><Clock3 aria-hidden="true" /><dt>Duration</dt><dd>{detail.duration}</dd></div> : null}
          {detail.dateSummary ? <div><CalendarDays aria-hidden="true" /><dt>When</dt><dd>{detail.dateSummary}</dd></div> : null}
          {detail.price ? <div><span aria-hidden="true">£</span><dt>Price</dt><dd>{detail.price}</dd></div> : null}
          {detail.bookingStatus ? <div><CheckCircle2 aria-hidden="true" /><dt>Status</dt><dd>{detail.bookingStatus}</dd></div> : null}
        </dl>

        {detail.commercialFacts ? <section className={styles.commercialFacts} aria-label={detail.commercialFacts.providerLabel}>
          <span>{detail.commercialFacts.providerLabel}</span>
          <dl>
            {detail.commercialFacts.price ? <div><dt>Price</dt><dd>{detail.commercialFacts.price}</dd></div> : null}
            {detail.commercialFacts.availability ? <div><dt>Availability</dt><dd>{detail.commercialFacts.availability}</dd></div> : null}
            {detail.commercialFacts.cancellation ? <div><dt>Cancellation</dt><dd>{detail.commercialFacts.cancellation}</dd></div> : null}
          </dl>
          <p>{detail.commercialFacts.qualification}</p>
        </section> : null}

        {detail.whyFit ? <section className={styles.why} aria-label="Why this fits"><Sparkles aria-hidden="true" /><div><h3>{detail.whyFitLabel ?? "Why it fits this part of the day"}</h3><p>{detail.whyFit}</p></div></section> : null}

        {detail.practical?.length ? <section className={styles.practical}><h3>Practical info</h3><dl>{detail.practical.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section> : null}

        {detail.canMoveTime && onDayPartChange ? <EasyTSelect label="Part of day" value={detail.dayPart ?? ""} disabled={pending} onChange={(event) => onDayPartChange(event.target.value ? event.target.value as ItineraryDayPart : null)}>
          <option value="">Time not set</option>
          {(Object.keys(partLabels) as ItineraryDayPart[]).map((part) => <option value={part} key={part}>{partLabels[part]}</option>)}
        </EasyTSelect> : null}

        <div className={styles.actions}>
          {primaryActions}
          {mapHref ? <EasyTLinkButton href={mapHref} icon={MapIcon} fullWidth loading={mapPending} onClick={() => setMapPending(true)}>{mapPending ? "Opening map…" : "View on map"}</EasyTLinkButton> : null}
          {detail.bookingHref ? <EasyTLinkButton href={detail.bookingHref} target="_blank" rel="noopener noreferrer" icon={ExternalLink} variant="secondary">Open booking</EasyTLinkButton> : null}
          {onManage ? <EasyTButton icon={BedDouble} variant="secondary" onClick={onManage}>{manageLabel}</EasyTButton> : null}
          {onAddNote ? <EasyTButton icon={NotebookPen} variant="secondary" onClick={onAddNote}>Add note</EasyTButton> : null}
          {detail.canRemove && onRemove ? <EasyTButton icon={Trash2} variant="danger" onClick={onRemove}>Remove</EasyTButton> : null}
        </div>
      </div>
    </section>
  </>;
}
