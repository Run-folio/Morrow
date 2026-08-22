"use client";

import { ArrowRight, CalendarDays, Heart, Sparkles, UsersRound } from "lucide-react";
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
    briefLabel: "TELL US ABOUT YOUR TRIP", briefPlaceholder: "Describe where you want to go, how long you have, and what matters to you. Add any must-see places, dates, interests or travel preferences.", continue: "Plan my trip", checking: "Understanding your trip…", travelStyle: "YOUR TRAVEL STYLE", edit: "Edit", routes: "Explore multi-country routes", dates: "Add dates", travellers: "Travellers", interests: "Interests", startDate: "Start date", endDate: "End date", interestLabel: "What matters most?", food: "Food", culture: "Culture", nature: "Nature", cities: "Cities", beach: "Beach", hiking: "Hiking",
  },
  es: {
    briefLabel: "CUÉNTANOS SOBRE TU VIAJE", briefPlaceholder: "Describe tu viaje...", continue: "Planificar mi viaje", checking: "Entendiendo tu viaje…", travelStyle: "TU ESTILO DE VIAJE", edit: "Editar", routes: "Explorar rutas multicountry", dates: "Añadir fechas", travellers: "Viajeros", interests: "Intereses", startDate: "Fecha de salida", endDate: "Fecha de regreso", interestLabel: "¿Qué te importa más?", food: "Comida", culture: "Cultura", nature: "Naturaleza", cities: "Ciudades", beach: "Playa", hiking: "Senderismo",
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
  const [travellers, setTravellers] = useState(2);
  const [interests, setInterests] = useState<string[]>([]);
  const [attributePanel, setAttributePanel] = useState<"dates" | "travellers" | "interests" | null>(null);
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
      window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({ locationMentions: payload.mentions, routeHints: payload.routeHints, regions: payload.regions, parserVersion: payload.parserVersion, startDate, endDate: proposedEndDate, travellers, interests, brief: payload.rawBrief }));
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
        </div>
        <div className={fidelity.promptAttributes}>
          <div className={fidelity.attributeActions}>
            <button type="button" aria-expanded={attributePanel === "dates"} onClick={() => setAttributePanel((current) => current === "dates" ? null : "dates")}><CalendarDays aria-hidden="true" /> {text.dates}</button>
            <button type="button" aria-expanded={attributePanel === "travellers"} onClick={() => setAttributePanel((current) => current === "travellers" ? null : "travellers")}><UsersRound aria-hidden="true" /> {travellers} {text.travellers.toLowerCase()}</button>
            <button type="button" aria-expanded={attributePanel === "interests"} onClick={() => setAttributePanel((current) => current === "interests" ? null : "interests")}><Heart aria-hidden="true" /> {interests.length ? `${interests.length} ${text.interests.toLowerCase()}` : text.interests}</button>
          </div>
          {attributePanel === "dates" ? <div className={fidelity.attributePanel}>
            <label><span>{text.startDate}</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label>
            <label><span>{text.endDate}</span><input type="date" min={startDate} value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
          </div> : null}
          {attributePanel === "travellers" ? <label className={fidelity.travellerField}><span>{text.travellers}</span><input type="number" min="1" max="12" value={travellers} onChange={(event) => setTravellers(Math.max(1, Math.min(12, Number(event.target.value) || 1)))} /></label> : null}
          {attributePanel === "interests" ? <div className={fidelity.interestPanel} aria-label={text.interestLabel}>
            <span>{text.interestLabel}</span><div>{(["food", "culture", "nature", "cities", "beach", "hiking"] as const).map((interest) => <button type="button" key={interest} aria-pressed={interests.includes(interest)} onClick={() => setInterests((current) => current.includes(interest) ? current.filter((item) => item !== interest) : [...current, interest])}>{text[interest]}</button>)}</div>
          </div> : null}
        </div>
        <div className={fidelity.promptFooter}>
          {travelProfile && <section className={fidelity.travelStyle} aria-label={text.travelStyle}>
            <div className={fidelity.travelStyleHead}><span>{text.travelStyle}</span><a href="/journey/profile">{text.edit}</a></div>
            <div className={fidelity.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
          </section>}
          <div className={`${styles.startBuilderPromptAction} ${fidelity.promptAction}`}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
        </div>
      </div>
    {captureError ? <p className={styles.captureError} role="alert">{captureError}</p> : null}
    <div className={styles.startBuilderSecondary}><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
