"use client";

import { shortlistedStays, removeShortlistedStay } from "@/lib/easyt/trip-starter";
import { stayWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import { useTripShellMutation } from "./trip-shell-client";
import { mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import layout from "./trip-starter.module.css";
import heading from "./trip-workspace-heading.module.css";
import styles from "./trip-stay-workspace.module.css";

export default function TripStayShortlist({ trip }: { trip: EasyTTrip }) {
  const mutation = useTripShellMutation();
  const entries = shortlistedStays(trip);
  if (!entries.length) return null;
  return <section id="stay-shortlist" className={`${styles.googleReferences} ${layout.shortlist}`} aria-label="Stay shortlist">
    <h2 className={heading.sectionTitle}>Shortlist</h2>
    <span>Unbooked · availability to check</span>
    {[...trip.stops].sort((a,b) => a.order-b.order).map(stop => {
      const items = entries.filter(item => item.stopId === stop.id);
      if (!items.length) return null;
      return <section key={stop.id} aria-label={`Shortlist for ${stop.name}`}>
        <h3>{stop.name} · {stop.arrivalDate}</h3>
        {items.map(item => <div key={item.placeId} className={layout.shortlistRow}>
          <strong>{item.name}</strong>
          <EasyTLinkButton size="small" variant="quiet" href={stayWorkspaceHref(trip.id,stop.id,mapResultSelectionId("stay",item.placeId,stop.id))}>Review stay</EasyTLinkButton>
          <EasyTButton size="small" variant="quiet" aria-label={`Remove ${item.name} from shortlist for ${stop.name}`} disabled={!mutation.mutationReady || mutation.hasPendingSaves()} onClick={() => { void mutation.mutateTrip(current => removeShortlistedStay(current,stop.id,item.placeId),`shortlist-remove-${stop.id}-${item.placeId}`); }}>Remove</EasyTButton>
        </div>)}
      </section>;
    })}
  </section>;
}
