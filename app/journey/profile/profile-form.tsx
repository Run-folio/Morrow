"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { BedDouble, Coffee, Footprints, Gem, Landmark, Luggage, Sparkles, Sun, Trees, Wallet, Zap } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  EasyTButton,
  EasyTField,
} from "@/components/easyt/easyt-controls";
import styles from "../account.module.css";
import { easytCopy } from "@/lib/easyt/i18n";
import { type TravelProfile } from "@/lib/easyt/travel-profile";

const paceOptions = [
  { value: "slow", label: "Slow", detail: "One good thing at a time", icon: Sun },
  { value: "balanced", label: "Balanced", detail: "Plan, then leave room", icon: Footprints },
  { value: "full", label: "Full", detail: "Make the most of each day", icon: Zap },
] as const;
const priorityOptions = [
  { value: "food", label: "Food", icon: Coffee },
  { value: "nature", label: "Nature", icon: Trees },
  { value: "culture", label: "Culture", icon: Landmark },
  { value: "mix", label: "A mix", icon: Sparkles },
] as const;
const moveOptions = [
  { value: "few", label: "Stay put", detail: "Fewer hotel moves", icon: BedDouble },
  { value: "some", label: "A few", detail: "Change bases when it helps", icon: Luggage },
  { value: "open", label: "Keep moving", detail: "Follow the best places", icon: Footprints },
] as const;
const comfortOptions = [
  { value: "value", label: "Good value", icon: Wallet },
  { value: "mid", label: "Mid-range", icon: Sparkles },
  { value: "high", label: "Best available", icon: Gem },
] as const;

export default function ProfileForm({
  name: initialName,
  email,
  initialLanguage,
  initialTravelProfile,
}: {
  name: string;
  email: string;
  initialLanguage: "en" | "es";
  initialTravelProfile: TravelProfile;
}) {
  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState(initialLanguage);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [travelProfile, setTravelProfile] = useState<TravelProfile>(initialTravelProfile);
  const copy = easytCopy[language];
  const profileGuide = language === "es"
    ? { eyebrow: "Punto de partida", title: "Configúralo una vez. Ajusta cada viaje cuando quieras.", detail: "Estas preferencias solo dan a EasyT una dirección inicial. No reservan nada ni limitan las decisiones de tu viaje.", action: "Crear un viaje" }
    : { eyebrow: "Starting point", title: "Set this once. Change every trip whenever you want.", detail: "These preferences only give EasyT an initial direction. They do not book anything or limit your decisions on a trip.", action: "Create a trip" };
  const messages = language === "es"
    ? {
        profileSaved: "Tu perfil se ha actualizado.",
        profileError: "No pudimos guardar tu perfil ahora. Revisa tu conexión e inténtalo de nuevo.",
        preferencesSaved: "Preferencias guardadas. EasyT las usará como punto de partida para nuevos viajes.",
        preferencesError: "No pudimos guardar tus preferencias. Inténtalo de nuevo; tu viaje actual no cambiará.",
      }
    : {
        profileSaved: "Your profile has been updated.",
        profileError: "We could not save your profile just now. Check your connection and try again.",
        preferencesSaved: "Travel preferences saved. EasyT will use them as a starting point for new trips.",
        preferencesError: "We could not save your travel preferences. Try again; your current trip will not change.",
      };

  useEffect(() => {
    window.localStorage.setItem("easyt-language", initialLanguage);
    document.documentElement.lang = initialLanguage;
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<"en" | "es">).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, [initialLanguage]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    const result = await authClient.updateUser({ name });
    setSaving(false);
    setMessage(
      result.error ? messages.profileError : messages.profileSaved,
    );
  };

  const saveTravelProfile = async () => {
    setSaving(true);
    const response = await fetch("/api/easyt/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ language, travelProfile }),
    });
    if (response.ok) window.localStorage.setItem("easyt-travel-profile", JSON.stringify(travelProfile));
    setSaving(false);
    setMessage(response.ok ? messages.preferencesSaved : messages.preferencesError);
  };

  return (
    <div className={styles.profileGrid}>
      <form className={styles.profileCard} onSubmit={save}>
        <h2>{copy.account.personal}</h2>
        <EasyTField label={copy.account.name} value={name} onChange={(event) => setName(event.target.value)} />
        <EasyTField label={copy.account.email} value={email} disabled readOnly />
        <EasyTButton type="submit" loading={saving}>{copy.account.saveProfile}</EasyTButton>
      </form>
      <section className={`${styles.profileCard} ${styles.travelProfileCard}`}>
        <div className={styles.profileGuide}><div><p className={styles.eyebrow}>{profileGuide.eyebrow}</p><strong>{profileGuide.title}</strong><span>{profileGuide.detail}</span></div><Link href="/journey/new">{profileGuide.action}</Link></div>
        <p className={styles.eyebrow}>YOUR TRAVEL PROFILE</p>
        <h2>What makes a trip feel good?</h2>
        <p className={styles.muted}>EasyT uses these as a starting point. You can always override them on any trip.</p>
        <div className={styles.profileVisuals}>
          <section className={styles.preferenceDial}>
            <div className={styles.preferenceHead}><span>Pace</span><b>{paceOptions.find((option) => option.value === travelProfile.pace)?.label}</b></div>
            <div className={styles.dialOptions}>{paceOptions.map((option) => { const Icon = option.icon; const active = travelProfile.pace === option.value; return <button type="button" key={option.value} className={active ? styles.dialActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, pace: option.value }))}><Icon /><strong>{option.label}</strong><small>{option.detail}</small></button>; })}</div>
            <input className={styles.preferenceRange} type="range" min="0" max="2" step="1" value={paceOptions.findIndex((option) => option.value === travelProfile.pace)} onChange={(event) => setTravelProfile((current) => ({ ...current, pace: paceOptions[Number(event.target.value)].value }))} aria-label="Trip pace" />
          </section>
          <section className={styles.preferenceChoices}>
            <div className={styles.preferenceHead}><span>What pulls you in</span><b>Choose the lead</b></div>
            <div>{priorityOptions.map((option) => { const Icon = option.icon; const active = travelProfile.priority === option.value; return <button type="button" key={option.value} className={active ? styles.choiceActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, priority: option.value }))}><Icon /><span>{option.label}</span></button>; })}</div>
          </section>
          <section className={styles.preferenceMoves}>
            <div className={styles.preferenceHead}><span>Hotel moves</span><b>{moveOptions.find((option) => option.value === travelProfile.hotelMoves)?.label}</b></div>
            <div>{moveOptions.map((option) => { const Icon = option.icon; const active = travelProfile.hotelMoves === option.value; return <button type="button" key={option.value} className={active ? styles.moveActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, hotelMoves: option.value }))}><Icon /><strong>{option.label}</strong><small>{option.detail}</small></button>; })}</div>
          </section>
          <section className={styles.preferenceDial}>
            <div className={styles.preferenceHead}><span>Comfort level</span><b>{comfortOptions.find((option) => option.value === travelProfile.budget)?.label}</b></div>
            <div className={styles.dialOptions}>{comfortOptions.map((option) => { const Icon = option.icon; const active = travelProfile.budget === option.value; return <button type="button" key={option.value} className={active ? styles.dialActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, budget: option.value }))}><Icon /><strong>{option.label}</strong></button>; })}</div>
            <input className={styles.preferenceRange} type="range" min="0" max="2" step="1" value={comfortOptions.findIndex((option) => option.value === travelProfile.budget)} onChange={(event) => setTravelProfile((current) => ({ ...current, budget: comfortOptions[Number(event.target.value)].value }))} aria-label="Comfort level" />
          </section>
        </div>
        <EasyTButton type="button" loading={saving} onClick={saveTravelProfile}>Save travel profile</EasyTButton>
      </section>
      {message ? (
        <p className={styles.profileMessage} role="status">
          {message}
        </p>
      ) : null}
    </div>
  );
}
