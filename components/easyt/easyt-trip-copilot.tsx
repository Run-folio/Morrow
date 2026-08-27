"use client";

import { Bot, ChevronDown, Send, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { mapCopilotAnswers, mapCopilotPrompts, type MapCopilotScope } from "@/lib/easyt/map-spatial-context";
import type { StoredTripCopilotPreview, TripCopilotResponse } from "@/lib/easyt/trip-copilot-actions";
import type { EasyTTrip } from "@/lib/easyt/trip";
import styles from "./easyt-trip-copilot.module.css";

type Props = {
  surface: "builder" | "map";
  dayCount?: number;
  destination?: string;
  contextLabel?: string;
  scope?: MapCopilotScope;
  tripId?: string;
  stopId?: string;
  dayNumber?: number;
  legId?: string;
  compact?: boolean;
  canApplyChanges?: boolean;
  onTripApplied?: (trip: EasyTTrip) => void;
  onOpenChange?: (open: boolean) => void;
};

const copy = {
  en: { eyebrow: "Morrovia co-pilot", builderTitle: "A little planning help, right when you need it.", mapTitle: "Ask about this day", open: "Ask Morrovia", prompts: ["Suggest a calmer pace", "Help choose my next stop", "What is missing?"], mapPrompts: ["Make this day lighter", "What fits near me now?", "Explain this day"], answers: ["Protect one unscheduled block. It gives transfers, weather and a good meal room to breathe.", "Choose a stop that adds a different feeling, not just another sight. Keep the rest flexible.", "A useful first plan needs a base, enough time there and one open pocket."], mapAnswers: ["Keep the first activity, then leave one block open. This makes the day easier to adapt.", "Use the nearby finder for a real option around your current mapped location, then save the one that fits today.", "This day is a starting point, not a fixed schedule. Move activities, add your own or remove a suggestion."], context: "Based on your current plan", noPlace: "Add a destination first for more specific suggestions.", detail: "Changes are previewed by Morrovia and only saved after you apply them.", askPlaceholder: "Ask about this trip…", send: "Ask", thinking: "Reading your trip…", applying: "Applying to your saved trip…", proposal: "Possible change", review: "Review change", choose: "Choose an outcome", apply: "Apply change", keep: "Keep current trip", applied: "Change applied to your saved trip.", localEdits: "Save or resolve this device copy before applying a co-pilot change.", empty: "Ask a trip question first.", unavailable: "The trip co-pilot is temporarily unavailable." },
  es: { eyebrow: "Copiloto de Morrovia", builderTitle: "Una pequeña ayuda para planificar, justo cuando la necesitas.", mapTitle: "Pregunta sobre este día", open: "Preguntar a Morrovia", prompts: ["Sugiere un ritmo más tranquilo", "Ayúdame a elegir la próxima parada", "¿Qué falta?"], mapPrompts: ["Haz este día más ligero", "¿Qué encaja cerca de mí ahora?", "Explícame este día"], answers: ["Protege un bloque sin planificar. Da espacio a traslados, clima y una buena comida.", "Elige una parada que añada una sensación diferente, no solo otra vista. Mantén flexible el resto.", "Un primer plan útil necesita una base, suficiente tiempo allí y un momento abierto."], mapAnswers: ["Mantén la primera actividad y deja un bloque abierto. Así el día se adapta mejor.", "Usa el buscador cercano para ver una opción real alrededor de tu ubicación actual y guarda la que encaje hoy.", "Este día es un punto de partida, no un horario fijo. Mueve actividades, añade las tuyas o elimina una sugerencia."], context: "Basado en tu plan actual", noPlace: "Añade primero un destino para recibir sugerencias más específicas.", detail: "Morrovia previsualiza los cambios y solo los guarda cuando los aplicas.", askPlaceholder: "Pregunta sobre este viaje…", send: "Preguntar", thinking: "Leyendo tu viaje…", applying: "Aplicando al viaje guardado…", proposal: "Posible cambio", review: "Revisar cambio", choose: "Elige un resultado", apply: "Aplicar cambio", keep: "Mantener viaje actual", applied: "Cambio aplicado al viaje guardado.", localEdits: "Guarda o resuelve esta copia del dispositivo antes de aplicar un cambio.", empty: "Haz una pregunta sobre el viaje.", unavailable: "El copiloto del viaje no está disponible temporalmente." },
} as const;

const mapTitles: Record<MapCopilotScope, string> = {
  "whole-trip": "Ask about this route",
  "selected-stop": "Ask about this stop",
  "selected-day": "Ask about this day",
  "selected-transfer": "Ask about this transfer",
  "selected-place": "Ask about this place",
};
const mapTitlesEs: Record<MapCopilotScope, string> = {
  "whole-trip": "Pregunta sobre esta ruta",
  "selected-stop": "Pregunta sobre esta parada",
  "selected-day": "Pregunta sobre este día",
  "selected-transfer": "Pregunta sobre este traslado",
  "selected-place": "Pregunta sobre este lugar",
};

export default function EasyTTripCopilot({ surface, dayCount = 0, destination, contextLabel, scope = "selected-day", tripId, stopId, dayNumber, legId, compact = false, canApplyChanges = true, onTripApplied, onOpenChange }: Props) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [open, setOpen] = useState(false);
  const [staticAnswer, setStaticAnswer] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [reply, setReply] = useState<TripCopilotResponse | null>(null);
  const [activePreview, setActivePreview] = useState<StoredTripCopilotPreview | null>(null);
  const [applyState, setApplyState] = useState<"idle" | "applying">("idle");
  const [requestState, setRequestState] = useState<"idle" | "loading" | "error">("idle");
  const [requestError, setRequestError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  useEffect(() => {
    requestRef.current?.abort();
    setStaticAnswer(null);
    setReply(null);
    setActivePreview(null);
    setApplyState("idle");
    setRequestState("idle");
    setRequestError("");
  }, [scope, contextLabel, tripId, stopId, dayNumber, legId]);
  useEffect(() => () => requestRef.current?.abort(), []);
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      onOpenChange?.(false);
      window.requestAnimationFrame(() => triggerRef.current?.focus());
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onOpenChange, open]);
  const text = copy[language];
  const prompts = surface === "map" ? mapCopilotPrompts(scope, language) : text.prompts;
  const answers = surface === "map" ? mapCopilotAnswers(scope, language) : text.answers;
  const live = surface === "map" && Boolean(tripId);
  const place = contextLabel ?? destination;
  const context = place ? `${text.context} · ${place}${surface === "map" && scope === "whole-trip" && dayCount ? ` · ${dayCount} ${language === "es" ? "días" : "days"}` : ""}` : text.noPlace;
  const setPanelOpen = (next: boolean) => { setOpen(next); onOpenChange?.(next); };
  const ask = async (question: string) => {
    const trimmed = question.trim();
    if (!trimmed) {
      setRequestState("error");
      setRequestError(text.empty);
      return;
    }
    if (!tripId) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setReply(null);
    setRequestError("");
    setRequestState("loading");
    try {
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(tripId)}/copilot`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          context: {
            ...(stopId ? { stopId } : {}),
            ...(dayNumber ? { dayNumber } : {}),
            ...(legId ? { legId } : {}),
          },
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as (TripCopilotResponse & { error?: string }) | null;
      if (!response.ok || !payload || typeof payload.answer !== "string") throw new Error(payload?.error || text.unavailable);
      setReply(payload);
      setActivePreview(payload.mutationPreview?.preview ?? null);
      setMessage("");
      setRequestState("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRequestState("error");
      setRequestError(error instanceof Error && error.message ? error.message : text.unavailable);
    }
  };
  const applyPreview = async () => {
    if (!tripId || !activePreview || !canApplyChanges || applyState === "applying") return;
    const actionPath = activePreview.action.action === "change_stop_nights" ? "change-stop-nights"
      : activePreview.action.action === "set_trip_preference" ? "set-trip-preference"
        : "change-transport-preference";
    setApplyState("applying");
    setRequestError("");
    try {
      const response = await fetch(`/api/easyt/trips/${encodeURIComponent(tripId)}/copilot/actions/${actionPath}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ previewId: activePreview.previewId }),
      });
      const payload = await response.json().catch(() => null) as { trip?: EasyTTrip; error?: string } | null;
      if (!response.ok || !payload?.trip) throw new Error(payload?.error || "The trip was not changed.");
      onTripApplied?.(payload.trip);
      setReply({ answer: text.applied, scope: "trip", proposedChange: null });
      setActivePreview(null);
    } catch (error) {
      setRequestError(error instanceof Error && error.message ? error.message : "The trip was not changed.");
    } finally {
      setApplyState("idle");
    }
  };
  const choosePrompt = (prompt: string, index: number) => {
    if (live) void ask(prompt);
    else setStaticAnswer(index);
  };
  const mutation = reply?.mutationPreview;
  return <aside className={`${styles.copilot} ${compact ? styles.compact : ""} ${open ? styles.open : ""}`} aria-label={text.eyebrow} data-copilot-scope={surface === "map" ? scope : undefined}>
    <button ref={triggerRef} type="button" className={styles.trigger} onClick={() => setPanelOpen(!open)} aria-expanded={open} aria-label={open ? (language === "es" ? "Cerrar copiloto de Morrovia" : "Close Morrovia co-pilot") : text.open}>
      <span><Bot aria-hidden="true" /><small>{text.eyebrow}</small><strong>{open ? (surface === "map" ? (language === "es" ? mapTitlesEs[scope] : mapTitles[scope]) : text.builderTitle) : text.open}</strong></span><ChevronDown aria-hidden="true" />
    </button>
    {open ? <div className={styles.panel}>
      <p className={styles.context}><Sparkles aria-hidden="true" /> {context}</p>
      <div className={styles.prompts}>{prompts.map((prompt, index) => <button type="button" key={prompt} disabled={requestState === "loading" || applyState === "applying"} onClick={() => choosePrompt(prompt, index)}>{prompt}</button>)}</div>
      {live ? <form className={styles.askForm} onSubmit={(event) => { event.preventDefault(); void ask(message); }}>
        <input value={message} maxLength={500} disabled={requestState === "loading" || applyState === "applying"} onChange={(event) => setMessage(event.target.value)} placeholder={text.askPlaceholder} aria-label={text.askPlaceholder} />
        <button type="submit" disabled={requestState === "loading" || applyState === "applying" || !message.trim()} aria-label={text.send}><Send aria-hidden="true" /></button>
      </form> : null}
      {requestState === "loading" || applyState === "applying" ? <p className={styles.loading} role="status"><span aria-hidden="true" />{applyState === "applying" ? text.applying : text.thinking}</p> : null}
      {requestError ? <p className={styles.error} role="alert">{requestError}</p> : null}
      {reply ? <div className={styles.response} aria-live="polite">
        <p className={styles.answer}>{reply.answer}</p>
        {reply.proposedChange && !mutation ? <p className={styles.proposal}><strong>{text.proposal}</strong><span>{reply.proposedChange.summary}</span></p> : null}
        {mutation && mutation.alternatives.length > 1 && !activePreview ? <section className={styles.alternatives} aria-label={text.choose}>
          <strong>{text.choose}</strong>
          {mutation.alternatives.map((option) => <button type="button" key={option.previewId} onClick={() => { setRequestError(""); setActivePreview(option); }}>{option.summary}</button>)}
          <button type="button" className={styles.keepButton} onClick={() => { setReply(null); setActivePreview(null); }}>{text.keep}</button>
        </section> : null}
        {activePreview ? <section className={styles.preview} aria-label={text.review}>
          <header><small>{text.review}</small><strong>{activePreview.summary}</strong></header>
          <dl>{activePreview.changes.map((change) => <div key={`${change.label}-${change.before}-${change.after}`}><dt>{change.label}</dt><dd><span>{change.before ?? "—"}</span><b aria-hidden="true">→</b><strong>{change.after ?? "—"}</strong></dd></div>)}</dl>
          <p className={styles.impact}>{activePreview.impacts.health.before === activePreview.impacts.health.after ? `Trip health remains ${activePreview.impacts.health.after}; open checks ${activePreview.impacts.health.openIssuesBefore} → ${activePreview.impacts.health.openIssuesAfter}.` : `Trip health: ${activePreview.impacts.health.before} → ${activePreview.impacts.health.after}; open checks ${activePreview.impacts.health.openIssuesBefore} → ${activePreview.impacts.health.openIssuesAfter}.`}</p>
          {activePreview.warnings.length ? <ul>{activePreview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
          {!canApplyChanges ? <p className={styles.applyBlocked}>{text.localEdits}</p> : null}
          <div className={styles.previewActions}>
            <button type="button" onClick={() => void applyPreview()} disabled={!canApplyChanges || applyState === "applying"}>{text.apply}</button>
            <button type="button" onClick={() => { setActivePreview(null); setRequestError(""); if (!mutation?.alternatives.length) setReply(null); }} disabled={applyState === "applying"}>{text.keep}</button>
          </div>
        </section> : null}
      </div> : staticAnswer !== null ? <p className={styles.answer} role="status">{answers[staticAnswer]}</p> : null}
      <small className={styles.disclaimer}>{text.detail}</small>
    </div> : null}
  </aside>;
}
