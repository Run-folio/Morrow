"use client";

import { AlertCircle, CarFront, ChevronRight, FileCheck2, Globe2, Plane, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { defaultTravelReadinessProfile, type ReadinessCard, type TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { trackEvent } from "@/lib/analytics";
import styles from "./journey-trip-readiness.module.css";

const profileStorageKey = "easyt-travel-readiness-profile";

const iconFor = (id: ReadinessCard["id"]) => ({
  entry: FileCheck2,
  passport: ShieldCheck,
  esim: Smartphone,
  insurance: ShieldCheck,
  driving: CarFront,
  "china-internet": Globe2,
})[id];

export function JourneyTripReadiness({
  countries,
  startDate,
  language = "en",
  hideConnectivity = false,
}: {
  countries: string[];
  startDate?: string;
  language?: "en" | "es";
  hideConnectivity?: boolean;
}) {
  const [profile, setProfile] = useState<TravelReadinessProfile>(defaultTravelReadinessProfile);
  const [cards, setCards] = useState<ReadinessCard[]>([]);
  const [expanded, setExpanded] = useState(false);
  const destinationKey = countries.filter(Boolean).join("|");
  const destinations = useMemo(() => [...new Set(countries.filter(Boolean))], [destinationKey]);
  const labels = language === "es"
    ? { eyebrow: "ANTES DE SALIR", title: "Los pequeños checks que protegen el plan.", description: "Útil, no alarmista. Personaliza solo lo necesario; nunca guardes datos de pasaporte.", setup: "Personalizar para mí", hide: "Ocultar detalles", nationality: "Nacionalidad(es)", residence: "País de residencia", expiry: "Mes de caducidad del pasaporte", save: "Guardar en este dispositivo", saved: "Guardado", secure: "No pedimos números, fotos ni copias del pasaporte.", essential: "ESENCIAL", useful: "ÚTIL", noTrip: "Añade una parada para ver la preparación del viaje." }
    : { eyebrow: "BEFORE YOU GO", title: "The small checks that protect the plan.", description: "Useful, not alarmist. Personalise only what helps; never store passport details.", setup: "Personalise for me", hide: "Hide details", nationality: "Nationality / nationalities", residence: "Country of residence", expiry: "Passport expiry month", save: "Save on this device", saved: "Saved", secure: "We never ask for passport numbers, scans or photos.", essential: "ESSENTIAL", useful: "USEFUL", noTrip: "Add a stop to see trip preparation." };

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(profileStorageKey) ?? "null") as Partial<TravelReadinessProfile> | null;
      if (saved && Array.isArray(saved.nationalities)) setProfile({
        nationalities: saved.nationalities.filter((country): country is string => typeof country === "string"),
        residenceCountry: typeof saved.residenceCountry === "string" ? saved.residenceCountry : "",
        passportExpiryMonth: typeof saved.passportExpiryMonth === "string" ? saved.passportExpiryMonth : "",
      });
    } catch { /* Start with the privacy-safe empty profile. */ }
  }, []);

  useEffect(() => {
    if (!destinations.length) { setCards([]); return; }
    let active = true;
    void fetch("/api/journey-readiness", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ countries: destinations, startDate, profile, language }),
    }).then(async (response) => {
      const payload = await response.json() as { cards?: ReadinessCard[] };
      if (active && response.ok) setCards(payload.cards ?? []);
    }).catch(() => { if (active) setCards([]); });
    return () => { active = false; };
  }, [destinations, profile, startDate]);

  const saveProfile = () => {
    window.localStorage.setItem(profileStorageKey, JSON.stringify(profile));
  };

  return (
    <section className={styles.panel} aria-labelledby="trip-readiness-title">
      <div className={styles.heading}>
        <div><p>{labels.eyebrow}</p><h2 id="trip-readiness-title">{labels.title}</h2><span>{labels.description}</span></div>
        <Plane aria-hidden="true" />
      </div>
      {!destinations.length ? <p className={styles.empty}>{labels.noTrip}</p> : <>
        <div className={styles.cards}>
          {cards.filter((card) => !(hideConnectivity && card.id === "esim")).map((card) => {
            const Icon = iconFor(card.id);
            return <article className={`${styles.card} ${card.priority === "essential" ? styles.essential : ""}`} key={card.id}>
              <Icon aria-hidden="true" />
              <div><small>{card.priority === "essential" ? labels.essential : labels.useful}{card.partner ? " · SAILY" : ""}</small><h3>{card.title}</h3><p>{card.detail}</p>{card.note ? <em><AlertCircle aria-hidden="true" />{card.note}</em> : null}{card.sources?.length ? <ul className={styles.entrySources}>{card.sources.map((source) => <li key={source.country}><span>{source.country}</span><a href={source.href} target="_blank" rel="noreferrer">{source.coverage === "official" ? source.label : (language === "es" ? "Comprobar guía oficial" : "Check official guidance")}<ChevronRight aria-hidden="true" /></a></li>)}</ul> : null}{card.href && card.cta ? <><a href={card.href} target="_blank" rel={card.partner ? "noreferrer sponsored" : "noreferrer"} onClick={() => { if (card.partner) trackEvent("easyt_readiness_affiliate_clicked", { partner: card.partner, card: card.id }); }}>{card.cta}<ChevronRight aria-hidden="true" /></a>{card.partner ? <small className={styles.disclosure}>{language === "es" ? "Enlace de socio: podemos recibir una comisión sin coste adicional para ti." : "Partner link: we may earn a commission at no extra cost to you."}</small> : null}</> : null}</div>
            </article>;
          })}
        </div>
        <div className={styles.profileToggle}><button type="button" onClick={() => setExpanded((current) => !current)}>{expanded ? labels.hide : labels.setup}</button><span><ShieldCheck aria-hidden="true" />{labels.secure}</span></div>
        {expanded ? <div className={styles.profileFields}>
          <label><span>{labels.nationality}</span><input value={profile.nationalities.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, nationalities: event.target.value.split(",").map((country) => country.trim()).filter(Boolean).slice(0, 4) }))} placeholder={language === "es" ? "Por ejemplo, Reino Unido" : "For example, United Kingdom"} /></label>
          <label><span>{labels.residence}</span><input value={profile.residenceCountry} onChange={(event) => setProfile((current) => ({ ...current, residenceCountry: event.target.value }))} placeholder={language === "es" ? "Por ejemplo, Reino Unido" : "For example, United Kingdom"} /></label>
          <label><span>{labels.expiry}</span><input type="month" value={profile.passportExpiryMonth} onChange={(event) => setProfile((current) => ({ ...current, passportExpiryMonth: event.target.value }))} /></label>
          <button type="button" onClick={saveProfile}>{labels.save}<ChevronRight aria-hidden="true" /></button>
        </div> : null}
      </>}
    </section>
  );
}
