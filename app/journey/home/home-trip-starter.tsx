"use client";

import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import styles from "./home.module.css";

type CapturedMention = { sourceText: string; canonicalName: string; role: "origin" | "stop"; order: number; status: "resolved" | "unresolved"; country?: string; coordinates?: [number, number]; kind?: string; intent: "place" | "landmark"; locality?: string };
type Capture = { rawBrief: string; parserVersion: string; durationDays?: number; regions: string[]; routeHints: string[]; mentions: CapturedMention[] };

const copy = {
  en: {
    briefLabel: "YOUR TRIP BRIEF", briefPlaceholder: "For example: Two weeks in Japan this October — Tokyo, Kyoto and time in the Japanese Alps.", continue: "Make my plan", checking: "Understanding your trip…", startersLabel: "SHAPE THE PLAN", starters: ["Keep travel days light", "Make food a daily anchor", "Mix cities with time outdoors"], newTrip: "New trip", routes: "See featured routes",
  },
  es: {
    briefLabel: "TU IDEA DE VIAJE", briefPlaceholder: "Por ejemplo: Dos semanas en Japón este octubre — Tokio, Kioto y tiempo en los Alpes japoneses.", continue: "Crear mi plan", checking: "Entendiendo tu viaje…", startersLabel: "DA FORMA AL PLAN", starters: ["Días de viaje ligeros", "La comida como hilo conductor", "Ciudades y tiempo al aire libre"], newTrip: "Nuevo viaje", routes: "Ver rutas destacadas",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + Math.max(0, days - 1)); return iso(date); }
export default function HomeTripStarter() {
  const router = useRouter();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [brief, setBrief] = useState("");
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const text = copy[language];
  const addShape = (shape: string) => setBrief((current) => current.trim() ? `${current.trim()} ${shape}.` : `${shape}.`);

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!brief.trim()) return;
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_brief: true });
    setLoading(true);
    setCaptureError("");
    try {
      const response = await fetch("/api/journey-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief }) });
      const payload = await response.json() as Capture & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Capture failed");
      const unresolvedCount = payload.mentions.filter((mention) => mention.status === "unresolved").length;
      trackEvent("easyt_trip_capture_reviewed", { source: "homepage_builder", parser_version: payload.parserVersion, place_count: payload.mentions.length, unresolved_count: unresolvedCount, region_count: payload.regions.length, has_duration: Boolean(payload.durationDays) });
      if (unresolvedCount) trackEvent("easyt_trip_capture_place_unresolved", { source: "homepage_builder", unresolved_count: unresolvedCount });
      const proposedEndDate = payload.durationDays ? addDays(startDate, payload.durationDays) : endDate;
      window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({ locationMentions: payload.mentions, routeHints: payload.routeHints, regions: payload.regions, parserVersion: payload.parserVersion, startDate, endDate: proposedEndDate, brief: payload.rawBrief }));
      router.push("/journey/new?homeDraft=1");
    } catch {
      setCaptureError(language === "es" ? "No pudimos entender tu viaje. Inténtalo de nuevo." : "We couldn't understand your trip. Please try again.");
      trackEvent("easyt_trip_capture_failed", { source: "homepage_builder" });
    } finally {
      setLoading(false);
    }
  };

  return <form id="start-building" className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={styles.startBuilderBrief}>
      <span>{text.briefLabel}</span>
      <div className={styles.startBuilderPromptField}>
        <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
        <div className={styles.startBuilderPromptAction}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
      </div>
      <div className={styles.shapePlan}>
        <span className={styles.shapePlanLabel}>{text.startersLabel}</span>
        <div className={styles.shapePlanChoices}>{text.starters.map((shape) => <button type="button" key={shape} onClick={() => addShape(shape)}><Sparkles aria-hidden="true" /> {shape}</button>)}</div>
      </div>
    </div>
    {captureError ? <p className={styles.captureError} role="alert">{captureError}</p> : null}
    <div className={styles.startBuilderSecondary}><Link href="/journey/new"><Plus aria-hidden="true" /> {text.newTrip}</Link><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
