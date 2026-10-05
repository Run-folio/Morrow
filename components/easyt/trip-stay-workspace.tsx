"use client";

import { BedDouble, Check, MapPin, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { JourneyLocalFinder, type JourneyLocalFinderInitialState, type JourneyLocalFinderRenderState, type JourneyLocalPlace } from "@/components/journey-local-finder";
import { MorroviaMapPreview } from "./morrovia-map-preview";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { JourneyRouteStopTrack, type JourneyPlannerStripStop } from "@/components/journey-planner-strip";
import { affiliateProviderLabel, getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { removeMappedStayForStop, savedGoogleStayReferencesForStop, selectMappedStayForStop, stayBookingForStop } from "@/lib/easyt/accommodation";
import { hasBookingLiveInformation } from "@/lib/easyt/local-place";
import { mapResultForLocalPlace, mapResultHandoffForLocalPlace, mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import { recommendationDetailForStayResult } from "@/lib/easyt/recommendation-detail";
import { routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import { stayCandidateFit, stayIsSelected, stayWorkspaceContext, type StayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { mapWorkspaceHref, stayWorkspaceHref, tripBuilderHref } from "@/lib/easyt/trip-workspace-links";
import { MorroviaAffiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
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
  const photos = useJourneyLocalPlacePhotos(finder.candidates, { allowGooglePlaceLookup: false });
  const [unavailablePhotoSources, setUnavailablePhotoSources] = useState<Record<string, string>>({});
  const booking = stayBookingForStop(workingTrip, context.stop);
  const savedGoogleStays = savedGoogleStayReferencesForStop(workingTrip, context.stop.id);
  const partnerAction = getCurrentPartnerAction("accommodation");
  const partnerLabel = partnerAction ? affiliateProviderLabel(partnerAction.provider) : null;
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
  const selectionOrigin = useRef<HTMLElement | null>(null);
  const selectionOriginLabel = useRef<string | null>(null);
  const selectionOriginMapId = useRef<string | null>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);

  const selectPlace = (place: JourneyLocalPlace, source: "card" | "map" = "card") => {
    selectionOrigin.current = source === "card" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    selectionOriginLabel.current = selectionOrigin.current?.getAttribute("aria-label") ?? null;
    selectionOriginMapId.current = source === "map" ? mapResultSelectionId("stay", place.id, context.stop.id) : null;
    setSelectedPlaceId(place.id);
    finder.selectPlace(place);
  };

  const closeDetail = () => {
    finder.clearSelection();
    setSelectedPlaceId(null);
    window.requestAnimationFrame(() => {
      const original = selectionOrigin.current;
      const replacement = selectionOriginMapId.current
        ? [...document.querySelectorAll<HTMLElement>("button[data-map-result-id]")].find((button) => button.dataset.mapResultId === selectionOriginMapId.current)
        : selectionOriginLabel.current
        ? [...document.querySelectorAll<HTMLElement>("button[aria-label]")].find((button) => button.getAttribute("aria-label") === selectionOriginLabel.current)
        : null;
      (original?.isConnected ? original : replacement)?.focus();
    });
  };

  const chooseStay = (place: JourneyLocalPlace) => {
    const changed = mutation.mutateTrip(
      (current) => selectMappedStayForStop(current, context.stop.id, place),
      `stay-select-${context.stop.id}-${place.id}`,
      "stay-select",
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
      stayWorkspaceHref(workingTrip.id, context.stop.id, selectionId),
    );
  };

  const showRail = compact ? Boolean(detail) : finder.candidates.length > 0 || Boolean(detail);
  const inventoryLoading = finder.accommodationInventoryStatus === "loading" && finder.candidates.length > 0;
  const mapPreview = finder.candidates.length ? <MorroviaMapPreview title="Stay map" href={fullMapHref(selected)}>
    <JourneyPlannerMap stops={[]} legs={[]} selectedId="" plannerPins={[]} mapResults={mapResults} selectedMapResult={selectedMapResult} focusCoordinates={context.searchCoordinates} focusZoom={13} draftPinCoordinates={null} pinPlacementMode={false} surface={{ variant: "embedded", interaction: "selection-only" }} previewLabel={`Stay options in ${context.stop.name}`} onMapPinDrop={() => undefined} onPlannerPinSelect={() => undefined} onMapResultSelect={(result) => {
      const place = finder.candidates.find((candidate) => candidate.id === result.sourceId);
      if (place) selectPlace(place, "map");
    }} onSelect={() => undefined} />
  </MorroviaMapPreview> : null;

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
        <p>{context.nights} {context.nights === 1 ? "night" : "nights"} · {context.dateLabel}</p>
      </header>

      {compact ? mapPreview : null}

      {booking && !finder.candidates.some((place) => stayIsSelected(workingTrip, context, place)) ? <MorroviaStatusBanner
        tone="success"
        title={`Saved stay: ${booking.title}`}
        detail="Not in the current shortlist."
        actions={<EasyTLinkButton size="small" variant="secondary" href={`/journey/${encodeURIComponent(workingTrip.id)}/itinerary`}>Manage in itinerary</EasyTLinkButton>}
      /> : null}
      {savedGoogleStays.length ? <section className={styles.googleReferences} aria-label="Saved Google stays">
        <strong>Saved from Google Maps</strong>
        <p>{savedGoogleStays.length} stay {savedGoogleStays.length === 1 ? "reference" : "references"} saved for this stop. No accommodation is booked by saving a place.</p>
        <EasyTLinkButton size="small" variant="secondary" href={mapWorkspaceHref(workingTrip.id, context.stop.id, "stay", mapDayNumber, null, null, stayWorkspaceHref(workingTrip.id, context.stop.id))}>Check in Google map</EasyTLinkButton>
      </section> : null}

      <section className={styles.options} aria-labelledby="stay-options-title">
        <h3 className="sr-only" id="stay-options-title">Stay options for {context.stop.name}</h3>
        {inventoryLoading ? <p className={styles.inventoryNote} role="status">Checking current room availability.</p> : null}
        {finder.status === "loading" ? <div className={styles.loading}><MorroviaSectionStatus title="Finding stays for this stop" detail={`Keeping ${context.stop.name}, ${context.nights} nights and ${context.dateLabel} in place.`} /><div aria-hidden="true"><MorroviaSkeleton height={240} radius="card" /><MorroviaSkeleton height={240} radius="card" /></div></div> : null}
        {finder.status === "failed" ? <MorroviaSectionStatus state="error" title="Couldn’t load stays" retryLabel="Try again" onRetry={finder.retry} /> : null}
        {finder.status === "empty" ? <MorroviaStatusBanner title="No stay options found" detail="No valid accommodation came back for this stop. Try again later or check the booking provider directly." /> : null}
        {finder.candidates.length ? <div className={styles.grid}>{finder.candidates.map((place) => {
          const isSelected = place.id === selectedBase?.id;
          const isChosen = stayIsSelected(workingTrip, context, place);
          const price = formattedPrice(place);
          const hasBookingFacts = hasBookingLiveInformation(place);
          const chooseKey = `stay-select-${context.stop.id}-${place.id}`;
          const imageSource = place.image ?? photos[place.id]?.src;
          const hasImage = Boolean(imageSource && unavailablePhotoSources[place.id] !== imageSource);
          const imageFallback = <div className={styles.cardMediaFallback}><BedDouble aria-hidden="true" /><span>Photos unavailable</span></div>;
          return <article key={place.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`} aria-current={isSelected ? "true" : undefined}>
            <div className={`${styles.cardMedia} ${hasImage ? "" : styles.cardMediaEmpty}`}>
              {hasImage
                ? <JourneyLocalPlacePhotoMedia place={place} photo={photos[place.id]} fallback={imageFallback} onError={() => setUnavailablePhotoSources((current) => ({ ...current, [place.id]: imageSource ?? "" }))} />
                : imageFallback}
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
      {!compact ? mapPreview : null}

      {detail && selected ? <div className={styles.detail}>
        {!compact ? <EasyTButton className={styles.detailClose} size="small" variant="quiet" aria-label={`Close details for ${selected.name}`} onClick={closeDetail}>Close</EasyTButton> : null}
        <ItineraryItemDetail
          detail={detail}
          embedded={!compact}
          pending={mutation.saveState === "saving"}
          onClose={closeDetail}
          mapHref={fullMapHref(selected)}
          primaryActions={<>
            {!selectedSaved ? <EasyTButton fullWidth loading={mutation.saveState === "saving"} onClick={() => chooseStay(selected)}>Choose stay</EasyTButton> : <span className={styles.selectedStatus}><Check aria-hidden="true" />Chosen for this stop</span>}
            {partnerAction && partnerLabel ? <div className={styles.partnerHandoff}><strong>Check on {partnerLabel}</strong><p>{partnerLabel} confirms its own current prices, availability and terms. Opening it does not choose or book this stay.</p><MorroviaAffiliateLink action={{ ...partnerAction, cta: `Check accommodation on ${partnerLabel}` }} context={{ placement: "stay_workspace_detail", tripId: workingTrip.id, stopId: context.stop.id, workspaceView: "stay", destinationCount: 1 }} variant="secondary" /><MorroviaAffiliateDisclosure provider={partnerAction.provider} /></div> : null}
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
      mapPresentation="maplibre"
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
