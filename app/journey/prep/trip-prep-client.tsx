"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CalendarDays, Map, MapPin, Plane, Route, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import EasyTNavigation from "../easyt-navigation";
import TripPrepWorkspace from "@/components/easyt/trip-prep-workspace";
import { cacheCanonicalTrip, canUseHydratedTripScope, loadActiveTrip, loadLocalTrip, loadTripFromEasyT } from "@/lib/easyt/storage";
import { requestedTripMatch } from "@/lib/easyt/trip-id-resolution";
import { authClient } from "@/lib/auth-client";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import JourneyLoading from "../loading";
import styles from "./trip-prep.module.css";
import editorial from "../surface-editorial.module.css";

export default function TripPrepClient() {
  const searchParams = useSearchParams();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const visibleOwnerId = session?.user?.id ?? null;
  const tripId = searchParams.get("trip");
  const documentIdentity = JSON.stringify([visibleOwnerId, tripId]);
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [hydratedOwnerScope, setHydratedOwnerScope] = useState<string | null | undefined>(undefined);
  const [hydratedDocumentIdentity, setHydratedDocumentIdentity] = useState<string | undefined>(undefined);
  const [tripResolved, setTripResolved] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    let active = true;
    setLanguage(languageFromStorage());
    setTripResolved(false);
    setHydratedOwnerScope(undefined);
    setHydratedDocumentIdentity(undefined);
    if (sessionPending) return () => { active = false; };
    void (async () => {
      const cloud = tripId ? await loadTripFromEasyT(tripId).catch(() => null) : null;
      const local = tripId ? loadLocalTrip(tripId, visibleOwnerId) : loadActiveTrip(visibleOwnerId);
      if (!active) return;
      const resolved = cloud ?? requestedTripMatch(tripId ?? local?.id ?? "", local, session?.user?.id);
      if (cloud) cacheCanonicalTrip(cloud);
      setHydratedOwnerScope(cloud?.ownerId ?? visibleOwnerId);
      setHydratedDocumentIdentity(documentIdentity);
      setTrip(resolved);
      setTripResolved(true);
    })();
    return () => { active = false; };
  }, [documentIdentity, session?.user?.id, sessionPending, tripId, visibleOwnerId]);
  const documentScopeMismatch = Boolean(trip
    && (!canUseHydratedTripScope(hydratedOwnerScope, visibleOwnerId)
      || hydratedDocumentIdentity !== documentIdentity));
  if (sessionPending || !tripResolved || documentScopeMismatch) return <JourneyLoading />;
  if (!trip) return <main className={`${styles.page} ${editorial.surface} ${editorial.prep} morrovia-editorial-page`}><EasyTNavigation current="home" /><section className={styles.empty}><p>TRIP PREP</p><h1>Choose a trip first.</h1><span>Once you have a route, its practical preparation will live here.</span><Link href="/journey/dashboard">See your trips <ArrowRight /></Link></section></main>;
  const mapHref = `/journey/plan?trip=${encodeURIComponent(trip.id)}`;
  const builderHref = `/journey/new?trip=${encodeURIComponent(trip.id)}&view=itinerary`;
  return <main className={`${styles.page} ${editorial.surface} ${editorial.prep} morrovia-editorial-page`}>
    <EasyTNavigation current="home" />
    <section className={styles.hero}>
      <div><p>YOUR TRIP · PRACTICALS</p><h1>{trip.title}</h1><span>{trip.startDate} → {trip.endDate} · {trip.stops.map((stop) => stop.name).join(" · ")}</span></div>
      <div className={styles.switcher}><Link href={mapHref}><Map />{language === "es" ? "Plan en mapa" : "Map plan"}</Link><span><ShieldCheck />{language === "es" ? "Preparación" : "Trip prep"}</span></div>
    </section>
    <section className={styles.summary}><article><CalendarDays /><small>DATES</small><strong>{trip.startDate} → {trip.endDate}</strong></article><article><Plane /><small>DEPARTURE</small><strong>{trip.brief.origin || "Add departure"}</strong></article><article><Route /><small>ROUTE</small><strong>{trip.stops.length} stops · {new Set(trip.stops.map((stop) => stop.country)).size} countries</strong></article></section>
    <section className={styles.content}>
      <div className={styles.main}><TripPrepWorkspace trip={trip} language={language} presentation="legacy" /></div>
      <aside className={styles.side}><p>MAKE IT USEFUL</p><h2>Plan first. Prepare once the route is real.</h2><span>Entry guidance, connectivity and the practical decisions belong here, not in the route builder.</span><Link href={builderHref}>Edit the route <MapPin /></Link><Link href={mapHref}>Open map plan <Map /></Link></aside>
    </section>
  </main>;
}
