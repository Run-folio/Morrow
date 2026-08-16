"use client";

import Link from "next/link";
import { ArrowRight, ExternalLink, Globe2, Languages, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import EasyTNavigation from "../easyt-navigation";
import { canonicalCountry, entrySourcesByCountry, type EntrySource } from "@/lib/easyt/travel-readiness";
import { countryFlagFor, supportedPassportCountries, touristEntryRequirementFor, type TouristEntryRequirement } from "@/lib/easyt/visa-requirements";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./passport.module.css";
import editorial from "../surface-editorial.module.css";

export default function PassportDestinationClient() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [nationality, setNationality] = useState("United Kingdom");
  const [destination, setDestination] = useState("Guatemala");
  const [source, setSource] = useState<EntrySource | null>(null);
  const [requirement, setRequirement] = useState<TouristEntryRequirement | null>(null);
  const destinations = useMemo(() => Object.keys(entrySourcesByCountry).sort((a, b) => a.localeCompare(b)), []);
  const t = language === "es"
    ? { eyebrow: "PASAPORTE AL DESTINO", title: "Comprueba lo que necesitas antes de reservar.", intro: "Consulta el visado turístico y la estancia permitida para tu pasaporte y destino.", passport: "Pasaporte o nacionalidad", destination: "Destino", check: "Comprobar requisitos", private: "No guardamos esta consulta ni pedimos números, fotos o copias del pasaporte.", result: "ENTRADA COMO TURISTA", visa: "Visado turístico", stay: "Estancia permitida", updated: "Datos actualizados", verify: "Las normas pueden cambiar. Comprueba la fuente oficial antes de pagar una reserva no reembolsable.", open: "Comprobar fuente oficial", plan: "¿Ya tienes una ruta? Crea un plan", note: "Datos indicativos para turismo; la autoridad fronteriza toma la decisión final." }
    : { eyebrow: "PASSPORT TO DESTINATION", title: "Check what to verify before you book.", intro: "See the tourist-visa position and permitted stay for your passport and destination.", passport: "Passport or nationality", destination: "Destination", check: "Check requirements", private: "We do not save this check or ask for passport numbers, photos or copies.", result: "TOURIST ENTRY", visa: "Tourist visa", stay: "Permitted stay", updated: "Data updated", verify: "Rules can change. Check the official source before paying for a non-refundable booking.", open: "Check official source", plan: "Already have a route? Build a plan", note: "Indicative tourism data; the border authority makes the final decision." };

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
    setRequirement(touristEntryRequirementFor(nationality, country, language));
  };

  return <main className={`${styles.page} ${editorial.surface} ${editorial.passport} morrovia-editorial-page`}>
    <EasyTNavigation current="passport" showBack={false} />
    <section className={styles.hero}>
      <div className={styles.copy}><p>{t.eyebrow}</p><h1>{t.title}</h1><span>{t.intro}</span></div>
      <Globe2 aria-hidden="true" />
    </section>
    <section className={styles.tool} aria-label={t.eyebrow}>
      <div className={styles.form}>
        <label><span>{t.passport}</span><select value={nationality} onChange={(event) => setNationality(event.target.value)}>{supportedPassportCountries.map((country) => <option key={country} value={country}>{countryFlagFor(country)} {country}</option>)}</select></label>
        <label><span>{t.destination}</span><select value={destination} onChange={(event) => setDestination(event.target.value)}>{destinations.map((country) => <option key={country} value={country}>{countryFlagFor(country)} {country}</option>)}</select></label>
        <button type="button" onClick={checkDestination}>{t.check}<ArrowRight aria-hidden="true" /></button>
      </div>
      <p className={styles.privacy}><ShieldCheck aria-hidden="true" />{t.private}</p>
      {source && requirement && <article className={styles.result}>
        <div className={styles.resultHeading}><div><p>{t.result}</p><h2><span className={styles.countryFlag} aria-hidden="true">{countryFlagFor(nationality)}</span>{nationality} <span aria-hidden="true">→</span> <span className={styles.countryFlag} aria-hidden="true">{countryFlagFor(source.country)}</span>{source.country}</h2></div><span className={`${styles.status} ${requirement.status === "not-verified" ? styles.notVerified : ""}`}>{requirement.statusLabel}</span></div>
        <div className={styles.facts}>
          <section><span>{t.visa}</span><strong>{requirement.visaAnswer}</strong></section>
          <section><span>{t.stay}</span><strong>{requirement.permittedStay}</strong></section>
        </div>
        <p className={styles.detail}>{requirement.detail}</p>
        <ul>{requirement.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
        <div className={styles.sourceRow}><div><p>{t.verify}</p>{requirement.dataUpdatedAt && <small>{t.updated}: {requirement.dataUpdatedAt}</small>}</div><a href={requirement.sourceHref} target="_blank" rel="noreferrer">{t.open}<ExternalLink aria-hidden="true" /></a></div>
        <small>{t.note}</small>
      </article>}
    </section>
    <section className={styles.bottom}><div><p>{language === "es" ? "CUANDO LA RUTA ES REAL" : "WHEN THE ROUTE IS REAL"}</p><h2>{language === "es" ? "La preparación completa vive junto a tu viaje." : "Full trip prep lives alongside your route."}</h2></div><Link href="/journey/home#start-building">{t.plan}<ArrowRight /></Link></section>
  </main>;
}
