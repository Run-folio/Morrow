"use client";

import { BedDouble, Building2, Check, MapPin, Star } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { JourneyLocalFinder, type JourneyLocalFinderInitialState, type JourneyLocalFinderRenderState, type JourneyLocalPlace } from "@/components/journey-local-finder";
import { JourneyStopNavigation } from "@/components/journey-planner-strip";
import { trackEvent } from "@/lib/analytics";
import { getCurrentPartnerAction } from "@/lib/easyt/booking-readiness";
import { removeMappedStayForStop, selectMappedStayForStop, stayBookingForStop } from "@/lib/easyt/accommodation";
import { hasBookingLiveInformation } from "@/lib/easyt/local-place";
import { mapResultHandoffForLocalPlace, mapResultSelectionId } from "@/lib/easyt/map-result-selection";
import { recommendationDetailForStayResult } from "@/lib/easyt/recommendation-detail";
import { routeTimelineStopsForTrip } from "@/lib/easyt/route-timeline";
import { stayAreaGuidance, stayCandidateFit, stayIsSelected, stayWorkspaceContext } from "@/lib/easyt/stay-workspace";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { mapWorkspaceHref, stayWorkspaceHref } from "@/lib/easyt/trip-workspace-links";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTLinkButton } from "./easyt-controls";
import ItineraryItemDetail from "./itinerary-item-detail";
import { MorroviaBriefNotice, MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus, MorroviaSkeleton } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
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

function sourceLabel(provider: JourneyLocalPlace["provider"]) {
  if (provider === "booking-demand") return "Booking.com live information";
  if (provider === "google-places") return "Google Places";
  if (provider === "openstreetmap") return "OpenStreetMap";
  return null;
}

export default function TripStayWorkspace({ trip, initialStopId, initialSelectedPlaceId, initialFinderState }: TripStayWorkspaceProps) {
  const router = useRouter();
  const mutation = useTripShellMutation();
  const workingTrip = mutation.trip.id === trip.id ? mutation.trip : trip;
  const overnightStops = useMemo(() => [...workingTrip.stops]
    .filter((stop) => (stop.nights ?? 0) > 0)
    .sort((left, right) => left.order - right.order), [workingTrip.stops]);
  const requestedStop = overnightStops.some((stop) => stop.id === initialStopId) ? initialStopId! : overnightStops[0]?.id ?? null;
  const [selectedStopId, setSelectedStopId] = useState<string | null>(requestedStop);
  const [selectedPlaceId, setSelectedPlaceId] = useState<string | null>(initialSelectedPlaceId ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const selectedOriginRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (selectedStopId && overnightStops.some((stop) => stop.id === selectedStopId)) return;
    setSelectedStopId(overnightStops[0]?.id ?? null);
    setSelectedPlaceId(null);
  }, [overnightStops, selectedStopId]);

  const context = selectedStopId ? stayWorkspaceContext(workingTrip, selectedStopId) : null;
  const guidance = context ? stayAreaGuidance(context) : null;
  const navigationStops = useMemo(() => selectedStopId
    ? routeTimelineStopsForTrip(workingTrip, { scopeId: selectedStopId })
      .filter((item) => item.kind === "stop" && overnightStops.some((stop) => stop.id === item.id))
    : [], [overnightStops, selectedStopId, workingTrip]);

  const closeDetail = useCallback((clearSelection?: () => void) => {
    clearSelection?.();
    setSelectedPlaceId(null);
    const origin = selectedOriginRef.current;
    selectedOriginRef.current = null;
    window.requestAnimationFrame(() => origin?.focus());
  }, []);

  if (!context || !context.searchCoordinates) {
    return <section className={styles.workspace} aria-label="Stay planning">
      <MorroviaSectionStatus
        title={overnightStops.length ? "This stop needs a mapped location" : "No overnight stays to plan"}
        detail={overnightStops.length ? "Add a trustworthy destination location before searching for accommodation." : "Add an overnight destination to the route before choosing accommodation."}
      />
    </section>;
  }

  const booking = stayBookingForStop(workingTrip, context.stop);
  const partnerAction = getCurrentPartnerAction("accommodation");

  const renderFinder = (finder: JourneyLocalFinderRenderState) => {
    const selected = finder.selectedPlace;
    const detail = selected ? recommendationDetailForStayResult({ trip: workingTrip, place: selected, stayContext: context, surface: "stay" }) : null;
    const selectedSaved = selected ? stayIsSelected(workingTrip, context, selected) : false;
    const inventoryNote = finder.accommodationInventoryStatus === "loading" && finder.candidates.length
      ? "Mapped stays are ready. Current room availability is still loading."
      : finder.accommodationInventoryStatus === "unavailable" && finder.candidates.length
        ? "Mapped stays remain useful. Current room availability could not be checked."
        : finder.accommodationInventoryStatus === "unconfigured" && finder.candidates.length
          ? "Mapped stays are ready. Check current availability with the booking provider."
          : null;

    const saveStay = () => {
      if (!selected) return;
      const changed = mutation.mutateTrip(
        (current) => selectMappedStayForStop(current, context.stop.id, selected),
        `stay-select-${context.stop.id}-${selected.id}`,
      );
      if (!changed) return;
      setNotice(`${selected.name} saved for ${context.stop.name}.`);
    };

    const removeStay = () => {
      if (!selected) return;
      const changed = mutation.mutateTrip(
        (current) => removeMappedStayForStop(current, context.stop.id, selected),
        `stay-remove-${context.stop.id}-${selected.id}`,
      );
      if (!changed) return;
      setNotice(`${selected.name} removed. ${context.stop.name} needs a stay again.`);
      closeDetail(finder.clearSelection);
    };

    return <div className={`${styles.layout} ${detail ? styles.layoutWithDetail : ""}`}>
      <div className={styles.main}>
        {notice ? <MorroviaBriefNotice title={notice} onDismiss={() => setNotice(null)} action={<EasyTButton size="small" variant="quiet" onClick={() => setNotice(null)}>Dismiss</EasyTButton>} /> : null}
        {mutation.error ? <MorroviaStatusBanner tone="warning" title="This change is safe on this device" detail={mutation.error} /> : null}

        <div className={styles.stopNavigation}>
          <JourneyStopNavigation
            stops={navigationStops}
            ariaLabel="Choose an overnight trip stop"
            onSelectStop={(stopId) => {
              setSelectedStopId(stopId);
              setSelectedPlaceId(null);
              selectedOriginRef.current = null;
              router.replace(stayWorkspaceHref(workingTrip.id, stopId), { scroll: false });
            }}
          />
        </div>

        <header className={styles.intro}>
          <span>STAY · {context.nights} {context.nights === 1 ? "NIGHT" : "NIGHTS"} · {context.dateLabel}</span>
          <h2>Where should you stay in {context.stop.name}?</h2>
          <p>Compare a small set of mapped options against the stop and itinerary you already planned.</p>
        </header>

        {guidance ? <section className={styles.areaGuidance} data-guidance={guidance.kind} aria-labelledby="stay-area-guidance-title">
          <MapPin aria-hidden="true" />
          <div><small>AREA GUIDANCE</small><h3 id="stay-area-guidance-title">{guidance.title}</h3><p>{guidance.reason}</p></div>
        </section> : null}

        {booking && !finder.candidates.some((place) => stayIsSelected(workingTrip, context, place)) ? <MorroviaStatusBanner
          tone="success"
          title={`${booking.title} is saved for this stop`}
          detail="The saved stay remains canonical even when it is not present in the current mapped shortlist."
          actions={<EasyTLinkButton size="small" variant="secondary" href={`/journey/${encodeURIComponent(workingTrip.id)}/itinerary`}>Manage in itinerary</EasyTLinkButton>}
        /> : null}

        <section className={styles.options} aria-labelledby="stay-options-title">
          <div className={styles.optionsHeader}><div><small>SHORTLIST</small><h3 id="stay-options-title">Useful options for {context.stop.name}</h3></div>{finder.candidates.length ? <span>{finder.candidates.length} options</span> : null}</div>
          {inventoryNote ? <p className={styles.inventoryNote} role={finder.accommodationInventoryStatus === "loading" ? "status" : undefined}>{inventoryNote}</p> : null}
          {finder.status === "loading" ? <div className={styles.loading}><MorroviaSectionStatus title="Finding stays for this stop" detail={`Keeping ${context.stop.name}, ${context.nights} nights and ${context.dateLabel} in place.`} /><div aria-hidden="true"><MorroviaSkeleton height={180} radius="card" /><MorroviaSkeleton height={180} radius="card" /></div></div> : null}
          {finder.status === "failed" ? <MorroviaSectionStatus state="error" title="Stay options are unavailable" detail="No mapped or live options could be loaded. Your trip and selected stop are unchanged." retryLabel="Try stay search again" onRetry={finder.retry} /> : null}
          {finder.status === "empty" ? <MorroviaSectionStatus title="No stay options found" detail="No valid accommodation came back for this stop. Try again later or check the booking provider directly." /> : null}
          {finder.candidates.length ? <div className={styles.grid}>{finder.candidates.map((place) => {
            const isSelected = place.id === selected?.id;
            const isSaved = stayIsSelected(workingTrip, context, place);
            const price = formattedPrice(place);
            const source = sourceLabel(place.provider);
            const hasBookingFacts = hasBookingLiveInformation(place);
            return <article key={place.id} className={`${styles.card} ${isSelected ? styles.cardSelected : ""}`} aria-current={isSelected ? "true" : undefined}>
              <div className={`${styles.cardMedia} ${place.image ? "" : styles.cardMediaFallback}`}>
                {place.image ? <ResilientImage src={place.image} alt={`${place.name} property`} fallback={<BedDouble aria-hidden="true" />} /> : <><BedDouble aria-hidden="true" /><span>No sourced property image</span></>}
                {isSaved ? <span className={styles.saved}><Check aria-hidden="true" />Saved stay</span> : null}
              </div>
              <div className={styles.cardBody}>
                <h4>{place.name}</h4>
                <p><MapPin aria-hidden="true" />{place.address}</p>
                <div className={styles.cardFacts}>
                  {place.rating !== undefined ? <span><Star aria-hidden="true" />{place.rating.toFixed(1)}{place.reviewCount !== undefined ? ` · ${place.reviewCount.toLocaleString()} reviews` : ""}</span> : null}
                  {source ? <small>{source}</small> : null}
                  {!hasBookingFacts ? <span>Availability to check</span> : null}
                </div>
                {hasBookingFacts ? <div className={`${styles.cardFacts} ${styles.bookingFacts}`}><small>BOOKING.COM LIVE INFO</small>{price ? <strong>{price} for your dates</strong> : null}<span>{place.availability === "available" ? "Current availability found" : "No current availability confirmed"}</span></div> : null}
                <p className={styles.fit}>{stayCandidateFit(place, context)}</p>
                <EasyTButton
                  ref={isSelected ? undefined : (element) => { if (element && place.id === selectedPlaceId) selectedOriginRef.current = element; }}
                  fullWidth
                  variant={isSelected ? "primary" : "secondary"}
                  aria-pressed={isSelected}
                  onClick={(event) => {
                    selectedOriginRef.current = event.currentTarget;
                    setSelectedPlaceId(place.id);
                    finder.selectPlace(place);
                  }}
                >{isSelected ? "Viewing details" : "View details"}</EasyTButton>
              </div>
            </article>;
          })}</div> : null}
        </section>
      </div>

      <aside className={`${styles.rail} ${detail ? styles.railSelected : ""}`} aria-label="Stay decision support">
        {detail && selected ? (() => {
          const mapDayNumber = workingTrip.planItems.find((day) => day.stopId === context.stop.id)?.dayNumber ?? null;
          const mapSelectionId = mapResultSelectionId("stay", selected.id, context.stop.id);
          return <ItineraryItemDetail
          detail={detail}
          pending={mutation.saveState === "saving"}
          onClose={() => closeDetail(finder.clearSelection)}
          mapHref={mapWorkspaceHref(workingTrip.id, context.stop.id, "stay", mapDayNumber, mapSelectionId, mapResultHandoffForLocalPlace(selected, "stay", context.stop.id, mapDayNumber, mapSelectionId))}
          primaryActions={<>
            {!selectedSaved ? <EasyTButton fullWidth loading={mutation.saveState === "saving"} onClick={saveStay}>{booking ? "Replace saved stay" : "Save stay to trip"}</EasyTButton> : <span className={styles.selectedStatus}><Check aria-hidden="true" />Saved for this stop</span>}
            {partnerAction ? <div className={styles.partnerHandoff}><strong>Check independently on Trip.com</strong>{hasBookingLiveInformation(selected) ? <p>Trip.com prices, availability and terms may differ from the Booking.com live information above.</p> : <p>Trip.com will confirm its own current prices, availability and terms.</p>}<MorroviaAffiliateLink action={{ ...partnerAction, cta: "Check Trip.com availability" }} context={{ placement: "stay_workspace_detail", tripId: workingTrip.id, stopId: context.stop.id, workspaceView: "stay", destinationCount: 1 }} variant="secondary" /><small className={styles.disclosure}>{affiliateDisclosure}</small></div> : null}
          </>}
          onRemove={selectedSaved ? removeStay : undefined}
        />;
        })() : <div className={styles.railPrompt}><Building2 aria-hidden="true" /><small>STAY DECISION</small><h3>Choose an option to compare</h3><p>Property detail will explain its sourced facts, relationship to your mapped plans, and what still needs checking.</p></div>}
      </aside>
    </div>;
  };

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
      render={renderFinder}
    />
  </section>;
}
