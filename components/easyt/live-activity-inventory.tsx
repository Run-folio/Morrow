"use client";

import { CheckCircle2, Clock3, MapPin, Star } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { affiliateDisclosure, MorroviaAffiliateLink } from "./affiliate-link";
import { EasyTButton, EasyTSelect } from "./easyt-controls";
import { MorroviaSectionStatus } from "./morrovia-loading-states";
import ResilientImage from "./resilient-image";
import { itineraryInterestReason } from "@/lib/easyt/itinerary-day-context";
import { activityInventoryIdentity, itineraryIdeaForActivityInventory, rankActivityInventory, type ActivityInventoryItem } from "@/lib/easyt/activity-inventory";
import { ideaStateForPlace } from "@/lib/easyt/itinerary-ideas";
import { tripIntentForTrip, type EasyTTrip, type ItineraryDayPart, type ItineraryIdea, type PlanItem, type TripStop } from "@/lib/easyt/trip";
import styles from "./live-activity-inventory.module.css";

type LiveActivityInventoryProps = {
  trip: EasyTTrip;
  stop: TripStop;
  day: PlanItem;
  placement: string;
  workspace: "itinerary" | "map";
  fallback?: ReactNode;
  onSave: (idea: ItineraryIdea) => boolean;
  onSchedule: (idea: ItineraryIdea, dayPart?: ItineraryDayPart) => boolean;
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

export default function LiveActivityInventory({ trip, stop, day, placement, workspace, fallback = null, onSave, onSchedule, isPending = () => false, initialItems }: LiveActivityInventoryProps) {
  const [items, setItems] = useState<ActivityInventoryItem[]>(initialItems ?? []);
  const [status, setStatus] = useState<"loading" | "ready" | "unavailable">(initialItems ? "ready" : "loading");
  const [periods, setPeriods] = useState<Record<string, ItineraryDayPart>>({});
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
  if (status === "loading") return <section className={styles.group}><h4>Bookable experiences</h4><MorroviaSectionStatus title="Checking live experiences" detail={`Keeping ${stop.name} and your day unchanged while Viator inventory loads.`} /></section>;
  if (!ranked.length) return <>{fallback}</>;

  return <section className={styles.group} aria-labelledby={`${workspace}-live-experiences-${stop.id}`}>
    <header><div><h4 id={`${workspace}-live-experiences-${stop.id}`}>Bookable experiences</h4><p>Live Viator inventory for {stop.name}. Add only what belongs in your plan.</p></div><span>Provided by Viator</span></header>
    <div className={styles.list}>{ranked.map((item) => {
      const identity = activityInventoryIdentity(item);
      const idea = itineraryIdeaForActivityInventory(stop.id, item, interests);
      const state = ideaStateForPlace(trip, stop.id, identity);
      const pending = isPending(idea);
      const interestReason = itineraryInterestReason({ title: item.title, type: "Experience", tags: item.tags ?? [], description: "" }, interests);
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
          {state.state === "planned" ? <span className={styles.state}><CheckCircle2 aria-hidden="true" />Added to Day {state.day.dayNumber}</span> : <>
            <EasyTButton size="small" variant="secondary" disabled={pending} onClick={() => onSchedule(idea, periods[identity])}>Add to Day {day.dayNumber}</EasyTButton>
            <EasyTSelect fieldClassName={styles.period} label={`Period for ${item.title}`} value={periods[identity] ?? ""} onChange={(event) => setPeriods((current) => ({ ...current, [identity]: event.target.value as ItineraryDayPart }))}>
              <option value="">Auto period</option><option value="morning">Morning</option><option value="midday">Midday</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option>
            </EasyTSelect>
          </>}
          {state.state === "available" ? <EasyTButton size="small" variant="quiet" disabled={pending} onClick={() => onSave(idea)}>Save</EasyTButton> : state.state === "saved" ? <span className={styles.state}><CheckCircle2 aria-hidden="true" />Saved</span> : null}
          {action ? <MorroviaAffiliateLink action={action} context={{ placement, tripId: trip.id, stopId: stop.id, workspaceView: workspace }} variant="quiet" /> : null}
        </div>
      </article>;
    })}</div>
    <small className={styles.disclosure}>{affiliateDisclosure}</small>
  </section>;
}
