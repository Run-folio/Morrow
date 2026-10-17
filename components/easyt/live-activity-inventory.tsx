"use client";

import { CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { activityInventoryIdentity, itineraryIdeaForActivityInventory, rankActivityInventory, type ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { createAbortableEffectScope } from "@/lib/easyt/abortable-effect";
import { recommendationDurationMs } from "@/lib/easyt/recommendation-performance";
import { trackEvent } from "@/lib/analytics";
import { ideaStateForPlace } from "@/lib/easyt/itinerary-ideas";
import { tripIntentForTrip, type EasyTTrip, type ItineraryIdea, type PlanItem, type TripStop } from "@/lib/easyt/trip";
import { discoveryCategoryMatches, type DiscoveryCategory } from "@/lib/easyt/discovery-taxonomy";
import { activityDurationLabel as faithfulActivityDurationLabel } from "@/lib/easyt/itinerary-schedule-awareness";
import { planningEvidenceFromResponse, publicActivityLaneMessage, planningLaneResponseStatus } from "@/lib/easyt/planning-evidence-presentation";
import type { PlanningEvidenceState } from "@/lib/easyt/planning-evidence-state";
import styles from "./live-activity-inventory.module.css";

type LiveActivityInventoryProps = {
  trip: EasyTTrip;
  stop: TripStop;
  day: PlanItem;
  placement: string;
  workspace: "itinerary" | "map";
  fallback?: ReactNode;
  onSave: (idea: ItineraryIdea) => boolean | Promise<boolean>;
  onSchedule: (idea: ItineraryIdea) => boolean | Promise<boolean>;
  onRemove?: (idea: ItineraryIdea) => boolean | Promise<boolean>;
  isPending?: (idea: ItineraryIdea) => boolean;
  initialItems?: ActivityInventoryItem[];
  discoveryCategory?: Exclude<DiscoveryCategory, "food">;
};

function durationLabel(duration: ActivityInventoryItem["duration"]) {
  return faithfulActivityDurationLabel(duration);
}

function priceLabel(price: ActivityInventoryItem["price"]) {
  if (!price) return null;
  try { return `From ${new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency, maximumFractionDigits: 2 }).format(price.amount)}`; }
  catch { return `From ${price.currency} ${price.amount}`; }
}

export default function LiveActivityInventory({ trip, stop, day, placement, workspace, fallback = null, onSave, onSchedule, onRemove, isPending = () => false, initialItems, discoveryCategory = "for-you" }: LiveActivityInventoryProps) {
  const actionScope = JSON.stringify([trip.ownerId, trip.id, stop.id, day.id]);
  const mountedRef = useRef(true);
  const pendingActionKeysRef = useRef(new Set<string>());
  const [pendingActions, setPendingActions] = useState<Set<string>>(new Set());
  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  const performAction = async (idea: ItineraryIdea, action: (idea: ItineraryIdea) => boolean | Promise<boolean>) => {
    const key = JSON.stringify([actionScope, idea.id]);
    if (pendingActionKeysRef.current.has(key)) return;
    pendingActionKeysRef.current.add(key);
    setPendingActions((current) => new Set(current).add(key));
    try { await action(idea); } catch {
      // The shared mutation owner reports failure; the current trip supplies
      // the saved/planned state, so a rejected action claims no acceptance.
    } finally {
      pendingActionKeysRef.current.delete(key);
      if (mountedRef.current) setPendingActions((current) => {
        const next = new Set(current); next.delete(key); return next;
      });
    }
  };
  const [items, setItems] = useState<ActivityInventoryItem[]>(initialItems ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "error" | "incomplete">(initialItems ? "ready" : "loading");
  const [assessment, setAssessment] = useState<PlanningEvidenceState>();
  const [retryVersion, setRetryVersion] = useState(0);
  const requestScopeRef = useRef<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(workspace === "map" ? 6 : 4);
  const interests = tripIntentForTrip(trip).preferences.interests;
  const placeMention = trip.brief.structuredBrief?.placeMentions?.find((mention) => mention.canonicalPlaceId === stop.canonicalPlaceId);
  const usesCommercialInventory = discoveryCategory !== "outdoors";

  useEffect(() => {
    if (!usesCommercialInventory) { setItems([]); setStatus("ready"); setAssessment(undefined); requestScopeRef.current = null; return; }
    if (initialItems) { setItems(initialItems); setStatus("ready"); setAssessment(undefined); requestScopeRef.current = null; return; }
    const scopeKey = JSON.stringify([trip.id, trip.ownerId, stop.id, stop.canonicalPlaceId, stop.providerId, stop.name, stop.country, stop.countryCode, stop.region, stop.latitude, stop.longitude, trip.currency, placeMention?.aliases, placeMention?.placeType]);
    if (requestScopeRef.current !== scopeKey) setItems([]);
    requestScopeRef.current = scopeKey;
    if (!stop.canonicalPlaceId) { setStatus("error"); setAssessment({ retrieval: "blocked", evidence: "unqualified", reason: "identity_required", retryable: false }); return; }
    const scope = createAbortableEffectScope(`Live activity inventory for ${stop.id}`);
    const startedAt = performance.now();
    setAssessment(undefined);
    setStatus("loading");
    void fetch("/api/journey-activity-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace, destination: {
        canonicalPlaceId: stop.canonicalPlaceId,
        ...(stop.providerId ? { providerId: stop.providerId } : {}),
        name: stop.name,
        country: stop.country,
        countryCode: stop.countryCode,
        region: stop.region,
        coordinates: stop.latitude !== null && stop.longitude !== null ? { latitude: stop.latitude, longitude: stop.longitude } : undefined,
        aliases: placeMention?.aliases,
        placeType: placeMention?.placeType,
      }, currency: trip.currency }),
      signal: scope.signal,
    }).then(async (response) => {
      const payload = await response.json() as { activities?: ActivityInventoryItem[]; unavailable?: boolean; assessment?: PlanningEvidenceState };
      return { payload, ok: response.ok };
    }).then(({ payload, ok }) => {
      scope.commit(() => {
        setAssessment(planningEvidenceFromResponse(payload));
        const responseStatus = planningLaneResponseStatus(payload, ok);
        setStatus(responseStatus);
        if (responseStatus !== "ready") {
          trackEvent("recommendation_performance", { surface: workspace, recommendation_kind: "activity", lane: "commercial", milestone: "lane_ready", duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: 0, outcome: "unavailable" });
          return;
        }
        const activities = payload.activities ?? [];
        setItems(activities);
        const properties = { surface: workspace, recommendation_kind: "activity" as const, lane: "commercial" as const, duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: activities.length, outcome: activities.length ? "ready" as const : "empty" as const };
        if (activities.length) trackEvent("recommendation_performance", { ...properties, milestone: "first_useful" });
        trackEvent("recommendation_performance", { ...properties, milestone: "lane_ready" });
      });
    }).catch((error: unknown) => {
      if (scope.isCancellation(error)) return;
      scope.commit(() => {
        setStatus("error");
        trackEvent("recommendation_performance", { surface: workspace, recommendation_kind: "activity", lane: "commercial", milestone: "lane_ready", duration_ms: recommendationDurationMs(startedAt, performance.now()), result_count: 0, outcome: "unavailable" });
      });
    });
    return () => scope.dispose();
  }, [initialItems, retryVersion, placeMention?.aliases, placeMention?.placeType, stop.canonicalPlaceId, stop.providerId, stop.country, stop.countryCode, stop.id, stop.latitude, stop.longitude, stop.name, stop.region, trip.id, trip.ownerId, trip.currency, usesCommercialInventory, workspace]);

  const ranked = useMemo(
    () => rankActivityInventory(items, interests).filter((item) => discoveryCategoryMatches({
      kind: "tour",
      category: /\b(?:day trip|full[- ]day|half[- ]day|excursion)\b/i.test(`${item.title} ${(item.tags ?? []).join(" ")}`) ? "Day trip" : "Tour",
      tags: item.tags,
      qualityScore: item.rating !== undefined ? Math.round(item.rating * 2 + Math.min(5, Math.log10((item.reviewCount ?? 0) + 1))) : undefined,
    }, discoveryCategory)),
    [discoveryCategory, interests, items],
  );
  const visible = useMemo(() => ranked.slice(0, visibleCount), [ranked, visibleCount]);
  if (status === "loading" && !ranked.length) return <section className={styles.group} aria-label="Live experiences"><MorroviaSectionStatus title="Finding experiences" detail={`Checking current options around ${stop.name}.`} /></section>;
  const unsettled = status === "error" || status === "incomplete";
  const feedback = unsettled ? <><MorroviaSectionStatus compact state="error" title={status === "incomplete" ? "Experiences are not ready yet" : "Experiences are unavailable"}
    detail={assessment ? publicActivityLaneMessage(assessment, "en") : "Bookable experiences are unavailable right now."}
    onRetry={status === "error" && assessment?.retryable !== false || status === "incomplete" && assessment?.retryable === true ? () => setRetryVersion(current => current + 1) : undefined} />
</> : null;
  if (!ranked.length) return <>{feedback}{discoveryCategory === "for-you" || discoveryCategory === "tours" ? fallback : null}</>;

  return <section className={styles.group} aria-label="Live experiences">
    {feedback}
    <div className={styles.list}>{visible.map((item) => {
      const identity = activityInventoryIdentity(item);
      const idea = itineraryIdeaForActivityInventory(stop.id, item, interests);
      const state = ideaStateForPlace(trip, stop.id, identity);
      const pending = isPending(idea) || pendingActions.has(JSON.stringify([actionScope, idea.id]));
      const duration = durationLabel(item.duration);
      const price = priceLabel(item.price);
      const action = item.productUrl ? { provider: "viator", category: "activities", href: item.productUrl, cta: "View on Viator", affiliate: true } as const : null;
      return <article key={identity} data-provider-product-id={item.providerProductId}>
        <ResilientImage className={styles.image} src={item.image} alt="" fallback={<span className={styles.imageFallback}><MapPin aria-hidden="true" /></span>} />
        <div className={styles.copy}><strong>{item.title}</strong><div className={styles.meta}>
          {item.rating !== undefined ? <span><Star aria-hidden="true" />{item.rating.toFixed(1)}{item.reviewCount !== undefined ? ` (${item.reviewCount})` : ""}</span> : null}
          {duration ? <span><Clock3 aria-hidden="true" />{duration}</span> : null}
          {price ? <span>{price}</span> : null}
        </div></div>
        <div className={styles.actions}>
          {state.state === "planned" ? <>
            <span className={styles.state}><CheckCircle2 aria-hidden="true" />Day {state.day.dayNumber}{state.idea.dayPart ? ` · ${state.idea.dayPart[0]!.toUpperCase()}${state.idea.dayPart.slice(1)}` : " · Placement to review"}</span>
            {onRemove ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => { void performAction(state.idea, onRemove); }}>Remove</EasyTButton> : null}
          </> : <EasyTButton size="small" variant="secondary" disabled={pending} onClick={() => { void performAction(idea, onSchedule); }}>Add to Day {day.dayNumber}</EasyTButton>}
          {state.state === "available" ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => { void performAction(idea, onSave); }}>Save for later</EasyTButton> : state.state === "saved" ? <span className={styles.state}><CheckCircle2 aria-hidden="true" />Saved for later</span> : null}
          {action ? <MorroviaAffiliateLink action={action} context={{ placement, tripId: trip.id, stopId: stop.id, workspaceView: workspace }} variant="quiet" /> : null}
        </div>
      </article>;
    })}</div>
    {workspace === "map" && ranked.length > visible.length ? <EasyTButton variant="secondary" size="small" className={styles.showMore} onClick={() => setVisibleCount((count) => Math.min(ranked.length, count + 6))}>Show more experiences</EasyTButton> : null}
    <small className={styles.disclosure}>Experiences from Viator · {affiliateDisclosure}</small>
  </section>;
}
