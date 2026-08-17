"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

type CapturedMention = { sourceText: string; canonicalName: string; role: "origin" | "stop"; order: number; status: "resolved" | "unresolved"; country?: string; coordinates?: [number, number]; kind?: string; intent: "place" | "landmark"; locality?: string };
type Capture = { rawBrief: string; parserVersion: string; durationDays?: number; regions: string[]; routeHints: string[]; mentions: CapturedMention[] };

const copy = {
  en: {
    briefLabel: "TELL US THE SHAPE OF YOUR TRIP", briefPlaceholder: "For example: Two weeks in Japan in October — Tokyo, Kyoto and time outdoors.", continue: "Make my first route", checking: "Understanding your trip…", startersLabel: "SHAPE THE PLAN", starters: ["Keep travel days light", "Make food a daily anchor", "Mix cities with time outdoors"], newTrip: "New trip", routes: "Explore multi-country routes",
  },
  es: {
    briefLabel: "CUÉNTANOS LA FORMA DE TU VIAJE", briefPlaceholder: "Por ejemplo: Dos semanas en Japón en octubre: Tokio, Kioto y tiempo al aire libre.", continue: "Crear mi primera ruta", checking: "Entendiendo tu viaje…", startersLabel: "DA FORMA AL PLAN", starters: ["Días de viaje ligeros", "La comida como hilo conductor", "Ciudades y tiempo al aire libre"], newTrip: "Nuevo viaje", routes: "Explorar rutas multicountry",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + Math.max(0, days - 1)); return iso(date); }
export default function HomeTripStarter() {
  const router = useRouter();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [brief, setBrief] = useState("");
  const [selectedShapes, setSelectedShapes] = useState<string[]>([]);
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const text = copy[language];
  const toggleShape = (shape: string) => setSelectedShapes((current) => current.includes(shape) ? current.filter((item) => item !== shape) : [...current, shape]);

  useEffect(() => {
    setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const shapedBrief = [brief.trim(), selectedShapes.length ? `Preferences: ${selectedShapes.join("; ")}.` : ""].filter(Boolean).join(" ");
    if (!shapedBrief) return;
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_brief: true });
    setLoading(true);
    setCaptureError("");
    try {
      const response = await fetch("/api/journey-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: shapedBrief }) });
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
    <div className={`${styles.startBuilderBrief} ${fidelity.promptCard}`}>
      <span>{text.briefLabel}</span>
      <div className={`${styles.startBuilderPromptField} ${fidelity.promptField}`}>
        <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
        <div className={fidelity.promptFooter}>
          <div className={fidelity.shapePlan}>
            <span className={fidelity.shapePlanLabel}>{text.startersLabel}</span>
            <div className={fidelity.shapeChoices}>{text.starters.map((shape) => <button className={fidelity.shapeChoice} type="button" key={shape} aria-pressed={selectedShapes.includes(shape)} onClick={() => toggleShape(shape)}><Sparkles aria-hidden="true" /> {shape}</button>)}</div>
          </div>
          <div className={`${styles.startBuilderPromptAction} ${fidelity.promptAction}`}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
        </div>
      </div>
    </div>
    {captureError ? <p className={styles.captureError} role="alert">{captureError}</p> : null}
    <div className={styles.startBuilderSecondary}><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
