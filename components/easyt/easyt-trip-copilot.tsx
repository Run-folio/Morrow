"use client";

import { Bot, ChevronDown, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./easyt-trip-copilot.module.css";

type Props = { surface: "builder" | "map"; dayCount?: number; destination?: string };

const copy = {
  en: { eyebrow: "EasyT co-pilot", builderTitle: "A little planning help, right when you need it.", mapTitle: "Ask about this day", open: "Ask EasyT", prompts: ["Suggest a calmer pace", "Help choose my next stop", "What is missing?"], mapPrompts: ["Make this day lighter", "What fits near me now?", "Explain this day"], answers: ["Protect one unscheduled block. It gives transfers, weather and a good meal room to breathe.", "Choose a stop that adds a different feeling, not just another sight. Keep the rest flexible.", "A useful first plan needs a base, enough time there and one open pocket."], mapAnswers: ["Keep the first activity, then leave one block open. This makes the day easier to adapt.", "Use the nearby finder for a real option around your current mapped location, then save the one that fits today.", "This day is a starting point, not a fixed schedule. Move activities, add your own or remove a suggestion."], context: "Based on your current plan", noPlace: "Add a destination first for more specific suggestions.", detail: "Guidance only, not a booking or live travel advice." },
  es: { eyebrow: "Copiloto de EasyT", builderTitle: "Una pequeña ayuda para planificar, justo cuando la necesitas.", mapTitle: "Pregunta sobre este día", open: "Preguntar a EasyT", prompts: ["Sugiere un ritmo más tranquilo", "Ayúdame a elegir la próxima parada", "¿Qué falta?"], mapPrompts: ["Haz este día más ligero", "¿Qué encaja cerca de mí ahora?", "Explícame este día"], answers: ["Protege un bloque sin planificar. Da espacio a traslados, clima y una buena comida.", "Elige una parada que añada una sensación diferente, no solo otra vista. Mantén flexible el resto.", "Un primer plan útil necesita una base, suficiente tiempo allí y un momento abierto."], mapAnswers: ["Mantén la primera actividad y deja un bloque abierto. Así el día se adapta mejor.", "Usa el buscador cercano para ver una opción real alrededor de tu ubicación actual y guarda la que encaje hoy.", "Este día es un punto de partida, no un horario fijo. Mueve actividades, añade las tuyas o elimina una sugerencia."], context: "Basado en tu plan actual", noPlace: "Añade primero un destino para recibir sugerencias más específicas.", detail: "Es orientación, no una reserva ni asesoramiento de viaje en tiempo real." },
} as const;

export default function EasyTTripCopilot({ surface, dayCount = 0, destination }: Props) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [open, setOpen] = useState(false);
  const [answer, setAnswer] = useState<number | null>(null);
  useEffect(() => { setLanguage(languageFromStorage()); const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail); window.addEventListener("easyt-language-change", update); return () => window.removeEventListener("easyt-language-change", update); }, []);
  const text = copy[language];
  const prompts = surface === "map" ? text.mapPrompts : text.prompts;
  const answers = surface === "map" ? text.mapAnswers : text.answers;
  const context = destination ? `${text.context} · ${destination}${surface === "map" && dayCount ? ` · ${dayCount} ${language === "es" ? "días" : "days"}` : ""}` : text.noPlace;
  return <aside className={`${styles.copilot} ${open ? styles.open : ""}`} aria-label={text.eyebrow}>
    <button type="button" className={styles.trigger} onClick={() => setOpen((value) => !value)} aria-expanded={open}><span><Bot aria-hidden="true" /><small>{text.eyebrow}</small><strong>{open ? (surface === "map" ? text.mapTitle : text.builderTitle) : text.open}</strong></span><ChevronDown aria-hidden="true" /></button>
    {open ? <div className={styles.panel}><p className={styles.context}><Sparkles aria-hidden="true" /> {context}</p><div className={styles.prompts}>{prompts.map((prompt, index) => <button type="button" key={prompt} onClick={() => setAnswer(index)}>{prompt}</button>)}</div>{answer !== null ? <p className={styles.answer} role="status">{answers[answer]}</p> : null}<small className={styles.disclaimer}>{text.detail}</small></div> : null}
  </aside>;
}
