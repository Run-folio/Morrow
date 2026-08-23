"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, House, Luggage, Map } from "lucide-react";
import { createContext, useContext, useState, type ReactNode } from "react";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./trip-shell.module.css";

const TripShellTripContext = createContext<EasyTTrip | null>(null);

export function TripShellTripProvider({ trip, children }: { trip: EasyTTrip; children: ReactNode }) {
  return <TripShellTripContext.Provider value={trip}>{children}</TripShellTripContext.Provider>;
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
