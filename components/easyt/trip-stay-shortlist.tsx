"use client";

import { BedDouble } from "lucide-react";
import { shortlistedStays, removeShortlistedStay } from "@/lib/easyt/trip-starter";
import { stayWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import type { EasyTTrip } from "@/lib/easyt/trip";
import type { JourneyLocalPlace } from "@/lib/easyt/local-place";
import { recommendationDetailForStayResult } from "@/lib/easyt/recommendation-detail";
import { stayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { useTripShellMutation } from "./trip-shell-client";
import { mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import { JourneyLocalPlacePhotoMedia } from "./journey-local-place-photo";
import heading from "./trip-workspace-heading.module.css";
import styles from "./trip-stay-shortlist.module.css";

export default function TripStayShortlist({ trip, stopId, places = [], onReview }: {
  trip: EasyTTrip;
  stopId?: string;
  places?: JourneyLocalPlace[];
  onReview?: (place: JourneyLocalPlace) => void;
}) {
  const mutation = useTripShellMutation();
  const entries = shortlistedStays(trip).filter(item => !stopId || item.stopId === stopId);
  if (!entries.length) return null;
  return <section id="stay-shortlist" className={styles.shortlist} aria-label="Stay shortlist">
    <h2 className={heading.sectionTitle}><BedDouble aria-hidden="true" />Shortlist</h2>
    {[...trip.stops].sort((a,b) => a.order-b.order).map(stop => {
      const items = entries.filter(item => item.stopId === stop.id);
      if (!items.length) return null;
      const context = stayWorkspaceContext(trip, stop.id);
      return <section key={stop.id} className={styles.stop} aria-label={`Shortlist for ${stop.name}`}>
        {!stopId ? <h3>{stop.name} · {stop.arrivalDate}</h3> : null}
        {items.map(item => {
          const place = places.find(place => place.id === item.placeId);
          const status = place && context ? recommendationDetailForStayResult({ trip, place, stayContext: context, surface: "stay" }).bookingStatus : "Shortlisted · availability to check";
          const fallback = <span className={styles.photoFallback}><BedDouble aria-hidden="true" /><span>Photos unavailable</span></span>;
          return <article key={item.placeId} className={styles.row}>
            <div className={styles.photo}>{place ? <JourneyLocalPlacePhotoMedia place={place} fallback={fallback} /> : fallback}</div>
            <div className={styles.copy}>
              <h3>{item.name}</h3>
              <p>{place?.category ?? "Stay"} · {stop.name}</p>
              <span className={styles.status}>{status}</span>
              <div className={styles.actions}>
                {place && onReview ? <EasyTButton size="small" aria-label={`Review ${item.name} for ${stop.name}`} onClick={() => onReview(place)}>Review stay</EasyTButton> : <EasyTLinkButton size="small" href={`${stayWorkspaceHref(trip.id,stop.id,mapResultSelectionId("stay",item.placeId,stop.id))}#stay-handoff`}>Review stay</EasyTLinkButton>}
                <EasyTButton size="small" variant="quiet" aria-label={`Remove ${item.name} from shortlist for ${stop.name}`} disabled={!mutation.mutationReady || mutation.hasPendingSaves()} onClick={() => { void mutation.mutateTrip(current => removeShortlistedStay(current,stop.id,item.placeId),`shortlist-remove-${stop.id}-${item.placeId}`); }}>Remove</EasyTButton>
              </div>
            </div>
          </article>;
        })}
      </section>;
    })}
  </section>;
}
