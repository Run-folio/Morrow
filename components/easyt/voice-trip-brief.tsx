"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import {
  finalSpeechTranscript,
  speechFailureKind,
  type SpeechRecognitionEventLike,
} from "@/lib/easyt/speech-recognition";
import { acknowledgeSpeechDisclosure, speechDisclosureAcknowledged } from "@/lib/easyt/speech-disclosure";
import { EasyTButton } from "./easyt-controls";
import { MorroviaContextualDisclosure } from "./morrovia-feedback";
import styles from "./voice-trip-brief.module.css";

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
};
type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

type VoiceTripBriefProps = {
  language: "en" | "es";
  onTranscript: (transcript: string) => void;
  className?: string;
};

export function VoiceTripBrief({ language, onTranscript, className }: VoiceTripBriefProps) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const disclosureId = useId();
  const [supported, setSupported] = useState<boolean | null>(null);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [disclosureAcknowledged, setDisclosureAcknowledged] = useState(false);

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    setDisclosureAcknowledged(speechDisclosureAcknowledged(window.localStorage));
    return () => recognitionRef.current?.abort();
  }, []);

  const text = language === "es"
    ? {
        start: "Usar voz para añadir una idea de viaje",
        stop: "Dejar de escuchar",
        listening: "Escuchando…",
        blocked: "El acceso al micrófono está bloqueado. Puedes seguir escribiendo.",
        unavailable: "La entrada por voz no está disponible en este navegador. Puedes seguir escribiendo.",
        noSpeech: "No hemos captado nada. Inténtalo de nuevo o escribe tu viaje.",
        added: "La transcripción se añadió como texto editable.",
        disclosureTitle: "Entrada por voz",
        disclosure: "El servicio de reconocimiento de voz de tu navegador convierte lo que dices en texto editable. Tu navegador o proveedor de voz puede procesar el audio; Morrovia recibe la transcripción resultante.",
        privacy: "Detalles de privacidad",
        begin: "Empezar a hablar",
        info: "Acerca de la entrada por voz",
      }
    : {
        start: "Use voice to add a trip idea",
        stop: "Stop listening",
        listening: "Listening…",
        blocked: "Microphone access was blocked. You can keep typing.",
        unavailable: "Speech input isn’t available in this browser. You can keep typing.",
        noSpeech: "We didn’t catch that. Try again or type your trip.",
        added: "Speech was added as editable text.",
        disclosureTitle: "Speech input",
        disclosure: "Your browser’s speech-recognition service turns what you say into editable text. Your browser or speech provider may process the audio; Morrovia receives the resulting transcript.",
        privacy: "Privacy details",
        begin: "Start speaking",
        info: "About speech input",
      };

  const stop = () => recognitionRef.current?.stop();

  const start = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setMessage(text.unavailable);
      return;
    }
    setMessage("");
    let heardSpeech = false;
    let hadError = false;
    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = language === "es" ? "es-ES" : "en-US";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onstart = () => setListening(true);
    recognition.onresult = (event) => {
      const transcript = finalSpeechTranscript(event);
      if (transcript) {
        heardSpeech = true;
        onTranscriptRef.current(transcript);
        setMessage(text.added);
      }
    };
    recognition.onerror = ({ error }) => {
      hadError = true;
      setMessage(text[speechFailureKind(error)]);
    };
    recognition.onend = () => {
      setListening(false);
      recognitionRef.current = null;
      if (!heardSpeech && !hadError) setMessage(text.noSpeech);
    };
    try {
      recognition.start();
    } catch {
      setListening(false);
      setMessage(text.unavailable);
    }
  };

  const requestStart = () => {
    if (listening) {
      stop();
      return;
    }
    if (!disclosureAcknowledged) {
      setDisclosureOpen(true);
      return;
    }
    start();
  };

  const confirmStart = () => {
    acknowledgeSpeechDisclosure(window.localStorage);
    setDisclosureAcknowledged(true);
    setDisclosureOpen(false);
    start();
  };

  return <div className={`${styles.voice} ${className ?? ""}`}>
    <div className={styles.voiceActions}>
      <button type="button" className={listening ? styles.listening : ""} aria-pressed={listening} aria-label={listening ? text.stop : text.start} aria-expanded={disclosureOpen} aria-controls={disclosureId} aria-haspopup="dialog" disabled={supported === null} onClick={requestStart}>
        {listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
        <span>{listening ? text.listening : language === "es" ? "Hablar" : "Speak"}</span>
      </button>
      <MorroviaContextualDisclosure
        id={disclosureId}
        open={disclosureOpen}
        onOpenChange={setDisclosureOpen}
        title={text.disclosureTitle}
        detail={text.disclosure}
        linkHref="/journey/privacy#ai-and-speech"
        linkLabel={text.privacy}
        triggerLabel={text.info}
        triggerIconOnly
        actions={<EasyTButton data-disclosure-autofocus="true" size="small" onClick={confirmStart}>{text.begin}</EasyTButton>}
      />
    </div>
    <span className={styles.status} role="status" aria-live="polite">{listening ? text.listening : message}</span>
  </div>;
}
