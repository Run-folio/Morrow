"use client";

import { Mic, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import styles from "./voice-trip-brief.module.css";

type RecognitionResultLike = { 0?: { transcript?: string }; isFinal: boolean };
type RecognitionEventLike = { resultIndex: number; results: ArrayLike<RecognitionResultLike> };
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
  onresult: ((event: RecognitionEventLike) => void) | null;
};
type RecognitionConstructor = new () => RecognitionLike;

declare global {
  interface Window {
    SpeechRecognition?: RecognitionConstructor;
    webkitSpeechRecognition?: RecognitionConstructor;
  }
}

export function appendVoiceTranscript(current: string, transcript: string) {
  const next = transcript.trim();
  if (!next) return current;
  const existing = current.trimEnd();
  return existing ? `${existing}${/\s$/.test(current) ? "" : " "}${next}` : next;
}

type VoiceTripBriefProps = {
  language: "en" | "es";
  onTranscript: (transcript: string) => void;
  className?: string;
};

export function VoiceTripBrief({ language, onTranscript, className }: VoiceTripBriefProps) {
  const recognitionRef = useRef<RecognitionLike | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    onTranscriptRef.current = onTranscript;
  }, [onTranscript]);

  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    return () => recognitionRef.current?.abort();
  }, []);

  const text = language === "es"
    ? {
        start: "Usar voz para añadir una idea de viaje",
        stop: "Dejar de escuchar",
        listening: "Escuchando…",
        blocked: "El acceso al micrófono está bloqueado. Puedes seguir escribiendo.",
        unavailable: "La entrada por voz no está disponible aquí. Puedes seguir escribiendo.",
        noSpeech: "No oímos nada. Puedes intentarlo de nuevo o seguir escribiendo.",
      }
    : {
        start: "Use voice to add a trip idea",
        stop: "Stop listening",
        listening: "Listening…",
        blocked: "Microphone access was blocked. You can keep typing.",
        unavailable: "Voice input isn’t available in this browser. You can keep typing.",
        noSpeech: "We didn’t hear anything. Try again or keep typing.",
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
      const transcript = Array.from(event.results)
        .slice(event.resultIndex)
        .filter((result) => result.isFinal)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        heardSpeech = true;
        onTranscriptRef.current(transcript);
      }
    };
    recognition.onerror = ({ error }) => {
      hadError = true;
      if (error === "not-allowed" || error === "service-not-allowed") setMessage(text.blocked);
      else if (error === "no-speech") setMessage(text.noSpeech);
      else setMessage(text.unavailable);
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

  if (!supported) return null;

  return <div className={`${styles.voice} ${className ?? ""}`}>
    <button type="button" className={listening ? styles.listening : ""} aria-pressed={listening} aria-label={listening ? text.stop : text.start} onClick={listening ? stop : start}>
      {listening ? <Square aria-hidden="true" /> : <Mic aria-hidden="true" />}
      <span>{listening ? text.listening : language === "es" ? "Hablar" : "Speak"}</span>
    </button>
    <span className={styles.status} role="status" aria-live="polite">{listening ? text.listening : message}</span>
  </div>;
}
