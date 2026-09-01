"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MorroviaTripCapture } from "@/components/easyt/morrovia-trip-capture";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { trackEvent } from "@/lib/analytics";
import { authClient } from "@/lib/auth-client";
import { travelProfileFromUnknown, tripInterestsWithProfileDefaults, type TravelProfile } from "@/lib/easyt/travel-profile";
import { travelProfileStorageKey } from "@/lib/easyt/private-browser-context";
import { createLatestJourneyCaptureRequestGate, journeyCaptureFailureMessage, requestJourneyCapture } from "@/lib/easyt/journey-capture-client";
import { createHomeTripDraft, HOME_TRIP_DRAFT_KEY } from "@/lib/easyt/home-trip-handoff";
import type { TripInterest } from "@/lib/easyt/trip-interest";

function iso(date: Date) { return date.toISOString().slice(0, 10); }
export default function HomeTripStarter() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const promptStartedRef = useRef(false);
  const captureRequestGateRef = useRef<ReturnType<typeof createLatestJourneyCaptureRequestGate> | null>(null);
  if (!captureRequestGateRef.current) captureRequestGateRef.current = createLatestJourneyCaptureRequestGate();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [brief, setBrief] = useState("");
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);
  const [startDate, setStartDate] = useState(() => iso(new Date()));
  const [endDate, setEndDate] = useState(() => iso(new Date(Date.now() + 6 * 86_400_000)));
  const [travellers, setTravellers] = useState(2);
  const [interests, setInterests] = useState<TripInterest[]>([]);
  const [interestsExplicit, setInterestsExplicit] = useState(false);
  const [datesExplicit, setDatesExplicit] = useState(false);
  const [travellersExplicit, setTravellersExplicit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [captureError, setCaptureError] = useState("");
  useEffect(() => {
    setLanguage(languageFromStorage());
    try {
      const savedProfile = JSON.parse(window.localStorage.getItem(travelProfileStorageKey(session?.user?.id ?? null)) ?? "null");
      const profile = session?.user?.id ? travelProfileFromUnknown(savedProfile) : null;
      setTravelProfile(profile);
      if (profile) setInterests((current) => tripInterestsWithProfileDefaults(current, profile, interestsExplicit));
    } catch { setTravelProfile(null); }
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, [session?.user?.id]);
  useEffect(() => () => captureRequestGateRef.current?.cancel(), []);

  const markPromptStarted = (inputMethod: "text" | "voice", value: string) => {
    if (promptStartedRef.current || value.trim().length < 3) return;
    promptStartedRef.current = true;
    trackEvent("homepage_prompt_started", { source: "homepage", input_method: inputMethod, is_authenticated: Boolean(session?.user) });
  };

  const submit = async () => {
    const tripBrief = brief;
    trackEvent("trip_generation_started", { trip_source: "homepage", has_dates: datesExplicit, traveller_count: travellers, is_authenticated: Boolean(session?.user) });
    setLoading(true);
    setCaptureError("");
    const captureRequest = captureRequestGateRef.current!.begin();
    let responseReceived = false;
    try {
      const payload = await requestJourneyCapture(tripBrief, {
        signal: captureRequest.signal,
        onResponse: () => { responseReceived = true; },
      });
      if (!captureRequest.isCurrent()) return;
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
        interestsExplicit,
      })));
      router.push("/journey/new?homeDraft=1");
    } catch {
      if (!captureRequest.isCurrent()) return;
      setCaptureError(journeyCaptureFailureMessage(responseReceived ? "interpretation" : "network", language));
      trackEvent("trip_generation_failed", { trip_source: "homepage", error_type: responseReceived ? "capture" : "network", is_authenticated: Boolean(session?.user) });
    } finally {
      if (captureRequest.isCurrent()) setLoading(false);
      captureRequest.finish();
    }
  };

  return <MorroviaTripCapture
    formId="start-building"
    language={language}
    value={brief}
    onValueChange={(value) => { setBrief(value); setCaptureError(""); }}
    onPromptStarted={markPromptStarted}
    startDate={startDate}
    endDate={endDate}
    onDatesChange={(range) => { setStartDate(range.start); setEndDate(range.end); setDatesExplicit(true); }}
    travellers={travellers}
    onTravellersChange={(value) => { setTravellers(value); setTravellersExplicit(true); }}
    interests={interests}
    onInterestsChange={(nextInterests) => { setInterests(nextInterests); setInterestsExplicit(true); }}
    travelProfile={travelProfile}
    onSubmit={submit}
    loading={loading}
    error={captureError}
  />;
}
