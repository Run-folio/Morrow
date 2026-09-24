"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, Compass, MapPin, Plus, Check } from "lucide-react";
import type { DiscoveryEntry } from "@/lib/easyt/discovery-entry";
import type { DiscoveryPlace } from "@/lib/easyt/discovery-content";
import type { DiscoveryDraft, DiscoveryDraftAction } from "@/lib/easyt/discovery-draft";
import type { DiscoveryProjection } from "@/lib/easyt/discovery-projection";
import type { ResolvedPlaceMention } from "@/lib/easyt/place-intelligence";
import { availableActions, discoveryDirectionTitle, discoveryShortlistCount, easytCopy, renderDiscoveryReason, type EasyTLanguage } from "@/lib/easyt/i18n";
import { routeEditorialPhoto, routeImageCredit } from "@/lib/easyt/route-images";
import { EasyTButton } from "./easyt-controls";
import { MorroviaStatusBanner } from "./morrovia-feedback";
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

function PlaceCard({ place, draft, mention, entry, language, existing, recommended, baseId, onAction }: {
  place: DiscoveryPlace; draft: DiscoveryDraft; mention: ResolvedPlaceMention; entry: DiscoveryEntry;
  language: EasyTLanguage; existing: boolean; recommended: boolean; baseId: string | null; onAction: Props["onAction"];
}) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const [expanded, setExpanded] = useState(false);
  const selected = draft.shortlistIds.includes(place.id);
  const isBaseStep = draft.step === "bases";
  const baseSelected = baseId === place.id;
  const actions = availableActions(place);
  const role = copy.roles[place.actionability];
  const type = copy.types[place.placeType as keyof typeof copy.types] ?? copy.types.other;
  return <article className={styles.placeCard} data-selected={selected || baseSelected} data-actionability={place.actionability}>
    <Photo imageKey={place.imageKey} name={place.name} language={language} />
    <div className={styles.cardContent}>
      <div className={styles.cardMeta}><span>{type} · {place.country}</span>{existing ? <span className={styles.existing}>{copy.roles.existing}</span> : null}</div>
      <h4>{place.name}</h4>
      {recommended && !existing ? <span className={styles.recommended}>{copy.status.worthConsidering}</span> : null}
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
        <EasyTButton variant="quiet" size="small" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{copy.actions.explore}</EasyTButton>
        {isBaseStep ? actions.includes("choose-base") ? <EasyTButton variant={baseSelected ? "secondary" : "primary"} size="small" icon={baseSelected ? Check : Plus}
          aria-pressed={baseSelected} onClick={() => onAction({ type: entry.kind === "landmark" ? "choose-visit-base" : "choose-base", intentId: mention.mentionId, baseId: place.id })}>
          {baseSelected ? copy.roles.chosen : copy.actions.chooseBase}
        </EasyTButton> : <span className={styles.notBase}>{copy.notBase}</span>
        : <EasyTButton variant={selected ? "secondary" : "primary"} size="small" icon={selected ? Check : Plus}
          aria-pressed={selected} onClick={() => onAction({ type: selected ? "remove-shortlist" : "add-shortlist", placeId: place.id })}>
          {selected ? copy.actions.remove : copy.actions.shortlist}
        </EasyTButton>}
      </div>
    </div>
  </article>;
}

export function DiscoverySteps({ entry, mention, projection, draft, language, existingPlaceIds = [], onAction, search }: Props) {
  const copy = easytCopy[language].builder.visualDiscovery;
  const [visibleCount, setVisibleCount] = useState(Math.max(6, projection.visiblePlaceIds.length));
  useEffect(() => setVisibleCount(Math.max(6, projection.visiblePlaceIds.length)), [draft.directionId, projection.visiblePlaceIds.length]);
  const activeDirection = projection.directions.find(direction => direction.id === draft.directionId);
  const allPlaces = activeDirection ? projection.places.filter(place => activeDirection.placeIds.includes(place.id)) : projection.places;
  const visible = allPlaces.slice(0, visibleCount);
  const baseId = draft.baseByIntentId[mention.mentionId] ?? draft.visitBaseByIntentId[mention.mentionId] ?? null;
  const selected = draft.shortlistIds.map(id => projection.places.find(place => place.id === id)).filter((place): place is DiscoveryPlace => Boolean(place));
  const selectedNames = draft.shortlistIds.map(id => projection.places.find(place => place.id === id)?.name ?? id);
  const baseName = baseId ? projection.places.find(place => place.id === baseId)?.name ?? baseId : null;

  if (draft.step === "directions" && projection.directions.length) return <div className={styles.step} data-discovery-step="directions">
    <div className={styles.lead}><span className={styles.eyebrow}>{copy.steps.directions}</span><h3>{mention.canonicalName || mention.sourceText}</h3><p>{copy.directionIntro}</p></div>
    <div className={styles.directions}>
      {projection.directions.map((direction, index) => <article className={styles.directionCard} key={direction.id} data-selected={draft.directionId === direction.id}>
        <Photo imageKey={direction.imageKey} name={discoveryDirectionTitle(language, direction.titleKey)} language={language} />
        <div className={styles.directionContent}><span className={styles.directionNumber}>{String(index + 1).padStart(2, "0")}</span>
          <h4>{discoveryDirectionTitle(language, direction.titleKey)}</h4>
          <p>{direction.placeIds.length} {copy.directionCount}</p>
          <EasyTButton variant="secondary" fullWidth onClick={() => {
            onAction({ type: "change-direction", directionId: direction.id });
            onAction({ type: "set-step", step: "places" });
          }}>{copy.directions.supported}</EasyTButton>
        </div>
      </article>)}
    </div>
    <p className={styles.truth}>{copy.status.noFitClaim}</p>
  </div>;

  if (draft.step === "review") return <div className={styles.step} data-discovery-step="review">
    <div className={styles.lead}><span className={styles.eyebrow}>{copy.steps.review}</span><h3>{copy.review}</h3><p>{copy.reviewIntro}</p></div>
    {selectedNames.length || baseName ? <div className={styles.reviewList}>
      {selectedNames.map((name, index) => <div key={draft.shortlistIds[index]}><span>{String(index + 1).padStart(2, "0")}</span><strong>{name}</strong></div>)}
      {baseName ? <div><MapPin aria-hidden="true" /><strong>{copy.roles.chosen}: {baseName}</strong></div> : null}
    </div> : <MorroviaStatusBanner title={copy.noDecision} detail={copy.empty} />}
    {selected.some(place => place.actionability === "browse-only") ? <MorroviaStatusBanner tone="warning" title={copy.roles["browse-only"]} detail={copy.notBase} /> : null}
    {selected.some(place => place.actionability === "visit") && !baseId ? <MorroviaStatusBanner tone="warning" title={copy.roles.visit} detail={copy.visitNeedsBase} /> : null}
    <p className={styles.truth}>{copy.status.routeUnverified}</p>
  </div>;

  return <div className={styles.step} data-discovery-step={draft.step}>
    <div className={styles.lead}><span className={styles.eyebrow}>{copy.steps[draft.step]}</span>
      <h3>{mention.canonicalName || mention.sourceText}</h3>
      <p>{draft.step === "bases" ? copy.baseIntro : copy.placesIntro}</p>
    </div>
    {projection.places.length === 0 ? <MorroviaStatusBanner title={copy.empty} detail={copy.intro} />
      : projection.places.length <= 2 ? <MorroviaStatusBanner title={copy.sparse} detail={copy.status.routeUnverified} /> : null}
    <div className={styles.contentGrid}>
      <div className={styles.placeColumn}>
        <div className={styles.placeGrid}>{visible.map(place => <PlaceCard key={place.id} place={place} draft={draft} mention={mention}
          entry={entry} language={language} existing={existingPlaceIds.includes(place.id)}
          recommended={projection.recommendedIds.includes(place.id)} baseId={baseId} onAction={onAction} />)}</div>
        {allPlaces.length > visible.length ? <EasyTButton variant="secondary" className={styles.more} onClick={() => setVisibleCount(count => count + 6)}>
          {copy.actions.showMore} ({allPlaces.length - visible.length})</EasyTButton> : null}
        {search ? <div className={styles.search}>{search}</div> : null}
      </div>
      <aside className={styles.shortlist} aria-label={copy.accessibility.shortlist}>
        <span className={styles.eyebrow}>{copy.shortlist}</span>
        <strong>{discoveryShortlistCount(language, draft.shortlistIds.length)}</strong>
        {selectedNames.length ? <ol>{selectedNames.map((name, index) => <li key={draft.shortlistIds[index]}>{name}</li>)}</ol>
          : <p>{copy.shortlistEmpty}</p>}
        {baseName ? <p>{copy.roles.chosen}: {baseName}</p> : null}
        <small>{copy.status.noFitClaim}</small>
      </aside>
    </div>
    <div className={styles.srAnnouncement} aria-live="polite">{discoveryShortlistCount(language, draft.shortlistIds.length)}</div>
  </div>;
}
