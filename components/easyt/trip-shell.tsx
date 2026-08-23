import type { ReactNode } from "react";
import { CalendarDays, Clock3, Edit3, MapPin, Route } from "lucide-react";
import type { EasyTTrip, TripStatus } from "@/lib/easyt/trip";
import { tripDisplayTitle } from "@/lib/easyt/trip-display";
import { EasyTLinkButton } from "./easyt-controls";
import { TripShellImage, TripShellNavigation, TripShellTripProvider } from "./trip-shell-client";
import styles from "./trip-shell.module.css";

function parsedDate(value: string) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSingleDate(date: Date, includeYear = true) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: includeYear ? "numeric" : undefined,
  }).format(date);
}

export function formatTripShellDates(startDate: string, endDate: string) {
  const start = parsedDate(startDate);
  const end = parsedDate(endDate);
  if (start && end) {
    const sameYear = start.getFullYear() === end.getFullYear();
    return `${formatSingleDate(start, !sameYear)} – ${formatSingleDate(end)}`;
  }
  if (start) return `From ${formatSingleDate(start)}`;
  if (end) return `Until ${formatSingleDate(end)}`;
  return "Dates to confirm";
}

export function tripShellDuration(startDate: string, endDate: string) {
  const start = parsedDate(startDate);
  const end = parsedDate(endDate);
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
}

function statusLabel(status: TripStatus) {
  if (status === "planned") return "Planned";
  if (status === "archived") return "Archived";
  return "Planning";
}

export default function TripShell({ trip, children }: { trip: EasyTTrip; children: ReactNode }) {
  const routeLabel = trip.stops.map((stop) => stop.name).join(" → ") || "Route to confirm";
  const image = trip.planItems.find((item) => Boolean(item.image))?.image ?? null;
  const duration = tripShellDuration(trip.startDate, trip.endDate);
  const editHref = `/journey/new?trip=${encodeURIComponent(trip.id)}`;

  return (
    <div className={styles.workspace}>
      <section className={styles.shell} aria-labelledby="trip-shell-title">
        <header className={styles.tripHeader}>
          <TripShellImage
            key={image ?? "trip-image-fallback"}
            src={image}
            alt={`View from ${routeLabel}`}
            routeLabel={routeLabel}
            stopCount={trip.stops.length}
          />

          <div className={styles.tripIdentity}>
            <p className={styles.eyebrow}>{statusLabel(trip.status)}</p>
            <h1 id="trip-shell-title">{tripDisplayTitle(trip)}</h1>
            <p className={styles.routeSummary}>{routeLabel}</p>
            <dl className={styles.metadata}>
              <div>
                <dt><CalendarDays aria-hidden="true" /><span className={styles.srOnly}>Dates</span></dt>
                <dd>{formatTripShellDates(trip.startDate, trip.endDate)}</dd>
              </div>
              <div>
                <dt><Clock3 aria-hidden="true" /><span className={styles.srOnly}>Duration</span></dt>
                <dd>{duration ? `${duration} ${duration === 1 ? "day" : "days"}` : "Duration to confirm"}</dd>
              </div>
              <div>
                <dt><MapPin aria-hidden="true" /><span className={styles.srOnly}>Stops</span></dt>
                <dd>{trip.stops.length} {trip.stops.length === 1 ? "stop" : "stops"}</dd>
              </div>
              <div>
                <dt><Route aria-hidden="true" /><span className={styles.srOnly}>Transfers</span></dt>
                <dd>{trip.legs.length} {trip.legs.length === 1 ? "transfer" : "transfers"}</dd>
              </div>
            </dl>
          </div>

          <EasyTLinkButton
            className={styles.editAction}
            href={editHref}
            icon={Edit3}
            size="small"
            variant="secondary"
          >
            Edit trip brief
          </EasyTLinkButton>
        </header>

        <TripShellNavigation tripId={trip.id} />
      </section>

      <TripShellTripProvider trip={trip}>
        <div className={styles.content}>{children}</div>
      </TripShellTripProvider>
    </div>
  );
}

export function TripWorkspacePlaceholder({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <section className={styles.placeholder} aria-labelledby="workspace-placeholder-title">
      <p>Trip shell foundation · temporary</p>
      <h2 id="workspace-placeholder-title">{title} workspace</h2>
      <span>{description}</span>
    </section>
  );
}
