"use client";

import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  CarFront,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  Landmark,
  Plane,
  ShieldCheck,
  Smartphone,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { trackEvent } from "@/lib/analytics";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import type { TripPrepTask, TripPrepTaskStatus } from "@/lib/easyt/trip-prep";
import type { TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { EasyTButton, EasyTField, EasyTLinkButton } from "./easyt-controls";
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

const affiliateDisclosure = "Partner link · Morrovia may earn a commission at no extra cost to you.";

function TaskAction({
  task,
  tripId,
  onOpenTravellerDetails,
}: {
  task: TripPrepTask;
  tripId: string;
  onOpenTravellerDetails: () => void;
}) {
  const action = task.action;
  if (!action) return null;
  if (action.opensTravellerDetails) {
    return <EasyTButton className={styles.taskAction} icon={ArrowRight} iconOnly size="small" variant="secondary" onClick={onOpenTravellerDetails}>{action.label}</EasyTButton>;
  }
  if (!action.href) return null;

  const onClick = () => {
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

  if (action.external) {
    return <EasyTLinkButton className={styles.taskAction} href={action.href} target="_blank" rel={action.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"} aria-label={`${action.label}, opens ${action.provider ?? "provider"} in a new tab`} icon={ExternalLink} iconOnly size="small" variant="secondary" onClick={onClick}>{action.label}</EasyTLinkButton>;
  }
  return <EasyTLinkButton className={styles.taskAction} href={action.href} icon={ArrowRight} iconOnly size="small" variant="secondary" onClick={onClick}>{action.label}</EasyTLinkButton>;
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

  return <article className={`${styles.taskRow} ${styles[`status-${task.status}`]}`}>
    <span className={styles.taskIcon}><Icon aria-hidden="true" /></span>
    <div className={styles.taskCopy}>
      <h3>{task.title}</h3>
      <p>{task.detail}</p>
      <span className={styles.statusChip}>{statusLabel[task.status]}</span>
    </div>
    <TaskAction task={task} tripId={tripId} onOpenTravellerDetails={onOpenTravellerDetails} />
    {showsAffiliateDisclosure ? <small className={styles.affiliateDisclosure}>{affiliateDisclosure}</small> : null}
  </article>;
}

export function TripPreparationTaskSection({
  id,
  title,
  icon: Icon,
  tasks,
  tripId,
  onOpenTravellerDetails,
}: {
  id: string;
  title: string;
  icon: LucideIcon;
  tasks: TripPrepTask[];
  tripId: string;
  onOpenTravellerDetails: () => void;
}) {
  if (!tasks.length) return null;
  return <section className={styles.taskSection} aria-labelledby={`${id}-title`}>
    <header><Icon aria-hidden="true" /><h2 id={`${id}-title`}>{title}</h2></header>
    <div className={styles.taskList}>
      {tasks.map((task) => <TripPreparationTaskRow key={task.id} task={task} tripId={tripId} onOpenTravellerDetails={onOpenTravellerDetails} />)}
    </div>
  </section>;
}

export function TripTravellerDetailsEditor({
  ownerId,
  profile,
  onClose,
  onSave,
}: {
  ownerId?: string | null;
  profile: TravelReadinessProfile;
  onClose: () => void;
  onSave: (profile: TravelReadinessProfile) => void;
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
      <div><p>Traveller details</p><h3 id="overview-traveller-details-title">Personalise entry and passport checks</h3><span>Only nationality, residence and passport expiry month are stored on this device. Never enter passport numbers or upload documents.</span></div>
      <ShieldCheck aria-hidden="true" />
    </header>
    <div className={styles.travellerFields}>
      <EasyTField label="Nationality / nationalities" value={draft.nationalities.join(", ")} onChange={(event) => setDraft((current) => ({ ...current, nationalities: event.target.value.split(",").map((country) => country.trim()).filter(Boolean).slice(0, 4) }))} placeholder="For example, United Kingdom" />
      <EasyTField label="Country of residence" value={draft.residenceCountry} onChange={(event) => setDraft((current) => ({ ...current, residenceCountry: event.target.value }))} placeholder="For example, United Kingdom" />
      <EasyTField label="Passport expiry month" type="month" value={draft.passportExpiryMonth} onChange={(event) => setDraft((current) => ({ ...current, passportExpiryMonth: event.target.value }))} />
    </div>
    <div className={styles.travellerActions}>
      <EasyTButton size="small" onClick={save}>Save on this device</EasyTButton>
      <EasyTButton size="small" variant="quiet" onClick={onClose}>Close</EasyTButton>
      {saveState === "saved" ? <span role="status">Traveller details saved.</span> : saveState === "error" ? <span role="alert">Morrovia couldn’t save these details in this browser. Nothing changed.</span> : null}
    </div>
  </section>;
}
