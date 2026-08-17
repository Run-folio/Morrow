"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./morrovia-footer.module.css";

const copy = {
  en: {
    copyright: "© 2026 Morrovia Ltd. All rights reserved.",
    about: "About",
    help: "Help",
    affiliate: "Affiliate disclosure",
    privacy: "Privacy",
    terms: "Terms",
    cookies: "Privacy & cookies",
  },
  es: {
    copyright: "© 2026 Morrovia Ltd. Todos los derechos reservados.",
    about: "Acerca de",
    help: "Ayuda",
    affiliate: "Divulgación de afiliados",
    privacy: "Privacidad",
    terms: "Términos",
    cookies: "Privacidad y cookies",
  },
} as const;

export default function MorroviaFooter() {
  const [language, setLanguage] = useState<EasyTLanguage>("en");

  useEffect(() => {
    const refresh = () => setLanguage(languageFromStorage());
    refresh();
    window.addEventListener("easyt-language-change", refresh);
    return () => window.removeEventListener("easyt-language-change", refresh);
  }, []);

  const text = copy[language];
  return <footer className={styles.footer}>
    <Link className={styles.brand} href="/journey/home" aria-label="Morrovia home">Morrovia</Link>
    <p>{text.copyright}</p>
    <nav aria-label="Company and legal information">
      <span>{text.about}</span>
      <span>{text.help}</span>
      <Link href="/journey/affiliate-disclosure">{text.affiliate}</Link>
      <Link href="/journey/privacy">{text.privacy}</Link>
      <span>{text.terms}</span>
      <Link href="/journey/privacy#analytics-settings">{text.cookies}</Link>
    </nav>
  </footer>;
}
