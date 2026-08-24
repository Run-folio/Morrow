"use client";

import { Check, CircleAlert, MapPin, Plus, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { reviewTripQuality, type TripQualityMention, type TripQualityStop } from "@/lib/easyt/trip-quality";
import type { TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import styles from "./journey-trip-quality.module.css";

export function JourneyTripQuality({ ownerId, origin, originCoordinates, startDate, endDate, stops, mentions, language = "en", onAddMissingPlace, onReviewOrigin, onReviewDates, onReviewTraveller }: {
  ownerId?: string | null;
  origin?: string;
  originCoordinates?: [number, number];
  startDate?: string;
  endDate?: string;
  stops: TripQualityStop[];
  mentions: TripQualityMention[];
  language?: "en" | "es";
  onAddMissingPlace?: (place: string) => void;
  onReviewOrigin?: () => void;
  onReviewDates?: () => void;
  onReviewTraveller?: () => void;
}) {
  const [profile, setProfile] = useState<TravelReadinessProfile | null>(null);
  useEffect(() => {
    try { setProfile(JSON.parse(window.localStorage.getItem(travelReadinessStorageKey(ownerId)) ?? "null")); } catch { setProfile(null); }
  }, [ownerId]);
  const checks = useMemo(() => reviewTripQuality({ origin, originCoordinates, startDate, endDate, stops, mentions, travellerReady: Boolean(profile?.nationalities?.length && profile.residenceCountry) }), [origin, originCoordinates, startDate, endDate, stops, mentions, profile]);
  const complete = checks.filter((check) => check.state === "complete").length;
  const copy = language === "es"
    ? { eyebrow: "CONTROL DEL PLAN", title: "Nada importante se pierde en el camino.", status: `${complete} de ${checks.length} comprobaciones listas`, all: "Todo lo que pediste está en el plan." }
    : { eyebrow: "PLAN CHECK", title: "Nothing important gets lost on the way.", status: `${complete} of ${checks.length} checks ready`, all: "Everything you asked for is in the plan." };
  const actionFor = (id: string) => id === "origin" ? onReviewOrigin : id === "dates" ? onReviewDates : id === "traveller-details" ? onReviewTraveller : undefined;
  return <section className={styles.panel} aria-label={copy.eyebrow}>
    <div className={styles.heading}><div><p>{copy.eyebrow}</p><h2>{copy.title}</h2></div><span>{copy.status}</span></div>
    <div className={styles.list}>{checks.map((check) => <article key={check.id} className={check.state === "complete" ? styles.complete : check.state === "missing" ? styles.missing : styles.attention}>
      {check.state === "complete" ? <Check aria-hidden="true" /> : check.id === "traveller-details" ? <UserRound aria-hidden="true" /> : check.id === "origin" ? <MapPin aria-hidden="true" /> : <CircleAlert aria-hidden="true" />}
      <div><strong>{check.title}</strong><p>{check.detail}</p>{check.missingPlaces?.length ? <div className={styles.missingPlaces}>{check.missingPlaces.map((place) => <button type="button" key={place} onClick={() => onAddMissingPlace?.(place)}><Plus aria-hidden="true" />{place}</button>)}</div> : null}{check.state !== "complete" && actionFor(check.id) ? <button type="button" className={styles.reviewButton} onClick={actionFor(check.id)}>{language === "es" ? "Revisar" : "Review"}</button> : null}</div>
    </article>)}</div>
  </section>;
}
