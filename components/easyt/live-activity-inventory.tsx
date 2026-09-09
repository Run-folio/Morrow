"use client";

import { CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { itineraryInterestReason } from "@/lib/easyt/itinerary-day-context";
import { activityInventoryIdentity, itineraryIdeaForActivityInventory, rankActivityInventory, type ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { ideaStateForPlace } from "@/lib/easyt/itinerary-ideas";
import { tripIntentForTrip, type EasyTTrip, type ItineraryIdea, type PlanItem, type TripStop } from "@/lib/easyt/trip";
import styles from "./live-activity-inventory.module.css";

type LiveActivityInventoryProps = {
  trip: EasyTTrip;
  stop: TripStop;
  day: PlanItem;
  placement: string;
  workspace: "itinerary" | "map";
  fallback?: ReactNode;
  onSave: (idea: ItineraryIdea) => boolean;
  onSchedule: (idea: ItineraryIdea) => boolean;
  onRemove?: (idea: ItineraryIdea) => boolean;
  isPending?: (idea: ItineraryIdea) => boolean;
  initialItems?: ActivityInventoryItem[];
};

function durationLabel(duration: ActivityInventoryItem["duration"]) {
  if (!duration) return null;
  const minutes = duration.fixedMinutes ?? duration.fromMinutes;
  if (!minutes) return null;
  const formatted = minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}m` : ""}` : `${minutes}m`;
  return duration.fixedMinutes ? formatted : `From ${formatted}`;
}

function priceLabel(price: ActivityInventoryItem["price"]) {
  if (!price) return null;
  try { return `From ${new Intl.NumberFormat(undefined, { style: "currency", currency: price.currency, maximumFractionDigits: 2 }).format(price.amount)}`; }
  catch { return `From ${price.currency} ${price.amount}`; }
}

export default function LiveActivityInventory({ trip, stop, day, placement, workspace, fallback = null, onSave, onSchedule, onRemove, isPending = () => false, initialItems }: LiveActivityInventoryProps) {
  const [items, setItems] = useState<ActivityInventoryItem[]>(initialItems ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(initialItems ? "ready" : "loading");
  const interests = tripIntentForTrip(trip).preferences.interests;
  const placeMention = trip.brief.structuredBrief?.placeMentions?.find((mention) => mention.canonicalPlaceId === stop.canonicalPlaceId);

  useEffect(() => {
    if (initialItems) { setItems(initialItems); setStatus("ready"); return; }
    if (!stop.canonicalPlaceId) { setItems([]); setStatus("unavailable"); return; }
    const controller = new AbortController();
    setItems([]);
    setStatus("loading");
    void fetch("/api/journey-activity-inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination: {
        canonicalPlaceId: stop.canonicalPlaceId,
        name: stop.name,
        country: stop.country,
        countryCode: stop.countryCode,
        region: stop.region,
        coordinates: stop.latitude !== null && stop.longitude !== null ? { latitude: stop.latitude, longitude: stop.longitude } : undefined,
        aliases: placeMention?.aliases,
        placeType: placeMention?.placeType,
      }, currency: trip.currency }),
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) throw new Error("Activity inventory unavailable");
      return response.json() as Promise<{ activities?: ActivityInventoryItem[] }>;
    }).then((payload) => {
      if (controller.signal.aborted) return;
      setItems(payload.activities ?? []);
      setStatus((payload.activities ?? []).length ? "ready" : "unavailable");
    }).catch((error: unknown) => {
      if ((error as { name?: string })?.name === "AbortError") return;
      setItems([]);
      setStatus("unavailable");
    });
    return () => controller.abort();
  }, [initialItems, placeMention?.aliases, placeMention?.placeType, stop.canonicalPlaceId, stop.country, stop.countryCode, stop.id, stop.latitude, stop.longitude, stop.name, stop.region, trip.currency]);

  const ranked = useMemo(() => rankActivityInventory(items, interests).slice(0, 4), [interests, items]);
  if (status === "loading") return <section className={styles.group}><h4>Things to do</h4><MorroviaSectionStatus title="Finding experiences" detail={`Checking current options around ${stop.name}.`} /></section>;
  if (!ranked.length) return <>{fallback}</>;

  return <section className={styles.group} aria-labelledby={`${workspace}-live-experiences-${stop.id}`}>
    <header><h4 id={`${workspace}-live-experiences-${stop.id}`}>Things to do</h4></header>
    <div className={styles.list}>{ranked.map((item) => {
      const identity = activityInventoryIdentity(item);
      const idea = itineraryIdeaForActivityInventory(stop.id, item, interests);
      const state = ideaStateForPlace(trip, stop.id, identity);
      const pending = isPending(idea);
      const interestReason = idea.reasons.includes("interest-relevance")
        ? itineraryInterestReason({ title: item.title, type: "Experience", tags: item.tags ?? [], description: "" }, interests)
        : null;
      const duration = durationLabel(item.duration);
      const price = priceLabel(item.price);
      const action = item.productUrl ? { provider: "viator", category: "activities", href: item.productUrl, cta: "View on Viator", affiliate: true } as const : null;
      return <article key={identity} data-provider-product-id={item.providerProductId}>
        <ResilientImage className={styles.image} src={item.image} alt="" fallback={<span className={styles.imageFallback}><MapPin aria-hidden="true" /></span>} />
        <div className={styles.copy}><strong>{item.title}</strong><div className={styles.meta}>
          {item.rating !== undefined ? <span><Star aria-hidden="true" />{item.rating.toFixed(1)}{item.reviewCount !== undefined ? ` (${item.reviewCount})` : ""}</span> : null}
          {duration ? <span><Clock3 aria-hidden="true" />{duration}</span> : null}
          {price ? <span>{price}</span> : null}
        </div>{interestReason ? <p>{interestReason}</p> : null}</div>
        <div className={styles.actions}>
          {state.state === "planned" ? <>
            <span className={styles.state}><CheckCircle2 aria-hidden="true" />Day {state.day.dayNumber}{state.idea.dayPart ? ` · ${state.idea.dayPart[0]!.toUpperCase()}${state.idea.dayPart.slice(1)}` : " · Placement to review"}</span>
            {onRemove ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => onRemove(state.idea)}>Remove</EasyTButton> : null}
          </> : <EasyTButton size="small" variant="secondary" disabled={pending} onClick={() => onSchedule(idea)}>Add to Day {day.dayNumber}</EasyTButton>}
          {state.state === "available" ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => onSave(idea)}>Save for later</EasyTButton> : state.state === "saved" ? <span className={styles.state}><CheckCircle2 aria-hidden="true" />Saved for later</span> : null}
          {action ? <MorroviaAffiliateLink action={action} context={{ placement, tripId: trip.id, stopId: stop.id, workspaceView: workspace }} variant="quiet" /> : null}
        </div>
      </article>;
    })}</div>
    <small className={styles.disclosure}>Experiences from Viator · {affiliateDisclosure}</small>
  </section>;
}
