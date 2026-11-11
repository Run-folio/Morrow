"use client";

import { BedDouble, CalendarDays, Check, Map, MapPin, Star, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { JourneyLocalFinder, type JourneyLocalFinderInitialState, type JourneyLocalFinderRenderState, type JourneyLocalPlace } from "@/components/journey-local-finder";
import { MorroviaMapPreview } from "./morrovia-map-preview";
import { JourneyPlannerMap } from "@/components/journey-planner-map";
import { JourneyRouteStopTrack, type JourneyPlannerStripStop } from "@/components/journey-planner-strip";
import { getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { removeMappedStayForStop, savedGoogleStayReferencesForStop, selectMappedStayForStop, stayBookingForStop } from "@/lib/easyt/accommodation";
import { hasBookingLiveInformation } from "@/lib/easyt/local-place";
import { mapResultForLocalPlace, mapResultHandoffForLocalPlace, mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import { recommendationDetailForStayResult } from "@/lib/easyt/recommendation-detail";
import { routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import { shortlistedStays } from "@/lib/easyt/trip-starter";
import { stayCandidateFit, stayHandoffDetails, stayIsSelected, stayWorkspaceContext, type StayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { mapWorkspaceHref, stayWorkspaceHref, tripBuilderHref } from "@/lib/easyt/trip-workspace-links";
import TripStayHandoff from "./trip-stay-handoff";
import { EasyTButton, EasyTLinkButton, EasyTField, EasyTSelect } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";
import { JourneyLocalPlacePhotoMedia, useJourneyLocalPlacePhotos } from "./journey-local-place-photo";
import { MorroviaBriefNotice, MorroviaContentDialog, MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus, MorroviaSkeleton } from "./morrovia-loading-states";
import workspaceHeading from "./trip-workspace-heading.module.css";
import { useTripShellMutation } from "./trip-shell-client";
import { useMobileTripWorkspace } from "./trip-mobile-sheet";
import styles from "./trip-stay-workspace.module.css";
import TripStayShortlist from "./trip-stay-shortlist";

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
  requestedPlaceId,
  workingTrip,
  context,
  navigationStops,
  notice,
  setNotice,
  setSelectedPlaceId,
  onSelectStop,
}: {
  finder: JourneyLocalFinderRenderState;
  requestedPlaceId: string | null;
  workingTrip: EasyTTrip;
  context: StayWorkspaceContext;
  navigationStops: JourneyPlannerStripStop[];
  notice: string | null;
  setNotice: (value: string | null) => void;
  setSelectedPlaceId: (value: string | null) => void;
  onSelectStop: (stopId: string) => void;
}) {
  const mutation = useTripShellMutation();
  const mobile = useMobileTripWorkspace();
  const [stayQuery, setStayQuery] = useState("");
  const [showAllStays, setShowAllStays] = useState(false);
  const filteredCandidates = finder.candidates.filter(place => `${place.name} ${place.address}`.toLocaleLowerCase().includes(stayQuery.trim().toLocaleLowerCase()));
  const mobileCandidates = [...filteredCandidates].sort((a, b) => Number(stayIsSelected(workingTrip, context, b)) - Number(stayIsSelected(workingTrip, context, a)));
  const visibleCandidates = mobile ? stayQuery.trim() || showAllStays ? mobileCandidates : mobileCandidates.slice(0, 1) : finder.candidates;
  useEffect(() => { setStayQuery(""); setShowAllStays(false); }, [context.stop.id, workingTrip.id, workingTrip.ownerId]);
  const actionScopeRef = useRef({ identity: "", revision: 0 });
  const actionIdentity = JSON.stringify([workingTrip.ownerId, workingTrip.id, context.stop.id]);
  if (actionScopeRef.current.identity !== actionIdentity) actionScopeRef.current = { identity: actionIdentity, revision: actionScopeRef.current.revision + 1 };
  const mountedRef = useRef(true);
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const captureActionScope = () => {
    const scope = actionScopeRef.current;
    return () => mountedRef.current && actionScopeRef.current === scope;
  };
  const photos = useJourneyLocalPlacePhotos(finder.candidates, { allowGooglePlaceLookup: false });
  const [unavailablePhotoSources, setUnavailablePhotoSources] = useState<Record<string, string>>({});
  const booking = stayBookingForStop(workingTrip, context.stop);
  const savedGoogleStays = savedGoogleStayReferencesForStop(workingTrip, context.stop.id);
  const partnerAction = getCurrentPartnerAction("accommodation");
  const mapDayNumber = workingTrip.planItems.find((day) => day.stopId === context.stop.id)?.dayNumber ?? null;
  const selectedBase = finder.selectedPlace;
  const selectedPhoto = selectedBase ? photos[selectedBase.id] : undefined;
  const selected = selectedBase && selectedPhoto ? { ...selectedBase, image: selectedPhoto.src } : selectedBase;
  const hasShortlist = shortlistedStays(workingTrip).some(item => item.stopId === context.stop.id);
  const detail = selected ? recommendationDetailForStayResult({ trip: workingTrip, place: selected, stayContext: context, surface: "stay" }) : null;
  const selectedSaved = selected ? stayIsSelected(workingTrip, context, selected) : false;
  const handoffDetails = selected ? stayHandoffDetails(workingTrip, context.stop.id, selected) : null;
  const mapResults = useMemo(() => finder.candidates.map((place) => mapResultForLocalPlace(place, "stay", {
    stopId: context.stop.id,
    dayNumber: mapDayNumber,
  })), [context.stop.id, finder.candidates, mapDayNumber]);
  const selectedMapResult = selected ? mapResults.find((result) => result.sourceId === selected.id) ?? null : null;
  const selectionOrigin = useRef<HTMLElement | null>(null);
  const selectionOriginLabel = useRef<string | null>(null);
  const selectionOriginMapId = useRef<string | null>(null);
  const [compact, setCompact] = useState(false);
  const focusedHandoff = useRef<string | null>(null);
  const [reviewHandoffIntent, setReviewHandoffIntent] = useState<{ scope: string; resultId: string; href: string } | null>(null);

  useEffect(() => {
    const viewport = window.matchMedia("(max-width: 900px)");
    const update = () => setCompact(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const reviewScope = JSON.stringify([workingTrip.id, workingTrip.ownerId, context.key]);
    if (reviewHandoffIntent && (reviewHandoffIntent.scope !== reviewScope || reviewHandoffIntent.href !== window.location.href)) {
      setReviewHandoffIntent(null);
      return;
    }
    if (!selected) return;
    // Wait until the canonical dialog has adapted before consuming deep-link focus.
    if (window.matchMedia("(max-width: 900px)").matches && !compact) return;
    const url = new URL(window.location.href);
    const resultId = mapResultSelectionId("stay", selected.id, context.stop.id);
    const scope = JSON.stringify([workingTrip.id, workingTrip.ownerId, context.stop.id, resultId]);
    const requestedReview = reviewHandoffIntent?.resultId === resultId;
    const requestedHash = url.hash === "#stay-handoff" && url.searchParams.get("stop") === context.stop.id && url.searchParams.get("result") === resultId && focusedHandoff.current !== scope;
    if (!requestedReview && !requestedHash) return;
    // Finder results may arrive after the review click or Next's hash scrolling.
    const frame = window.requestAnimationFrame(() => {
      if (window.location.href !== url.href) return;
      const handoff = document.getElementById("stay-handoff");
      if (!handoff) return;
      if (requestedReview) setReviewHandoffIntent(null);
      handoff.scrollIntoView({ block: "nearest" });
      handoff.focus({ preventScroll: true });
      if (requestedHash) {
        focusedHandoff.current = scope;
        url.hash = "";
        window.history.replaceState(window.history.state, "", url);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [selected?.id, context.key, workingTrip.id, workingTrip.ownerId, compact, reviewHandoffIntent]);

  const selectPlace = (place: JourneyLocalPlace, source: "card" | "map" = "card") => {
    setReviewHandoffIntent(null);
    selectionOrigin.current = source === "card" && document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null;
    selectionOriginLabel.current = selectionOrigin.current?.getAttribute("aria-label") ?? null;
    selectionOriginMapId.current = source === "map" ? mapResultSelectionId("stay", place.id, context.stop.id) : null;
    setSelectedPlaceId(place.id);
    finder.selectPlace(place);
  };

  const reviewPlace = (place: JourneyLocalPlace) => {
    selectPlace(place);
    setReviewHandoffIntent({
      scope: JSON.stringify([workingTrip.id, workingTrip.ownerId, context.key]),
      resultId: mapResultSelectionId("stay", place.id, context.stop.id),
      href: window.location.href,
    });
  };

  const closeDetail = () => {
    setReviewHandoffIntent(null);
    finder.clearSelection();
    setSelectedPlaceId(null);
    window.requestAnimationFrame(() => {
      const original = selectionOrigin.current;
      const returnLabel = selectionOriginLabel.current ?? (selected ? `Open details for ${selected.name}` : null);
      const replacement = selectionOriginMapId.current
        ? [...document.querySelectorAll<HTMLElement>("button[data-map-result-id]")].find((button) => button.dataset.mapResultId === selectionOriginMapId.current)
        : returnLabel
        ? [...document.querySelectorAll<HTMLElement>("button[aria-label]")].find((button) => button.getAttribute("aria-label") === returnLabel)
        : null;
      (original?.isConnected ? original : replacement)?.focus();
    });
  };

  const chooseStay = async (place: JourneyLocalPlace) => {
    const isCurrent = captureActionScope();
    const changed = await mutation.mutateTrip(
      (current) => selectMappedStayForStop(current, context.stop.id, place),
      `stay-select-${context.stop.id}-${place.id}`,
      "stay-select",
    );
    if (!isCurrent()) return;
    if (changed) {
      setNotice(`${place.name} chosen for ${context.stop.name}.`);
      trackEvent("stay_chosen", { trip_id: workingTrip.id, stop_id: context.stop.id, source: "stay_workspace" });
    }
  };

  const removeStay = async () => {
    if (!selected) return;
    const isCurrent = captureActionScope();
    const changed = await mutation.mutateTrip(
      (current) => removeMappedStayForStop(current, context.stop.id, selected),
      `stay-remove-${context.stop.id}-${selected.id}`,
    );
    if (!isCurrent()) return;
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

  const dateSummary = context.checkIn && context.checkOut
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).formatRange(new Date(`${context.checkIn}T12:00:00Z`), new Date(`${context.checkOut}T12:00:00Z`))
    : "Dates to confirm";
  const handoffSummary = selected && detail ? <div className={styles.handoffSummary}>
    <p className={styles.handoffLocation}><MapPin aria-hidden="true" />{context.stop.name}</p>
    <div className={styles.handoffProperty}>
      <div className={styles.handoffPhoto}><JourneyLocalPlacePhotoMedia place={selected} photo={selectedPhoto} fallback={<div className={styles.cardMediaFallback}><BedDouble aria-hidden="true" /><span>Photos unavailable</span></div>} /></div>
      <div className={styles.handoffPropertyCopy}>
        <h3>{selected.name}</h3>
        <p>{selected.category} · {context.stop.name}</p>
        <span className={styles.handoffStatus}>{detail.bookingStatus}</span>
      </div>
    </div>
    <div className={styles.handoffDates}><CalendarDays aria-hidden="true" /><p><strong>{dateSummary}</strong><span>{context.nights} {context.nights === 1 ? "night" : "nights"}</span></p></div>
  </div> : null;

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

    <header className={styles.intro}>
      <h2 className={workspaceHeading.sectionTitle}>{context.stop.name}</h2>
      <p><CalendarDays aria-hidden="true" />{dateSummary} · {context.nights} {context.nights === 1 ? "night" : "nights"}</p>
    </header>

    <div className={styles.main}>
      <TripStayShortlist trip={workingTrip} stopId={context.stop.id} places={finder.candidates} onReview={reviewPlace} />

      {mobile ? <>
        <div className={styles.mobileStayToolbar}>
          <EasyTSelect label="Overnight stop" labelClassName="sr-only" value={context.stop.id} onChange={event => onSelectStop(event.target.value)}>
            {navigationStops.map(stop => { const scope = stayWorkspaceContext(workingTrip, stop.id); return <option key={stop.id} value={stop.id}>{scope?.stop.name} · {scope?.dateLabel} · {scope?.nights} nights</option>; })}
          </EasyTSelect>
          <EasyTLinkButton href={fullMapHref(selected)} icon={Map} size="small" variant="secondary">Map</EasyTLinkButton>
        </div>
        <EasyTField label="Search these stays" value={stayQuery} onChange={event => setStayQuery(event.target.value)} type="search" />
      </> : compact ? mapPreview : null}

      {booking && !finder.candidates.some((place) => stayIsSelected(workingTrip, context, place)) ? <MorroviaStatusBanner
        tone="success"
        title={`Saved stay: ${booking.title}`}
        detail="Not in the current shortlist."
        actions={<EasyTLinkButton size="small" variant="secondary" href={`/journey/${encodeURIComponent(workingTrip.id)}/itinerary`}>Manage in itinerary</EasyTLinkButton>}
      /> : null}
      {savedGoogleStays.length ? <section className={styles.googleReferences} aria-label="Saved Google stays">
        <strong>Saved from Google Maps</strong>
        <p>{savedGoogleStays.length} stay {savedGoogleStays.length === 1 ? "reference" : "references"} saved for this stop. No accommodation is booked by saving a place.</p>
        <EasyTLinkButton size="small" variant="secondary" href={mapWorkspaceHref(workingTrip.id, context.stop.id, "stay", mapDayNumber, null, null, stayWorkspaceHref(workingTrip.id, context.stop.id))}>View on map</EasyTLinkButton>
      </section> : null}

      <details className={styles.browseStays} open={!hasShortlist || finder.status !== "ready" || Boolean(requestedPlaceId && !finder.candidates.some(place => place.id === requestedPlaceId))}>
        <summary>{hasShortlist ? "Find more stays" : "Stay options"}</summary>
        <section className={styles.options} aria-label={`Stay options for ${context.stop.name}`}>
        {requestedPlaceId && finder.status !== "loading" && finder.accommodationInventoryStatus !== "loading" && !finder.candidates.some(place => place.id === requestedPlaceId) ? <MorroviaSectionStatus title="This stay is not in the current results" /> : null}
        {inventoryLoading ? <p className={styles.inventoryNote} role="status">Checking current room availability.</p> : null}
        {finder.status === "loading" ? <div className={styles.loading}><MorroviaSectionStatus title="Finding stays for this stop" detail={`Keeping ${context.stop.name}, ${context.nights} nights and ${context.dateLabel} in place.`} /><div aria-hidden="true"><MorroviaSkeleton height={240} radius="card" /><MorroviaSkeleton height={240} radius="card" /></div></div> : null}
        {finder.status === "failed" ? <MorroviaSectionStatus state="error" title="Couldn’t load stays" retryLabel="Try again" onRetry={finder.retry} /> : null}
        {finder.status === "empty" ? <MorroviaStatusBanner title="No stay options found" detail="No mapped stays came back for this stop. Try again later." /> : null}
        {finder.candidates.length ? <div className={styles.grid}>{visibleCandidates.map((place) => {
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
              {mobile && isChosen ? <p className={styles.mobileStayState}><Check aria-hidden="true" />Chosen · {booking?.confirmation?.trim() ? "Booking details saved" : "Not booked"}</p> : null}
              <EasyTButton fullWidth loading={mutation.isPending(chooseKey)} disabled={isChosen} aria-pressed={isChosen} variant={isChosen ? "secondary" : "primary"} onClick={() => chooseStay(place)}>{isChosen ? "Chosen" : "Choose stay"}</EasyTButton>
            </div>
          </article>;
        })}</div> : null}
        {mobile && stayQuery.trim() && !filteredCandidates.length ? <p>No stays match this search.</p> : null}
        {mobile && !stayQuery.trim() && filteredCandidates.length > 1 ? <EasyTButton variant="quiet" onClick={() => setShowAllStays(value => !value)} aria-expanded={showAllStays}>{showAllStays ? "Show fewer stays" : `Compare more stays (${filteredCandidates.length - 1})`}</EasyTButton> : null}
        </section>
      </details>
    </div>

    {showRail ? <aside className={styles.rail} aria-label="Stay map and decision support">
      {detail && selected ? <MorroviaContentDialog
        open
        inline={!compact}
        ariaLabel={`Find your stay: ${selected.name}`}
        autoFocusSelector="[data-stay-close]"
        onClose={closeDetail}
        className={styles.handoffDialog}
      >
        <div className={styles.detail}>
          <div className={styles.handoffTop}><span aria-hidden="true" /><EasyTButton data-stay-close icon={X} iconOnly size="small" variant="secondary" aria-label={`Close details for ${selected.name}`} onClick={closeDetail}>Close</EasyTButton></div>
          {partnerAction && handoffDetails ? <TripStayHandoff
            key={JSON.stringify([workingTrip.id, workingTrip.ownerId, context.key, selected.id, handoffDetails])}
            details={handoffDetails}
            action={partnerAction}
            summary={handoffSummary}
            context={{ placement: "stay_workspace_detail", tripId: workingTrip.id, stopId: context.stop.id, workspaceView: "stay", destinationCount: 1 }}
          /> : <><h2 className={workspaceHeading.sectionTitle}>Find your stay</h2>{handoffSummary}</>}
          <div className={styles.decisionSecondary}>
            {!selectedSaved ? <EasyTButton variant="secondary" loading={mutation.saveState === "saving"} onClick={() => chooseStay(selected)}>Choose stay</EasyTButton> : <><span className={styles.selectedStatus}><Check aria-hidden="true" />Chosen for this stop</span><EasyTButton variant="quiet" disabled={mutation.saveState === "saving"} onClick={removeStay}>Remove chosen stay</EasyTButton></>}
            <EasyTLinkButton href={fullMapHref(selected)} icon={Map} variant="secondary">View on map</EasyTLinkButton>
          </div>
          <details className={styles.propertyDetails} key={selected.id}>
            <summary tabIndex={0}>Property details</summary>
            <ItineraryItemDetail detail={detail} embedded omitMapAction pending={mutation.saveState === "saving"} onClose={closeDetail} />
          </details>
        </div>
      </MorroviaContentDialog> : !compact ? <div className={styles.emptyHandoff}><h2 className={workspaceHeading.sectionTitle}>Find your stay</h2><p>Review a stay to copy its details and continue to Trip.com.</p></div> : null}
      {!compact ? mapPreview : null}
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
    return <section className={styles.workspace} aria-label="Stay planning"><TripStayShortlist trip={workingTrip} /><MorroviaStatusBanner title={overnightStops.length ? "This stop needs a mapped location" : "No overnight stays to plan"} detail={overnightStops.length ? "Add a trustworthy destination location before searching for accommodation." : "Add an overnight destination to the route before choosing accommodation."} actions={overnightStops.length ? <EasyTLinkButton size="small" variant="secondary" href={tripBuilderHref(workingTrip.id, workingTrip.ownerId)}>Adjust route</EasyTLinkButton> : undefined} /></section>;
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
      render={(finder) => <StayFinderSurface finder={finder} requestedPlaceId={selectedPlaceId} workingTrip={workingTrip} context={context} navigationStops={navigationStops} notice={notice} setNotice={setNotice} setSelectedPlaceId={setSelectedPlaceId} onSelectStop={(stopId) => {
        setSelectedStopId(stopId);
        setSelectedPlaceId(null);
        router.replace(stayWorkspaceHref(workingTrip.id, stopId), { scroll: false });
      }} />}
    />
  </section>;
}
