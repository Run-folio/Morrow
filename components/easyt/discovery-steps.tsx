"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Compass, MapPin, Plus, Check } from "lucide-react";
import type { DiscoveryReview } from "@/lib/easyt/discovery-review";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryPlace } from "@/lib/easyt/discovery-content";
import { discoveryFailureFocusPlan } from "@/lib/easyt/discovery-map-target";
import { resolveDiscoveryBaseChoice, type DiscoveryDraft, type DiscoveryDraftAction } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import { discoveryMapPlacesKey } from "@/lib/easyt/discovery-projection-key";
import { discoveryReviewState } from "@/lib/easyt/discovery-review-state";
import type { ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { discoveryWarningText, availableActions, discoveryDirectionTitle, discoveryShortlistCount, easytCopy, renderDiscoveryReason, type EasyTLanguage } from "@/lib/easyt/i18n";
import { routeEditorialPhoto, routeImageCredit } from "@/lib/easyt/route-images";
import { EasyTButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import styles from "./discovery-modal.module.css";

type Props = {
  canonicalReview?: DiscoveryReview;
  entry: DiscoveryEntry;
  mention: ResolvedPlaceMention;
  projection: DiscoveryProjection;
  draft: DiscoveryDraft;
  language: EasyTLanguage;
  existingPlaceIds?: readonly string[];
  onAction: (action: DiscoveryDraftAction) => void;
  search?: React.ReactNode;
  highlightedPlaceId: string | null;
  onHighlight: (placeId: string) => void;
};

function Photo({ imageKey, name, language }: { imageKey: string | null; name: string; language: EasyTLanguage }) {
  const photo = imageKey ? routeEditorialPhoto(imageKey) : null;
  const variant = photo?.variants.find(item => item.width >= 600) ?? photo?.variants[0];
  const credit = variant ? routeImageCredit(variant.src) : null;
  return <div className={styles.visual} data-photo={credit ? "licensed" : "unavailable"}>
    {credit ? <>
      {/* Content imagery is bounded by the visible page; the browser loads it only near view. */}
      <img src={credit.src} alt={credit.alt} loading="lazy" decoding="async" />
      <MorroviaPhotoCredit language={language} credit={credit.sourceLabel} photoLabel={name} sourceHref={credit.sourceUrl}
        licenseHref={credit.licenseUrl} fullCreditHref={credit.fullCreditUrl} />
    </> : <div className={styles.noPhoto} aria-label={easytCopy[language].builder.visualDiscovery.accessibility.noPhoto}>
      <Compass aria-hidden="true" /><span>{easytCopy[language].builder.visualDiscovery.noPhoto}</span>
    </div>}
  </div>;
}

const PlaceCard = memo(function PlaceCard({ place, draft, mention, entry, language, existing, baseId, splitSupported, onAction, onHighlight, onShowOnMap, registerCard, mapAvailable, highlighted }: {
  place: DiscoveryPlace; draft: DiscoveryDraft; mention: ResolvedPlaceMention; entry: DiscoveryEntry;
  language: EasyTLanguage; existing: boolean; baseId: string | null; splitSupported: boolean; onAction: Props["onAction"];
  onHighlight: Props["onHighlight"]; onShowOnMap: (id: string) => void;
  registerCard: (id: string, element: HTMLElement | null) => void; mapAvailable: boolean; highlighted: boolean;
}) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const [expanded, setExpanded] = useState(false);
  const selected = draft.shortlistIds.includes(place.id);
  const isBaseStep = draft.step === "bases";
  const baseSelected = baseId === place.id;
  const actions = availableActions(place);
  const role = copy.roles[place.actionability];
  const type = copy.types[place.placeType as keyof typeof copy.types] ?? copy.types.other;
  const location = mention.placeType === "country" && mention.canonicalName === place.country
    ? type : `${type} · ${place.country}`;
  return <article ref={element => registerCard(place.id, element)} tabIndex={-1} className={styles.placeCard} data-discovery-card="true"
    data-selected={selected || baseSelected} data-highlighted={highlighted} data-actionability={place.actionability}
    onFocus={() => onHighlight(place.id)}>
    <Photo imageKey={place.imageKey} name={place.name} language={language} />
    <div className={styles.cardContent}>
      <div className={styles.cardMeta}><span>{location}</span>{existing ? <span className={styles.existing}>{copy.roles.existing}</span> : null}</div>
      <h4>{place.name}</h4>
      <p>{renderDiscoveryReason(language, place)}</p>
      <div className={styles.role}><MapPin aria-hidden="true" /><span>{role}</span></div>
      {expanded ? <div className={styles.evidence}>
        <span>{copy.sources}</span>
        <ul>{place.relevance.sources.map(source => <li key={source.id}>
          <a href={source.url} target="_blank" rel="noreferrer" aria-label={`${copy.accessibility.source}: ${source.label}`}>
            {source.label}<ArrowUpRight aria-hidden="true" />
          </a>
        </li>)}</ul>
        <p>{copy.status.noFitClaim}</p>
      </div> : null}
      <div className={styles.cardActions}>
        {mapAvailable ? <EasyTButton variant="quiet" size="small" icon={MapPin}
          aria-label={`${copy.actions.showOnMap}: ${place.name}`} onClick={() => onShowOnMap(place.id)}>{copy.actions.showOnMap}</EasyTButton> : null}
        <EasyTButton variant="quiet" size="small" aria-label={`${copy.actions.explore}: ${place.name}`}
          aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{copy.actions.explore}</EasyTButton>
        {isBaseStep ? actions.includes("choose-base") ? <EasyTButton variant={baseSelected ? "secondary" : "primary"} size="small" icon={baseSelected ? Check : Plus}
          aria-label={`${entry.kind === "landmark" || entry.kind === "natural-area" ? copy.actions.visitFromBase : baseId ? copy.actions.changeBase : copy.actions.chooseBase}: ${place.name}`} aria-pressed={baseSelected}
          onClick={() => onAction({ type: entry.kind === "landmark" || entry.kind === "natural-area" ? "choose-visit-base" : "choose-base", intentId: mention.mentionId, baseId: place.id })}>
          {baseSelected ? copy.roles.chosen : entry.kind === "landmark" || entry.kind === "natural-area" ? copy.actions.visitFromBase : baseId ? copy.actions.changeBase : copy.actions.chooseBase}
        </EasyTButton> : <span className={styles.notBase}>{copy.notBase}</span>
        : <EasyTButton variant={selected ? "secondary" : "primary"} size="small" icon={selected ? Check : Plus}
          aria-label={`${selected ? copy.accessibility.removeFromShortlist : copy.accessibility.addToShortlist}: ${place.name}`}
          aria-pressed={selected} onClick={() => onAction({ type: selected ? "remove-shortlist" : "add-shortlist", placeId: place.id })}>
          {selected ? copy.actions.remove : copy.actions.shortlist}
        </EasyTButton>}
        {!isBaseStep && actions.includes("stay-here") && !baseSelected ? <EasyTButton variant="secondary" size="small"
          aria-label={`${copy.actions.stayHere}: ${place.name}`}
          onClick={() => onAction({ type: "choose-base", intentId: mention.mentionId, baseId: place.id })}>{copy.actions.stayHere}</EasyTButton> : null}
        {!isBaseStep && splitSupported && baseId && baseId !== place.id && !selected && actions.includes("stay-here")
          ? <EasyTButton variant="quiet" size="small" onClick={() => onAction({ type: "add-shortlist", placeId: place.id })}>{copy.actions.splitStay}</EasyTButton> : null}
      </div>
    </div>
  </article>;
});

export function DiscoverySteps({ entry, mention, projection, draft, language, existingPlaceIds = [], onAction, search,
  highlightedPlaceId, onHighlight, canonicalReview }: Props) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const [visibleCount, setVisibleCount] = useState(Math.max(6, projection.visiblePlaceIds.length));
  const [desktopMapVisible, setDesktopMapVisible] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [MapComponent, setMapComponent] = useState<typeof import("./discovery-map").default | null>(null);
  const [cardToFocus, setCardToFocus] = useState<string | null>(null);
  const cardsRef = useRef(new Map<string, HTMLElement>());
  const mapPanelRef = useRef<HTMLDivElement>(null);
  const mapToggleRef = useRef<HTMLButtonElement>(null);
  const mapRegionId = useId();
  useEffect(() => {
    const query = window.matchMedia("(min-width: 801px)");
    const update = () => { setDesktopMapVisible(query.matches); if (query.matches) setMobileMapOpen(false); };
    update(); query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    if (!cardToFocus) return;
    const card = cardsRef.current.get(cardToFocus);
    if (!card) return;
    card.focus();
    card.scrollIntoView({ block: "nearest", behavior: "instant" });
    setCardToFocus(null);
  }, [cardToFocus, visibleCount, mobileMapOpen]);
  useEffect(() => {
    if (mobileMapOpen) mapPanelRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [mobileMapOpen]);
  useEffect(() => setVisibleCount(Math.max(6, projection.visiblePlaceIds.length)), [draft.directionId, projection.visiblePlaceIds.length]);
  const activeDirection = projection.directions.find(direction => direction.id === draft.directionId);
  const allPlaces = useMemo(() => activeDirection ? projection.places.filter(place => activeDirection.placeIds.includes(place.id)) : projection.places,
    [activeDirection, projection.places]);
  const mapPlacesKey = discoveryMapPlacesKey(allPlaces);
  // Recommendations can change after a shortlist edit; marker geometry cannot.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mapPlaces = useMemo(() => allPlaces, [mapPlacesKey]);
  const wantsMap = (desktopMapVisible || mobileMapOpen) && (draft.step === "places" || draft.step === "bases") && allPlaces.length > 0;
  const handleMapUnavailable = useCallback(() => {
    const active = document.activeElement;
    const focusedPinId = active instanceof HTMLElement ? active.closest<HTMLElement>("[data-map-place-id]")?.dataset.mapPlaceId ?? null : null;
    const mapOwnedFocus = active instanceof HTMLElement && (mapPanelRef.current?.contains(active) || mapToggleRef.current === active);
    if (mapOwnedFocus) {
      const focusPlan = discoveryFailureFocusPlan(focusedPinId, highlightedPlaceId, allPlaces, visibleCount);
      setVisibleCount(focusPlan.visibleCount);
      setCardToFocus(focusPlan.placeId);
    }
    setMapUnavailable(true);
    setMobileMapOpen(false);
  }, [allPlaces, highlightedPlaceId, visibleCount]);
  useEffect(() => {
    if (!wantsMap || mapUnavailable || MapComponent) return;
    let active = true;
    import("./discovery-map").then(module => {
      if (active) setMapComponent(() => module.default);
    }).catch(() => {
      if (active) handleMapUnavailable();
    });
    return () => { active = false; };
  }, [wantsMap, mapUnavailable, MapComponent, handleMapUnavailable]);
  const visible = allPlaces.slice(0, visibleCount);
  const { baseId } = resolveDiscoveryBaseChoice(draft, mention.mentionId);
  const splitSupported = projection.places.filter(place => place.actionability === "overnight-base" && place.stayEvidence.length).length >= 2;
  const selectedNames = draft.shortlistIds.map(id => projection.places.find(place => place.id === id)?.name ?? id);
  const baseName = baseId ? projection.places.find(place => place.id === baseId)?.name ?? baseId : null;
  const review = discoveryReviewState(mention.mentionId, draft, projection, existingPlaceIds);
  const registerCard = useCallback((id: string, element: HTMLElement | null) => {
    if (element) cardsRef.current.set(id, element); else cardsRef.current.delete(id);
  }, []);
  const handleShowOnMap = useCallback((id: string) => {
    onHighlight(id);
    if (!desktopMapVisible) setMobileMapOpen(true);
  }, [desktopMapVisible, onHighlight]);
  const handlePinHighlight = (id: string) => {
    const index = allPlaces.findIndex(place => place.id === id);
    if (index < 0) return;
    onHighlight(id);
    setVisibleCount(count => Math.max(count, index + 1));
    setMobileMapOpen(false);
    setCardToFocus(id);
  };

  if (draft.step === "directions" && projection.directions.length) return <div className={styles.step} data-discovery-step="directions">
    <p className={styles.stepHelper}>{copy.directionIntro}</p>
    <div className={styles.directions}>
      {projection.directions.map((direction, index) => <article className={styles.directionCard} key={direction.id} data-selected={draft.directionId === direction.id} data-discovery-card="true">
        <Photo imageKey={direction.imageKey} name={discoveryDirectionTitle(language, direction.titleKey)} language={language} />
        <div className={styles.directionContent}><span className={styles.directionNumber}>{String(index + 1).padStart(2, "0")}</span>
          <h4>{discoveryDirectionTitle(language, direction.titleKey)}</h4>
          <p>{direction.placeIds.length} {copy.directionCount}</p>
          <EasyTButton variant="secondary" fullWidth aria-label={`${copy.accessibility.direction}: ${discoveryDirectionTitle(language, direction.titleKey)}`} onClick={() => {
            onAction({ type: "change-direction", directionId: direction.id });
            onAction({ type: "set-step", step: "places" });
          }}>{copy.directions.supported}</EasyTButton>
        </div>
      </article>)}
    </div>
  </div>;

  if (draft.step === "review") return <div className={styles.step} data-discovery-step="review">
    <p className={styles.stepHelper}>{copy.reviewIntro}</p>
    {canonicalReview ? <>
      <p>{language === "es" ? "Tu idea" : "Your original idea"}: {canonicalReview.originalIntent}</p>
      {canonicalReview.direction ? <p>{copy.steps.directions}: {discoveryDirectionTitle(language, canonicalReview.direction.titleKey)}</p> : null}
      <p>{copy.status.noFitClaim}</p>
      {canonicalReview.existingStops.length ? <div className={styles.reviewList}>
        {canonicalReview.existingStops.map(stop => <div className={styles.reviewChoice} key={stop.id}>
          <div className={styles.reviewDetail}><strong>{stop.name}</strong><small>{copy.roles.existing} · {stop.nights} {language === "es" ? "noches" : "nights"}</small></div>
        </div>)}
      </div> : null}
      {canonicalReview.visits.map(visit => <p key={visit.intentId}>{visit.name}: {copy.actions.visitFromBase}: {canonicalReview.bases.find(base => base.id === visit.baseId)?.name}</p>)}
      {canonicalReview.continuity.reentryCount > 0 ? <MorroviaStatusBanner tone="warning"
        title={language === "es" ? "Revisa el orden entre países" : "Review the order between countries"}
        detail={language === "es" ? "La ruta vuelve a entrar en un país. Revisa las fechas fijas y el orden en Builder." : "The route re-enters a country. Review fixed dates and ordering in Builder."} /> : null}
      {canonicalReview.warnings.length ? <MorroviaStatusBanner tone="warning"
        title={language === "es" ? "Comprobaciones de ruta y tiempo" : "Route and timing checks"}
        detail={[...new Set(canonicalReview.warnings.map(warning => discoveryWarningText(language, warning, [...canonicalReview.existingStops, ...canonicalReview.bases.map(base => ({ id: `discovery:${base.id}`, name: base.name }))])))].join(" ")} /> : null}
    </> : null}
    {review.choices.length || review.base ? <div className={styles.reviewList}>
      {review.choices.map((choice, index) => <div key={choice.id} className={styles.reviewChoice}>
        <span>{String(index + 1).padStart(2, "0")}</span>
        <div className={styles.reviewDetail}>
          <strong>{choice.name}</strong>
          <small>{choice.role ? copy.roles[choice.role] : copy.reviewStatus.unavailable}</small>
          <small>{choice.existing ? copy.roles.existing : choice.confirmable ? copy.reviewStatus.ready : copy.reviewStatus.exploreOnly}</small>
          {choice.outsideDirection ? <small className={styles.reviewWarning}>{copy.reviewStatus.outsideDirection}</small> : null}
        </div>
        <EasyTButton variant="quiet" size="small" aria-label={`${copy.accessibility.removeFromShortlist}: ${choice.name}`}
          onClick={() => onAction({ type: "remove-shortlist", placeId: choice.id })}>
          {copy.actions.remove}
        </EasyTButton>
      </div>)}
      {review.base ? <div className={styles.reviewChoice}><MapPin aria-hidden="true" />
        <div className={styles.reviewDetail}><strong>{copy.roles.chosen}: {review.base.name}</strong>
          <small>{review.base.existing ? copy.roles.existing : review.base.confirmable ? copy.reviewStatus.ready : copy.reviewStatus.exploreOnly}</small>
        </div>
      </div> : null}
    </div> : <MorroviaStatusBanner title={copy.noDecision} detail={copy.noDecisionDetail} />}
    {(canonicalReview ? canonicalReview.blockedIds.length > 0 : review.hasUnresolvedChoices) ? <MorroviaStatusBanner tone="warning" title={copy.reviewStatus.resolveTitle} detail={copy.reviewStatus.resolveDetail} /> : null}
  </div>;

  return <div className={styles.step} data-discovery-step={draft.step}>
    <p className={styles.stepHelper}>{draft.step === "bases" ? copy.baseIntro : copy.placesIntro}</p>
    {!mapUnavailable && allPlaces.length ? <EasyTButton ref={mapToggleRef} variant="secondary" size="small" className={styles.mobileMapButton}
      aria-expanded={mobileMapOpen} aria-controls={mapRegionId} onClick={() => {
        if (mobileMapOpen) {
          if (highlightedPlaceId) handlePinHighlight(highlightedPlaceId);
          else setMobileMapOpen(false);
        } else setMobileMapOpen(true);
      }}>{mobileMapOpen ? copy.actions.showCards : copy.actions.showMap}</EasyTButton> : null}
    {mapUnavailable ? <MorroviaStatusBanner title={copy.status.mapUnavailable} detail={copy.status.mapUnavailableDetail} /> : null}
    {projection.places.length === 0 ? <MorroviaStatusBanner
      title={draft.step === "bases" ? copy.emptyBase : copy.empty}
      detail={draft.step === "bases" ? copy.emptyBaseDetail : copy.emptyDetail} />
      : projection.places.length <= 2 ? <MorroviaStatusBanner title={copy.sparse} detail={copy.sparseDetail} /> : null}
    <div className={styles.contentGrid}>
      <div className={styles.placeColumn}>
        <div className={styles.placeGrid}>{visible.map(place => <PlaceCard key={place.id} place={place} draft={draft} mention={mention}
          entry={entry} language={language} existing={existingPlaceIds.includes(place.id)}
          baseId={baseId} splitSupported={splitSupported} onAction={onAction} mapAvailable={!mapUnavailable && allPlaces.length > 0}
          highlighted={highlightedPlaceId === place.id} onHighlight={onHighlight}
          onShowOnMap={handleShowOnMap} registerCard={registerCard} />)}</div>
        {allPlaces.length > visible.length ? <EasyTButton variant="secondary" className={styles.more} onClick={() => setVisibleCount(count => count + 6)}>
          {copy.actions.showMore} ({allPlaces.length - visible.length})</EasyTButton> : null}
        {search ? <div className={styles.search}>{search}</div> : null}
      </div>
      <aside className={styles.sideRail}>
      <div id={mapRegionId} ref={mapPanelRef} className={styles.mapPanel} hidden={!wantsMap || mapUnavailable || !allPlaces.length}>
        {wantsMap && !mapUnavailable && allPlaces.length ? MapComponent
          ? <MapComponent places={mapPlaces} highlightedPlaceId={highlightedPlaceId} onHighlight={handlePinHighlight}
              onUnavailable={handleMapUnavailable} language={language} />
          : <div className={styles.mapLoadStatus}><MorroviaSectionStatus compact title={copy.status.openingMap}
              detail={copy.status.openingMapDetail} /></div> : null}
      </div>
      <div className={styles.shortlist} role="complementary" aria-label={copy.accessibility.shortlist}>
        <div className={styles.shortlistHeading}><strong>{copy.shortlist}</strong><span>{discoveryShortlistCount(language, draft.shortlistIds.length)}</span></div>
        {selectedNames.length ? <ol>{selectedNames.map((name, index) => <li key={draft.shortlistIds[index]}>{name}</li>)}</ol> : null}
        {baseName ? <p>{copy.roles.chosen}: {baseName}</p> : null}
      </div>
      </aside>
    </div>
    <div className={styles.srAnnouncement} aria-live="polite">{discoveryShortlistCount(language, draft.shortlistIds.length)}</div>
  </div>;
}
