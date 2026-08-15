"use client";

import { CalendarDays, LockKeyhole, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./home.module.css";

const copy = {
  en: [
    [Sparkles, "Thoughtful first plan", "We plan the hard part, so you can focus on the fun."],
    [CalendarDays, "Saves hours of planning", "Compare options and book with confidence."],
    [LockKeyhole, "Yours to make", "It’s your trip—edit, swap, and shape it your way."],
  ],
  es: [
    [Sparkles, "Un primer plan pensado", "Hacemos la parte difícil para que disfrutes lo importante."],
    [CalendarDays, "Ahorra horas de planificación", "Compara opciones y reserva con confianza."],
    [LockKeyhole, "Hecho a tu manera", "Es tu viaje: edítalo, cámbialo y hazlo tuyo."],
  ],
} as const;

export default function HomeBenefits() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    setLanguage(languageFromStorage());
    const update = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener("easyt-language-change", update);
    return () => window.removeEventListener("easyt-language-change", update);
  }, []);
  return <section className={styles.homeBenefits} aria-label={language === "es" ? "Beneficios de Morrovia" : "Morrovia benefits"}>
    {copy[language].map(([Icon, title, detail]) => <article key={title}><Icon aria-hidden="true" /><div><h2>{title}</h2><p>{detail}</p></div></article>)}
  </section>;
}
