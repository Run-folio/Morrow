"use client";

import Link from "next/link";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import styles from "./home.module.css";

type DraftDestination = { id: string; name: string; country: string; coordinates: [number, number] };
type CapturedMention = { sourceText: string; canonicalName: string; role: "origin" | "stop"; order: number; status: "resolved" | "unresolved"; country?: string; coordinates?: [number, number]; kind?: string };
type Capture = { rawBrief: string; parserVersion: string; durationDays?: number; regions: string[]; routeHints: string[]; mentions: CapturedMention[] };
type GeocodeResult = { name?: string; country?: string; coordinates?: [number, number]; kind?: string };

const copy = {
  en: {
    briefLabel: "YOUR TRIP BRIEF", briefPlaceholder: "For example: Two weeks in Japan this October — Tokyo, Kyoto and time in the Japanese Alps.", continue: "Make my plan", checking: "Understanding your trip…", review: "Here’s what Morrovia understood", from: "From", stops: "Route", regions: "Region", duration: "Length", unresolved: "Needs confirmation", resolveFirst: "Confirm or edit every place before continuing.", resolvePlace: "Find this place", resolving: "Checking…", placeNotFound: "We couldn't verify that place. Try adding a city or country.", edit: "Edit brief", confirm: "Continue to the builder", startersLabel: "SHAPE THE PLAN", starters: ["Keep travel days light", "Make food a daily anchor", "Mix cities with time outdoors"], newTrip: "New trip", routes: "See featured routes",
  },
  es: {
    briefLabel: "TU IDEA DE VIAJE", briefPlaceholder: "Por ejemplo: Dos semanas en Japón este octubre — Tokio, Kioto y tiempo en los Alpes japoneses.", continue: "Crear mi plan", checking: "Entendiendo tu viaje…", review: "Esto es lo que entendió Morrovia", from: "Desde", stops: "Ruta", regions: "Región", duration: "Duración", unresolved: "Necesita confirmación", resolveFirst: "Confirma o edita cada lugar antes de continuar.", resolvePlace: "Buscar este lugar", resolving: "Comprobando…", placeNotFound: "No pudimos verificar ese lugar. Prueba añadiendo una ciudad o país.", edit: "Editar idea", confirm: "Continuar al planificador", startersLabel: "DA FORMA AL PLAN", starters: ["Días de viaje ligeros", "La comida como hilo conductor", "Ciudades y tiempo al aire libre"], newTrip: "Nuevo viaje", routes: "Ver rutas destacadas",
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
  const [capture, setCapture] = useState<Capture | null>(null);
  const [captureError, setCaptureError] = useState("");
  const [placeInputs, setPlaceInputs] = useState<Record<string, string>>({});
  const [resolvingPlace, setResolvingPlace] = useState<string | null>(null);
  const [placeErrors, setPlaceErrors] = useState<Record<string, string>>({});
  const text = copy[language];
  const hasUnresolvedMentions = Boolean(capture?.mentions.some((mention) => mention.status === "unresolved"));
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
      setCapture(payload);
      const unresolvedCount = payload.mentions.filter((mention) => mention.status === "unresolved").length;
      trackEvent("easyt_trip_capture_reviewed", { source: "homepage_builder", parser_version: payload.parserVersion, place_count: payload.mentions.length, unresolved_count: unresolvedCount, region_count: payload.regions.length, has_duration: Boolean(payload.durationDays) });
      if (unresolvedCount) trackEvent("easyt_trip_capture_place_unresolved", { source: "homepage_builder", unresolved_count: unresolvedCount });
    } catch {
      setCaptureError(language === "es" ? "No pudimos entender tu viaje. Inténtalo de nuevo." : "We couldn't understand your trip. Please try again.");
      trackEvent("easyt_trip_capture_failed", { source: "homepage_builder" });
    } finally {
      setLoading(false);
    }
  };

  const resolvePlace = async (mention: CapturedMention) => {
    if (!capture) return;
    const query = (placeInputs[mention.sourceText] ?? mention.canonicalName).trim();
    if (!query) return;
    setResolvingPlace(mention.sourceText);
    setPlaceErrors((current) => ({ ...current, [mention.sourceText]: "" }));
    try {
      const response = await fetch(`/api/journey-geocode?place=${encodeURIComponent(query)}`);
      const payload = await response.json() as { result?: GeocodeResult | null };
      if (!payload.result?.coordinates || !payload.result.country) throw new Error("Not found");
      const resolvedName = payload.result.name?.split(",")[0]?.trim() || query;
      setCapture((current) => current ? { ...current, mentions: current.mentions.map((item) => item.sourceText === mention.sourceText ? { ...item, canonicalName: resolvedName, country: payload.result!.country!, coordinates: payload.result!.coordinates!, kind: payload.result!.kind, status: "resolved" } : item) } : current);
      trackEvent("easyt_trip_capture_place_resolved", { source: "homepage_builder", role: mention.role, corrected: query.toLocaleLowerCase() !== mention.canonicalName.toLocaleLowerCase() });
    } catch {
      setPlaceErrors((current) => ({ ...current, [mention.sourceText]: text.placeNotFound }));
    } finally {
      setResolvingPlace(null);
    }
  };

  const continueToBuilder = () => {
    if (!capture) return;
    const origin = capture.mentions.find((mention) => mention.role === "origin" && mention.status === "resolved");
    const destinations: DraftDestination[] = capture.mentions.filter((mention) => mention.role === "stop" && mention.status === "resolved" && mention.coordinates && mention.country).map((mention, index) => ({ id: `${mention.canonicalName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}-${index}`, name: mention.canonicalName, country: mention.country!, coordinates: mention.coordinates! }));
    const proposedEndDate = capture.durationDays ? addDays(startDate, capture.durationDays) : endDate;
    window.localStorage.setItem("easyt-home-trip-draft", JSON.stringify({ origin: origin?.canonicalName, originCoordinates: origin?.coordinates, destinations, routeHints: capture.routeHints, regions: capture.regions, locationMentions: capture.mentions, parserVersion: capture.parserVersion, startDate, endDate: proposedEndDate, brief: capture.rawBrief }));
    router.push("/journey/new?homeDraft=1");
  };

  return <form id="start-building" className={styles.startBuilder} onSubmit={(event) => void submit(event)}>
    <div className={styles.startBuilderBrief}>
      <span>{text.briefLabel}</span>
      {!capture ? <div className={styles.startBuilderPromptField}>
        <textarea aria-label={text.briefLabel} value={brief} onChange={(event) => setBrief(event.target.value)} maxLength={600} placeholder={text.briefPlaceholder} />
        <div className={styles.startBuilderPromptAction}><button type="submit" disabled={loading}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</button></div>
      </div> : <div className={styles.captureReview} role="status"><strong>{text.review}</strong><dl>{capture.mentions.filter((mention) => mention.status === "resolved").map((mention) => <div key={`${mention.role}-${mention.order}`}><dt>{mention.role === "origin" ? text.from : text.stops}</dt><dd>{mention.canonicalName}{mention.country ? `, ${mention.country}` : ""}</dd></div>)}{capture.regions.map((region) => <div key={region}><dt>{text.regions}</dt><dd>{region}</dd></div>)}{capture.durationDays ? <div><dt>{text.duration}</dt><dd>{capture.durationDays} {language === "es" ? "días" : "days"}</dd></div> : null}</dl>{capture.mentions.filter((mention) => mention.status === "unresolved").map((mention) => <div className={styles.captureUnresolved} key={mention.sourceText}><span>{text.unresolved}</span><label><input aria-label={text.unresolved} value={placeInputs[mention.sourceText] ?? mention.canonicalName} onChange={(event) => setPlaceInputs((current) => ({ ...current, [mention.sourceText]: event.target.value }))} /><button type="button" onClick={() => void resolvePlace(mention)} disabled={resolvingPlace === mention.sourceText}>{resolvingPlace === mention.sourceText ? text.resolving : text.resolvePlace}</button></label>{placeErrors[mention.sourceText] ? <small>{placeErrors[mention.sourceText]}</small> : null}</div>)}{hasUnresolvedMentions ? <p className={styles.captureWarning}>{text.resolveFirst}</p> : null}<div className={styles.captureActions}><button type="button" onClick={() => { setCapture(null); setPlaceErrors({}); }}>{text.edit}</button><button type="button" onClick={continueToBuilder} disabled={hasUnresolvedMentions}>{text.confirm} <ArrowRight aria-hidden="true" /></button></div></div>}
      {!capture ? <div className={styles.shapePlan}>
        <span className={styles.shapePlanLabel}>{text.startersLabel}</span>
        <div className={styles.shapePlanChoices}>{text.starters.map((shape) => <button type="button" key={shape} onClick={() => addShape(shape)}><Sparkles aria-hidden="true" /> {shape}</button>)}</div>
      </div> : null}
    </div>
    {captureError ? <p className={styles.captureError} role="alert">{captureError}</p> : null}
    <div className={styles.startBuilderSecondary}><Link href="/journey/new"><Plus aria-hidden="true" /> {text.newTrip}</Link><a href="#routes"><Sparkles aria-hidden="true" /> {text.routes}</a></div>
  </form>;
}
