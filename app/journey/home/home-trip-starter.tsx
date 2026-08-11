"use client";

import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { parseTripBrief } from "@/lib/easyt/trip-brief";
import { trackEvent } from "@/lib/analytics";
import styles from "./home.module.css";

type GeocodeResult = { name?: string; country?: string; coordinates?: [number, number] };
type DraftDestination = { id: string; name: string; country: string; coordinates: [number, number] };

const copy = {
  en: {
    briefLabel: "YOUR TRIP BRIEF", briefPlaceholder: "For example: Two weeks in Japan this October — Tokyo, Kyoto and time in the Japanese Alps.", continue: "Make my plan", checking: "Opening your plan…", startersLabel: "SHAPE THE PLAN", starters: ["Keep travel days light", "Make food a daily anchor", "Mix cities with time outdoors"], newTrip: "New trip", routes: "See featured routes",
  },
  es: {
    briefLabel: "TU IDEA DE VIAJE", briefPlaceholder: "Por ejemplo: Dos semanas en Japón este octubre — Tokio, Kioto y tiempo en los Alpes japoneses.", continue: "Crear mi plan", checking: "Abriendo tu plan…", startersLabel: "DA FORMA AL PLAN", starters: ["Días de viaje ligeros", "La comida como hilo conductor", "Ciudades y tiempo al aire libre"], newTrip: "Nuevo viaje", routes: "Ver rutas destacadas",
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
  const addShape = (shape: string) => setBrief((current) => current.trim() ? `${current.trim()} ${shape}.` : `${shape}.`);

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
      const destinationsToResolve = [...new Set((destination.trim() ? [proposedDestination, ...parsed.stops] : [...parsed.stops, proposedDestination]).filter(Boolean))];
      const [resolvedOrigin, ...resolvedDestinations] = await Promise.all([
        proposedOrigin ? resolve(proposedOrigin).catch(() => null) : Promise.resolve(null),
        ...destinationsToResolve.map((place) => resolve(place).catch(() => null)),
      ]);
      const destinations: DraftDestination[] = resolvedDestinations.flatMap((result, index) => {
        if (!result?.coordinates || !result.country) return [];
        const name = result.name?.split(",")[0]?.trim() || destinationsToResolve[index];
        return [{
          id: `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}`,
          name,
          country: result.country,
          coordinates: result.coordinates,
        }];
      });
      window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({
        origin: resolvedOrigin?.name?.split(",")[0]?.trim() || proposedOrigin || undefined,
        originCoordinates: resolvedOrigin?.coordinates,
        // Keep every explicitly mentioned place. The builder can then show a
        // real Tokyo → Kyoto starting route instead of silently keeping only
        // the final city in the sentence.
        destinations,
        routeHints: parsed.routeHints,
        startDate,
        endDate: proposedEndDate,
        brief: brief.trim(),
      }));
      router.push("/journey/new?homeDraft=1");
    } finally {
      setLoading(false);
    }
  };

  return <form id="start-building" className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={styles.startBuilderBrief}>
      <span>{text.briefLabel}</span>
      <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
      <div className={styles.startBuilderPromptAction}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
      <div className={styles.shapePlan}>
        <span className={styles.shapePlanLabel}>{text.startersLabel}</span>
        <div className={styles.shapePlanChoices}>{text.starters.map((shape) => <button type="button" key={shape} onClick={() => addShape(shape)}><Sparkles aria-hidden="true" /> {shape}</button>)}</div>
      </div>
    </div>
    <div className={styles.startBuilderSecondary}><Link href="/journey/new"><Plus aria-hidden="true" /> {text.newTrip}</Link><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
