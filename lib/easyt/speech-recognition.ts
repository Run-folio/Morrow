export type SpeechRecognitionResultLike = { 0?: { transcript?: string }; isFinal: boolean };
export type SpeechRecognitionEventLike = { resultIndex: number; results: ArrayLike<SpeechRecognitionResultLike> };

export type SpeechFailureKind = "blocked" | "noSpeech" | "unavailable";

export function appendVoiceTranscript(current: string, transcript: string) {
  const next = transcript.trim();
  if (!next) return current;
  const existing = current.trimEnd();
  return existing ? `${existing} ${next}` : next;
}

export function finalSpeechTranscript(event: SpeechRecognitionEventLike) {
  return Array.from(event.results)
    .slice(event.resultIndex)
    .filter((result) => result.isFinal)
    .map((result) => (result[0]?.transcript ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function speechFailureKind(error: string): SpeechFailureKind {
  if (error === "not-allowed" || error === "service-not-allowed") return "blocked";
  if (error === "no-speech") return "noSpeech";
  return "unavailable";
}
