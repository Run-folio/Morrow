import type { ReactNode } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { deriveTripDateFacts } from "@/lib/easyt/trip-facts";
import { routeImageCredit } from "@/lib/easyt/route-images";
import { overviewStopImage, type OverviewPlaceImage } from "@/lib/easyt/trip-overview-imagery";
import { TripShellCanonicalMutationProvider, TripShellChrome, TripShellIdentityAndActions, TripShellImage, TripShellNavigation, TripShellTripProvider } from "./trip-shell-client";
import { ContextualFeedbackProvider } from "./contextual-feedback-controller";
import { WorkspaceOrientationProvider } from "./workspace-orientation";
import styles from "./trip-shell.module.css";

export function formatTripShellDates(startDate: string, endDate: string) {
  return deriveTripDateFacts({ startDate, endDate }).rangeLabel;
}

export function tripShellDuration(startDate: string, endDate: string) {
  return deriveTripDateFacts({ startDate, endDate }).durationDays;
}

export default function TripShell({ trip, children, deviceOnlyNotice, cacheTrip = true, orientationAutoStart = true, workspaceGuideVersionSeen = 0 }: { trip: EasyTTrip; children: ReactNode; deviceOnlyNotice?: ReactNode; cacheTrip?: boolean; orientationAutoStart?: boolean; workspaceGuideVersionSeen?: number }) {
  const routeLabel = [trip.brief.origin, ...trip.stops.map((stop) => stop.name)].filter(Boolean).join(" → ") || "Route to confirm";
  const imagedDay = trip.planItems.find((item) => Boolean(item.image));
  const image = imagedDay?.image ?? null;
  const reviewed = image ? routeImageCredit(image) : null;
  const shellPhoto: OverviewPlaceImage | null = reviewed ?? (image && imagedDay?.sourceUrl ? {
    src: image,
    alt: imagedDay.title,
    sourceUrl: imagedDay.sourceUrl,
    sourceLabel: "Photo source",
  } : null);
  const sharedPhoto = shellPhoto ?? trip.stops.map((stop) => overviewStopImage(trip, stop))
    .find((photo) => photo?.sourceUrl && routeImageCredit(photo.src)) ?? null;

  return (
    <div className={styles.workspace}>
      <WorkspaceOrientationProvider ownerId={trip.ownerId} accountVersionSeen={workspaceGuideVersionSeen} autoStart={orientationAutoStart}>
        <TripShellCanonicalMutationProvider trip={trip}>
          <ContextualFeedbackProvider>
          <TripShellChrome tripId={trip.id}><section className={styles.shell} aria-labelledby="trip-shell-title">
          <header className={styles.tripHeader}>
            <TripShellImage
              key={image ?? "trip-image-fallback"}
              src={image}
              mobilePhoto={sharedPhoto}
              alt={`View from ${routeLabel}`}
              routeLabel={routeLabel}
              stopCount={trip.stops.length}
            />

            <TripShellIdentityAndActions mobilePhoto={sharedPhoto} />
          </header>

          {deviceOnlyNotice ? <div className={styles.deviceOnlyNotice}>{deviceOnlyNotice}</div> : null}
          <TripShellNavigation tripId={trip.id} />
          </section></TripShellChrome>

          <TripShellTripProvider trip={trip} cacheTrip={cacheTrip}>
            <div className={styles.content}>{children}</div>
          </TripShellTripProvider>
          </ContextualFeedbackProvider>
        </TripShellCanonicalMutationProvider>
      </WorkspaceOrientationProvider>
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
