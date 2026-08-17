"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ChevronDown,
  Languages,
  LogOut,
  Map,
  Plus,
  ShieldCheck,
  Stamp,
  UserRound,
  House,
  Compass,
  Menu,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearActiveTrip } from "@/lib/easyt/storage";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import EasyTProductTour from "@/components/easyt/easyt-product-tour";
import { easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./easyt-navigation.module.css";

type EasyTNavigationProps = {
  current?: "home" | "prototype" | "trips" | "stamped" | "new" | "login" | "profile" | "privacy" | "admin" | "passport";
  account?: { name?: string | null; email: string; language?: Language };
  landing?: boolean;
};

type Language = EasyTLanguage;

export default function EasyTNavigation({
  current,
  account,
}: EasyTNavigationProps) {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [language, setLanguage] = useState<Language>("en");
  const [isAdmin, setIsAdmin] = useState(false);
  const activeAccount =
    account ||
    (session?.user
      ? { name: session.user.name, email: session.user.email }
      : undefined);

  useEffect(() => {
    if (account?.language) {
      setLanguage(account.language);
      window.localStorage.setItem("easyt-language", account.language);
      document.documentElement.lang = account.language;
      return;
    }
    const saved = window.localStorage.getItem("easyt-language");
    if (saved === "en" || saved === "es") setLanguage(saved);
  }, [account?.language]);

  useEffect(() => {
    document.body.classList.add("easyt-mobile-shell");
    return () => document.body.classList.remove("easyt-mobile-shell");
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!activeAccount?.email) {
      setIsAdmin(false);
      return;
    }
    void fetch("/api/easyt/admin/access")
      .then((response) => response.ok ? response.json() : { isAdmin: false })
      .then((data: { isAdmin?: boolean }) => {
        if (!cancelled) setIsAdmin(Boolean(data.isAdmin));
      })
      .catch(() => {
        if (!cancelled) setIsAdmin(false);
      });
    return () => { cancelled = true; };
  }, [activeAccount?.email]);

  const changeLanguage = (next: Language) => {
    setLanguage(next);
    window.localStorage.setItem("easyt-language", next);
    document.documentElement.lang = next;
    window.dispatchEvent(new CustomEvent("easyt-language-change", { detail: next }));
    if (activeAccount) {
      void fetch("/api/easyt/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ language: next }),
      });
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    router.push("/journey/login");
    router.refresh();
  };

  const labels = easytCopy[language].nav;
  return (
    <>
      <header className={`${styles.header} ${styles.landingHeader}`} data-easyt-app>
      <Link
        className={styles.brand}
        href="/journey/home"
        aria-label="Morrovia home"
      >
        <span className={styles.brandName}>Morrovia</span>
      </Link>

      <nav className={styles.landingActions} aria-label="Morrovia navigation">
        <EasyTLinkButton
          className={styles.primaryLink}
          href="/journey/new"
          icon={Plus}
          size="small"
          onClick={() => clearActiveTrip()}
        >
          <span>{labels.newTrip}</span>
        </EasyTLinkButton>
        <Link href="/journey/home#how-it-works">{language === "es" ? "Cómo funciona" : "How it works"}</Link>
        <Link href="/journey/discover">{language === "es" ? "Rutas" : "Routes"}</Link>
        <Link href="/journey/stamped">{labels.stamped}</Link>
        <Link href="/journey/passport">{language === "es" ? "Información de pasaporte" : "Passport info"}</Link>
        <span className={styles.landingDivider} aria-hidden="true" />
        <span className={styles.landingTour}>
          <EasyTProductTour triggerLabel={labels.tour} />
        </span>
        {activeAccount ? <details className={styles.accountMenu}>
          <summary className={styles.landingMenuTrigger}>
            <span>{labels.account}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className={styles.accountPopover}>
            <div className={styles.accountIdentity}>
              <strong>{activeAccount.name || labels.account}</strong>
              <span>{activeAccount.email}</span>
            </div>
            <Link href="/journey/dashboard"><Map aria-hidden="true" /><span>{labels.trips}</span></Link>
            <Link href="/journey/prep"><ShieldCheck aria-hidden="true" /><span>{language === "es" ? "Preparativos" : "Travel prep"}</span></Link>
            <Link href="/journey/profile"><UserRound aria-hidden="true" /><span>{labels.profile}</span></Link>
            <Link className={current === "privacy" ? styles.submenuCurrent : undefined} href="/journey/privacy"><ShieldCheck aria-hidden="true" /><span>{labels.privacy}</span></Link>
            {isAdmin && <Link className={current === "admin" ? styles.submenuCurrent : undefined} href="/journey/admin"><ShieldCheck aria-hidden="true" /><span>Admin</span></Link>}
            <button type="button" onClick={signOut}><LogOut aria-hidden="true" /><span>{labels.signOut}</span></button>
          </div>
        </details> : <Link href="/journey/dashboard">{language === "es" ? "Iniciar sesión" : "Sign in"}</Link>}
        <label className={styles.landingLanguage}>
          <Languages aria-hidden="true" />
          <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)} aria-label={labels.language}>
            <option value="en">EN</option>
            <option value="es">ES</option>
          </select>
        </label>
        <details className={styles.compactMenu}>
          <summary aria-label={language === "es" ? "Abrir navegación" : "Open navigation"}>
            <Menu aria-hidden="true" />
            <span>{language === "es" ? "Menú" : "Menu"}</span>
          </summary>
          <div className={styles.compactPopover}>
            <Link href="/journey/new" onClick={() => clearActiveTrip()}><Plus aria-hidden="true" /><span>{labels.newTrip}</span></Link>
            <Link href="/journey/home#how-it-works"><span>{language === "es" ? "Cómo funciona" : "How it works"}</span></Link>
            <Link href="/journey/discover"><span>{language === "es" ? "Rutas" : "Routes"}</span></Link>
            <Link href="/journey/stamped"><Stamp aria-hidden="true" /><span>{labels.stamped}</span></Link>
            <Link href="/journey/passport"><ShieldCheck aria-hidden="true" /><span>{language === "es" ? "Información de pasaporte" : "Passport info"}</span></Link>
            <span className={styles.compactDivider} aria-hidden="true" />
            <span className={styles.compactTour}><EasyTProductTour triggerLabel={labels.tour} /></span>
            {activeAccount ? <>
              <Link href="/journey/dashboard"><Map aria-hidden="true" /><span>{labels.trips}</span></Link>
              <Link href="/journey/profile"><UserRound aria-hidden="true" /><span>{labels.profile}</span></Link>
              <button type="button" onClick={signOut}><LogOut aria-hidden="true" /><span>{labels.signOut}</span></button>
            </> : <Link href="/journey/dashboard"><UserRound aria-hidden="true" /><span>{language === "es" ? "Iniciar sesión" : "Sign in"}</span></Link>}
            <label className={styles.compactLanguage}>
              <Languages aria-hidden="true" />
              <span>{labels.language}</span>
              <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)} aria-label={labels.language}>
                <option value="en">EN</option>
                <option value="es">ES</option>
              </select>
            </label>
          </div>
        </details>
      </nav>
      </header>
      <nav className={styles.mobileDock} aria-label="EasyT mobile navigation">
          <Link
            className={current === "home" ? styles.dockCurrent : undefined}
            href="/journey/home"
          >
            <House aria-hidden="true" />
            <span>{labels.home}</span>
          </Link>
          <Link
            className={current === "trips" ? styles.dockCurrent : undefined}
            href="/journey/dashboard"
          >
            <Map aria-hidden="true" />
            <span>{labels.trips}</span>
          </Link>
          <Link className={styles.dockPrimary} href="/journey/new">
            <Plus aria-hidden="true" />
            <span>{labels.newTrip}</span>
          </Link>
          <Link
            className={current === "stamped" ? styles.dockCurrent : undefined}
            href="/journey/stamped"
          >
            <Stamp aria-hidden="true" />
            <span>{labels.stamped}</span>
          </Link>
          <Link
            className={current === "passport" ? styles.dockCurrent : undefined}
            href={activeAccount ? "/journey/profile" : "/journey/passport"}
          >
            {activeAccount ? <UserRound aria-hidden="true" /> : <Compass aria-hidden="true" />}
            <span>{activeAccount ? labels.account : (language === "es" ? "Pasaporte" : "Passport")}</span>
          </Link>
      </nav>
    </>
  );
}
