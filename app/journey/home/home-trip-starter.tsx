"use client";

import { ArrowRight, CalendarDays, ChevronDown, MapPin, Plane } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { Calendar } from "../new/trip-builder";
import builderStyles from "../new/trip-builder.module.css";
import styles from "./home.module.css";

type GeocodeResult = { name?: string; country?: string; coordinates?: [number, number] };

const copy = {
  en: {
    eyebrow: "Start a real trip", title: "Where next?", intro: "Begin with the basics. You can shape every stop, day and detail in the builder.", from: "Leaving from", fromPlaceholder: "City or airport", to: "Going to", toPlaceholder: "City, region or landmark", startDate: "Start date", endDate: "End date", typeIt: "Or type it", continue: "Start building", checking: "Checking your route…", error: "We could not find both places. Try a city, region or airport.", samePlace: "Choose a different starting point and destination.", dateError: "Choose an end date after your start date.",
  },
  es: {
    eyebrow: "Empieza un viaje real", title: "¿Adónde?", intro: "Empieza con lo básico. Podrás dar forma a cada parada, día y detalle en el creador.", from: "Sales de", fromPlaceholder: "Ciudad o aeropuerto", to: "Vas a", toPlaceholder: "Ciudad, región o lugar", startDate: "Fecha de inicio", endDate: "Fecha de fin", typeIt: "O escríbela", continue: "Empezar a crear", checking: "Comprobando tu ruta…", error: "No pudimos encontrar ambos lugares. Prueba una ciudad, región o aeropuerto.", samePlace: "Elige un punto de partida y destino diferentes.", dateError: "Elige una fecha de fin posterior a la fecha de inicio.",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function formatDate(value: string, language: EasyTLanguage) {
  return new Intl.DateTimeFormat(language === "es" ? "es" : "en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

export default function HomeTripStarter() {
  const router = useRouter();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [picker, setPicker] = useState<"start" | "end" | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const text = copy[language];
  const dateMin = useMemo(() => startDate, [startDate]);

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
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_origin: Boolean(origin.trim()), has_destination: Boolean(destination.trim()) });
    setError("");
    if (endDate <= startDate) { setError(text.dateError); return; }
    if (origin.trim().toLowerCase() === destination.trim().toLowerCase()) { setError(text.samePlace); return; }
    setLoading(true);
    try {
      const [resolvedOrigin, resolvedDestination] = await Promise.all([resolve(origin), resolve(destination)]);
      if (!resolvedOrigin?.coordinates || !resolvedDestination?.coordinates || !resolvedDestination.country) {
        setError(text.error);
        return;
      }
      window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({
        origin: resolvedOrigin.name?.split(",")[0]?.trim() || origin.trim(),
        originCoordinates: resolvedOrigin.coordinates,
        destination: {
          id: `${(resolvedDestination.name || destination).toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
          name: resolvedDestination.name?.split(",")[0]?.trim() || destination.trim(),
          country: resolvedDestination.country,
          coordinates: resolvedDestination.coordinates,
        },
        startDate,
        endDate,
      }));
      router.push("/journey/new?homeDraft=1");
    } catch {
      setError(text.error);
    } finally {
      setLoading(false);
    }
  };

  return <form className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={styles.startBuilderIntro}><p>{text.eyebrow}</p><h2>{text.title}</h2><span>{text.intro}</span></div>
    <label><span><Plane aria-hidden="true" /> {text.from}</span><input required value={origin} onChange={(event) => setOrigin(event.target.value)} placeholder={text.fromPlaceholder} /></label>
    <label><span><MapPin aria-hidden="true" /> {text.to}</span><input required value={destination} onChange={(event) => setDestination(event.target.value)} placeholder={text.toPlaceholder} /></label>
    <div className={`${styles.homeDateField} ${builderStyles.dateRow}`}>
      {([
        { key: "start" as const, label: text.startDate, value: startDate, set: (value: string) => { setStartDate(value); if (value > endDate) setEndDate(value); } },
        { key: "end" as const, label: text.endDate, value: endDate, set: (value: string) => setEndDate(value < dateMin ? dateMin : value) },
      ]).map((field) => <div key={field.key} className={styles.homeDateControl}>
        <span className={styles.homeDateLabel}><CalendarDays aria-hidden="true" /> {field.label}</span>
        <button type="button" className={styles.homeDateTrigger} aria-expanded={picker === field.key} onClick={() => setPicker(picker === field.key ? null : field.key)}>
          <span>{formatDate(field.value, language)}</span><ChevronDown aria-hidden="true" />
        </button>
        {picker === field.key ? <div className={`${styles.homeDatePopover} ${builderStyles.popover}`}>
          <Calendar language={language} value={field.value} onPick={(value) => { field.set(value); setPicker(null); }} />
          <label className={builderStyles.typeIt}>{text.typeIt}<input defaultValue={formatDate(field.value, language)} onChange={(event) => { const value = new Date(event.target.value); if (!Number.isNaN(value.getTime())) field.set(iso(value)); }} /></label>
        </div> : null}
      </div>)}
    </div>
    <div className={styles.startBuilderAction}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button>{error ? <small className={styles.startBuilderError}>{error}</small> : null}</div>
  </form>;
}
