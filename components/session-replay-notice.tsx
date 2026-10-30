"use client";

import { useEffect, useState } from "react";
import { EASYT_LANGUAGE_CHANGE_EVENT, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { sessionReplayPrivacyCopy } from "@/lib/analytics-replay-copy";

/** Uses the existing language preference; this is copy inside the cookie inventory. */
export default function SessionReplayNotice() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    const refresh = () => setLanguage(languageFromStorage());
    const updateLanguage = (event: Event) => {
      const language = (event as CustomEvent<EasyTLanguage>).detail;
      if (language === "en" || language === "es") setLanguage(language);
    };
    refresh();
    window.addEventListener(EASYT_LANGUAGE_CHANGE_EVENT, updateLanguage);
    return () => window.removeEventListener(EASYT_LANGUAGE_CHANGE_EVENT, updateLanguage);
  }, []);
  return <span lang={language}>{sessionReplayPrivacyCopy[language]}</span>;
}
