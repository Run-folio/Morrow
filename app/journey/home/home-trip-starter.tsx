"use client";

import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { parseTripBrief } from "@/lib/easyt/trip-brief";
import { trackEvent } from "@/lib/analytics";
import styles from "./home.module.css";

type GeocodeResult = { name?: string; country?: string; coordinates?: [number, number] };

const copy = {
  en: {
    eyebrow: "Start with the why", title: "What are you trying to make happen?", intro: "Tell us the occasion, places, timing, budget or anything that matters. We will carry it into your plan.", briefLabel: "Your trip brief", briefPlaceholder: "For example: We have three weeks in Japan, a marathon in Tokyo, and want to finish in Hong Kong without rushing.", continue: "Turn this into a plan", checking: "Opening your plan…",
  },
  es: {
    eyebrow: "Empieza por el porqué", title: "¿Qué quieres hacer realidad?", intro: "Cuéntanos la ocasión, los lugares, las fechas, el presupuesto o lo que importe. Lo llevaremos a tu plan.", briefLabel: "Tu idea de viaje", briefPlaceholder: "Por ejemplo: Tenemos tres semanas en Japón, una maratón en Tokio y queremos terminar en Hong Kong sin prisas.", continue: "Convertirlo en un plan", checking: "Abriendo tu plan…",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + Math.max(0, days - 1)); return iso(date); }
export default function HomeTripStarter() {
  const router = useRouter();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [brief, setBrief] = useState("");
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const text = copy[language];

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const resolve = async (place: string) => {
    const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(place.trim())}`);
    const payload = await response.json() as { result?: GeocodeResult | null };
    return payload.result;
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseTripBrief(brief);
    const proposedOrigin = origin.trim() || parsed.origin || "";
    const proposedDestination = destination.trim() || parsed.destination || parsed.stops[0] || "";
    const proposedEndDate = parsed.durationDays ? addDays(startDate, parsed.durationDays) : endDate;
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_brief: Boolean(brief.trim()), has_origin: Boolean(origin.trim()), has_destination: Boolean(destination.trim()) });
    setLoading(true);
    try {
      const [resolvedOrigin, resolvedDestination] = await Promise.all([
        proposedOrigin ? resolve(proposedOrigin).catch(() => null) : Promise.resolve(null),
        proposedDestination ? resolve(proposedDestination).catch(() => null) : Promise.resolve(null),
      ]);
      window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({
        origin: resolvedOrigin?.name?.split(",")[0]?.trim() || proposedOrigin || undefined,
        originCoordinates: resolvedOrigin?.coordinates,
        destination: resolvedDestination?.coordinates && resolvedDestination.country ? {
          id: `${(resolvedDestination.name || proposedDestination).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
          name: resolvedDestination.name?.split(",")[0]?.trim() || proposedDestination,
          country: resolvedDestination.country,
          coordinates: resolvedDestination.coordinates,
        } : undefined,
        startDate,
        endDate: proposedEndDate,
        brief: brief.trim(),
      }));
      router.push("/journey/new?homeDraft=1");
    } finally {
      setLoading(false);
    }
  };

  return <form className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={styles.startBuilderIntro}><p>{text.eyebrow}</p><h2>{text.title}</h2><span>{text.intro}</span></div>
    <div className={styles.startBuilderBrief}>
      <span>{text.briefLabel}</span>
      <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
    </div>
    <div className={styles.startBuilderAction}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
  </form>;
}
