"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { languageFromStorage, type EasyTLanguage } from "@/lib/easyt/i18n";
import { morroviaLegalIdentity } from "@/lib/morrovia-legal-identity";
import MorroviaBrandLogo from "./morrovia-brand-logo";
import styles from "./morrovia-footer.module.css";

const copy = {
  en: {
    rights: "All rights reserved.",
    operatedBy: "Operated by",
    about: "About",
    help: "Help",
    contact: "Contact",
    affiliate: "Affiliate disclosure",
    terms: "Terms",
    privacy: "Privacy",
    cookies: "Cookie settings",
  },
  es: {
    rights: "Todos los derechos reservados.",
    operatedBy: "Operado por",
    about: "Acerca de",
    help: "Ayuda",
    contact: "Contacto",
    affiliate: "Divulgación de afiliados",
    terms: "Términos",
    privacy: "Privacidad",
    cookies: "Ajustes de cookies",
  },
} as const;

export default function MorroviaFooter({ overImage = false, omitOnImmersiveHome = false }: { overImage?: boolean; omitOnImmersiveHome?: boolean }) {
  const pathname = usePathname();
  const [language, setLanguage] = useState<EasyTLanguage>("en");

  useEffect(() => {
    const refresh = () => setLanguage(languageFromStorage());
    refresh();
    window.addEventListener("easyt-language-change", refresh);
    return () => window.removeEventListener("easyt-language-change", refresh);
  }, []);

  const text = copy[language];
  if (omitOnImmersiveHome && (pathname === "/" || pathname === "/journey/home")) return null;
  return <footer role="contentinfo" className={`${styles.footer} ${overImage ? styles.overImage : ""}`}>
    <Link className={styles.brand} href="/" aria-label={`${morroviaLegalIdentity.productName} home`}>
      <MorroviaBrandLogo variant={overImage ? "light" : "full"} decorative />
    </Link>
    <div className={styles.identity}>
      <p>© {morroviaLegalIdentity.copyrightYear} {morroviaLegalIdentity.productName}. {text.rights}</p>
      <p>{text.operatedBy} {morroviaLegalIdentity.legalOperator}</p>
    </div>
    <nav aria-label="Company and legal information">
      <Link href="/journey/about">{text.about}</Link>
      <Link href="/journey/help">{text.help}</Link>
      <Link href="/journey/contact">{text.contact}</Link>
      <Link href="/journey/affiliate-disclosure">{text.affiliate}</Link>
      <Link href="/journey/terms">{text.terms}</Link>
      <Link href="/journey/privacy">{text.privacy}</Link>
      <Link href="/journey/cookies#cookie-settings">{text.cookies}</Link>
    </nav>
  </footer>;
}
