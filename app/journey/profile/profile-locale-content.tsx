"use client";

import { useLayoutEffect, useState } from "react";

import ImportedBookings from "@/components/easyt/imported-bookings";
import {
  EASYT_LANGUAGE_CHANGE_EVENT,
  easytCopy,
  establishSessionLanguage,
  type EasyTLanguage,
} from "@/lib/easyt/i18n";
import type { TravelProfile } from "@/lib/easyt/travel-profile";
import type { TravelReadinessProfile } from "@/lib/easyt/travel-readiness";
import styles from "../account.module.css";
import ProfileForm from "./profile-form";

export default function ProfileLocaleContent({
  ownerId,
  name,
  email,
  accountLanguage,
  initialTravelProfile,
  initialTravelReadinessProfile,
}: {
  ownerId: string;
  name: string;
  email: string;
  accountLanguage: EasyTLanguage;
  initialTravelProfile: TravelProfile;
  initialTravelReadinessProfile: TravelReadinessProfile;
}) {
  const [language, setLanguage] = useState<EasyTLanguage>("en");

  useLayoutEffect(() => {
    const updateLanguage = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener(EASYT_LANGUAGE_CHANGE_EVENT, updateLanguage);
    setLanguage(establishSessionLanguage(accountLanguage));
    return () => window.removeEventListener(EASYT_LANGUAGE_CHANGE_EVENT, updateLanguage);
  }, [accountLanguage]);

  const copy = easytCopy[language].account;
  const profileIntro = language === "es"
    ? "Gestiona tus datos y las preferencias de viaje que Morrovia usa como punto de partida para nuevos viajes."
    : "Manage your details and the travel preferences Morrovia uses as a starting point for new trips.";

  return (
    <section className={styles.profileWrap}>
      <p className={styles.eyebrow}>{copy.settings}</p>
      <h1>{copy.profileTitle}</h1>
      <p className={styles.profileIntro}>{profileIntro}</p>
      <ProfileForm
        key={ownerId}
        ownerId={ownerId}
        name={name}
        email={email}
        language={language}
        initialTravelProfile={initialTravelProfile}
        initialTravelReadinessProfile={initialTravelReadinessProfile}
      />
      <ImportedBookings language={language} />
    </section>
  );
}
