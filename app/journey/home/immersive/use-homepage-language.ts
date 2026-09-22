"use client";

import { useEffect, useState } from "react";
import { EASYT_LANGUAGE_CHANGE_EVENT, languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";

export function useHomepageLanguage() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    setLanguage(languageFromStorage());
    const change = (event: Event) => setLanguage((event as CustomEvent<EasyTLanguage>).detail);
    window.addEventListener(EASYT_LANGUAGE_CHANGE_EVENT, change);
    return () => window.removeEventListener(EASYT_LANGUAGE_CHANGE_EVENT, change);
  }, []);
  return language;
}
