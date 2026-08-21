"use client";

import Link from "next/link";
import { ArrowRight, CalendarDays, Map, MapPin, Plane, Route, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

import EasyTNavigation from "../easyt-navigation";
import { JourneyTripQuality } from "@/components/journey-trip-quality";
import { JourneyTripReadiness } from "@/components/journey-trip-readiness";
import { JourneyBookingReadiness } from "@/components/journey-booking-readiness";
import { JourneyTripPrepAccommodation } from "@/components/journey-trip-prep-accommodation";
import { loadActiveTrip, loadTripFromEasyT } from "@/lib/easyt/storage";
import type { EasyTTrip } from "@/lib/easyt/trip";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import JourneyLoading from "../loading";
import styles from "./trip-prep.module.css";
import editorial from "../surface-editorial.module.css";

export default function TripPrepClient() {
  const [trip, setTrip] = useState<EasyTTrip | null>(null);
  const [tripResolved, setTripResolved] = useState(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    let active = true;
    setLanguage(languageFromStorage());
    const id = new URLSearchParams(window.location.search).get("trip");
    void (async () => {
      const cloud = id ? await loadTripFromEasyT(id).catch(() => null) : null;
      const local = loadActiveTrip();
      if (!active) return;
      setTrip(cloud ?? (local && (!id || local.id === id) ? local : null));
      setTripResolved(true);
    })();
    return () => { active = false; };
  }, []);
  if (!tripResolved) return <JourneyLoading />;
  if (!trip) return <main className={`${styles.page} ${editorial.surface} ${editorial.prep} morrovia-editorial-page`}><EasyTNavigation current="home" /><section className={styles.empty}><p>TRIP PREP</p><h1>Choose a trip first.</h1><span>Once you have a route, its practical preparation will live here.</span><Link href="/journey/dashboard">See your trips <ArrowRight /></Link></section></main>;
  const mapHref = `/journey/plan?trip=${encodeURIComponent(trip.id)}`;
  const builderHref = `/journey/new?trip=${encodeURIComponent(trip.id)}&view=itinerary`;
  const mentions = trip.brief.capturedIntent?.mentions ?? trip.stops.map((stop, order) => ({ sourceText: stop.name, canonicalName: stop.name, role: "stop" as const, status: "resolved" as const, order }));
  return <main className={`${styles.page} ${editorial.surface} ${editorial.prep} morrovia-editorial-page`}>
    <EasyTNavigation current="home" />
    <section className={styles.hero}>
      <div><p>YOUR TRIP · PRACTICALS</p><h1>{trip.title}</h1><span>{trip.startDate} → {trip.endDate} · {trip.stops.map((stop) => stop.name).join(" · ")}</span></div>
      <div className={styles.switcher}><Link href={mapHref}><Map />{language === "es" ? "Plan en mapa" : "Map plan"}</Link><span><ShieldCheck />{language === "es" ? "Preparación" : "Trip prep"}</span></div>
    </section>
    <section className={styles.summary}><article><CalendarDays /><small>DATES</small><strong>{trip.startDate} → {trip.endDate}</strong></article><article><Plane /><small>DEPARTURE</small><strong>{trip.brief.origin || "Add departure"}</strong></article><article><Route /><small>ROUTE</small><strong>{trip.stops.length} stops · {new Set(trip.stops.map((stop) => stop.country)).size} countries</strong></article></section>
    <section className={styles.content}>
      <div className={styles.main}><JourneyTripQuality origin={trip.brief.origin} originCoordinates={trip.brief.originCoordinates} startDate={trip.startDate} endDate={trip.endDate} stops={trip.stops} mentions={mentions} language={language} /><JourneyTripPrepAccommodation trip={trip} /><JourneyBookingReadiness trip={trip} language={language} excludeCategories={["accommodation"]} /><JourneyTripReadiness countries={trip.stops.map((stop) => stop.country)} startDate={trip.startDate} language={language} hideConnectivity /></div>
      <aside className={styles.side}><p>MAKE IT USEFUL</p><h2>Plan first. Prepare once the route is real.</h2><span>Entry guidance, connectivity and the practical decisions belong here—not in the route builder.</span><Link href={builderHref}>Edit the route <MapPin /></Link><Link href={mapHref}>Open map plan <Map /></Link></aside>
    </section>
  </main>;
}
