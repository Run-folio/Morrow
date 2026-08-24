"use client";

import { ArrowRight, CalendarDays, Heart, Sparkles, UsersRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { isTravelProfile, type TravelProfile } from "@/lib/easyt/travel-profile";
import { travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { appendVoiceTranscript, VoiceTripBrief } from "@/components/easyt/voice-trip-brief";
import type { JourneyCaptureResult } from "@/lib/easyt/journey-capture";
import { createHomeTripDraft, HOME_TRIP_DRAFT_KEY } from "@/lib/easyt/home-trip-handoff";
import styles from "./home.module.css";
import fidelity from "./home-fidelity.module.css";

const copy = {
  en: {
    briefLabel: "TELL US ABOUT YOUR TRIP", briefPlaceholder: "Where would you like to go?", briefHelp: "Describe places or regions, how long you have, and what matters to you.", briefDetail: "Include must-sees, dates, pace, interests, transport preferences or constraints.", exampleLabel: "Try an example", examples: ["Two weeks through Japan, relaxed pace, food and mountains.", "10 days in Patagonia without driving.", "Portugal and Spain, three weeks, no more than four bases."], continue: "Plan my trip", checking: "Understanding your trip…", travelStyle: "YOUR TRAVEL STYLE", edit: "Edit", routes: "Explore multi-country routes", dates: "Add dates", travellers: "Travellers", interests: "Interests", startDate: "Start date", endDate: "End date", interestLabel: "What matters most?", food: "Food", culture: "Culture", nature: "Nature", cities: "Cities", beach: "Beach", hiking: "Hiking",
  },
  es: {
    briefLabel: "CUÉNTANOS SOBRE TU VIAJE", briefPlaceholder: "¿Adónde te gustaría ir?", briefHelp: "Describe lugares o regiones, cuánto tiempo tienes y qué te importa.", briefDetail: "Incluye imprescindibles, fechas, ritmo, intereses, transporte o límites.", exampleLabel: "Prueba un ejemplo", examples: ["Dos semanas por Japón, ritmo tranquilo, comida y montaña.", "10 días en Patagonia sin conducir.", "Portugal y España, tres semanas, máximo cuatro bases."], continue: "Planificar mi viaje", checking: "Entendiendo tu viaje…", travelStyle: "TU ESTILO DE VIAJE", edit: "Editar", routes: "Explorar rutas multicountry", dates: "Añadir fechas", travellers: "Viajeros", interests: "Intereses", startDate: "Fecha de salida", endDate: "Fecha de regreso", interestLabel: "¿Qué te importa más?", food: "Comida", culture: "Cultura", nature: "Naturaleza", cities: "Ciudades", beach: "Playa", hiking: "Senderismo",
  },
} as const;

function iso(date: Date) { return date.toISOString().slice(0, 10); }
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
  const { data: session } = authClient.useSession();
  const promptStartedRef = useRef(false);
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [brief, setBrief] = useState("");
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [travellers, setTravellers] = useState(2);
  const [interests, setInterests] = useState<string[]>([]);
  const [datesExplicit, setDatesExplicit] = useState(false);
  const [travellersExplicit, setTravellersExplicit] = useState(false);
  const [attributePanel, setAttributePanel] = useState<"dates" | "travellers" | "interests" | null>(null);
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  const text = copy[language];
  useEffect(() => {
    setLanguage(languageFromStorage());
    try {
      const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(session?.user?.id ?? null)) ?? "null");
      setTravelProfile(isTravelProfile(savedProfile) ? savedProfile : null);
    } catch { setTravelProfile(null); }
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, [session?.user?.id]);

  const markPromptStarted = (inputMethod: "text" | "voice", value: string) => {
    if (promptStartedRef.current || value.trim().length < 3) return;
    promptStartedRef.current = true;
    trackEvent("homepage_prompt_started", { source: "homepage", input_method: inputMethod, is_authenticated: Boolean(session?.user) });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const tripBrief = brief;
    if (!tripBrief.trim()) return;
    trackEvent("easyt_trip_started", { source: "homepage_builder", has_brief: true });
    trackEvent("trip_generation_started", { trip_source: "homepage", has_dates: datesExplicit, traveller_count: travellers, is_authenticated: Boolean(session?.user) });
    setLoading(true);
    setCaptureError("");
    let responseReceived = false;
    try {
      const response = await fetch("/api/journey-capture", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ brief: tripBrief }) });
      responseReceived = true;
      const payload = await response.json() as JourneyCaptureResult & { message?: string };
      if (!response.ok) throw new Error(payload.message || "Capture failed");
      const unresolvedCount = payload.mentions.filter((mention) => mention.status === "unresolved").length;
      trackEvent("easyt_trip_capture_reviewed", { source: "homepage_builder", parser_version: payload.parserVersion, place_count: payload.mentions.length, unresolved_count: unresolvedCount, region_count: payload.regions.length, has_duration: Boolean(payload.durationDays) });
      if (unresolvedCount) trackEvent("easyt_trip_capture_place_unresolved", { source: "homepage_builder", unresolved_count: unresolvedCount });
      const handoffId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.localStorage.setItem(HOME_TRIP_DRAFT_KEY, JSON.stringify(createHomeTripDraft({
        capture: payload,
        handoffId,
        datesExplicit,
        startDate,
        endDate,
        travellers,
        travellersExplicit,
        interests,
      })));
      router.push("/journey/new?homeDraft=1");
    } catch {
      setCaptureError(language === "es" ? "No pudimos entender tu viaje. Inténtalo de nuevo." : "We couldn't understand your trip. Please try again.");
      trackEvent("easyt_trip_capture_failed", { source: "homepage_builder" });
      trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: responseReceived ? "capture" : "network", is_authenticated: Boolean(session?.user) });
    } finally {
      setLoading(false);
    }
  };

  return <form id="start-building" className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={`${styles.startBuilderBrief} ${fidelity.promptCard}`}>
      <span>{text.briefLabel}</span>
        <div className={`${styles.startBuilderPromptField} ${fidelity.promptField}`}>
        <div className={fidelity.promptHelp}>
          <p>{text.briefHelp}</p>
          <span>{text.briefDetail}</span>
        </div>
        <div className={fidelity.promptTextareaField}>
          <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => { const next = event.target.value; setBrief(next); markPromptStarted("text", next); }} maxLength={600} placeholder={text.briefPlaceholder} />
          <VoiceTripBrief className={fidelity.voiceInput} language={language} onTranscript={(transcript) => setBrief((current) => { const next = appendVoiceTranscript(current, transcript); markPromptStarted("voice", next); return next; })} />
        </div>
        <div className={fidelity.promptExamples} aria-label={text.exampleLabel}>
          <span>{text.exampleLabel}</span>
          <div>{text.examples.map((example) => <button type="button" key={example} onClick={() => { setBrief(example); markPromptStarted("text", example); }}>{example}</button>)}</div>
        </div>
        </div>
        <div className={fidelity.promptAttributes}>
          <div className={fidelity.attributeActions}>
            <button type="button" aria-expanded={attributePanel === "dates"} onClick={() => setAttributePanel((current) => current === "dates" ? null : "dates")}><CalendarDays aria-hidden="true" /> {text.dates}</button>
            <button type="button" aria-expanded={attributePanel === "travellers"} onClick={() => setAttributePanel((current) => current === "travellers" ? null : "travellers")}><UsersRound aria-hidden="true" /> {travellers} {text.travellers.toLowerCase()}</button>
            <button type="button" aria-expanded={attributePanel === "interests"} onClick={() => setAttributePanel((current) => current === "interests" ? null : "interests")}><Heart aria-hidden="true" /> {interests.length ? `${interests.length} ${text.interests.toLowerCase()}` : text.interests}</button>
          </div>
          {attributePanel === "dates" ? <div className={fidelity.attributePanel}>
            <label><span>{text.startDate}</span><input type="date" value={startDate} onChange={(event) => { setStartDate(event.target.value); setDatesExplicit(true); }} /></label>
            <label><span>{text.endDate}</span><input type="date" min={startDate} value={endDate} onChange={(event) => { setEndDate(event.target.value); setDatesExplicit(true); }} /></label>
          </div> : null}
          {attributePanel === "travellers" ? <label className={fidelity.travellerField}><span>{text.travellers}</span><input type="number" min="1" max="12" value={travellers} onChange={(event) => { setTravellers(Math.max(1, Math.min(12, Number(event.target.value) || 1))); setTravellersExplicit(true); }} /></label> : null}
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
