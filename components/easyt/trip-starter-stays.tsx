"use client";

import { BedDouble, Check, Plus } from "lucide-react";
import { JourneyLocalFinder, type JourneyLocalFinderRenderState } from "@/components/journey-local-finder";
import { stayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import { hasBookingLiveInformation, type JourneyLocalFinderInitialState } from "@/lib/easyt/local-place";
import { shortlistStay, shortlistedStays, stayShortlistDestinationKey } from "@/lib/easyt/trip-starter";
import type { EasyTTrip, TripStop } from "@/lib/easyt/trip";
import { EasyTButton } from "./easyt-controls";
import { useTripShellMutation } from "./trip-shell-client";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { JourneyLocalPlacePhotoMedia, useJourneyLocalPlacePhotos } from "./journey-local-place-photo";
import { MorroviaPlaceDataCredit } from "./morrovia-place-data-credit";
import layout from "./trip-starter.module.css";

function StayOptions({finder, trip, stop}: {finder: JourneyLocalFinderRenderState;trip:EasyTTrip;stop:TripStop}) {
 const mutation=useTripShellMutation();
 const photos=useJourneyLocalPlacePhotos(finder.candidates,{allowGooglePlaceLookup:false});
 const saved=shortlistedStays(trip);
 return <div className={layout.stayGroup}>
   {finder.status === "loading" ? <MorroviaSectionStatus title="Finding stays" /> : null}
   {finder.status === "failed" ? <MorroviaSectionStatus state="error" title="Stays unavailable" onRetry={finder.retry} /> : null}
   {finder.status === "empty" ? <MorroviaSectionStatus title="No stays found" onRetry={finder.retry} /> : null}
   <div className={layout.stayList}>{finder.candidates.slice(0,3).map(place => {
     const selected=saved.some(item=>item.stopId===stop.id && item.placeId===place.id);
     return <article key={place.id} data-shortlisted={selected}>
       <div className={layout.stayImage}><JourneyLocalPlacePhotoMedia place={place} photo={photos[place.id]} fallback={<span className={layout.stayImageFallback}><BedDouble aria-hidden="true" /></span>} /></div>
       <div className={layout.stayCopy}><strong>{place.name}</strong><div className={layout.stayMeta}>{place.address}</div><div className={layout.stayMeta}>{hasBookingLiveInformation(place) && place.availability === "available" ? "Current availability found" : "Availability to check"}</div></div>
       <div className={layout.stayActions}><EasyTButton size="small" icon={selected ? Check : Plus} variant={selected ? "primary" : "secondary"} disabled={selected || !mutation.mutationReady || mutation.hasPendingSaves()} onClick={() => {void mutation.mutateTrip(current=>shortlistStay(current,stop.id,place,stayShortlistDestinationKey(stop)),`shortlist-${stop.id}-${place.id}`);}}>{selected ? "Shortlisted" : "Shortlist"}</EasyTButton></div>
     </article>;
   })}</div>
   {finder.candidates.some(place=>place.provider === "openstreetmap") ? <MorroviaPlaceDataCredit sources={["openstreetmap"]}/> : null}
 </div>;
}

export default function TripStarterStays({trip,stop,initialState}:{trip:EasyTTrip;stop:TripStop;initialState?:JourneyLocalFinderInitialState}) {
 const context=stayWorkspaceContext(trip,stop.id);
 if (!context?.searchCoordinates) return <MorroviaSectionStatus title="Stay location unavailable" />;
 return <JourneyLocalFinder mapPresentation="maplibre" key={context.key} ownerId={trip.ownerId} tripId={trip.id} stopId={stop.id} canonicalPlaceId={stop.canonicalPlaceId} kind="stay" city={stop.name} country={stop.country} dayId={context.key} coordinates={context.searchCoordinates} candidateLimit={3} autoSelectFirst={false} analyticsSurface="stay" initialState={initialState} render={finder=><StayOptions finder={finder} trip={trip} stop={stop}/>} />;
}
