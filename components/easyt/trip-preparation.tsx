"use client";

import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  CarFront,
  Check,
  ClipboardCheck,
  ChevronDown,
  ExternalLink,
  FileCheck2,
  Landmark,
  Plane,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import type { OverviewPracticalTask, OverviewPrepKind, TripPrepTask, TripPrepTaskStatus } from "@/lib/easyt/trip-prep";
import type { TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { EasyTButton, EasyTField, EasyTLinkButton } from "./easyt-controls";
import { affiliateDisclosureForProvider, MorroviaAffiliateLink } from "./affiliate-link";
import { MorroviaPartnerPromotion } from "./partner-promotion";
import styles from "./trip-preparation.module.css";

const iconByKind: Record<TripPrepTask["kind"], LucideIcon> = {
  dates: CalendarDays,
  passport: FileCheck2,
  accommodation: BedDouble,
  flight: Plane,
  insurance: ShieldCheck,
  connectivity: Smartphone,
  transport: CarFront,
  activity: Landmark,
  checklist: ClipboardCheck,
};

const statusLabel: Record<TripPrepTaskStatus, string> = {
  complete: "Complete",
  "in-progress": "In progress",
  "to-do": "To do",
  urgent: "Needs attention",
};

function TaskActionCue({ task }: { task: TripPrepTask }) {
  const action = task.action;
  if (!action) return null;
  return <span className={`${styles.taskAction} ${action.provider === "world-nomads" ? styles.insuranceAction : ""}`}>{action.label}{action.external ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</span>;
}

function taskActionClick(task: TripPrepTask, tripId: string) {
  const action = task.action;
  const onClick = () => {
    if (!action) return;
    if (task.kind === "accommodation" && action.stopId) {
      trackEvent("accommodation_map_opened", { trip_id: tripId, stop_id: action.stopId });
    }
    if (action.provider === "omio") {
      trackEvent("affiliate_link_clicked", {
        partner: "omio",
        placement: "overview_before_you_go",
        tripId,
        transferId: action.transferId,
        originStopId: action.originStopId,
        destinationStopId: action.destinationStopId,
      });
    } else if (action.provider === "viator") {
      trackEvent("affiliate_link_clicked", {
        partner: "viator",
        placement: "overview_before_you_go",
        tripId,
        stopId: action.stopId,
      });
    } else if (action.affiliate && action.bookingCategory && action.provider) {
      trackEvent("affiliate_click", {
        category: action.affiliateCategory ?? action.bookingCategory,
        provider: action.provider,
        trip_id: tripId,
        stop_id: action.stopId,
        placement: "overview_before_you_go",
        workspace_view: "overview",
      });
    }
  };
  return onClick;
}

function TripPreparationTaskRow({
  task,
  tripId,
  onOpenTravellerDetails,
}: {
  task: TripPrepTask;
  tripId: string;
  onOpenTravellerDetails: () => void;
}) {
  const Icon = iconByKind[task.kind];
  const showsAffiliateDisclosure = task.action?.affiliate === true;
  const interactive = Boolean(task.action?.href || task.action?.opensTravellerDetails);
  const className = `${styles.taskRow} ${interactive ? styles.taskRowInteractive : ""} ${styles[`status-${task.status}`]}`;
  const content = <>
    <span className={styles.taskIcon}><Icon aria-hidden="true" /></span>
    <div className={styles.taskCopy}>
      <h3>{task.title}</h3>
      <p>{task.detail}</p>
      <span className={styles.statusChip}>{statusLabel[task.status]}</span>
    </div>
    <TaskActionCue task={task} />
    {showsAffiliateDisclosure ? <small className={styles.affiliateDisclosure}>{affiliateDisclosureForProvider(task.action?.provider ?? "")}</small> : null}
  </>;
  const action = task.action;

  if (!interactive || !action) return <article className={className}>{content}</article>;
  if (action.opensTravellerDetails) return <a className={className} href="#overview-traveller-details" aria-label={`${action.label}: ${task.title}`} onClick={(event) => { event.preventDefault(); onOpenTravellerDetails(); }}>{content}</a>;
  if (!action.href) return <article className={className}>{content}</article>;
  if (action.affiliate && (action.provider === "world-nomads" || action.provider === "saily")) {
    return <MorroviaAffiliateLink
      action={{
        provider: action.provider,
        category: action.provider === "world-nomads" ? "travel_insurance" : "connectivity",
        href: action.href,
        cta: action.label,
        affiliate: true,
      }}
      context={{ placement: "overview_before_you_go", tripId, workspaceView: "overview" }}
      className={className}
      renderAsSurface
    >{content}</MorroviaAffiliateLink>;
  }
  const onClick = taskActionClick(task, tripId);
  if (action.external) return <a className={className} href={action.href} target="_blank" rel={action.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"} aria-label={`${action.label}: ${task.title}, opens ${action.provider ?? "provider"} in a new tab`} onClick={onClick}>{content}</a>;
  return <Link className={className} href={action.href} aria-label={`${action.label}: ${task.title}`} onClick={onClick}>{content}</Link>;
}

export function TripPreparationTaskSection({
  id,
  title,
  icon: Icon,
  tasks,
  tripId,
  onOpenTravellerDetails,
  collapsible = false,
  defaultOpen = false,
  showPartnerPromotion = false,
  promotionNow,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  tasks: TripPrepTask[];
  tripId: string;
  onOpenTravellerDetails: () => void;
  collapsible?: boolean;
  defaultOpen?: boolean;
  showPartnerPromotion?: boolean;
  promotionNow?: Date;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!tasks.length) return null;
  const taskList = <>
    <div className={styles.taskList}>
      {tasks.map((task) => <TripPreparationTaskRow key={task.id} task={task} tripId={tripId} onOpenTravellerDetails={onOpenTravellerDetails} />)}
    </div>
    {showPartnerPromotion ? <MorroviaPartnerPromotion
      className={styles.partnerPromotion}
      action={tasks.find((task) => task.action?.provider === "omio")?.action}
      now={promotionNow}
    /> : null}
  </>;
  return <section className={styles.taskSection} aria-labelledby={`${id}-title`}>
    {collapsible ? <details className={styles.taskDisclosure} open={open} onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary aria-expanded={open} aria-controls={`${id}-tasks`}>
        <Icon aria-hidden="true" />
        <span><h2 id={`${id}-title`}>{title}</h2><small>{tasks.length} outstanding {tasks.length === 1 ? "task" : "tasks"}</small></span>
        <ChevronDown aria-hidden="true" />
      </summary>
      <div id={`${id}-tasks`} className={styles.taskDisclosurePanel}>{taskList}</div>
    </details> : <>
      <header><Icon aria-hidden="true" /><h2 id={`${id}-title`}>{title}</h2></header>
      {taskList}
    </>}
  </section>;
}

export function TripTravellerDetailsEditor({
  ownerId,
  profile,
  onClose,
  onSave,
  language = "en",
}: {
  ownerId?: string | null;
  profile: TravelReadinessProfile;
  onClose: () => void;
  onSave: (profile: TravelReadinessProfile) => void;
  language?: "en" | "es";
}) {
  const [draft, setDraft] = useState(profile);
  const [saveState, setSaveState] = useState<"idle" | "saved" | "error">("idle");

  useEffect(() => {
    setDraft(profile);
    setSaveState("idle");
  }, [profile]);

  const save = () => {
    try {
      window.localStorage.setItem(travelReadinessStorageKey(ownerId), JSON.stringify(draft));
      onSave(draft);
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  };

  return <section className={styles.travellerEditor} aria-labelledby="overview-traveller-details-title">
    <header>
      <div><p>{language === "es" ? "Datos del viajero" : "Traveller details"}</p><h3 id="overview-traveller-details-title">{language === "es" ? "Personaliza las consultas de entrada y pasaporte" : "Personalise entry and passport checks"}</h3><span>{language === "es" ? "Solo se guardan en este dispositivo la nacionalidad, la residencia y el mes de caducidad del pasaporte. No introduzcas números de pasaporte ni subas documentos." : "Only nationality, residence and passport expiry month are stored on this device. Never enter passport numbers or upload documents."}</span></div>
      <ShieldCheck aria-hidden="true" />
    </header>
    <div className={styles.travellerFields}>
      <EasyTField label={language === "es" ? "Nacionalidad / nacionalidades" : "Nationality / nationalities"} value={draft.nationalities.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, nationalities: event.target.value.split(",").map((country) => country.trim()).filter(Boolean).slice(0, 4) }))} placeholder={language === "es" ? "Por ejemplo, España" : "For example, United Kingdom"} />
      <EasyTField label={language === "es" ? "País de residencia" : "Country of residence"} value={draft.residenceCountry} onChange={(event) => setDraft((current) => ({ ...current, residenceCountry: event.target.value }))} placeholder={language === "es" ? "Por ejemplo, España" : "For example, United Kingdom"} />
      <EasyTField label={language === "es" ? "Mes de caducidad del pasaporte" : "Passport expiry month"} type="month" value={draft.passportExpiryMonth} onChange={(event) => setDraft((current) => ({ ...current, passportExpiryMonth: event.target.value }))} />
    </div>
    <div className={styles.travellerActions}>
      <EasyTButton size="small" onClick={save}>{language === "es" ? "Guardar en este dispositivo" : "Save on this device"}</EasyTButton>
      <EasyTButton size="small" variant="quiet" onClick={onClose}>{language === "es" ? "Cerrar" : "Close"}</EasyTButton>
      {saveState === "saved" ? <span role="status">{language === "es" ? "Datos del viajero guardados." : "Traveller details saved."}</span> : saveState === "error" ? <span role="alert">{language === "es" ? "Morrovia no pudo guardar los datos en este navegador. No se aplicaron cambios." : "Morrovia couldn’t save these details in this browser. Nothing changed."}</span> : null}
    </div>
  </section>;
}

/** Overview card presentation composes existing controls and affiliate owners; legacy task rows stay unchanged. */
export function TripPreparationCards({ tasks, tripId, language, onOpenTravellerDetails, onStatusChange, isPending }: {
  tasks: OverviewPracticalTask[];
  tripId: string;
  language: "en" | "es";
  onOpenTravellerDetails: () => void;
  onStatusChange: (kind: OverviewPrepKind, choice: "to-review" | "sorted") => void;
  isPending: (kind: OverviewPrepKind) => boolean;
}) {
  return <div className={styles.overviewPrepGrid}>
    {tasks.map((task) => {
      const Icon = iconByKind[task.id];
      const action = task.action;
      const reviewed = task.status === "sorted" || task.status === "not-needed";
      const legacyTask: TripPrepTask = { ...task, kind: task.id, category: "good", status: "to-do" };
      const disclosure = language === "es"
        ? action?.provider === "world-nomads"
          ? "Recibimos una comisión cuando obtienes una cotización de World Nomads mediante este enlace. No representamos a World Nomads. Esto no es una recomendación de contratar un seguro de viaje."
          : "Enlace de socio · Morrovia puede recibir una comisión sin coste adicional para ti. La reserva, el pago y las condiciones del proveedor se aplican en su sitio."
        : affiliateDisclosureForProvider(action?.provider ?? "");
      return <article key={task.id} className={styles.overviewPrepCard} data-prep-kind={task.id} data-prep-state={task.status}>
        <span className={styles.overviewPrepIcon}><Icon aria-hidden="true" /></span>
        <div className={styles.overviewPrepCopy}>
          <h3>{task.title}</h3>
          <p>{task.detail}</p>
          {action?.affiliate ? <small className={styles.overviewPrepDisclosure}>{disclosure}</small> : null}
          <div className={styles.overviewPrepAction}>
            {action?.opensTravellerDetails ? <EasyTButton variant="quiet" size="small" onClick={onOpenTravellerDetails}>{action.label}<ArrowRight aria-hidden="true" /></EasyTButton>
              : action?.href && action.affiliate && (action.provider === "world-nomads" || action.provider === "saily") ? <MorroviaAffiliateLink
                action={{ provider: action.provider, category: action.provider === "world-nomads" ? "travel_insurance" : "connectivity", href: action.href, cta: action.label, affiliate: true }}
                context={{ placement: "overview_before_you_go", tripId, workspaceView: "overview" }} variant="quiet"
              /> : action?.href ? <EasyTLinkButton href={action.href} target={action.external ? "_blank" : undefined} rel={action.external ? action.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer" : undefined} variant="quiet" size="small" onClick={taskActionClick(legacyTask, tripId)}>{action.label}{action.external ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}</EasyTLinkButton>
              : <span className={styles.overviewPrepUnavailable}>{language === "es" ? "Opciones no disponibles por ahora" : "Options currently unavailable"}</span>}
          </div>
        </div>
        <EasyTButton
          className={styles.overviewPrepReview}
          variant="quiet"
          role="checkbox"
          aria-checked={reviewed}
          aria-label={language === "es"
            ? `Marcar la tarea ${task.title} como ${reviewed ? "pendiente" : "revisada"}`
            : `Mark ${task.title} as ${reviewed ? "not reviewed" : "reviewed"}`}
          disabled={isPending(task.id)}
          onClick={() => onStatusChange(task.id, reviewed ? "to-review" : "sorted")}
        ><span className={styles.overviewPrepReviewMark}><Check aria-hidden="true" /></span></EasyTButton>
      </article>;
    })}
  </div>;
}
