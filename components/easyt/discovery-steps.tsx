"use client";

import { memo, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { MapPin, Plus, Check } from "lucide-react";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryPlace } from "@/lib/easyt/discovery-content";
import { discoveryFailureFocusPlan } from "@/lib/easyt/discovery-map-target";
import { resolveDiscoveryBaseChoice, type DiscoveryDraft, type DiscoveryDraftAction } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import { discoveryMapPlacesKey } from "@/lib/easyt/discovery-projection-key";
import type { ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { availableActions, discoveryDirectionTitle, discoveryShortlistCount, discoveryStayInLabel, discoveryVisitBaseAriaLabel, easytCopy, renderDiscoveryReason, type EasyTLanguage } from "@/lib/easyt/i18n";
import { routeEditorialPhoto, routeImageCredit, routeImagePhoto } from "@/lib/easyt/route-images";
import { EasyTButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import MorroviaPhotoCredit from "./morrovia-photo-credit";
import styles from "./discovery-modal.module.css";

type Props = {
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
  const photo = imageKey ? routeEditorialPhoto(imageKey) ?? routeImagePhoto(imageKey) : null;
  const variant = photo?.variants.find(item => item.width >= 600) ?? photo?.variants[0];
  const credit = variant ? routeImageCredit(variant.src) : null;
  if (!credit) return null;
  return <div className={styles.visual} data-photo="licensed">
    <>
      {/* Content imagery is bounded by the visible page; the browser loads it only near view. */}
      <img src={credit.src} alt={credit.alt} loading="lazy" decoding="async" />
      <MorroviaPhotoCredit language={language} credit={credit.sourceLabel} photoLabel={name} sourceHref={credit.sourceUrl}
        licenseHref={credit.licenseUrl} fullCreditHref={credit.fullCreditUrl} />
    </>
  </div>;
}

const PlaceCard = memo(function PlaceCard({ place, draft, mention, entry, language, existing, baseId, onAction, onHighlight, registerCard, highlighted }: {
  place: DiscoveryPlace; draft: DiscoveryDraft; mention: ResolvedPlaceMention; entry: DiscoveryEntry;
  language: EasyTLanguage; existing: boolean; baseId: string | null; onAction: Props["onAction"];
  onHighlight: Props["onHighlight"];
  registerCard: (id: string, element: HTMLElement | null) => void; highlighted: boolean;
}) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const selected = draft.shortlistIds.includes(place.id);
  const isBaseStep = draft.step === "bases";
  const isSpecialResolution = isBaseStep && (entry.kind === "landmark" || entry.kind === "natural-area");
  const baseSelected = baseId === place.id;
  const actions = availableActions(place);
  const role = copy.roles[place.actionability];
  const type = copy.types[place.placeType as keyof typeof copy.types] ?? copy.types.other;
  const location = mention.placeType === "country" && mention.canonicalName === place.country
    ? type : `${type} · ${place.country}`;
  const focusPlace = () => onHighlight(place.id);
  return <article ref={element => registerCard(place.id, element)} tabIndex={0} className={styles.placeCard} data-discovery-card="true"
    data-selected={selected || baseSelected} data-highlighted={highlighted} data-actionability={place.actionability}
    aria-label={`${place.name}, ${role}`} onFocus={(event) => { if (event.target === event.currentTarget) focusPlace(); }} onClick={focusPlace}
    onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); focusPlace(); } }}>
    <Photo imageKey={place.imageKey} name={place.name} language={language} />
    <div className={styles.cardContent}>
      <div className={styles.cardMeta}><span>{location}</span>{existing ? <span className={styles.existing}>{copy.roles.existing}</span> : null}</div>
      <h4>{place.name}</h4>
      <p>{renderDiscoveryReason(language, place)}</p>
      <div className={styles.role}><MapPin aria-hidden="true" /><span>{role}</span></div>
      <div className={styles.cardActions}>
        {isBaseStep ? actions.includes("choose-base") ? <EasyTButton variant={baseSelected ? "secondary" : "primary"} size="small" icon={baseSelected ? Check : Plus}
          aria-label={isSpecialResolution ? discoveryVisitBaseAriaLabel(language, place.name, mention.canonicalName || mention.sourceText)
            : `${baseId ? copy.actions.changeBase : copy.actions.chooseBase}: ${place.name}`} aria-pressed={baseSelected}
          onClick={(event) => { event.stopPropagation(); onAction({ type: isSpecialResolution ? "choose-visit-base" : "choose-base", intentId: mention.mentionId, baseId: place.id }); }}>
          {baseSelected ? copy.roles.chosen : isSpecialResolution ? discoveryStayInLabel(language, place.name) : baseId ? copy.actions.changeBase : copy.actions.chooseBase}
        </EasyTButton> : <span className={styles.notBase}>{copy.notBase}</span>
        : place.actionability === "overnight-base" ? <EasyTButton variant={selected ? "secondary" : "primary"} size="small" icon={selected ? Check : Plus}
          aria-label={`${selected ? copy.accessibility.removeFromShortlist : copy.accessibility.addToShortlist}: ${place.name}`}
          aria-pressed={selected} onClick={(event) => { event.stopPropagation(); onAction({ type: selected ? "remove-shortlist" : "add-shortlist", placeId: place.id }); }}>
          {selected ? copy.actions.remove : copy.actions.shortlist}
        </EasyTButton> : null}
      </div>
    </div>
  </article>;
});

export function DiscoverySteps({ entry, mention, projection, draft, language, existingPlaceIds = [], onAction, search,
  highlightedPlaceId, onHighlight }: Props) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const specialResolution = draft.step === "bases" && (entry.kind === "landmark" || entry.kind === "natural-area");
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
  const selectedNames = draft.shortlistIds.map(id => projection.places.find(place => place.id === id)?.name ?? id);
  const registerCard = useCallback((id: string, element: HTMLElement | null) => {
    if (element) cardsRef.current.set(id, element); else cardsRef.current.delete(id);
  }, []);
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
        <Photo imageKey={direction.imageKey} name={discoveryDirectionTitle(language, direction.titleKey, direction.title)} language={language} />
        <div className={styles.directionContent}><span className={styles.directionNumber}>{String(index + 1).padStart(2, "0")}</span>
          <h4>{discoveryDirectionTitle(language, direction.titleKey, direction.title)}</h4>
          <p>{direction.summary ?? `${direction.placeIds.length} ${copy.directionCount}`}</p>
          <EasyTButton variant="secondary" fullWidth aria-label={`${copy.accessibility.direction}: ${discoveryDirectionTitle(language, direction.titleKey, direction.title)}`} onClick={() => {
            onAction({ type: "change-direction", directionId: direction.id });
            onAction({ type: "set-step", step: "places" });
          }}>{copy.directions.supported}</EasyTButton>
        </div>
      </article>)}
    </div>
  </div>;

  if (projection.places.length === 0) return <div className={styles.emptyState} data-discovery-state="empty">
    <MorroviaStatusBanner
      title={draft.step === "bases" ? copy.emptyBase : copy.empty}
      detail={draft.step === "bases" ? copy.emptyBaseDetail : copy.emptyDetail} />
    {search ? <div className={styles.search}>{search}</div> : null}
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
    {projection.places.length <= 2 ? <MorroviaStatusBanner title={copy.sparse} detail={copy.sparseDetail} /> : null}
    <div className={styles.contentGrid}>
      <div className={styles.placeColumn}>
        <div className={styles.placeGrid}>{visible.map(place => <PlaceCard key={place.id} place={place} draft={draft} mention={mention}
          entry={entry} language={language} existing={existingPlaceIds.includes(place.id)}
          baseId={baseId} onAction={onAction}
          highlighted={highlightedPlaceId === place.id} onHighlight={onHighlight}
          registerCard={registerCard} />)}</div>
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
      {!specialResolution ? <div className={styles.shortlist} role="complementary" aria-label={copy.accessibility.shortlist}>
        <div className={styles.shortlistHeading}><strong>{copy.shortlist}</strong><span>{discoveryShortlistCount(language, draft.shortlistIds.length)}</span></div>
        {selectedNames.length ? <ol>{selectedNames.map((name, index) => <li key={draft.shortlistIds[index]}>{name}</li>)}</ol> : null}
      </div> : null}
      </aside>
    </div>
    {!specialResolution ? <div className={styles.srAnnouncement} aria-live="polite">{discoveryShortlistCount(language, draft.shortlistIds.length)}</div> : null}
  </div>;
}
