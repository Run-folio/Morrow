"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  ChevronDown,
  CircleHelp,
  Compass,
  Info,
  Languages,
  LogOut,
  Map,
  Menu,
  Plus,
  ShieldCheck,
  Stamp,
  UserRound,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { identifyAnalyticsUser, resetAnalyticsIdentity } from "@/lib/analytics";
import { beginNewTripNavigation, forgetRememberedOwner, rememberLastOwner } from "@/lib/easyt/storage";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import MorroviaBrandLogo from "@/components/morrovia-brand-logo";
import EasyTProductTour from "@/components/easyt/easyt-product-tour";
import { easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./easyt-navigation.module.css";

type EasyTNavigationProps = {
  current?: "home" | "prototype" | "trips" | "stamped" | "new" | "login" | "profile" | "privacy" | "admin" | "passport" | "routes" | "about" | "help";
  account?: { id?: string; name?: string | null; email: string; language?: Language };
  storageOwnerId?: string | null;
  landing?: boolean;
  logoTone?: "dark" | "light";
  /** Keep deferred destination bundles out of an immersive landing page’s first load. */
  deferPrefetch?: boolean;
};

type Language = EasyTLanguage;

export default function EasyTNavigation({
  current,
  account,
  storageOwnerId,
  logoTone = "dark",
  deferPrefetch = false,
}: EasyTNavigationProps) {
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [language, setLanguage] = useState<Language>("en");
  const [isAdmin, setIsAdmin] = useState(false);
  const [signOutBusy, setSignOutBusy] = useState(false);
  const accountMenuRef = useRef<HTMLDetailsElement>(null);
  const compactMenuRef = useRef<HTMLDetailsElement>(null);
  const activeAccount = sessionPending
    ? account
    : session?.user
      ? { id: session.user.id, name: session.user.name, email: session.user.email }
      : undefined;

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
    const menus = [accountMenuRef, compactMenuRef];
    const closeMenus = (except?: HTMLDetailsElement | null) => {
      for (const menu of menus) {
        if (menu.current && menu.current !== except) menu.current.open = false;
      }
    };
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (menus.some((menu) => menu.current?.contains(target))) return;
      closeMenus();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      const openMenu = menus.find((menu) => menu.current?.open)?.current;
      if (!openMenu) return;
      openMenu.open = false;
      openMenu.querySelector<HTMLElement>("summary")?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  useEffect(() => {
    if (activeAccount?.id) {
      identifyAnalyticsUser(activeAccount.id);
      rememberLastOwner(activeAccount.id);
    }
  }, [activeAccount?.id]);

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
    // Remove the offline address hint before the session is cleared so a cold
    // signed-out shell cannot reopen the previous account's local documents.
    setSignOutBusy(true);
    forgetRememberedOwner();
    try {
      await authClient.signOut();
      resetAnalyticsIdentity();
    } finally {
      setSignOutBusy(false);
      window.location.assign("/journey/login");
    }
  };

  const beginNewTrip = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    const preserved = beginNewTripNavigation(activeAccount?.id ?? storageOwnerId ?? null, window);
    event.preventDefault();
    if (!preserved) {
      return;
    }
    // New trip is a document boundary even when this link is clicked from an
    // already-queryless builder. A hard navigation guarantees fresh client
    // state, and the public service-worker shell still supports it offline.
    window.location.assign("/journey/new");
  };

  const labels = easytCopy[language].nav;
  const howItWorksLabel = language === "es" ? "Cómo funciona" : "How it works";
  const moreLabel = language === "es" ? "Más" : "More";
  const routesLabel = language === "es" ? "Rutas" : "Routes";
  const myTripsLabel = language === "es" ? "Mis viajes" : "My Trips";
  const aboutLabel = language === "es" ? "Acerca de" : "About";
  const passportLabel = language === "es" ? "Información de pasaporte" : "Passport info";
  const helpLabel = language === "es" ? "Ayuda" : "Help";
  const signInLabel = language === "es" ? "Iniciar sesión" : "Sign in";
  const secondaryCurrent = current === "stamped" || current === "passport" || current === "about" || current === "help";
  return (
    <>
      <header className={`${styles.header} ${styles.landingHeader}`} data-easyt-app>
      <Link prefetch={deferPrefetch ? false : undefined}
        className={styles.brand}
        href="/"
        aria-label="Morrovia home"
      >
        <MorroviaBrandLogo variant={logoTone === "light" ? "light" : "full"} size="navigation" decorative priority={current !== "home"} />
      </Link>

      <nav className={styles.landingActions} aria-label="Morrovia navigation">
        <EasyTLinkButton
          prefetch={deferPrefetch ? false : undefined}
          href="/journey/new"
          icon={Plus}
          size="small"
          aria-current={current === "new" ? "page" : undefined}
          onClick={beginNewTrip}
        >
          <span>{labels.newTrip}</span>
        </EasyTLinkButton>
        <Link prefetch={deferPrefetch ? false : undefined} className={styles.landingTextLink} href="/journey/discover" aria-current={current === "routes" ? "page" : undefined}>{routesLabel}</Link>
        <Link prefetch={deferPrefetch ? false : undefined} className={styles.landingTextLink} href="/journey/dashboard" aria-current={current === "trips" ? "page" : undefined}>{myTripsLabel}</Link>
        <span className={styles.landingDivider} aria-hidden="true" />
        <span className={styles.landingTour}>
          <EasyTProductTour triggerLabel={howItWorksLabel} dispatchOpen />
        </span>
        <details ref={accountMenuRef} className={styles.accountMenu} onToggle={(event) => {
          if (event.currentTarget.open) {
            compactMenuRef.current && (compactMenuRef.current.open = false);
          }
        }}>
          <summary aria-label={labels.account} className={`${styles.landingMenuTrigger} ${secondaryCurrent || current === "profile" || current === "privacy" || current === "admin" ? styles.menuCurrent : ""}`}>
            <span>{labels.account}</span>
            <ChevronDown aria-hidden="true" />
          </summary>
          <div className={styles.accountPopover}>
            {activeAccount ? <div className={styles.accountIdentity}>
              <strong>{activeAccount.name || labels.account}</strong>
              <span>{activeAccount.email}</span>
            </div> : null}
            {activeAccount ? <Link prefetch={deferPrefetch ? false : undefined} className={current === "profile" ? styles.submenuCurrent : undefined} href="/journey/profile" aria-current={current === "profile" ? "page" : undefined}><UserRound aria-hidden="true" /><span>{labels.profile}</span></Link> : null}
            <Link prefetch={deferPrefetch ? false : undefined} className={current === "stamped" ? styles.submenuCurrent : undefined} href="/journey/stamped" aria-current={current === "stamped" ? "page" : undefined}><Stamp aria-hidden="true" /><span>{labels.stamped}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} className={current === "passport" ? styles.submenuCurrent : undefined} href="/journey/passport" aria-current={current === "passport" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>{passportLabel}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} className={current === "about" ? styles.submenuCurrent : undefined} href="/journey/about" aria-current={current === "about" ? "page" : undefined}><Info aria-hidden="true" /><span>{aboutLabel}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} className={current === "help" ? styles.submenuCurrent : undefined} href="/journey/help" aria-current={current === "help" ? "page" : undefined}><CircleHelp aria-hidden="true" /><span>{helpLabel}</span></Link>
            {activeAccount ? <>
              <Link prefetch={deferPrefetch ? false : undefined} className={current === "privacy" ? styles.submenuCurrent : undefined} href="/journey/privacy" aria-current={current === "privacy" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>{labels.privacy}</span></Link>
              {isAdmin && <Link prefetch={deferPrefetch ? false : undefined} className={current === "admin" ? styles.submenuCurrent : undefined} href="/journey/admin" aria-current={current === "admin" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>Admin</span></Link>}
              <button type="button" onClick={signOut} disabled={signOutBusy}><LogOut aria-hidden="true" /><span>{labels.signOut}</span></button>
            </> : <Link prefetch={deferPrefetch ? false : undefined} href="/journey/dashboard"><UserRound aria-hidden="true" /><span>{signInLabel}</span></Link>}
          </div>
        </details>
        <label className={styles.landingLanguage}>
          <Languages aria-hidden="true" />
          <select value={language} onChange={(event) => changeLanguage(event.target.value as Language)} aria-label={labels.language}>
            <option value="en">EN</option>
            <option value="es">ES</option>
          </select>
        </label>
        <details ref={compactMenuRef} className={styles.compactMenu} onToggle={(event) => {
          if (event.currentTarget.open) {
            accountMenuRef.current && (accountMenuRef.current.open = false);
          }
        }}>
          <summary aria-label={language === "es" ? "Abrir navegación" : "Open navigation"}>
            <Menu aria-hidden="true" />
            <span>{language === "es" ? "Menú" : "Menu"}</span>
          </summary>
          <div className={styles.compactPopover}>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/new" aria-current={current === "new" ? "page" : undefined} onClick={beginNewTrip}><Plus aria-hidden="true" /><span>{labels.newTrip}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/dashboard" aria-current={current === "trips" ? "page" : undefined}><Map aria-hidden="true" /><span>{labels.trips}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/discover" aria-current={current === "routes" ? "page" : undefined}><Compass aria-hidden="true" /><span>{routesLabel}</span></Link>
            <span className={styles.compactDivider} aria-hidden="true" />
            <span className={styles.compactSectionLabel}>{moreLabel}</span>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/stamped" aria-current={current === "stamped" ? "page" : undefined}><Stamp aria-hidden="true" /><span>{labels.stamped}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/passport" aria-current={current === "passport" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>{passportLabel}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/about" aria-current={current === "about" ? "page" : undefined}><Info aria-hidden="true" /><span>{aboutLabel}</span></Link>
            <Link prefetch={deferPrefetch ? false : undefined} href="/journey/help" aria-current={current === "help" ? "page" : undefined}><CircleHelp aria-hidden="true" /><span>{helpLabel}</span></Link>
            <span className={styles.compactTour}><EasyTProductTour triggerLabel={howItWorksLabel} dispatchOpen /></span>
            <span className={styles.compactDivider} aria-hidden="true" />
            <span className={styles.compactSectionLabel}>{labels.account}</span>
            {activeAccount ? <>
              <Link prefetch={deferPrefetch ? false : undefined} href="/journey/profile" aria-current={current === "profile" ? "page" : undefined}><UserRound aria-hidden="true" /><span>{labels.profile}</span></Link>
              <Link prefetch={deferPrefetch ? false : undefined} href="/journey/privacy" aria-current={current === "privacy" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>{labels.privacy}</span></Link>
              {isAdmin && <Link prefetch={deferPrefetch ? false : undefined} href="/journey/admin" aria-current={current === "admin" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>Admin</span></Link>}
              <button type="button" onClick={signOut} disabled={signOutBusy}><LogOut aria-hidden="true" /><span>{labels.signOut}</span></button>
            </> : <Link prefetch={deferPrefetch ? false : undefined} href="/journey/dashboard"><UserRound aria-hidden="true" /><span>{signInLabel}</span></Link>}
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
      <EasyTProductTour showTrigger={false} listenForOpen />
    </>
  );
}
