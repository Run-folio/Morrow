"use client";

import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";

export function useHomepageLanguage() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");
  useEffect(() => {
    setLanguage(languageFromStorage());
    const change = () => setLanguage(languageFromStorage());
    window.addEventListener("easyt-language-change", change);
    return () => window.removeEventListener("easyt-language-change", change);
  }, []);
  return language;
}

