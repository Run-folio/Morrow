"use client";

import Link from "next/link";
import {
  ArrowRight,
  BedDouble,
  CalendarDays,
  CarFront,
  Check,
  ChevronRight,
  Circle,
  CircleAlert,
  ClipboardCheck,
  ExternalLink,
  FileCheck2,
  HeartPulse,
  Landmark,
  Luggage,
  Plane,
  ShieldCheck,
  Smartphone,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState } from "react";

import { JourneyBookingReadiness } from "@/components/journey-booking-readiness";
import { JourneyTripPrepAccommodation } from "@/components/journey-trip-prep-accommodation";
import { JourneyTripQuality } from "@/components/journey-trip-quality";
import { JourneyTripReadiness } from "@/components/journey-trip-readiness";
import { trackEvent } from "@/lib/analytics";
import type { BookingReadinessAction } from "@/lib/easyt/booking-readiness";
import {
  deriveTripPrepTasks,
  nextTripPrepTask,
  tripDepartureCountdown,
  tripPrepProgress,
  type TripPrepTask,
  type TripPrepTaskStatus,
} from "@/lib/easyt/trip-prep";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { tripIntentForTrip } from "@/lib/easyt/trip";
import { formatIsoDate, parseIsoDate } from "@/lib/easyt/trip-lifecycle";
import {
  defaultTravelReadinessProfile,
  type ReadinessCard,
  type TravelReadinessProfile,
} from "@/lib/easyt/travel-readiness";
import styles from "./trip-prep-workspace.module.css";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";

type Props = {
  trip: EasyTTrip;
  language?: "en" | "es";
  presentation?: "legacy" | "shell";
  initialActions?: BookingReadinessAction[];
  initialReadinessCards?: ReadinessCard[];
  initialProfile?: TravelReadinessProfile;
  initialProviderStatus?: ProviderStatus;
  now?: string;
};

type ProviderStatus = "loading" | "available" | "unavailable";

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

/** Concise card copy; canonical task guidance remains unchanged in detailed Prep. */
function taskSummary(task: TripPrepTask) {
  if (task.kind === "dates" || task.kind === "passport") return task.detail;
  if (task.kind === "insurance") return "Compare medical, cancellation and activity exclusions before travel.";
  if (task.kind === "flight") return "Check the route and dates with the flight provider.";
  if (task.kind === "connectivity") return "Compare data coverage before purchasing.";
  if (task.kind === "activity") return "Confirm dates and opening days before booking.";
  return task.detail;
}

function tripMentions(trip: EasyTTrip) {
  return trip.brief.capturedIntent?.mentions ?? trip.stops.map((stop, order) => ({
    sourceText: stop.name,
    canonicalName: stop.name,
    role: "stop" as const,
    status: "resolved" as const,
    order,
  }));
}

function DetailedPrep({ trip, language, onProfileSaved }: { trip: EasyTTrip; language: "en" | "es"; onProfileSaved?: (profile: TravelReadinessProfile) => void }) {
  return <>
    <JourneyTripQuality
      ownerId={trip.ownerId}
      origin={trip.brief.origin}
      originCoordinates={trip.brief.originCoordinates}
      startDate={trip.startDate}
      endDate={trip.endDate}
      stops={trip.stops}
      mentions={tripMentions(trip)}
      language={language}
    />
    <JourneyTripPrepAccommodation trip={trip} />
    <JourneyBookingReadiness trip={trip} language={language} excludeCategories={["accommodation"]} />
    <JourneyTripReadiness ownerId={trip.ownerId} countries={trip.stops.map((stop) => stop.country)} startDate={trip.startDate} avoidDriving={tripIntentForTrip(trip).hardConstraints.avoidDriving} language={language} hideConnectivity onProfileSaved={onProfileSaved} />
  </>;
}

function TaskAction({ task, tripId, onOpenDetails, compact = false }: {
  task: TripPrepTask;
  tripId: string;
  onOpenDetails: () => void;
  compact?: boolean;
}) {
  const action = task.action;
  if (!action) return null;
  if (action.opensDetails) return <button className={compact ? styles.compactAction : styles.taskAction} type="button" onClick={onOpenDetails}>{action.label}<ArrowRight aria-hidden="true" /></button>;
  if (!action.href) return null;
  const onClick = () => {
    if (task.kind === "accommodation" && action.stopId) trackEvent("accommodation_map_opened", { trip_id: tripId, stop_id: action.stopId });
    if (action.provider === "omio") trackEvent("affiliate_link_clicked", {
      partner: "omio",
      placement: "booking_readiness_transport",
      tripId,
      transferId: action.transferId,
      originStopId: action.originStopId,
      destinationStopId: action.destinationStopId,
    });
    else if (action.provider === "viator") trackEvent("affiliate_link_clicked", {
      partner: "viator",
      placement: "trip_prep_booking_readiness",
      tripId,
      stopId: action.stopId,
    });
    else if (action.affiliate && action.bookingCategory && action.provider) trackEvent("affiliate_click", {
      category: action.affiliateCategory ?? action.bookingCategory,
      provider: action.provider,
      trip_id: tripId,
      stop_id: action.stopId,
      placement: "trip_prep_booking_readiness",
      workspace_view: "prep",
    });
  };
  if (action.external) return <a className={compact ? styles.compactAction : styles.taskAction} href={action.href} target="_blank" rel={action.affiliate ? "sponsored noopener noreferrer" : "noopener noreferrer"} aria-label={action.provider === "omio" ? `${action.label}, opens Omio in a new tab` : undefined} onClick={onClick}>{action.label}<ExternalLink aria-hidden="true" /></a>;
  return <Link className={compact ? styles.compactAction : styles.taskAction} href={action.href} onClick={onClick}>{action.label}<ArrowRight aria-hidden="true" /></Link>;
}

function TaskCard({ task, tripId, onOpenDetails, compact = false }: {
  task: TripPrepTask;
  tripId: string;
  onOpenDetails: () => void;
  compact?: boolean;
}) {
  const Icon = iconByKind[task.kind];
  const StatusIcon = task.status === "complete" ? Check : task.status === "urgent" ? CircleAlert : Circle;
  return <article className={`${styles.taskCard} ${compact ? styles.taskCardCompact : ""} ${styles[`status-${task.status}`]} ${styles[`kind-${task.kind}`] ?? ""}`}>
    <div className={styles.taskTop}>
      <span className={styles.taskIcon}><Icon aria-hidden="true" /></span>
      <StatusIcon className={styles.statusIcon} aria-hidden="true" />
    </div>
    <div className={styles.taskCopy}>
      <h3>{task.title}</h3>
      {!compact ? <p>{taskSummary(task)}</p> : null}
      <span className={styles.statusPill}>{statusLabel[task.status]}</span>
    </div>
    <TaskAction task={task} tripId={tripId} onOpenDetails={onOpenDetails} compact={compact} />
  </article>;
}

function TaskSection({ id, title, icon: Icon, tasks, tripId, onOpenDetails, compact = false }: {
  id: string;
  title: string;
  icon: LucideIcon;
  tasks: TripPrepTask[];
  tripId: string;
  onOpenDetails: () => void;
  compact?: boolean;
}) {
  if (!tasks.length) return null;
  return <section className={`${styles.taskSection} ${styles[id]}`} aria-labelledby={`${id}-title`}>
    <header><Icon aria-hidden="true" /><h2 id={`${id}-title`}>{title}</h2></header>
    <div className={compact ? styles.compactTaskGrid : styles.taskGrid}>
      {tasks.map((task) => <TaskCard key={task.id} task={task} tripId={tripId} onOpenDetails={onOpenDetails} compact={compact} />)}
    </div>
  </section>;
}

export default function TripPrepWorkspace({
  trip,
  language = "en",
  presentation = "shell",
  initialActions,
  initialReadinessCards,
  initialProfile,
  initialProviderStatus,
  now,
}: Props) {
  const avoidDriving = tripIntentForTrip(trip).hardConstraints.avoidDriving;
  const [profile, setProfile] = useState<TravelReadinessProfile>(initialProfile ?? defaultTravelReadinessProfile);
  const [actions, setActions] = useState<BookingReadinessAction[]>(initialActions ?? []);
  const [readinessCards, setReadinessCards] = useState<ReadinessCard[]>(initialReadinessCards ?? []);
  const [actionsStatus, setActionsStatus] = useState<ProviderStatus>(initialProviderStatus ?? (initialActions !== undefined ? "available" : "loading"));
  const [readinessStatus, setReadinessStatus] = useState<ProviderStatus>(initialProviderStatus ?? (initialReadinessCards !== undefined || !trip.stops.length ? "available" : "loading"));
  const [detailsOpen, setDetailsOpen] = useState(false);

  useEffect(() => {
    if (initialProfile) return;
    try {
      const stored = JSON.parse(window.localStorage.getItem(travelReadinessStorageKey(trip.ownerId)) ?? "null") as Partial<TravelReadinessProfile> | null;
      if (stored && Array.isArray(stored.nationalities)) setProfile({
        nationalities: stored.nationalities.filter((country): country is string => typeof country === "string"),
        residenceCountry: typeof stored.residenceCountry === "string" ? stored.residenceCountry : "",
        passportExpiryMonth: typeof stored.passportExpiryMonth === "string" ? stored.passportExpiryMonth : "",
      });
    } catch { /* Use the existing privacy-safe empty profile. */ }
  }, [initialProfile, trip.ownerId]);

  useEffect(() => {
    if (presentation === "legacy" || initialActions !== undefined || initialProviderStatus !== undefined) return;
    let active = true;
    setActions([]);
    setActionsStatus("loading");
    void fetch("/api/journey-booking-readiness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ trip }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Booking readiness unavailable");
      const payload = await response.json() as { actions?: BookingReadinessAction[] };
      if (!Array.isArray(payload.actions)) throw new Error("Booking readiness response was incomplete");
      return payload.actions;
    }).then((nextActions) => {
      if (!active) return;
      setActions(nextActions);
      setActionsStatus("available");
    }).catch(() => {
      if (!active) return;
      setActions([]);
      setActionsStatus("unavailable");
    });
    return () => { active = false; };
  }, [initialActions, initialProviderStatus, presentation, trip]);

  useEffect(() => {
    if (presentation === "legacy" || initialReadinessCards !== undefined || initialProviderStatus !== undefined) return;
    if (!trip.stops.length) {
      setReadinessCards([]);
      setReadinessStatus("available");
      return;
    }
    let active = true;
    setReadinessCards([]);
    setReadinessStatus("loading");
    void fetch("/api/journey-readiness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ countries: trip.stops.map((stop) => stop.country), startDate: trip.startDate, avoidDriving, profile, language }),
    }).then(async (response) => {
      if (!response.ok) throw new Error("Travel readiness unavailable");
      const payload = await response.json() as { cards?: ReadinessCard[] };
      if (!Array.isArray(payload.cards)) throw new Error("Travel readiness response was incomplete");
      return payload.cards;
    }).then((nextCards) => {
      if (!active) return;
      setReadinessCards(nextCards);
      setReadinessStatus("available");
    }).catch(() => {
      if (!active) return;
      setReadinessCards([]);
      setReadinessStatus("unavailable");
    });
    return () => { active = false; };
  }, [avoidDriving, initialProviderStatus, initialReadinessCards, language, presentation, profile, trip.startDate, trip.stops]);

  if (presentation === "legacy") return <DetailedPrep trip={trip} language={language} />;

  const effectiveNow = parseIsoDate(now) ?? new Date();
  const tasks = deriveTripPrepTasks({ trip, profile, bookingActions: actions, readinessCards, now: effectiveNow });
  const progress = tripPrepProgress(tasks);
  const nextTask = nextTripPrepTask(tasks);
  const countdown = tripDepartureCountdown(trip.startDate, trip.endDate, effectiveNow);
  const providersAvailable = actionsStatus === "available" && readinessStatus === "available";
  const providerUnavailable = actionsStatus === "unavailable" || readinessStatus === "unavailable";
  const providerMessage = providerUnavailable
    ? "Some provider-backed Prep checks are unavailable. Retry before treating this as final."
    : "Checking provider-backed Prep tasks…";
  const departureDate = formatIsoDate(trip.startDate, "en-GB", { weekday: "long", day: "numeric", month: "short", year: "numeric" });
  const remainingTasks = nextTask ? tasks.filter((task) => task.id !== nextTask.id) : tasks;
  const grouped = {
    must: remainingTasks.filter((task) => task.category === "must"),
    good: remainingTasks.filter((task) => task.category === "good"),
    nice: remainingTasks.filter((task) => task.category === "nice"),
  };
  const openDetails = () => {
    setDetailsOpen(true);
    window.requestAnimationFrame(() => document.getElementById("prep-details")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  return <section className={styles.workspace} aria-labelledby="trip-prep-title">
    <header className={styles.intro}>
      <h2 id="trip-prep-title">Trip prep</h2>
      <span>Complete key tasks to travel with confidence.</span>
    </header>

    <div className={styles.dashboard}>
      <section className={styles.progressCard} aria-labelledby="prep-progress-title">
        <div className={styles.progressCopy}>
          <p>OVERALL PROGRESS</p>
          <h3 id="prep-progress-title">{providersAvailable ? `${progress.percent}%` : "N/A"}</h3>
          <span>{providersAvailable ? `${progress.complete} of ${progress.total} tasks complete` : providerMessage}</span>
          <div
            className={styles.progressTrack}
            aria-label="Trip preparation progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={providersAvailable ? progress.percent : undefined}
            aria-valuetext={providersAvailable ? undefined : providerMessage}
          ><span style={{ width: providersAvailable ? `${progress.percent}%` : "0%" }} /></div>
        </div>
        <div className={styles.progressIllustration} aria-hidden="true"><img src="/journey/illustrations/prep-triptych.png" alt="" /></div>
        <dl className={styles.progressStats}>
          <div><dt><Check aria-hidden="true" />Complete</dt><dd>{providersAvailable ? progress.complete : "N/A"}</dd></div>
          <div><dt><Circle aria-hidden="true" />In progress</dt><dd>{providersAvailable ? progress.inProgress : "N/A"}</dd></div>
          <div><dt><Circle aria-hidden="true" />To do</dt><dd>{providersAvailable ? progress.toDo : "N/A"}</dd></div>
        </dl>
      </section>

      <aside className={styles.countdownCard}>
        <CalendarDays aria-hidden="true" />
        <p>TRIP TIMELINE</p>
        <strong>{countdown.label}</strong>
        {departureDate ? <span>{departureDate}</span> : null}
      </aside>

      <TaskSection id="must" title="Must do" icon={Sparkles} tasks={grouped.must} tripId={trip.id} onOpenDetails={openDetails} />

      <aside className={`${styles.nextCard} ${nextTask?.status === "urgent" ? styles.nextUrgent : ""}`}>
        <header><p>NEXT IMPORTANT TASK</p>{nextTask?.status === "urgent" ? <CircleAlert aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}</header>
        {nextTask ? <>
          <div><span className={styles.nextIcon}>{(() => { const Icon = iconByKind[nextTask.kind]; return <Icon aria-hidden="true" />; })()}</span><div><h3>{nextTask.title}</h3><p>{taskSummary(nextTask)}</p></div></div>
          <TaskAction task={nextTask} tripId={trip.id} onOpenDetails={openDetails} compact />
        </> : providersAvailable
          ? <div className={styles.readyMessage}><Check aria-hidden="true" /><div><h3>Prep tasks complete.</h3><p>Every currently tracked Prep task is complete.</p></div></div>
          : <div className={styles.readyMessage}><CircleAlert aria-hidden="true" /><div><h3>{providerUnavailable ? "Some Prep checks are unavailable." : "Prep checks are still loading."}</h3><p>{providerMessage}</p></div></div>}
      </aside>

      <TaskSection id="good" title="Good to do" icon={HeartPulse} tasks={grouped.good} tripId={trip.id} onOpenDetails={openDetails} compact />
      <TaskSection id="nice" title="Nice to have" icon={Sparkles} tasks={grouped.nice} tripId={trip.id} onOpenDetails={openDetails} compact />

      <details id="prep-details" className={styles.details} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
        <summary>
          <span className={styles.detailsTitle}><Luggage aria-hidden="true" /><span><small>PREP DETAILS</small><strong>Detailed preparation guidance</strong></span></span>
          <span className={styles.detailsMeta}>Plan checks, stays, booking actions and traveller guidance<ChevronRight aria-hidden="true" /></span>
        </summary>
        <div className={styles.detailsBody}><DetailedPrep trip={trip} language={language} onProfileSaved={setProfile} /></div>
      </details>
    </div>
  </section>;
}
