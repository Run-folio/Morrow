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
import { useEffect, useId, useRef, useState } from "react";
import type { ItineraryDayPart } from "@/lib/easyt/trip";
import { EasyTButton, EasyTLinkButton, EasyTSelect } from "./easyt-controls";
import ResilientImage from "./resilient-image";
import styles from "./itinerary-item-detail.module.css";

export type ItineraryItemDetailModel = {
  id: string;
  kind: "activity" | "restaurant" | "accommodation";
  title: string;
  location?: string | null;
  description?: string | null;
  image?: string | null;
  category?: string | null;
  duration?: string | null;
  price?: string | null;
  dateSummary?: string | null;
  bookingStatus?: string | null;
  bookingHref?: string | null;
  whyFit?: string | null;
  practical?: Array<{ label: string; value: string }>;
  dayPart?: ItineraryDayPart | null;
  canMoveTime?: boolean;
  canRemove?: boolean;
};

type Props = {
  detail: ItineraryItemDetailModel;
  mapHref: string;
  pending?: boolean;
  onClose: () => void;
  onDayPartChange?: (part: ItineraryDayPart | null) => void;
  onAddNote?: () => void;
  onRemove?: () => void;
  onManage?: () => void;
  manageLabel?: string;
};

const partLabels: Record<ItineraryDayPart, string> = {
  morning: "Morning",
  midday: "Midday",
  afternoon: "Afternoon",
  evening: "Evening",
};

export default function ItineraryItemDetail({
  detail,
  mapHref,
  pending = false,
  onClose,
  onDayPartChange,
  onAddNote,
  onRemove,
  onManage,
  manageLabel = "Manage",
}: Props) {
  const headingId = useId();
  const shellRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [mobileSheet, setMobileSheet] = useState(false);
  const KindIcon = detail.kind === "restaurant" ? Utensils : detail.kind === "accommodation" ? BedDouble : Sparkles;

  useEffect(() => {
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
  }, [detail.id, onClose]);

  return <>
    <EasyTButton className={styles.scrim} iconOnly variant="quiet" aria-label="Close item details" onClick={onClose}>Close item details</EasyTButton>
    <section
      ref={shellRef}
      className={styles.shell}
      role="dialog"
      aria-modal={mobileSheet || undefined}
      aria-labelledby={headingId}
      aria-busy={pending || undefined}
      data-itinerary-detail-kind={detail.kind}
    >
      <div className={styles.handle} aria-hidden="true" />
      <EasyTButton ref={closeRef} className={styles.close} icon={X} iconOnly variant="secondary" aria-label={`Close details for ${detail.title}`} onClick={onClose}>Close</EasyTButton>

      {detail.image ? <div className={styles.hero}><ResilientImage src={detail.image} alt="" fallback={<span><KindIcon aria-hidden="true" /></span>} /></div> : <div className={`${styles.hero} ${styles.heroFallback}`}><KindIcon aria-hidden="true" /><span>{detail.location ?? "Saved itinerary item"}</span></div>}

      <div className={styles.content}>
        <header className={styles.header}>
          <span><KindIcon aria-hidden="true" />{detail.kind === "accommodation" ? "Your stay" : detail.kind === "restaurant" ? "Restaurant" : "Activity"}</span>
          <h2 id={headingId}>{detail.title}</h2>
          {detail.location ? <p><MapPin aria-hidden="true" />{detail.location}</p> : null}
          {detail.description ? <div className={styles.description}>{detail.description}</div> : null}
        </header>

        <dl className={styles.facts}>
          {detail.category ? <div><Tag aria-hidden="true" /><dt>Category</dt><dd>{detail.category}</dd></div> : null}
          {detail.duration ? <div><Clock3 aria-hidden="true" /><dt>Duration</dt><dd>{detail.duration}</dd></div> : null}
          {detail.dateSummary ? <div><CalendarDays aria-hidden="true" /><dt>When</dt><dd>{detail.dateSummary}</dd></div> : null}
          {detail.price ? <div><span aria-hidden="true">£</span><dt>Price</dt><dd>{detail.price}</dd></div> : null}
          {detail.bookingStatus ? <div><CheckCircle2 aria-hidden="true" /><dt>Status</dt><dd>{detail.bookingStatus}</dd></div> : null}
        </dl>

        {detail.whyFit ? <section className={styles.why} aria-label="Why this fits"><Sparkles aria-hidden="true" /><div><h3>Why it fits this part of the day</h3><p>{detail.whyFit}</p></div></section> : null}

        {detail.practical?.length ? <section className={styles.practical}><h3>Practical info</h3><dl>{detail.practical.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl></section> : null}

        {detail.canMoveTime && onDayPartChange ? <EasyTSelect label="Part of day" value={detail.dayPart ?? ""} disabled={pending} onChange={(event) => onDayPartChange(event.target.value ? event.target.value as ItineraryDayPart : null)}>
          <option value="">Time not set</option>
          {(Object.keys(partLabels) as ItineraryDayPart[]).map((part) => <option value={part} key={part}>{partLabels[part]}</option>)}
        </EasyTSelect> : null}

        <div className={styles.actions}>
          <EasyTLinkButton href={mapHref} icon={MapIcon} fullWidth>View on map</EasyTLinkButton>
          {detail.bookingHref ? <EasyTLinkButton href={detail.bookingHref} target="_blank" rel="noopener noreferrer" icon={ExternalLink} variant="secondary">Open booking</EasyTLinkButton> : null}
          {onManage ? <EasyTButton icon={BedDouble} variant="secondary" onClick={onManage}>{manageLabel}</EasyTButton> : null}
          {onAddNote ? <EasyTButton icon={NotebookPen} variant="secondary" onClick={onAddNote}>Add note</EasyTButton> : null}
          {detail.canRemove && onRemove ? <EasyTButton icon={Trash2} variant="danger" onClick={onRemove}>Remove</EasyTButton> : null}
        </div>
      </div>
    </section>
  </>;
}
