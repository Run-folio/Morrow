"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Luggage, Map } from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { trackEvent } from "@/lib/analytics";
import { EASYT_ACTIVE_TRIP_CHANGE_EVENT, saveActiveTrip } from "@/lib/easyt/storage";
import { isEasyTTrip, type EasyTTrip } from "@/lib/easyt/trip";
import { workspaceViewFromPathname, workspaceVisitKey } from "@/lib/easyt/trip-workspace-links";
import styles from "./trip-shell.module.css";

const TripShellTripContext = createContext<EasyTTrip | null>(null);

export function TripShellTripProvider({ trip, children, cacheTrip = true }: { trip: EasyTTrip; children: ReactNode; cacheTrip?: boolean }) {
  const pathname = usePathname();
  const [activeTrip, setActiveTrip] = useState(trip);
  const trackedWorkspaceVisitRef = useRef<string | null>(null);

  useEffect(() => {
    setActiveTrip(trip);
    // A server-resolved deep link is canonical for this owner. Refresh the
    // offline fallback with the same document instead of retaining stale data.
    if (cacheTrip) saveActiveTrip(trip);
  }, [cacheTrip, trip]);
  useEffect(() => {
    const onActiveTripChange = (event: Event) => {
      const next = (event as CustomEvent<unknown>).detail;
      if (isEasyTTrip(next) && next.id === trip.id) setActiveTrip(next);
    };
    window.addEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
    return () => window.removeEventListener(EASYT_ACTIVE_TRIP_CHANGE_EVENT, onActiveTripChange);
  }, [trip.id]);

  useEffect(() => {
    const visitKey = workspaceVisitKey(pathname);
    if (trackedWorkspaceVisitRef.current === visitKey) return;
    trackedWorkspaceVisitRef.current = visitKey;
    const view = workspaceViewFromPathname(pathname, trip.id);
    const common = { trip_id: trip.id, route_mode: "shell" as const, stop_count: trip.stops.length };
    if (view === "itinerary") {
      trackEvent("trip_itinerary_viewed", { ...common, workspace_view: "itinerary" });
    } else if (view === "map") {
      trackEvent("trip_map_viewed", { ...common, workspace_view: "map" });
    } else if (view === "prep") {
      trackEvent("trip_prep_viewed", { ...common, workspace_view: "prep" });
    } else {
      trackEvent("trip_overview_viewed", { ...common, workspace_view: "overview" });
    }
  }, [pathname, trip.id, trip.stops.length]);

  return <TripShellTripContext.Provider value={activeTrip}>{children}</TripShellTripContext.Provider>;
}

export function useTripShellTrip() {
  const trip = useContext(TripShellTripContext);
  if (!trip) throw new Error("useTripShellTrip must be used inside TripShell");
  return trip;
}

const views = [
  { id: "overview", label: "Overview", icon: House, suffix: "" },
  { id: "itinerary", label: "Itinerary", icon: CalendarDays, suffix: "/itinerary" },
  { id: "map", label: "Map", icon: Map, suffix: "/map" },
  { id: "prep", label: "Prep", icon: Luggage, suffix: "/prep" },
] as const;

export function TripShellNavigation({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const baseHref = `/journey/${encodeURIComponent(tripId)}`;
  const decodedPathname = decodeURIComponent(pathname);
  const decodedBase = `/journey/${tripId}`;
  const remainder = decodedPathname.slice(decodedBase.length);
  const activeView = remainder.startsWith("/itinerary")
    ? "itinerary"
    : remainder.startsWith("/map")
      ? "map"
      : remainder.startsWith("/prep")
        ? "prep"
        : "overview";

  return (
    <nav className={styles.subnav} aria-label="Trip workspace">
      {views.map((view) => {
        const Icon = view.icon;
        const active = activeView === view.id;
        return (
          <Link
            key={view.id}
            className={active ? styles.subnavActive : undefined}
            href={`${baseHref}${view.suffix}`}
            aria-current={active ? "page" : undefined}
          >
            <Icon aria-hidden="true" />
            <span>{view.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function TripShellImage({
  src,
  alt,
  routeLabel,
  stopCount,
}: {
  src: string | null;
  alt: string;
  routeLabel: string;
  stopCount: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <div className={styles.tripImage}>
      <div className={styles.tripImageFallback} aria-hidden={showImage || undefined}>
        <span>{stopCount || 1}</span>
        <small>{routeLabel}</small>
      </div>
      {showImage ? (
        <img src={src ?? ""} alt={alt} onError={() => setFailed(true)} />
      ) : null}
    </div>
  );
}
