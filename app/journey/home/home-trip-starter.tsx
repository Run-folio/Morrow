"use client";

import { ArrowRight, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import { appendVoiceTranscript, VoiceTripBrief } from "@/components/easyt/voice-trip-brief";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

type CapturedMention = { sourceText: string; canonicalName: string; role: "origin" | "stop"; order: number; status: "resolved" | "unresolved"; country?: string; coordinates?: [number, number]; kind?: string; intent: "place" | "landmark"; locality?: string };
type Capture = { rawBrief: string; parserVersion: string; durationDays?: number; regions: string[]; routeHints: string[]; mentions: CapturedMention[] };

const copy = {
  en: {
    briefLabel: "TELL US ABOUT YOUR TRIP", briefPlaceholder: "Describe where you want to go, how long you have, and what matters to you. Add any must-see places, dates, interests or travel preferences.", continue: "Plan my trip", checking: "Understanding your trip…", travelStyle: "YOUR TRAVEL STYLE", edit: "Edit", routes: "Explore multi-country routes",
  },
  es: {
    briefLabel: "CUÉNTANOS SOBRE TU VIAJE", briefPlaceholder: "Estoy pensando en Japón y Corea del Sur durante unas dos semanas. Tokio y los Alpes japoneses, después Seúl y Busan. Nos gusta comer bien y pasar tiempo al aire libre.", continue: "Planificar mi viaje", checking: "Entendiendo tu viaje…", travelStyle: "TU ESTILO DE VIAJE", edit: "Editar", routes: "Explorar rutas multicountry",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
function addDays(value: string, days: number) { const date = new Date(`${value}T00:00:00`); date.setDate(date.getDate() + Math.max(0, days - 1)); return iso(date); }
function travelStyleLabels(profile: TravelProfile, language: EasyTLanguage) {
  const labels = language === "es"
    ? {
        pace: { slow: "Ritmo tranquilo", balanced: "Ritmo equilibrado", full: "Días completos" },
        priority: { food: "Gastronomía", nature: "Naturaleza", culture: "Cultura", mix: "Un poco de todo" },
        hotelMoves: { few: "Pocas mudanzas de hotel", some: "Algunos cambios de base", open: "Abierto a moverse" },
        budget: { value: "Buena relación calidad-precio", mid: "Gama media", high: "Lo mejor disponible" },
      }
    : {
        pace: { slow: "Slow pace", balanced: "Balanced pace", full: "Full days" },
        priority: { food: "Food", nature: "Nature", culture: "Culture", mix: "A mix" },
        hotelMoves: { few: "Fewer hotel moves", some: "A few hotel moves", open: "Open to moving" },
        budget: { value: "Good value", mid: "Mid-range", high: "Best available" },
      };
  return [labels.pace[profile.pace], labels.priority[profile.priority], labels.hotelMoves[profile.hotelMoves], labels.budget[profile.budget]];
}
export default function HomeTripStarter() {
  const router = useRouter();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [brief, setBrief] = useState("");
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const text = copy[language];
  useEffect(() => {
    setLanguage(languageFromStorage());
    try {
      const savedProfile = JSON.parse(window.localStorage.getItem("easyt-travel-profile") ?? "null");
      setTravelProfile(isTravelProfile(savedProfile) ? savedProfile : null);
    } catch { setTravelProfile(null); }
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tripBrief = brief.trim();
    if (!tripBrief) return;
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_brief: true });
    setLoading(true);
    setCaptureError("");
    try {
      const response = await fetch("/api/journey-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: tripBrief }) });
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
        <div className={fidelity.promptTextareaField}>
          <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
          <VoiceTripBrief className={fidelity.voiceInput} language={language} onTranscript={(transcript) => setBrief((current) => appendVoiceTranscript(current, transcript))} />
        </div>
        <div className={fidelity.promptFooter}>
          {travelProfile && <section className={fidelity.travelStyle} aria-label={text.travelStyle}>
            <div className={fidelity.travelStyleHead}><span>{text.travelStyle}</span><a href="/journey/profile">{text.edit}</a></div>
            <div className={fidelity.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
          </section>}
          <div className={`${styles.startBuilderPromptAction} ${fidelity.promptAction}`}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
        </div>
      </div>
    </div>
    {captureError ? <p className={styles.captureError} role="alert">{captureError}</p> : null}
    <div className={styles.startBuilderSecondary}><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
