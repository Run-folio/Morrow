"use client";

import { BedDouble, Check, Map as MapIcon, MapPin, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { JourneyLocalFinder, type JourneyLocalFinderInitialState, type JourneyLocalFinderRenderState, type JourneyLocalPlace } from "@/components/journey-local-finder";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { JourneyRouteStopTrack, type JourneyPlannerStripStop } from "@/components/journey-planner-strip";
import { getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { removeMappedStayForStop, selectMappedStayForStop, stayBookingForStop } from "@/lib/easyt/accommodation";
import { hasBookingLiveInformation } from "@/lib/easyt/local-place";
import { mapResultForLocalPlace, mapResultHandoffForLocalPlace, mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import { recommendationDetailForStayResult } from "@/lib/easyt/recommendation-detail";
import { routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import { stayCandidateFit, stayIsSelected, stayWorkspaceContext, type StayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { mapWorkspaceHref, stayWorkspaceHref, tripBuilderHref } from "@/lib/easyt/trip-workspace-links";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";
import { JourneyLocalPlacePhotoAttribution, JourneyLocalPlacePhotoMedia, useJourneyLocalPlacePhotos } from "./journey-local-place-photo";
import { MorroviaBriefNotice, MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus, MorroviaSkeleton } from "./morrovia-loading-states";
import { useTripShellMutation } from "./trip-shell-client";
import styles from "./trip-stay-workspace.module.css";

export type TripStayWorkspaceProps = {
  trip: EasyTTrip;
  initialStopId?: string | null;
  initialSelectedPlaceId?: string | null;
  initialFinderState?: JourneyLocalFinderInitialState;
};

function formattedPrice(place: JourneyLocalPlace) {
  if (!hasBookingLiveInformation(place) || place.availability !== "available" || !place.price) return null;
  try {
    return new Intl.NumberFormat("en", { style: "currency", currency: place.price.currency, maximumFractionDigits: 0 }).format(place.price.total);
  } catch {
    return `${place.price.total} ${place.price.currency}`;
  }
}

function StayFinderSurface({
  finder,
  workingTrip,
  context,
  navigationStops,
  notice,
  setNotice,
  setSelectedPlaceId,
  onSelectStop,
}: {
  finder: JourneyLocalFinderRenderState;
  workingTrip: EasyTTrip;
  context: StayWorkspaceContext;
  navigationStops: JourneyPlannerStripStop[];
  notice: string | null;
  setNotice: (value: string | null) => void;
  setSelectedPlaceId: (value: string | null) => void;
  onSelectStop: (stopId: string) => void;
}) {
  const mutation = useTripShellMutation();
  const photos = useJourneyLocalPlacePhotos(finder.candidates);
  const booking = stayBookingForStop(workingTrip, context.stop);
  const partnerAction = getCurrentPartnerAction("accommodation");
  const mapDayNumber = workingTrip.planItems.find((day) => day.stopId === context.stop.id)?.dayNumber ?? null;
  const selectedBase = finder.selectedPlace;
  const selectedPhoto = selectedBase ? photos[selectedBase.id] : undefined;
  const selected = selectedBase && selectedPhoto ? { ...selectedBase, image: selectedPhoto.src } : selectedBase;
  const detail = selected ? recommendationDetailForStayResult({ trip: workingTrip, place: selected, stayContext: context, surface: "stay" }) : null;
  const selectedSaved = selected ? stayIsSelected(workingTrip, context, selected) : false;
  const mapResults = useMemo(() => finder.candidates.map((place) => mapResultForLocalPlace(place, "stay", {
    stopId: context.stop.id,
    dayNumber: mapDayNumber,
  })), [context.stop.id, finder.candidates, mapDayNumber]);
  const selectedMapResult = selected ? mapResults.find((result) => result.sourceId === selected.id) ?? null : null;
  const detailRef = useRef<HTMLDivElement>(null);

  const selectPlace = (place: JourneyLocalPlace) => {
    setSelectedPlaceId(place.id);
    finder.selectPlace(place);
    if (window.matchMedia("(max-width: 900px)").matches) {
      window.requestAnimationFrame(() => detailRef.current?.scrollIntoView({ block: "start" }));
    }
  };

  const chooseStay = (place: JourneyLocalPlace) => {
    const changed = mutation.mutateTrip(
      (current) => selectMappedStayForStop(current, context.stop.id, place),
      `stay-select-${context.stop.id}-${place.id}`,
    );
    if (changed) setNotice(`${place.name} chosen for ${context.stop.name}.`);
  };

  const removeStay = () => {
    if (!selected) return;
    const changed = mutation.mutateTrip(
      (current) => removeMappedStayForStop(current, context.stop.id, selected),
      `stay-remove-${context.stop.id}-${selected.id}`,
    );
    if (!changed) return;
    setNotice(`${selected.name} removed. ${context.stop.name} needs a stay again.`);
  };

  const fullMapHref = (place: JourneyLocalPlace | null) => {
    const selectionId = place ? mapResultSelectionId("stay", place.id, context.stop.id) : undefined;
    return mapWorkspaceHref(
      workingTrip.id,
      context.stop.id,
      "stay",
      mapDayNumber,
      selectionId,
      place && selectionId ? mapResultHandoffForLocalPlace(place, "stay", context.stop.id, mapDayNumber, selectionId) : null,
    );
  };

  const showRail = finder.candidates.length > 0 || Boolean(detail);
  const inventoryLoading = finder.accommodationInventoryStatus === "loading" && finder.candidates.length > 0;

  return <div className={`${styles.layout} ${showRail ? "" : styles.layoutNoRail}`}>
    {notice || mutation.error ? <div className={styles.feedbackRow}>
      {notice ? <MorroviaBriefNotice title={notice} onDismiss={() => setNotice(null)} action={<EasyTButton size="small" variant="quiet" onClick={() => setNotice(null)}>Dismiss</EasyTButton>} /> : null}
      {mutation.error ? <MorroviaStatusBanner tone="warning" title="This change is safe on this device" detail={mutation.error} /> : null}
    </div> : null}

    <div className={styles.stopNavigation}>
      <JourneyRouteStopTrack stops={navigationStops} ariaLabel="Choose an overnight trip stop" presentation="integrated" surface="standalone" onSelectStop={onSelectStop} />
    </div>

    <div className={styles.main}>
      <header className={styles.intro}>
        <h2>Where to stay in {context.stop.name}</h2>
      </header>

      {booking && !finder.candidates.some((place) => stayIsSelected(workingTrip, context, place)) ? <MorroviaStatusBanner
        tone="success"
        title={`Saved stay: ${booking.title}`}
        detail="Not in the current shortlist."
        actions={<EasyTLinkButton size="small" variant="secondary" href={`/journey/${encodeURIComponent(workingTrip.id)}/itinerary`}>Manage in itinerary</EasyTLinkButton>}
      /> : null}

      <section className={styles.options} aria-labelledby="stay-options-title">
        <h3 className="sr-only" id="stay-options-title">Stay options for {context.stop.name}</h3>
        {inventoryLoading ? <p className={styles.inventoryNote} role="status">Checking current room availability.</p> : null}
        {finder.status === "loading" ? <div className={styles.loading}><MorroviaSectionStatus title="Finding stays for this stop" detail={`Keeping ${context.stop.name}, ${context.nights} nights and ${context.dateLabel} in place.`} /><div aria-hidden="true"><MorroviaSkeleton height={240} radius="card" /><MorroviaSkeleton height={240} radius="card" /></div></div> : null}
        {finder.status === "failed" ? <MorroviaSectionStatus state="error" title="Stay options are unavailable" detail="No mapped or live options could be loaded. Your trip and selected stop are unchanged." retryLabel="Try stay search again" onRetry={finder.retry} /> : null}
        {finder.status === "empty" ? <MorroviaStatusBanner title="No stay options found" detail="No valid accommodation came back for this stop. Try again later or check the booking provider directly." /> : null}
        {finder.candidates.length ? <div className={styles.grid}>{finder.candidates.map((place) => {
          const isSelected = place.id === selectedBase?.id;
          const isChosen = stayIsSelected(workingTrip, context, place);
          const price = formattedPrice(place);
          const hasBookingFacts = hasBookingLiveInformation(place);
          const chooseKey = `stay-select-${context.stop.id}-${place.id}`;
          return <article key={place.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`} aria-current={isSelected ? "true" : undefined}>
            <div className={`${styles.cardMedia} ${place.image || photos[place.id] ? "" : styles.cardMediaFallback}`}>
              <JourneyLocalPlacePhotoMedia place={place} photo={photos[place.id]} fallback={<><BedDouble aria-hidden="true" /><span>No sourced property image</span></>} />
              {isChosen ? <span className={styles.chosenBadge}><Check aria-hidden="true" />Chosen</span> : null}
            </div>
            <div className={styles.cardBody}>
              <div className={styles.cardCopy}>
                <h4>{place.name}</h4>
                <p><MapPin aria-hidden="true" />{place.address}</p>
                <div className={styles.cardFacts}>
                  {place.rating !== undefined ? <span><Star aria-hidden="true" />{place.rating.toFixed(1)}{place.reviewCount !== undefined ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}</span> : null}
                  {!hasBookingFacts ? <span>Availability to check</span> : null}
                </div>
                {hasBookingFacts ? <div className={`${styles.cardFacts} ${styles.bookingFacts}`}><small>BOOKING.COM LIVE INFO</small>{price ? <strong>{price} for your dates</strong> : null}<span>{place.availability === "available" ? "Current availability found" : "No current availability confirmed"}</span></div> : null}
                <p className={styles.fit}>{stayCandidateFit(place, context)}</p>
              </div>
            </div>
            <EasyTButton type="button" className={styles.cardOpen} variant="quiet" aria-label={`Open details for ${place.name}`} aria-pressed={isSelected} onClick={() => selectPlace(place)}>Open details for {place.name}</EasyTButton>
            <div className={styles.cardActions}>
              <EasyTButton fullWidth loading={mutation.isPending(chooseKey)} disabled={isChosen} aria-pressed={isChosen} variant={isChosen ? "secondary" : "primary"} onClick={() => chooseStay(place)}>{isChosen ? "Chosen" : "Choose stay"}</EasyTButton>
            </div>
          </article>;
        })}</div> : null}
      </section>
    </div>

    {showRail ? <aside className={styles.rail} aria-label="Stay map and decision support">
      {finder.candidates.length ? <section className={styles.mapPanel} aria-labelledby="stay-map-title">
        <h3 id="stay-map-title">Stay map</h3>
        <div className={styles.mapPreview}>
          <JourneyPlannerMap stops={[]} legs={[]} selectedId="" plannerPins={[]} mapResults={mapResults} selectedMapResult={selectedMapResult} focusCoordinates={context.searchCoordinates} focusZoom={13} draftPinCoordinates={null} pinPlacementMode={false} surface={{ variant: "embedded", interaction: "selection-only" }} previewLabel={`Stay options in ${context.stop.name}`} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onMapResultSelect={(result) => {
            const place = finder.candidates.find((candidate) => candidate.id === result.sourceId);
            if (place) selectPlace(place);
          }} onSelect={() => undefined} />
        </div>
        <EasyTLinkButton href={fullMapHref(selected)} icon={MapIcon} variant="quiet" fullWidth>Open full map</EasyTLinkButton>
      </section> : null}

      {detail && selected ? <div ref={detailRef} className={styles.detail}>
        <ItineraryItemDetail
          detail={detail}
          embedded
          pending={mutation.saveState === "saving"}
          onClose={() => { finder.clearSelection(); setSelectedPlaceId(null); }}
          mapHref={fullMapHref(selected)}
          primaryActions={<>
            {!selectedSaved ? <EasyTButton fullWidth loading={mutation.saveState === "saving"} onClick={() => chooseStay(selected)}>Choose stay</EasyTButton> : <span className={styles.selectedStatus}><Check aria-hidden="true" />Chosen for this stop</span>}
            {partnerAction ? <div className={styles.partnerHandoff}><strong>Check independently on Trip.com</strong>{hasBookingLiveInformation(selected) ? <p>Trip.com prices, availability and terms may differ from the Booking.com live information above.</p> : <p>Trip.com will confirm its own current prices, availability and terms.</p>}<MorroviaAffiliateLink action={{ ...partnerAction, cta: "Check Trip.com availability" }} context={{ placement: "stay_workspace_detail", tripId: workingTrip.id, stopId: context.stop.id, workspaceView: "stay", destinationCount: 1 }} variant="secondary" /><small className={styles.disclosure}>{affiliateDisclosure}</small></div> : null}
          </>}
          onRemove={selectedSaved ? removeStay : undefined}
        />
        <JourneyLocalPlacePhotoAttribution photo={selectedPhoto} className={styles.detailPhotoCredit} />
      </div> : null}
    </aside> : null}
  </div>;
}

export default function TripStayWorkspace({ trip, initialStopId, initialSelectedPlaceId, initialFinderState }: TripStayWorkspaceProps) {
  const router = useRouter();
  const mutation = useTripShellMutation();
  const workingTrip = mutation.trip.id === trip.id ? mutation.trip : trip;
  const overnightStops = useMemo(() => [...workingTrip.stops].filter((stop) => (stop.nights ?? 0) > 0).sort((left, right) => left.order - right.order), [workingTrip.stops]);
  const requestedStop = overnightStops.some((stop) => stop.id === initialStopId) ? initialStopId! : overnightStops[0]?.id ?? null;
  const [selectedStopId, setSelectedStopId] = useState<string | null>(requestedStop);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialSelectedPlaceId ?? null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (selectedStopId && overnightStops.some((stop) => stop.id === selectedStopId)) return;
    setSelectedStopId(overnightStops[0]?.id ?? null);
    setSelectedPlaceId(null);
  }, [overnightStops, selectedStopId]);

  const context = selectedStopId ? stayWorkspaceContext(workingTrip, selectedStopId) : null;
  const navigationStops = useMemo(() => selectedStopId ? routeTimelineStopsForTrip(workingTrip, { scopeId: selectedStopId }).filter((item) => item.kind === "stop" && overnightStops.some((stop) => stop.id === item.id)) : [], [overnightStops, selectedStopId, workingTrip]);

  if (!context || !context.searchCoordinates) {
    return <section className={styles.workspace} aria-label="Stay planning"><MorroviaStatusBanner title={overnightStops.length ? "This stop needs a mapped location" : "No overnight stays to plan"} detail={overnightStops.length ? "Add a trustworthy destination location before searching for accommodation." : "Add an overnight destination to the route before choosing accommodation."} actions={overnightStops.length ? <EasyTLinkButton size="small" variant="secondary" href={tripBuilderHref(workingTrip.id, workingTrip.ownerId)}>Adjust route</EasyTLinkButton> : undefined} /></section>;
  }

  return <section className={styles.workspace} aria-label={`Stay planning for ${context.stop.name}`}>
    <JourneyLocalFinder
      key={context.key}
      ownerId={workingTrip.ownerId}
      tripId={workingTrip.id}
      stopId={context.stop.id}
      canonicalPlaceId={context.stop.canonicalPlaceId}
      kind="stay"
      city={context.stop.name}
      country={context.stop.country}
      dayId={context.key}
      dayNumber={workingTrip.planItems.find((day) => day.stopId === context.stop.id)?.dayNumber}
      coordinates={context.searchCoordinates}
      staySearch={context.checkIn && context.checkOut ? { checkIn: context.checkIn, checkOut: context.checkOut, adults: Math.max(1, workingTrip.travellers), rooms: 1, currency: workingTrip.currency } : undefined}
      selectedPlaceId={selectedPlaceId}
      savedPlaceIds={[]}
      initialState={initialFinderState}
      candidateLimit={6}
      autoSelectFirst={false}
      analyticsSurface="stay"
      render={(finder) => <StayFinderSurface finder={finder} workingTrip={workingTrip} context={context} navigationStops={navigationStops} notice={notice} setNotice={setNotice} setSelectedPlaceId={setSelectedPlaceId} onSelectStop={(stopId) => {
        setSelectedStopId(stopId);
        setSelectedPlaceId(null);
        router.replace(stayWorkspaceHref(workingTrip.id, stopId), { scroll: false });
      }} />}
    />
  </section>;
}
