"use client";

import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { BedDouble, Building2, Coffee, Footprints, Gem, Landmark, Luggage, Mountain, Sparkles, Sun, Trees, Wallet, Waves, Zap, type LucideIcon } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  EasyTButton,
  EasyTField,
  EasyTLinkButton,
} from "@/components/easyt/easyt-controls";
import styles from "../account.module.css";
import { easytCopy } from "@/lib/easyt/i18n";
import { type TravelProfile } from "@/lib/easyt/travel-profile";
import { type TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import { ownerBoundaryState, travelProfileStorageKey, travelReadinessStorageKey } from "@/lib/easyt/private-browser-context";
import { EASYT_LAST_OWNER_KEY, loadRememberedOwner } from "@/lib/easyt/storage";
import { journeyReauthenticationPath } from "@/lib/easyt/trip-continuity";
import { tripInterestIds, tripInterestLabels, type TripInterest } from "@/lib/easyt/trip-interest";

const paceOptions = [
  { value: "slow", label: "Slow", detail: "One good thing at a time", icon: Sun },
  { value: "balanced", label: "Balanced", detail: "Plan, then leave room", icon: Footprints },
  { value: "full", label: "Full", detail: "Make the most of each day", icon: Zap },
] as const;
const interestIcons: Record<TripInterest, LucideIcon> = {
  food: Coffee,
  culture: Landmark,
  nature: Trees,
  cities: Building2,
  beach: Waves,
  hiking: Mountain,
};
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

type SaveMessage = {
  text: string;
  tone: "error" | "success";
};

const rangeProgress = (index: number) => ({
  "--profile-progress": `${index * 50}%`,
}) as CSSProperties;

export default function ProfileForm({
  ownerId,
  name: initialName,
  email,
  initialLanguage,
  initialTravelProfile,
  initialTravelReadinessProfile,
}: {
  ownerId: string;
  name: string;
  email: string;
  initialLanguage: "en" | "es";
  initialTravelProfile: TravelProfile;
  initialTravelReadinessProfile: TravelReadinessProfile;
}) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const authenticatedOwnerRef = useRef<string | null>(ownerId);
  if (session?.user?.id) authenticatedOwnerRef.current = session.user.id;
  const [rememberedOwnerId, setRememberedOwnerId] = useState<string | null>(ownerId);
  const [name, setName] = useState(initialName);
  const [language, setLanguage] = useState(initialLanguage);
  const [accountMessage, setAccountMessage] = useState<SaveMessage | null>(null);
  const [travelMessage, setTravelMessage] = useState<SaveMessage | null>(null);
  const [accountSaving, setAccountSaving] = useState(false);
  const [travelSaving, setTravelSaving] = useState(false);
  const [travelProfile, setTravelProfile] = useState<TravelProfile>(initialTravelProfile);
  const [travelReadinessProfile, setTravelReadinessProfile] = useState<TravelReadinessProfile>(initialTravelReadinessProfile);
  const [nationalitiesInput, setNationalitiesInput] = useState(initialTravelReadinessProfile.nationalities.join(", "));
  const copy = easytCopy[language];
  const profileCopy = language === "es"
    ? {
        guideEyebrow: "Punto de partida",
        guideTitle: "Configúralo una vez. Ajusta cada viaje cuando quieras.",
        guideDetail: "Estas preferencias solo dan a Morrovia una dirección inicial. No reservan nada ni limitan las decisiones de tu viaje.",
        travelEyebrow: "Tu perfil de viaje",
        travelTitle: "¿Qué hace que un viaje se sienta bien?",
        travelDetail: "Morrovia las usa como punto de partida. Puedes cambiarlas en cualquier viaje.",
        interestsTitle: "Intereses habituales",
        interestsDetail: "Preselecciónalos en viajes nuevos",
        interestsSelected: "seleccionados",
        beforeEyebrow: "Antes de salir",
        beforeTitle: "Haz que las comprobaciones prácticas sean más útiles.",
        beforeDetail: "Usamos estos datos solo para orientar recordatorios de entrada, visado y conectividad.",
        privacyDetail: "Nunca introduzcas números, fotos o copias del pasaporte.",
        nationalities: "Nacionalidad(es)",
        residence: "País de residencia",
        passportExpiry: "Mes de caducidad del pasaporte",
        countryPlaceholder: "Por ejemplo, Reino Unido",
        saveTravel: "Guardar perfil de viaje",
      }
    : {
        guideEyebrow: "Starting point",
        guideTitle: "Set this once. Change every trip whenever you want.",
        guideDetail: "These preferences only give Morrovia an initial direction. They do not book anything or limit your decisions on a trip.",
        travelEyebrow: "Your travel profile",
        travelTitle: "What makes a trip feel good?",
        travelDetail: "Morrovia uses these as a starting point. You can override them on any trip.",
        interestsTitle: "Usual interests",
        interestsDetail: "Preselect on new trips",
        interestsSelected: "selected",
        beforeEyebrow: "Before you go",
        beforeTitle: "Make practical trip checks more useful.",
        beforeDetail: "We use this only to shape entry, visa and connectivity reminders.",
        privacyDetail: "Never enter passport numbers, scans or photos.",
        nationalities: "Nationality / nationalities",
        residence: "Country of residence",
        passportExpiry: "Passport expiry month",
        countryPlaceholder: "For example, United Kingdom",
        saveTravel: "Save travel profile",
      };
  const messages = language === "es"
    ? {
        profileSaved: "Tu perfil se ha actualizado.",
        profileError: "No pudimos guardar tu perfil ahora. Revisa tu conexión e inténtalo de nuevo.",
        preferencesSaved: "Preferencias guardadas. Morrovia las usará como punto de partida para nuevos viajes.",
        preferencesError: "No pudimos guardar tus preferencias. Inténtalo de nuevo; tu viaje actual no cambiará.",
      }
    : {
        profileSaved: "Your profile has been updated.",
        profileError: "We could not save your profile just now. Check your connection and try again.",
        preferencesSaved: "Travel preferences saved. Morrovia will use them as a starting point for new trips.",
        preferencesError: "We could not save your travel preferences. Try again; your current trip will not change.",
      };

  useEffect(() => {
    window.localStorage.setItem("easyt-language", initialLanguage);
    document.documentElement.lang = initialLanguage;
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<"en" | "es">).detail);
    window.addEventListener("easyt-language-change", updateLanguage);
    return () => window.removeEventListener("easyt-language-change", updateLanguage);
  }, [initialLanguage]);

  useEffect(() => {
    setAccountMessage(null);
  }, [name]);

  useEffect(() => {
    setTravelMessage(null);
  }, [nationalitiesInput, travelProfile, travelReadinessProfile]);

  const boundary = ownerBoundaryState({ renderedOwnerId: ownerId, sessionOwnerId: session?.user?.id, rememberedOwnerId, sessionPending, previouslyAuthenticatedOwnerId: authenticatedOwnerRef.current });
  useEffect(() => {
    const refreshOwner = () => setRememberedOwnerId(loadRememberedOwner());
    const onStorage = (event: StorageEvent) => { if (event.key === EASYT_LAST_OWNER_KEY) refreshOwner(); };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
  useEffect(() => {
    if (boundary === "mismatch") window.location.reload();
  }, [boundary]);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setAccountSaving(true);
    setAccountMessage(null);
    try {
      const result = await authClient.updateUser({ name });
      setAccountMessage({
        text: result.error ? messages.profileError : messages.profileSaved,
        tone: result.error ? "error" : "success",
      });
    } catch {
      setAccountMessage({ text: messages.profileError, tone: "error" });
    } finally {
      setAccountSaving(false);
    }
  };

  const saveTravelProfile = async () => {
    setTravelSaving(true);
    setTravelMessage(null);
    try {
      const response = await fetch("/api/easyt/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language, travelProfile, travelReadinessProfile }),
      });
      if (response.ok) {
        window.localStorage.setItem(travelProfileStorageKey(ownerId), JSON.stringify(travelProfile));
        window.localStorage.setItem(travelReadinessStorageKey(ownerId), JSON.stringify(travelReadinessProfile));
      }
      setTravelMessage({
        text: response.ok ? messages.preferencesSaved : messages.preferencesError,
        tone: response.ok ? "success" : "error",
      });
    } catch {
      setTravelMessage({ text: messages.preferencesError, tone: "error" });
    } finally {
      setTravelSaving(false);
    }
  };

  if (boundary === "mismatch") return <section className={styles.profileCard} role="status">Account changed. Refreshing your private profile…</section>;
  if (boundary === "expired" || boundary === "signed-out") return <section className={styles.profileCard} role="alert"><h2>Your session ended</h2><p>Your private profile is hidden until you sign in again.</p><EasyTLinkButton href={journeyReauthenticationPath("/journey/profile")}>Sign in again</EasyTLinkButton></section>;

  return (
    <div className={styles.profileGrid}>
      <form className={`${styles.profileCard} ${styles.personalProfileCard}`} onSubmit={save}>
        <h2>{copy.account.personal}</h2>
        <EasyTField label={copy.account.name} value={name} onChange={(event) => setName(event.target.value)} />
        <EasyTField label={copy.account.email} value={email} disabled readOnly />
        <EasyTButton className={styles.accountSave} type="submit" loading={accountSaving}>{copy.account.saveProfile}</EasyTButton>
        {accountMessage ? (
          <p
            className={`${styles.profileMessage} ${accountMessage.tone === "success" ? styles.profileMessageSuccess : styles.profileMessageError} ${styles.accountMessage}`}
            role={accountMessage.tone === "error" ? "alert" : "status"}
          >
            {accountMessage.text}
          </p>
        ) : null}
      </form>
      <section className={`${styles.profileCard} ${styles.travelProfileCard}`}>
        <header className={styles.travelProfileHeader}>
          <div className={styles.travelProfileIntro}>
            <p className={styles.eyebrow}>{profileCopy.travelEyebrow}</p>
            <h2>{profileCopy.travelTitle}</h2>
            <p className={styles.muted}>{profileCopy.travelDetail}</p>
          </div>
          <aside className={styles.profileGuide} aria-label={profileCopy.guideEyebrow}>
            <p className={styles.eyebrow}>{profileCopy.guideEyebrow}</p>
            <strong>{profileCopy.guideTitle}</strong>
            <span>{profileCopy.guideDetail}</span>
          </aside>
        </header>
        <div className={styles.profileVisuals}>
          <section className={styles.preferenceDial}>
            <div className={styles.preferenceHead}><h3>Pace</h3><b>{paceOptions.find((option) => option.value === travelProfile.pace)?.label}</b></div>
            <div className={styles.dialOptions} role="group" aria-label="Trip pace options">{paceOptions.map((option) => { const Icon = option.icon; const active = travelProfile.pace === option.value; return <button type="button" key={option.value} aria-pressed={active} className={active ? styles.dialActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, pace: option.value }))}><Icon aria-hidden="true" /><strong>{option.label}</strong><small>{option.detail}</small></button>; })}</div>
            <input className={styles.preferenceRange} style={rangeProgress(paceOptions.findIndex((option) => option.value === travelProfile.pace))} type="range" min="0" max="2" step="1" value={paceOptions.findIndex((option) => option.value === travelProfile.pace)} onChange={(event) => setTravelProfile((current) => ({ ...current, pace: paceOptions[Number(event.target.value)].value }))} aria-label="Trip pace" aria-valuetext={paceOptions.find((option) => option.value === travelProfile.pace)?.label} />
          </section>
          <section className={styles.preferenceChoices}>
            <div className={styles.preferenceHead}><h3>{profileCopy.interestsTitle}</h3><b>{travelProfile.usualInterests.length ? `${travelProfile.usualInterests.length} ${profileCopy.interestsSelected}` : profileCopy.interestsDetail}</b></div>
            <div role="group" aria-label={profileCopy.interestsTitle}>{tripInterestIds.map((interest) => { const Icon = interestIcons[interest]; const active = travelProfile.usualInterests.includes(interest); return <button type="button" key={interest} aria-pressed={active} className={active ? styles.choiceActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, usualInterests: active ? current.usualInterests.filter((item) => item !== interest) : [...current.usualInterests, interest] }))}><Icon aria-hidden="true" /><span>{tripInterestLabels[language][interest]}</span></button>; })}</div>
          </section>
          <section className={styles.preferenceMoves}>
            <div className={styles.preferenceHead}><h3>Hotel moves</h3><b>{moveOptions.find((option) => option.value === travelProfile.hotelMoves)?.label}</b></div>
            <div role="group" aria-label="Hotel move options">{moveOptions.map((option) => { const Icon = option.icon; const active = travelProfile.hotelMoves === option.value; return <button type="button" key={option.value} aria-pressed={active} className={active ? styles.moveActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, hotelMoves: option.value }))}><Icon aria-hidden="true" /><strong>{option.label}</strong><small>{option.detail}</small></button>; })}</div>
          </section>
          <section className={`${styles.preferenceDial} ${styles.comfortPreference}`}>
            <div className={styles.preferenceHead}><h3>Comfort level</h3><b>{comfortOptions.find((option) => option.value === travelProfile.budget)?.label}</b></div>
            <div className={styles.dialOptions} role="group" aria-label="Comfort level options">{comfortOptions.map((option) => { const Icon = option.icon; const active = travelProfile.budget === option.value; return <button type="button" key={option.value} aria-pressed={active} className={active ? styles.dialActive : ""} onClick={() => setTravelProfile((current) => ({ ...current, budget: option.value }))}><Icon aria-hidden="true" /><strong>{option.label}</strong></button>; })}</div>
            <input className={styles.preferenceRange} style={rangeProgress(comfortOptions.findIndex((option) => option.value === travelProfile.budget))} type="range" min="0" max="2" step="1" value={comfortOptions.findIndex((option) => option.value === travelProfile.budget)} onChange={(event) => setTravelProfile((current) => ({ ...current, budget: comfortOptions[Number(event.target.value)].value }))} aria-label="Comfort level" aria-valuetext={comfortOptions.find((option) => option.value === travelProfile.budget)?.label} />
          </section>
        </div>
        <section className={styles.readinessProfile}>
          <div>
            <p className={styles.eyebrow}>{profileCopy.beforeEyebrow}</p>
            <h3>{profileCopy.beforeTitle}</h3>
            <p>{profileCopy.beforeDetail}</p>
            <strong className={styles.privacyReassurance}>{profileCopy.privacyDetail}</strong>
          </div>
          <div className={styles.readinessFields}>
            <EasyTField label={profileCopy.nationalities} maxLength={412} value={nationalitiesInput} onChange={(event) => { const nextInput = event.target.value.split(",").slice(0, 4).map((country) => country.slice(0, 100)).join(","); setNationalitiesInput(nextInput); setTravelReadinessProfile((current) => ({ ...current, nationalities: nextInput.split(",").map((country) => country.trim()).filter(Boolean) })); }} placeholder={profileCopy.countryPlaceholder} />
            <EasyTField label={profileCopy.residence} maxLength={100} value={travelReadinessProfile.residenceCountry} onChange={(event) => setTravelReadinessProfile((current) => ({ ...current, residenceCountry: event.target.value }))} placeholder={profileCopy.countryPlaceholder} />
            <EasyTField label={profileCopy.passportExpiry} type="month" value={travelReadinessProfile.passportExpiryMonth} onChange={(event) => setTravelReadinessProfile((current) => ({ ...current, passportExpiryMonth: event.target.value }))} />
          </div>
        </section>
        <footer className={styles.travelProfileActions}>
          {travelMessage ? (
            <p
              className={`${styles.profileMessage} ${travelMessage.tone === "success" ? styles.profileMessageSuccess : styles.profileMessageError}`}
              role={travelMessage.tone === "error" ? "alert" : "status"}
            >
              {travelMessage.text}
            </p>
          ) : null}
          <EasyTButton className={styles.travelSave} type="button" loading={travelSaving} onClick={saveTravelProfile}>{profileCopy.saveTravel}</EasyTButton>
        </footer>
      </section>
    </div>
  );
}
