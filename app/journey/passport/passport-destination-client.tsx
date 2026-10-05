"use client";

import Link from "next/link";
import {
  AlertCircle,
  ArrowRight,
  BadgeCheck,
  BadgeHelp,
  CalendarDays,
  ExternalLink,
  FileCheck2,
  Globe2,
  Info,
  Route,
  ShieldCheck,
  Waves,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import EasyTNavigation from "../easyt-navigation";
import { EasyTButton, EasyTSelect } from "@/components/easyt/easyt-controls";
import { authClient } from "@/lib/auth-client";
import { countryFor } from "@/lib/easyt/country-registry";
import { passportCountryCodeFor, passportCountryLabel, passportDestinationCountries, passportNationalityCountries } from "@/lib/easyt/passport-countries";
import { passportPresentationFor } from "@/lib/easyt/passport-presentation";
import { travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import {
  beginPassportCheck,
  emptyPassportResult,
  failPassportCheck,
  invalidatePassportResult,
  resolvePassportCheck,
  type PassportCheckResult,
} from "@/lib/easyt/passport-result-state";
import { defaultTravelReadinessProfile, entrySourceForCountry, type TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./passport.module.css";
import editorial from "../surface-editorial.module.css";

const copy = {
  en: {
    eyebrow: "PASSPORT TO DESTINATION", title: "Check what to verify before you book.", intro: "Choose your passport and destination to see a reviewed tourist rule where available, or find an official source to check.",
    passport: "Your passport", destination: "Destination", check: "Check requirements", checking: "Checking…", private: "We do not save this check or ask for passport numbers, photos or copies.", failed: "Requirements could not be checked. Try again before relying on this result.",
    resultEyebrow: "TOURIST ENTRY RESULT", entry: "Tourist entry", stay: "Permitted stay", confidence: "Result status", verified: "Reviewed rule", needsConfirmation: "Needs confirmation", unavailable: "Entry information unavailable", resultAvailable: "Official guidance reviewed", noResult: "No matched rule is available",
    officialStrip: "Requirements can change. Check the destination authority before you book or travel.", open: "View official source", considerations: "Entry checks", passportChecks: "Passport checks", validity: "Passport validity", scope: "Tourist-entry scope",
    sourceTitle: "Verification source", official: "Official source", sourceAvailable: "Source available", sourceConfirm: "Source needs confirmation", snapshot: "Checked", freshnessUnknown: "No review date is available for this result.",
    trustTitle: "Use this as a planning check, not a border decision.", trustCopy: "Morrovia does not issue visas, guarantee entry or replace advice from an embassy, consulate or border authority.", privacyTitle: "Your documents stay private", privacyCopy: "This public check uses nationality and destination only. Do not enter passport numbers, scans or booking details.",
    prepEyebrow: "PLANNING A TRIP?", prepTitle: "Trip readiness lives in each trip Overview.", prepCopy: "Keep entry checks, saved reminders, stays and transport decisions with the trip they affect.", prepAction: "Open your trips", buildAction: "Build a plan",
  },
  es: {
    eyebrow: "PASAPORTE AL DESTINO", title: "Comprueba qué verificar antes de reservar.", intro: "Elige tu pasaporte y destino para ver una regla turística revisada, si existe, o encontrar una fuente oficial.",
    passport: "Tu pasaporte", destination: "Destino", check: "Comprobar requisitos", checking: "Comprobando…", private: "No guardamos esta consulta ni pedimos números, fotos o copias del pasaporte.", failed: "No se pudieron comprobar los requisitos. Inténtalo de nuevo antes de confiar en el resultado.",
    resultEyebrow: "RESULTADO DE ENTRADA TURÍSTICA", entry: "Entrada turística", stay: "Estancia permitida", confidence: "Estado del resultado", verified: "Regla revisada", needsConfirmation: "Requiere confirmación", unavailable: "Información de entrada no disponible", resultAvailable: "Guía oficial revisada", noResult: "No hay una regla coincidente disponible",
    officialStrip: "Los requisitos pueden cambiar. Consulta la autoridad del destino antes de reservar o viajar.", open: "Ver fuente oficial", considerations: "Comprobaciones de entrada", passportChecks: "Comprobaciones del pasaporte", validity: "Validez del pasaporte", scope: "Alcance de entrada turística",
    sourceTitle: "Fuente de verificación", official: "Fuente oficial", sourceAvailable: "Fuente disponible", sourceConfirm: "La fuente requiere confirmación", snapshot: "Comprobado", freshnessUnknown: "Este resultado no incluye una fecha de revisión.",
    trustTitle: "Úsalo como comprobación de planificación, no como decisión fronteriza.", trustCopy: "Morrovia no emite visados, garantiza la entrada ni sustituye el consejo de una embajada, consulado o autoridad fronteriza.", privacyTitle: "Tus documentos siguen siendo privados", privacyCopy: "Esta consulta pública solo usa nacionalidad y destino. No introduzcas números, escaneos ni datos de reservas.",
    prepEyebrow: "¿PLANIFICANDO UN VIAJE?", prepTitle: "La preparación vive en el resumen de cada viaje.", prepCopy: "Mantén las comprobaciones, recordatorios, alojamientos y decisiones de transporte junto al viaje al que afectan.", prepAction: "Abrir tus viajes", buildAction: "Crear un plan",
  },
} satisfies Record<EasyTLanguage, Record<string, string>>;

function safeProfile(value: unknown): TravelReadinessProfile {
  if (!value || typeof value !== "object") return defaultTravelReadinessProfile;
  const profile = value as Partial<TravelReadinessProfile>;
  return {
    nationalities: Array.isArray(profile.nationalities) ? profile.nationalities.filter((country): country is string => typeof country === "string") : [],
    residenceCountry: typeof profile.residenceCountry === "string" ? profile.residenceCountry : "",
    passportExpiryMonth: typeof profile.passportExpiryMonth === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(profile.passportExpiryMonth) ? profile.passportExpiryMonth : "",
  };
}

function checkedDateLabel(value: string | null, language: EasyTLanguage): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return new Date(`${value}T00:00:00Z`).toLocaleDateString(language === "es" ? "es-ES" : "en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}

export default function PassportDestinationClient() {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  const [nationality, setNationality] = useState("GB");
  const [destination, setDestination] = useState("GT");
  const [profile, setProfile] = useState<TravelReadinessProfile>(defaultTravelReadinessProfile);
  const [resultState, setResultState] = useState(emptyPassportResult);
  const requestIdRef = useRef(0);
  const passportChosenRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const resultRef = useRef<HTMLElement | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const t = copy[language];

  const invalidateResult = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    const requestId = ++requestIdRef.current;
    setResultState((current) => invalidatePassportResult(current, requestId));
  };

  useEffect(() => {
    const update = (event?: Event) => {
      setLanguage(event ? (event as CustomEvent<EasyTLanguage>).detail : languageFromStorage());
      invalidateResult();
    };
    update();
    window.addEventListener("easyt-language-change", update);
    return () => {
      window.removeEventListener("easyt-language-change", update);
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (sessionPending) return;
    let savedProfile = defaultTravelReadinessProfile;
    try {
      savedProfile = safeProfile(JSON.parse(window.localStorage.getItem(travelReadinessStorageKey(session?.user?.id ?? null)) ?? "null"));
    } catch { /* Keep privacy-safe defaults. */ }
    setProfile(savedProfile);
    const savedNationality = savedProfile.nationalities.map(passportCountryCodeFor).find((code): code is string => Boolean(code));
    if (savedNationality && !passportChosenRef.current && savedNationality !== nationality) {
      invalidateResult();
      setNationality(savedNationality);
    }
  }, [session?.user?.id, sessionPending]);

  useEffect(() => {
    if (resultState.status === "ready") resultRef.current?.focus();
    if (resultState.status === "failed") errorRef.current?.focus();
  }, [resultState.status]);

  const checkDestination = async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    setResultState((current) => beginPassportCheck(current, requestId));
    try {
      const response = await fetch("/api/journey-passport-requirements", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nationality, destination, language }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Passport requirements unavailable");
      const result = await response.json() as PassportCheckResult;
      setResultState((current) => resolvePassportCheck(current, requestId, result));
    } catch (error) {
      if ((error as { name?: string }).name !== "AbortError") setResultState((current) => failPassportCheck(current, requestId));
    }
  };

  const result = resultState.status === "ready"
    && resultState.result.nationality === nationality
    && resultState.result.destination === destination
    && resultState.result.language === language
    ? resultState.result
    : null;
  const presentation = result ? passportPresentationFor({
    requirement: result.requirement,
    language,
    sourceCoverage: entrySourceForCountry(result.destination)?.coverage,
    passportExpiryMonth: profile.passportExpiryMonth,
  }) : null;
  const resultAvailable = presentation?.verification === "verified";
  const resultNationality = result ? countryFor(result.nationality) : null;
  const resultDestination = result ? countryFor(result.destination) : null;

  return <main id="main-content" className={`${styles.page} ${editorial.surface} ${editorial.passport} morrovia-editorial-page`}>
    <EasyTNavigation current="passport" />
    <section className={styles.hero} aria-labelledby="passport-page-title">
      <div className={styles.heroCopy}><p>{t.eyebrow}</p><h1 id="passport-page-title">{t.title}</h1><span>{t.intro}</span></div>
      <div className={styles.heroMark} aria-hidden="true"><Globe2 /><Waves /></div>
    </section>

    <section className={styles.tool} aria-labelledby="passport-check-title">
      <h2 id="passport-check-title" className={styles.srOnly}>{t.eyebrow}</h2>
      <form className={styles.form} onSubmit={(event) => { event.preventDefault(); void checkDestination(); }}>
        <EasyTSelect id="passport-nationality" label={t.passport} value={nationality} onChange={(event) => { passportChosenRef.current = true; invalidateResult(); setNationality(event.target.value); }}>{passportNationalityCountries.map((country) => <option key={country.code} value={country.code}>{country.flag} {passportCountryLabel(country)}</option>)}</EasyTSelect>
        <EasyTSelect id="passport-destination" label={t.destination} value={destination} onChange={(event) => { invalidateResult(); setDestination(event.target.value); }}>{passportDestinationCountries.map((country) => <option key={country.code} value={country.code}>{country.flag} {country.name}</option>)}</EasyTSelect>
        <EasyTButton type="submit" loading={resultState.status === "loading"}>{resultState.status === "loading" ? t.checking : t.check}<ArrowRight aria-hidden="true" /></EasyTButton>
      </form>
      <p className={styles.privacy}><ShieldCheck aria-hidden="true" />{t.private}</p>
      {resultState.status === "failed" ? <p ref={errorRef} tabIndex={-1} role="alert" className={styles.error}><AlertCircle aria-hidden="true" />{t.failed}</p> : null}
    </section>

    {result && presentation ? <div className={styles.results}>
      <article ref={resultRef} tabIndex={-1} className={styles.result} aria-labelledby="passport-result-title">
        <header className={styles.resultHeading}>
          <div><p>{t.resultEyebrow}</p><h2 id="passport-result-title"><span aria-hidden="true">{resultDestination?.flag ?? "🌐"}</span>{resultDestination?.name ?? result.destination}</h2><span>{resultNationality?.flag ?? "🌐"} {resultNationality ? passportCountryLabel(resultNationality) : result.nationality} <span aria-hidden="true">→</span> {resultDestination?.flag ?? "🌐"} {resultDestination?.name ?? result.destination}</span>{resultAvailable ? <small className={styles.ruleScope}>{language === "es" ? "Pasaporte completo de ciudadano británico · turismo" : "Full British citizen passport · tourism"}</small> : null}</div>
          <span className={`${styles.status} ${!resultAvailable ? styles.notVerified : ""}`}>{resultAvailable ? <BadgeCheck aria-hidden="true" /> : <BadgeHelp aria-hidden="true" />}{resultAvailable ? t.verified : result.requirement.informationState === "unsupported" ? t.unavailable : t.needsConfirmation}</span>
        </header>
        {resultAvailable ? <div className={styles.facts}>
          <section><FileCheck2 aria-hidden="true" /><span>{t.entry}</span><strong>{result.requirement.visaAnswer}</strong></section>
          <section><CalendarDays aria-hidden="true" /><span>{t.stay}</span><strong>{result.requirement.permittedStay}</strong></section>
        </div> : null}
        {!resultAvailable ? <div className={styles.sourceStrip}><Info aria-hidden="true" /><p>{result.requirement.detail}</p>{presentation.source.href ? <a href={presentation.source.href} target="_blank" rel="noopener noreferrer">{t.open}<ArrowRight aria-hidden="true" /></a> : null}</div> : null}
      </article>

      {resultAvailable ? <section className={styles.requirements} aria-labelledby="passport-considerations-title">
        <div className={styles.considerationList}>
          <h2 id="passport-considerations-title">{t.considerations}</h2>
          {presentation.entryConsiderations.map((condition, index) => <div className={styles.consideration} key={`${condition}-${index}`}><span className={styles.confirmIcon}><FileCheck2 aria-hidden="true" /></span><div><p>{condition}</p></div></div>)}
          {profile.passportExpiryMonth ? <div className={styles.consideration}><span className={styles.confirmIcon}><CalendarDays aria-hidden="true" /></span><div><p>{presentation.passportValidityContext}</p></div></div> : null}
        </div>
        <aside className={styles.provenance} aria-labelledby="passport-source-title">
          <Globe2 aria-hidden="true" />
          <div><p>{presentation.source.official ? t.official : t.sourceTitle}</p><h2 id="passport-source-title">{presentation.source.label ?? t.sourceTitle}</h2><span>{presentation.source.official ? t.sourceAvailable : t.sourceConfirm}</span></div>
          <dl><div><dt>{t.snapshot}</dt><dd>{checkedDateLabel(presentation.freshness, language) ?? t.freshnessUnknown}</dd></div></dl>
          {presentation.source.href ? <a href={presentation.source.href} target="_blank" rel="noreferrer">{t.open}<ExternalLink aria-hidden="true" /></a> : null}
        </aside>
      </section> : null}

      <section className={styles.trust} aria-label={language === "es" ? "Confianza y privacidad" : "Trust and privacy"}>
        <article><Info aria-hidden="true" /><div><h2>{t.trustTitle}</h2><p>{t.trustCopy}</p></div></article>
        <article><ShieldCheck aria-hidden="true" /><div><h2>{t.privacyTitle}</h2><p>{t.privacyCopy}</p></div></article>
      </section>

      <section className={styles.prepHandoff}>
        <Route aria-hidden="true" />
        <div><p>{t.prepEyebrow}</p><h2>{t.prepTitle}</h2><span>{t.prepCopy}</span></div>
        <div className={styles.prepActions}>{session?.user ? <Link href="/journey/dashboard">{t.prepAction}<ArrowRight aria-hidden="true" /></Link> : null}<Link href="/#start-building">{t.buildAction}<ArrowRight aria-hidden="true" /></Link></div>
      </section>
    </div> : null}
  </main>;
}
