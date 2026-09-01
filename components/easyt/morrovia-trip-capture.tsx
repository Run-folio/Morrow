"use client";

import { ArrowRight, CalendarDays, Heart, UsersRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { EasyTLanguage } from "@/lib/easyt/i18n";
import { journeyCaptureValidationMessage, validateJourneyCaptureSubmission, type JourneyCaptureValidationIssue } from "@/lib/easyt/journey-capture-client";
import { tripInterestIds, tripInterestLabels, type TripInterest } from "@/lib/easyt/trip-interest";
import type { TravelProfile } from "@/lib/easyt/travel-profile";
import { appendVoiceTranscript } from "@/lib/easyt/speech-recognition";
import { EasyTButton } from "./easyt-controls";
import { MorroviaDatePicker } from "./morrovia-date-picker";
import { MorroviaContextualDisclosure } from "./morrovia-feedback";
import { MorroviaQuantitySelector } from "./morrovia-quantity-selector";
import { VoiceTripBrief } from "./voice-trip-brief";
import styles from "./morrovia-trip-capture.module.css";

const copy = {
  en: {
    briefLabel: "TELL US ABOUT YOUR TRIP",
    briefPlaceholder: "Where would you like to go and for how long?\nAny must see places to base the trip around?",
    continue: "Plan my trip",
    checking: "Understanding your trip…",
    travelStyle: "YOUR TRAVEL STYLE",
    edit: "Edit",
    dates: "Add dates",
    travellers: "Travellers",
    interests: "Interests",
    startDate: "Start date",
    endDate: "End date",
    interestLabel: "What matters most?",
    aiLabel: "AI-assisted",
    aiTitle: "AI-assisted planning",
    aiDisclosure: "Morrovia may use Luna, our AI travel assistant, to help interpret your trip brief. AI can make mistakes, so review your resulting plan before relying on important travel details.",
    privacy: "Privacy details",
  },
  es: {
    briefLabel: "CUÉNTANOS SOBRE TU VIAJE",
    briefPlaceholder: "¿Adónde te gustaría ir y durante cuánto tiempo?\n¿Hay algún lugar imprescindible alrededor del que organizar el viaje?",
    continue: "Planificar mi viaje",
    checking: "Entendiendo tu viaje…",
    travelStyle: "TU ESTILO DE VIAJE",
    edit: "Editar",
    dates: "Añadir fechas",
    travellers: "Viajeros",
    interests: "Intereses",
    startDate: "Fecha de salida",
    endDate: "Fecha de regreso",
    interestLabel: "¿Qué te importa más?",
    aiLabel: "Con ayuda de IA",
    aiTitle: "Planificación asistida por IA",
    aiDisclosure: "Morrovia puede usar Luna, nuestro asistente de viaje con IA, para ayudar a interpretar tu viaje. La IA puede equivocarse; revisa el plan resultante antes de confiar en detalles importantes del viaje.",
    privacy: "Detalles de privacidad",
  },
} as const;

function travelStyleLabels(profile: TravelProfile, language: EasyTLanguage) {
  const labels = language === "es"
    ? {
        pace: { slow: "Ritmo tranquilo", balanced: "Ritmo equilibrado", full: "Días completos" },
        hotelMoves: { few: "Pocas mudanzas de hotel", some: "Algunos cambios de base", open: "Abierto a moverse" },
        budget: { value: "Buena relación calidad-precio", mid: "Gama media", high: "Lo mejor disponible" },
      }
    : {
        pace: { slow: "Slow pace", balanced: "Balanced pace", full: "Full days" },
        hotelMoves: { few: "Fewer hotel moves", some: "A few hotel moves", open: "Open to moving" },
        budget: { value: "Good value", mid: "Mid-range", high: "Best available" },
      };
  return [
    labels.pace[profile.pace],
    ...profile.usualInterests.map((interest) => tripInterestLabels[language][interest]),
    labels.hotelMoves[profile.hotelMoves],
    labels.budget[profile.budget],
  ];
}

export type MorroviaTripCaptureProps = {
  disabled?: boolean;
  allowEmptyPrompt?: boolean;
  endDate: string;
  error?: string;
  formId?: string;
  interests: TripInterest[];
  language: EasyTLanguage;
  loading?: boolean;
  onDatesChange: (range: { end: string; start: string }) => void;
  onInterestsChange: (interests: TripInterest[]) => void;
  onPromptStarted?: (inputMethod: "text" | "voice", value: string) => void;
  onSubmit: () => void | Promise<void>;
  onTravellersChange: (value: number) => void;
  onValueChange: (value: string) => void;
  manualEntry?: ReactNode;
  startDate: string;
  travelProfile?: TravelProfile | null;
  travellers: number;
  value: string;
};

export function MorroviaTripCapture({
  disabled = false,
  allowEmptyPrompt = false,
  endDate,
  error = "",
  formId,
  interests,
  language,
  loading = false,
  onDatesChange,
  onInterestsChange,
  onPromptStarted,
  onSubmit,
  onTravellersChange,
  onValueChange,
  manualEntry,
  startDate,
  travelProfile,
  travellers,
  value,
}: MorroviaTripCaptureProps) {
  const [attributePanel, setAttributePanel] = useState<"dates" | "travellers" | "interests" | null>(null);
  const [aiDisclosureOpen, setAiDisclosureOpen] = useState(false);
  const [validationIssue, setValidationIssue] = useState<JourneyCaptureValidationIssue | null>(null);
  const promptErrorId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const text = copy[language];
  const promptError = validationIssue ? journeyCaptureValidationMessage(validationIssue, language) : "";
  useEffect(() => {
    if (validationIssue && !validateJourneyCaptureSubmission({ prompt: value, allowEmptyPrompt })) setValidationIssue(null);
  }, [allowEmptyPrompt, validationIssue, value]);
  const updateValue = (next: string, inputMethod: "text" | "voice") => {
    if (!validateJourneyCaptureSubmission({ prompt: next, allowEmptyPrompt })) setValidationIssue(null);
    onValueChange(next);
    onPromptStarted?.(inputMethod, next);
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || loading) return;
    const issue = validateJourneyCaptureSubmission({ prompt: value, allowEmptyPrompt });
    if (issue) {
      setValidationIssue(issue);
      textareaRef.current?.focus();
      return;
    }
    setValidationIssue(null);
    void onSubmit();
  };
  const promptTextarea = (
    // morrovia-ui-audit-allow-next-line native-control -- the voice overlay requires the Homepage prompt textarea to remain one composite control
    <textarea
      ref={textareaRef}
      aria-label={text.briefLabel}
      aria-describedby={promptError ? promptErrorId : undefined}
      aria-invalid={promptError ? true : undefined}
      value={value}
      onChange={(event) => updateValue(event.target.value, "text")}
      maxLength={600}
      placeholder={text.briefPlaceholder}
    />
  );

  return <form id={formId} className={styles.root} onSubmit={submit}>
    <div className={styles.card}>
      <span className={styles.label}>{text.briefLabel}</span>
      <div className={`${styles.promptField}${promptError ? ` ${styles.promptFieldError}` : ""}`}>
        <div className={styles.textareaField}>
          {promptTextarea}
          <VoiceTripBrief
            className={styles.voiceInput}
            language={language}
            onTranscript={(transcript) => updateValue(appendVoiceTranscript(value, transcript), "voice")}
          />
        </div>
        {promptError ? <p id={promptErrorId} className={styles.promptError} role="alert">{promptError}</p> : null}
      </div>
      {manualEntry ? <section className={styles.manualEntry} aria-label={language === "es" ? "Entrada manual del viaje" : "Manual trip entry"}>
        <div className={styles.manualDivider}><span>{language === "es" ? "o introdúcelo manualmente" : "or enter it manually"}</span></div>
        {manualEntry}
      </section> : null}
      <div className={styles.attributes}>
        <div className={styles.attributeActions}>
          <EasyTButton variant="secondary" size="small" icon={CalendarDays} aria-expanded={attributePanel === "dates"} onClick={() => setAttributePanel((current) => current === "dates" ? null : "dates")}>{text.dates}</EasyTButton>
          <EasyTButton variant="secondary" size="small" icon={UsersRound} aria-expanded={attributePanel === "travellers"} onClick={() => setAttributePanel((current) => current === "travellers" ? null : "travellers")}>{travellers} {text.travellers.toLowerCase()}</EasyTButton>
          <EasyTButton variant="secondary" size="small" icon={Heart} aria-expanded={attributePanel === "interests"} onClick={() => setAttributePanel((current) => current === "interests" ? null : "interests")}>{interests.length ? `${interests.length} ${text.interests.toLowerCase()}` : text.interests}</EasyTButton>
        </div>
        {attributePanel === "dates" ? <MorroviaDatePicker
          className={styles.datePicker}
          mode="range"
          locale={language}
          startLabel={text.startDate}
          endLabel={text.endDate}
          startValue={startDate}
          endValue={endDate}
          onChange={onDatesChange}
        /> : null}
        {attributePanel === "travellers" ? <MorroviaQuantitySelector
          className={styles.travellerField}
          compact
          label={text.travellers}
          locale={language}
          noun={language === "es" ? "viajero" : "traveller"}
          nounPlural={language === "es" ? "viajeros" : "travellers"}
          value={travellers}
          min={1}
          max={12}
          onChange={onTravellersChange}
        /> : null}
        {attributePanel === "interests" ? <div className={styles.interestPanel} aria-label={text.interestLabel}>
          <span>{text.interestLabel}</span>
          <div>{tripInterestIds.map((interest) => <EasyTButton
            variant="secondary"
            size="small"
            key={interest}
            aria-pressed={interests.includes(interest)}
            onClick={() => onInterestsChange(interests.includes(interest) ? interests.filter((item) => item !== interest) : [...interests, interest])}
          >{tripInterestLabels[language][interest]}</EasyTButton>)}</div>
        </div> : null}
      </div>
      <div className={styles.footer}>
        {travelProfile ? <section className={styles.travelStyle} aria-label={text.travelStyle}>
          <div className={styles.travelStyleHead}><span>{text.travelStyle}</span><a href="/journey/profile">{text.edit}</a></div>
          <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
        </section> : null}
        <div className={styles.actionCluster}>
          <MorroviaContextualDisclosure
            open={aiDisclosureOpen}
            onOpenChange={setAiDisclosureOpen}
            title={text.aiTitle}
            detail={text.aiDisclosure}
            linkHref="/journey/privacy#ai-and-speech"
            linkLabel={text.privacy}
            triggerLabel={text.aiLabel}
          />
          <div className={styles.action}><EasyTButton type="submit" size="large" loading={loading} disabled={disabled}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</EasyTButton></div>
        </div>
      </div>
    </div>
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </form>;
}
