"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ChevronDown,
  Languages,
  LogOut,
  Map,
  Plus,
  ShieldCheck,
  Stamp,
  UserRound,
  House,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { clearActiveTrip } from "@/lib/easyt/storage";
import { EasyTLinkButton } from "@/components/easyt/easyt-controls";
import EasyTProductTour from "@/components/easyt/easyt-product-tour";
import { easytCopy, type EasyTLanguage } from "@/lib/easyt/i18n";
import styles from "./easyt-navigation.module.css";

type EasyTNavigationProps = {
  current?: "home" | "prototype" | "trips" | "stamped" | "new" | "login" | "profile" | "privacy" | "admin";
  account?: { name?: string | null; email: string; language?: Language };
  showBack?: boolean;
};

type Language = EasyTLanguage;

export default function EasyTNavigation({
  current,
  account,
  showBack = true,
}: EasyTNavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
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
  const accountLabel =
    activeAccount?.name?.trim() || activeAccount?.email || labels.account;

  return (
    <>
      <header className={styles.header} data-easyt-app>
      {!showBack || pathname === "/journey/home" ? (
        <span className={styles.portfolioSpacer} aria-hidden="true" />
      ) : (
        <button
          type="button"
          className={styles.portfolio}
          onClick={() => {
            if (window.history.length > 1) router.back();
            else router.push("/journey/dashboard");
          }}
          aria-label={labels.back}
        >
          <ArrowLeft aria-hidden="true" />
          <span>{labels.back}</span>
        </button>
      )}

      <Link
        className={styles.brand}
        href="/journey/home"
        aria-label="Morrovia home"
      >
        <img
          className={styles.brandMark}
          src="/brand/morrow-route-wordmark.svg"
          alt=""
        />
        <span className={styles.brandName}>MORROVIA</span>
      </Link>

      <nav className={styles.actions} aria-label="Morrovia navigation">
        {current !== "new" ? (
          <EasyTLinkButton
            className={styles.primaryLink}
            href="/journey/new"
            icon={Plus}
            size="small"
            onClick={() => clearActiveTrip()}
          >
            <span>{labels.newTrip}</span>
          </EasyTLinkButton>
        ) : null}
        <EasyTLinkButton
          className={`${styles.quietLink} ${styles.tripsLink} ${current === "trips" ? styles.current : ""}`}
          href="/journey/dashboard"
          size="small"
          variant="secondary"
        >
          <span>{labels.trips}</span>
        </EasyTLinkButton>
        <EasyTLinkButton
          className={`${styles.quietLink} ${current === "stamped" ? styles.current : ""}`}
          href="/journey/stamped"
          size="small"
          variant="secondary"
        >
          <Stamp aria-hidden="true" />
          <span>{labels.stamped}</span>
        </EasyTLinkButton>
        <EasyTProductTour triggerLabel={labels.tour} />
        {activeAccount ? (
          <details className={styles.accountMenu}>
            <summary
              className={`${styles.accountTrigger} ${current === "profile" ? styles.current : ""}`}
            >
              <span className={styles.avatar}>
                {accountLabel.slice(0, 1).toUpperCase()}
              </span>
              <span className={styles.accountName}>{accountLabel}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <div className={styles.accountPopover}>
              <div className={styles.accountIdentity}>
                <strong>{activeAccount.name || labels.account}</strong>
                <span>{activeAccount.email}</span>
              </div>
              <Link href="/journey/profile">
                <UserRound aria-hidden="true" />
                <span>{labels.profile}</span>
              </Link>
              <Link
                className={current === "stamped" ? styles.submenuCurrent : undefined}
                href="/journey/stamped"
              >
                <Stamp aria-hidden="true" />
                <span>{labels.stamped}</span>
              </Link>
              <Link
                className={current === "prototype" ? styles.submenuCurrent : undefined}
                href="/journey"
              >
                <Map aria-hidden="true" />
                <span>{labels.prototype}</span>
              </Link>
              <Link
                className={current === "privacy" ? styles.submenuCurrent : undefined}
                href="/journey/privacy"
              >
                <ShieldCheck aria-hidden="true" />
                <span>{labels.privacy}</span>
              </Link>
              {isAdmin && <Link
                className={current === "admin" ? styles.submenuCurrent : undefined}
                href="/journey/admin"
              >
                <ShieldCheck aria-hidden="true" />
                <span>Admin</span>
              </Link>}
              <label className={styles.languageControl}>
                <Languages aria-hidden="true" />
                <span>{labels.language}</span>
                <select
                  value={language}
                  onChange={(event) =>
                    changeLanguage(event.target.value as Language)
                  }
                  aria-label={labels.language}
                >
                  <option value="en">English</option>
                  <option value="es">Español</option>
                </select>
              </label>
              <button type="button" onClick={signOut}>
                <LogOut aria-hidden="true" />
                <span>{labels.signOut}</span>
              </button>
            </div>
          </details>
        ) : current !== "login" ? (
          <Link
            className={styles.accountTrigger}
            href="/journey/dashboard"
            aria-label={labels.account}
          >
            <UserRound aria-hidden="true" />
            <span className={styles.accountName}>{labels.account}</span>
          </Link>
        ) : null}
      </nav>
      </header>
      {current !== "prototype" ? (
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
            className={current === "profile" ? styles.dockCurrent : undefined}
            href={activeAccount ? "/journey/profile" : "/journey/dashboard"}
          >
            <UserRound aria-hidden="true" />
            <span>{labels.account}</span>
          </Link>
        </nav>
      ) : null}
    </>
  );
}
