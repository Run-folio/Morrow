"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import styles from "./morrovia-footer.module.css";

const copy = {
  en: {
    rights: "All rights reserved.",
    operatedBy: "Operated by",
    about: "About",
    help: "Help",
    affiliate: "Affiliate disclosure",
    privacy: "Privacy",
    terms: "Terms",
    cookies: "Cookie settings",
  },
  es: {
    rights: "Todos los derechos reservados.",
    operatedBy: "Operado por",
    about: "Acerca de",
    help: "Ayuda",
    affiliate: "Divulgación de afiliados",
    privacy: "Privacidad",
    terms: "Términos",
    cookies: "Ajustes de cookies",
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
    <div className={styles.identity}>
      <p>© {morroviaLegalIdentity.copyrightYear} {morroviaLegalIdentity.productName}. {text.rights}</p>
      <p>{text.operatedBy} {morroviaLegalIdentity.legalOperator}</p>
    </div>
    <nav aria-label="Company and legal information">
      <Link href="/journey/about">{text.about}</Link>
      <Link href="/journey/help">{text.help}</Link>
      <Link href="/journey/affiliate-disclosure">{text.affiliate}</Link>
      <Link href="/journey/privacy">{text.privacy}</Link>
      <span>{text.terms}</span>
      <Link href="/journey/cookies#cookie-settings">{text.cookies}</Link>
    </nav>
  </footer>;
}
