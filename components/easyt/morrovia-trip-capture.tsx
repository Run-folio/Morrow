"use client";

import { ArrowRight, CalendarDays, ChevronDown, Heart, UsersRound } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
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
    homepageLabel: "Start your plan",
    homepagePlaceholder: "Where would you like to go, for how long?",
    showDetails: "Add trip details",
    hideDetails: "Hide trip details",
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
    planWithStops: "Plan with stops",
    describeTrip: "Describe my trip",
    datesHeading: "When are you travelling?",
    clear: "Clear",
    personalize: "Personalize",
    hidePersonalize: "Hide personalization",
    budget: "Budget",
    budgetValue: "Budget",
    budgetMid: "Mid-range",
    budgetHigh: "Luxury",
  },
  es: {
    briefLabel: "CUÉNTANOS SOBRE TU VIAJE",
    briefPlaceholder: "¿Adónde te gustaría ir y durante cuánto tiempo?\n¿Hay algún lugar imprescindible alrededor del que organizar el viaje?",
    homepageLabel: "Empieza tu plan",
    homepagePlaceholder: "¿Adónde te gustaría ir y por cuánto tiempo?",
    showDetails: "Añadir detalles del viaje",
    hideDetails: "Ocultar detalles del viaje",
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
    planWithStops: "Planificar con paradas",
    describeTrip: "Describir mi viaje",
    datesHeading: "¿Cuándo viajas?",
    clear: "Borrar",
    personalize: "Personalizar",
    hidePersonalize: "Ocultar personalización",
    budget: "Presupuesto",
    budgetValue: "Económico",
    budgetMid: "Gama media",
    budgetHigh: "Lujo",
  },
} as const;

export type HomepageCaptureEntry = {
  mode: "stops" | "describe";
  onModeChange: (mode: "stops" | "describe") => void;
  destinationEntry: ReactNode;
  budget: "value" | "mid" | "high" | null;
  onBudgetChange: (value: "value" | "mid" | "high" | null) => void;
  datesChosen: boolean;
  onDatesClear: () => void;
};

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
  progressiveDetails?: boolean;
  homepageEntry?: HomepageCaptureEntry;
  onDatesChange: (range: { end: string; start: string }) => void;
  onInterestsChange: (interests: TripInterest[]) => void;
  onPromptStarted?: (inputMethod: "text" | "voice", value: string) => void;
  onSubmit: () => void | Promise<void>;
  onTravellersChange: (value: number) => void;
  onValueChange: (value: string) => void;
  endpointEntry?: ReactNode;
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
  progressiveDetails = false,
  homepageEntry,
  onDatesChange,
  onInterestsChange,
  onPromptStarted,
  onSubmit,
  onTravellersChange,
  onValueChange,
  endpointEntry,
  manualEntry,
  startDate,
  travelProfile,
  travellers,
  value,
}: MorroviaTripCaptureProps) {
  const [attributePanel, setAttributePanel] = useState<"dates" | "travellers" | "interests" | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [personalizeOpen, setPersonalizeOpen] = useState(false);
  const [aiDisclosureOpen, setAiDisclosureOpen] = useState(false);
  const [validationIssue, setValidationIssue] = useState<JourneyCaptureValidationIssue | null>(null);
  const promptErrorId = useId();
  const detailsId = useId();
  const personalizeId = useId();
  const stopsPanelId = useId();
  const describePanelId = useId();
  const stopsTabRef = useRef<HTMLButtonElement>(null);
  const describeTabRef = useRef<HTMLButtonElement>(null);
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
    const issue = homepageEntry ? null : validateJourneyCaptureSubmission({ prompt: value, allowEmptyPrompt });
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
      aria-label={progressiveDetails ? text.homepageLabel : text.briefLabel}
      aria-describedby={promptError ? promptErrorId : undefined}
      aria-invalid={promptError ? true : undefined}
      value={value}
      onChange={(event) => updateValue(event.target.value, "text")}
      maxLength={600}
      placeholder={progressiveDetails ? text.homepagePlaceholder : text.briefPlaceholder}
      disabled={disabled || loading}
    />
  );
  const promptField = <div className={`${styles.promptField}${promptError ? ` ${styles.promptFieldError}` : ""}`} onMouseDown={(event) => {
    if (event.target === event.currentTarget) textareaRef.current?.focus();
  }}>
    <div className={styles.textareaField} onMouseDown={(event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.closest("button, a")) textareaRef.current?.focus();
    }}>
      {promptTextarea}
      <VoiceTripBrief
        className={styles.voiceInput}
        compact={progressiveDetails || Boolean(homepageEntry)}
        language={language}
        onTranscript={(transcript) => updateValue(appendVoiceTranscript(value, transcript), "voice")}
      />
    </div>
    {promptError ? <p id={promptErrorId} className={styles.promptError} role="alert">{promptError}</p> : null}
  </div>;
  const onTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const order = ["stops", "describe"] as const;
    const current = order.indexOf(homepageEntry?.mode ?? "stops");
    let next = current;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (current + 1) % order.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (current - 1 + order.length) % order.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = order.length - 1;
    else return;
    event.preventDefault();
    homepageEntry?.onModeChange(order[next]);
    (order[next] === "stops" ? stopsTabRef : describeTabRef).current?.focus();
  };
  const submitAction = <EasyTButton type="submit" size="large" loading={loading} disabled={disabled}>{loading ? text.checking : <>{text.continue} <ArrowRight aria-hidden="true" /></>}</EasyTButton>;

  return <form id={formId} className={`${styles.root}${homepageEntry ? ` ${styles.wideRoot}` : ""}`} onSubmit={submit}>
    {homepageEntry ? <div className={`${styles.card} ${styles.wideCard}`}>
      <div className={styles.modeTabs} role="tablist" aria-label={language === "es" ? "Cómo empezar el viaje" : "How to start your trip"}>
        <EasyTButton ref={stopsTabRef} className={styles.modeTab} variant="quiet" role="tab" id={`${stopsPanelId}-tab`} aria-selected={homepageEntry.mode === "stops"} aria-controls={stopsPanelId} tabIndex={homepageEntry.mode === "stops" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => homepageEntry.onModeChange("stops")}>{text.planWithStops}</EasyTButton>
        <EasyTButton ref={describeTabRef} className={styles.modeTab} variant="quiet" role="tab" id={`${describePanelId}-tab`} aria-selected={homepageEntry.mode === "describe"} aria-controls={describePanelId} tabIndex={homepageEntry.mode === "describe" ? 0 : -1} onKeyDown={onTabKeyDown} onClick={() => homepageEntry.onModeChange("describe")}>{text.describeTrip}</EasyTButton>
      </div>
      <div className={styles.wideMainRow}>
        <div className={styles.wideEntryPanel} role="tabpanel" id={homepageEntry.mode === "stops" ? stopsPanelId : describePanelId} aria-labelledby={`${homepageEntry.mode === "stops" ? stopsPanelId : describePanelId}-tab`}>
          {homepageEntry.mode === "stops" ? homepageEntry.destinationEntry : promptField}
        </div>
        <section className={styles.wideDates} aria-labelledby={`${stopsPanelId}-dates`}>
          <div className={styles.sectionHeading}><span id={`${stopsPanelId}-dates`}>{text.datesHeading}</span>{homepageEntry.datesChosen ? <EasyTButton variant="quiet" size="small" onClick={homepageEntry.onDatesClear}>{text.clear}</EasyTButton> : null}</div>
          <MorroviaDatePicker className={styles.wideDatePicker} mode="range" locale={language} startLabel={text.startDate} endLabel={text.endDate} startValue={startDate} endValue={endDate} onChange={onDatesChange} />
        </section>
        <div className={styles.personalizeRow}>
          <EasyTButton className={styles.personalizeToggle} variant="secondary" size="small" aria-expanded={personalizeOpen} aria-controls={personalizeId} icon={ChevronDown} onClick={() => setPersonalizeOpen((current) => !current)}>{personalizeOpen ? text.hidePersonalize : text.personalize}</EasyTButton>
          {interests.length || homepageEntry.budget ? <span>{[interests.length ? `${interests.length} ${interests.length === 1 ? (language === "es" ? "interés" : "interest") : text.interests.toLowerCase()}` : "", homepageEntry.budget ? text[`budget${homepageEntry.budget === "value" ? "Value" : homepageEntry.budget === "mid" ? "Mid" : "High"}`] : ""].filter(Boolean).join(" · ")}</span> : null}
        </div>
        <div className={styles.wideAction}>{submitAction}</div>
      </div>
      {personalizeOpen ? <div className={styles.personalizePanel} id={personalizeId}>
        <div className={styles.interestPanel} aria-label={text.interestLabel}><span>{text.interestLabel}</span><div>{tripInterestIds.map((interest) => <EasyTButton variant="secondary" size="small" key={interest} aria-pressed={interests.includes(interest)} onClick={() => onInterestsChange(interests.includes(interest) ? interests.filter((item) => item !== interest) : [...interests, interest])}>{tripInterestLabels[language][interest]}</EasyTButton>)}</div></div>
        <div className={styles.budgetPanel} aria-label={text.budget}><span>{text.budget}</span><div>{(["value", "mid", "high"] as const).map((budget) => <EasyTButton variant="secondary" size="small" key={budget} aria-pressed={homepageEntry.budget === budget} onClick={() => homepageEntry.onBudgetChange(budget)}>{text[`budget${budget === "value" ? "Value" : budget === "mid" ? "Mid" : "High"}`]}</EasyTButton>)}{homepageEntry.budget ? <EasyTButton variant="quiet" size="small" onClick={() => homepageEntry.onBudgetChange(null)}>{text.clear}</EasyTButton> : null}</div></div>
      </div> : null}
      <EasyTButton className={styles.detailsToggle} variant="quiet" size="small" aria-expanded={detailsOpen} aria-controls={detailsId} icon={ChevronDown} onClick={() => setDetailsOpen((current) => !current)}>{detailsOpen ? text.hideDetails : text.showDetails}</EasyTButton>
      {detailsOpen ? <div className={styles.detailsPanel} id={detailsId}>{endpointEntry ? <div className={styles.endpointEntry}>{endpointEntry}</div> : null}<MorroviaQuantitySelector className={styles.travellerField} compact label={text.travellers} locale={language} noun={language === "es" ? "viajero" : "traveller"} nounPlural={language === "es" ? "viajeros" : "travellers"} value={travellers} min={1} max={12} onChange={onTravellersChange} /></div> : null}
      {homepageEntry.mode === "describe" ? <div className={styles.wideDisclosure}><MorroviaContextualDisclosure open={aiDisclosureOpen} onOpenChange={setAiDisclosureOpen} title={text.aiTitle} detail={text.aiDisclosure} linkHref="/journey/privacy#ai-and-speech" linkLabel={text.privacy} triggerLabel={text.aiLabel} /></div> : null}
    </div> : <div className={`${styles.card}${progressiveDetails && !detailsOpen ? ` ${styles.detailsCollapsed}` : ""}`}>
      <span className={`${styles.label}${progressiveDetails ? ` ${styles.homepageLabel}` : ""}`}>{progressiveDetails ? text.homepageLabel : text.briefLabel}</span>
      {promptField}
      {progressiveDetails ? <EasyTButton
        className={styles.detailsToggle}
        variant="quiet"
        size="small"
        aria-expanded={detailsOpen}
        aria-controls={detailsId}
        icon={ChevronDown}
        onClick={() => setDetailsOpen((current) => !current)}
      >{detailsOpen ? text.hideDetails : text.showDetails}</EasyTButton> : null}
      {(!progressiveDetails || detailsOpen) ? <div className={progressiveDetails ? styles.detailsPanel : undefined} id={progressiveDetails ? detailsId : undefined}>
        {endpointEntry ? <div className={styles.endpointEntry}>{endpointEntry}</div> : null}
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
        {progressiveDetails && travelProfile ? <section className={styles.travelStyle} aria-label={text.travelStyle}>
          <div className={styles.travelStyleHead}><span>{text.travelStyle}</span><a href="/journey/profile">{text.edit}</a></div>
          <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
        </section> : null}
      </div> : null}
      <div className={styles.footer}>
        {!progressiveDetails && travelProfile ? <section className={styles.travelStyle} aria-label={text.travelStyle}>
          <div className={styles.travelStyleHead}><span>{text.travelStyle}</span><a href="/journey/profile">{text.edit}</a></div>
          <div className={styles.travelStyleChips}>{travelStyleLabels(travelProfile, language).map((label) => <span key={label}>{label}</span>)}</div>
        </section> : null}
        <div className={styles.actionCluster}>
          {!progressiveDetails ? <MorroviaContextualDisclosure
            open={aiDisclosureOpen}
            onOpenChange={setAiDisclosureOpen}
            title={text.aiTitle}
            detail={text.aiDisclosure}
            linkHref="/journey/privacy#ai-and-speech"
            linkLabel={text.privacy}
            triggerLabel={text.aiLabel}
          /> : null}
          <div className={styles.action}>{submitAction}</div>
        </div>
      </div>
    </div>}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
  </form>;
}
