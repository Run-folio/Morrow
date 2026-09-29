"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import { priceLevelLabel, type EnrichedPlace, type EnrichedReview, type PlaceEnrichmentCategory } from "@/lib/easyt/place-enrichment";
import type { GooglePlacePhotoAttribution } from "@/lib/easyt/google-place-photo";
import type { GooglePlaceFailureKind } from "@/lib/easyt/google-place-request-control";
import { selectedGoogleDetailForPlace } from "@/lib/easyt/google-map-workspace-selection";
import styles from "./map-place-enrichment.module.css";

type Props = {
  destination: string;
  contextLabel: string;
  category: PlaceEnrichmentCategory;
  places: readonly EnrichedPlace[];
  savedReferences?: readonly { id: string; placeId: string; dayLabel: string | null }[];
  status: "loading" | "ready" | "empty" | "unavailable";
  failure?: GooglePlaceFailureKind;
  selectedPlaceId: string | null;
  detail: EnrichedPlace | null;
  detailStatus: "idle" | "loading" | "unavailable";
  unavailableReason?: "invalid" | "not-found" | "provider-failure" | null;
  photo: { src: string; sourceUrl: string; attributions: GooglePlacePhotoAttribution[] } | null;
  reviews: readonly EnrichedReview[];
  mediaRequested?: boolean;
  onRequestMedia?(): void;
  listScrollTop: number;
  onListScroll(top: number): void;
  onSelectPlace(placeId: string): void;
  onSelectSavedReference?(referenceId: string, placeId: string): void;
  onBackToPlaces(): void;
  onRetry(): void;
  actions?: ReactNode;
};

/** Controlled projection. The Map workspace owns category, scoped results, selection and requests. */
export default function MapPlaceEnrichment(props: Props) {
  const panelRef = useRef<HTMLElement>(null);
  const backFocusPlaceIdRef = useRef<string | null>(null);
  const exactDetail = selectedGoogleDetailForPlace(props.selectedPlaceId, props.detail);
  const selected = props.selectedPlaceId
    ? exactDetail ?? props.places.find((place) => place.providerPlaceId === props.selectedPlaceId) ?? null
    : null;
  useLayoutEffect(() => {
    if (!props.selectedPlaceId && panelRef.current) {
      panelRef.current.scrollTop = props.listScrollTop;
      if (backFocusPlaceIdRef.current) {
        const button = [...panelRef.current.querySelectorAll<HTMLButtonElement>("button[data-place-id]")]
          .find((candidate) => candidate.dataset.placeId === backFocusPlaceIdRef.current);
        (button ?? panelRef.current.querySelector<HTMLButtonElement>("button[data-place-id]"))?.focus();
        backFocusPlaceIdRef.current = null;
      }
    }
  }, [props.selectedPlaceId, props.listScrollTop]);

  return <section ref={panelRef} className={styles.panel} aria-label={`Google Maps places near ${props.destination}`}
    onScroll={(event) => { if (!props.selectedPlaceId) props.onListScroll(event.currentTarget.scrollTop); }}>
    <div className={styles.source}>Places near {props.destination} <span>Google Maps</span></div>
    {props.selectedPlaceId ? <div className={styles.detail}>
      <EasyTButton variant="quiet" size="small" icon={ChevronLeft} onClick={() => { backFocusPlaceIdRef.current = props.selectedPlaceId; props.onBackToPlaces(); }}>Back to places</EasyTButton>
      <p className={styles.context}>{props.contextLabel}</p>
      {selected ? <>
        <h3>{selected.name}</h3>
        {selected.category ? <p className={styles.category}>{selected.category}</p> : null}
        {selected.address ? <p>{selected.address}</p> : null}
        {selected.rating !== undefined ? <p>{selected.rating.toFixed(1)} ★{selected.ratingCount !== undefined ? ` · ${selected.ratingCount.toLocaleString()} ratings` : ""}</p> : null}
        {priceLevelLabel(selected.priceLevel) ? <p>Price level: {priceLevelLabel(selected.priceLevel)}</p> : null}
        {selected.openNow !== undefined ? <p>{selected.openNow ? "Open now (at lookup)" : "Closed now (at lookup)"}</p> : null}
        {selected.hours?.length ? <details><summary>Current opening hours</summary><ul>{selected.hours.map((hour) => <li key={hour}>{hour}</li>)}</ul></details> : null}
        {selected.website ? <a href={selected.website} target="_blank" rel="noopener noreferrer">Website <ArrowUpRight aria-hidden="true" /></a> : null}
        <a href={selected.mapsUrl} target="_blank" rel="noopener noreferrer">Open in Google Maps <ArrowUpRight aria-hidden="true" /></a>
        {selected.attributions?.map((item) => <small key={item.name}>{item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.name}</a> : item.name}</small>)}
        {props.actions ? <div className={styles.actions}>{props.actions}</div> : null}
        {props.onRequestMedia && !props.mediaRequested ? <EasyTButton variant="quiet" size="small" onClick={props.onRequestMedia}>Load photos and reviews</EasyTButton> : null}
        {exactDetail && props.photo ? <figure className={styles.photoMedia}>
          <img src={props.photo.src} alt={`Provider photo of ${selected.name}`} />
          <figcaption>Photo: {props.photo.attributions.length ? props.photo.attributions.map((credit, index) => <span key={`${credit.displayName}-${index}`}>{index ? " · " : null}{credit.photoUri ? <img src={credit.photoUri} alt="" /> : null}{credit.uri ? <a href={credit.uri} target="_blank" rel="noopener noreferrer">{credit.displayName}</a> : credit.displayName}</span>) : "Google Maps"} · <a href={props.photo.sourceUrl} target="_blank" rel="noopener noreferrer">View source photo</a></figcaption>
        </figure> : null}
        {exactDetail && props.reviews.length ? <details className={styles.reviews}><summary>{props.reviews.length} {props.reviews.length === 1 ? "review" : "reviews"} from Google Maps</summary><ul>{props.reviews.map((review) => <li key={review.sourceUrl}>
          <p>{review.text}</p>
          <p className={styles.reviewAuthor}>{review.author.avatarUrl ? <img src={review.author.avatarUrl} alt="" /> : null}{review.author.url ? <a href={review.author.url} target="_blank" rel="noopener noreferrer">{review.author.name}</a> : review.author.name}{review.rating !== undefined ? ` · ${review.rating} ★` : null} · <a href={review.sourceUrl} target="_blank" rel="noopener noreferrer">View review on Google Maps</a></p>
        </li>)}</ul></details> : null}
      </> : null}
      {props.detailStatus === "loading" ? <p role="status">Loading place details…</p> : null}
      {props.detailStatus === "unavailable" ? <p role="status">{props.unavailableReason === "invalid" || props.unavailableReason === "not-found"
        ? "This saved Google place could not be found. Your saved reference is still here; try again or choose a place from the list."
        : "Couldn't load place details. Your saved reference is still here."} <EasyTButton variant="quiet" size="small" onClick={props.onRetry}>Try again</EasyTButton></p> : null}
    </div> : <>
      {props.savedReferences?.length ? <div className={styles.savedReferences}><strong>Saved Google places</strong><ul>{props.savedReferences.map((reference) => <li key={reference.id}><EasyTButton variant="quiet" fullWidth onClick={() => props.onSelectSavedReference?.(reference.id, reference.placeId)}>Saved Google place{reference.dayLabel ? ` · ${reference.dayLabel}` : " · for later"}</EasyTButton></li>)}</ul></div> : null}
      {props.status === "loading" ? <MorroviaSectionStatus state="loading" title="Finding nearby places" detail="Checking this destination now." /> : null}
      {props.status === "unavailable" ? <p role="status">{props.failure === "offline" ? "You're offline. Nearby places could not be refreshed." : props.failure === "quota" ? "Google Maps is temporarily at its request limit." : props.failure === "configuration" ? "Google Maps places are not configured for this session." : "Couldn't load places."}{props.places.length ? " Previous places remain visible below." : ""} <EasyTButton variant="quiet" size="small" onClick={props.onRetry}>Try again</EasyTButton></p> : null}
      {props.status === "empty" ? <p role="status">No places found for this category.</p> : null}
      {props.places.length ? <ul className={styles.results}>{props.places.map((place) => <li key={place.providerPlaceId}><EasyTButton variant="quiet" fullWidth className={styles.resultButton} data-place-id={place.providerPlaceId} onClick={() => props.onSelectPlace(place.providerPlaceId)}><strong>{place.name}</strong>{place.category ? <span>{place.category}</span> : null}{place.address ? <small>{place.address}</small> : null}</EasyTButton></li>)}</ul> : null}
    </>}
  </section>;
}
