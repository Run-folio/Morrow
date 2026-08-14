"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Globe2, Languages, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import EasyTNavigation from "../easyt-navigation";
import { canonicalCountry, entrySourcesByCountry, type EntrySource } from "@/lib/easyt/travel-readiness";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./passport.module.css";

const passportOptions = [
  "Australia", "Canada", "Denmark", "Finland", "France", "Germany", "Ireland", "Japan", "Netherlands", "New Zealand", "Norway", "Singapore", "South Korea", "Spain", "Sweden", "United Kingdom", "United States",
];

export default function PassportDestinationClient() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [nationality, setNationality] = useState("United Kingdom");
  const [destination, setDestination] = useState("Guatemala");
  const [source, setSource] = useState<EntrySource | null>(null);
  const destinations = useMemo(() => Object.keys(entrySourcesByCountry).sort((a, b) => a.localeCompare(b)), []);
  const t = language === "es"
    ? { eyebrow: "PASAPORTE AL DESTINO", title: "Comprueba lo que necesitas antes de reservar.", intro: "Una forma sencilla de llegar a la fuente oficial adecuada para tu pasaporte y destino.", passport: "Pasaporte o nacionalidad", destination: "Destino", check: "Comprobar la fuente oficial", private: "No guardamos esta consulta ni pedimos números, fotos o copias del pasaporte.", result: "Tu punto de partida oficial", verify: "Los requisitos pueden cambiar según nacionalidad, residencia, fechas y tránsito. Compruébalos antes de pagar una reserva no reembolsable.", open: "Abrir fuente oficial", plan: "¿Ya tienes una ruta? Crea un plan", note: "Morrovia no toma decisiones de visado." }
    : { eyebrow: "PASSPORT TO DESTINATION", title: "Check what to verify before you book.", intro: "A simple way to reach the right official source for your passport and destination.", passport: "Passport or nationality", destination: "Destination", check: "Check official source", private: "We do not save this check or ask for passport numbers, photos or copies.", result: "Your official starting point", verify: "Requirements can change by nationality, residence, dates and transit route. Verify them before paying for a non-refundable booking.", open: "Open official source", plan: "Already have a route? Build a plan", note: "Morrovia is not a visa decision service." };

  useEffect(() => {
    const update = (event?: Event) => setLanguage(event ? (event as CustomEvent<EasyTLanguage>).detail : languageFromStorage());
    update();
    window.addEventListener("easyt-language-change", update);
    return () => window.removeEventListener("easyt-language-change", update);
  }, []);

  const checkDestination = () => {
    const country = canonicalCountry(destination);
    const record = entrySourcesByCountry[country];
    setSource(record ? { country, ...record } : null);
  };

  return <main className={styles.page}>
    <EasyTNavigation current="passport" showBack={false} />
    <section className={styles.hero}>
      <div className={styles.copy}><p>{t.eyebrow}</p><h1>{t.title}</h1><span>{t.intro}</span></div>
      <Globe2 aria-hidden="true" />
    </section>
    <section className={styles.tool} aria-label={t.eyebrow}>
      <div className={styles.form}>
        <label><span>{t.passport}</span><select value={nationality} onChange={(event) => setNationality(event.target.value)}>{passportOptions.map((country) => <option key={country}>{country}</option>)}</select></label>
        <label><span>{t.destination}</span><select value={destination} onChange={(event) => setDestination(event.target.value)}>{destinations.map((country) => <option key={country}>{country}</option>)}</select></label>
        <button type="button" onClick={checkDestination}>{t.check}<ArrowRight aria-hidden="true" /></button>
      </div>
      <p className={styles.privacy}><ShieldCheck aria-hidden="true" />{t.private}</p>
      {source && <article className={styles.result}>
        <p>{t.result}</p><h2>{source.country}</h2><span>{nationality} passport · {source.label}</span>
        <div><p>{t.verify}</p><a href={source.href} target="_blank" rel="noreferrer">{t.open}<ExternalLink aria-hidden="true" /></a></div>
        <small>{t.note}</small>
      </article>}
    </section>
    <section className={styles.bottom}><div><p>{language === "es" ? "CUANDO LA RUTA ES REAL" : "WHEN THE ROUTE IS REAL"}</p><h2>{language === "es" ? "La preparación completa vive junto a tu viaje." : "Full trip prep lives alongside your route."}</h2></div><Link href="/journey/home#start-building">{t.plan}<ArrowRight /></Link></section>
  </main>;
}
