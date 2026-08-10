"use client";

import Image from "next/image";
import Link from "next/link";
import { ChevronDown, Menu, X } from "lucide-react";
import { useState } from "react";
import { trackEvent } from "@/lib/analytics";
import { caseStudies } from "@/lib/case-studies";

const primaryLinks = [
  { label: "Home", href: "/" },
  { label: "About", href: "/#about" },
  { label: "Beyond Design", href: "/more-about-me" },
  { label: "Contact", href: "/#contact" },
];

const journeyPrototype = {
  label: "EasyT",
  detail: "Travel companion prototype",
  href: "/journey",
};

export function SiteNavigation() {
  const [menuOpen, setMenuOpen] = useState(false);

  function closeMenu() {
    setMenuOpen(false);
  }

  function handleCaseStudyClick(slug: string, title: string, ctaLabel: string) {
    trackEvent("case_study_cta_clicked", {
      case_study_slug: slug,
      case_study_title: title,
      cta_label: ctaLabel,
    });
  }

  function handleJourneyPrototypeClick(location: string) {
    trackEvent("journey_prototype_clicked", {
      cta_label: journeyPrototype.label,
      location,
    });
  }

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-white text-ink dark:border-white/10 dark:bg-[#0d0d0c] dark:text-[#f4f3ef]">
      <a
        href="#main"
        className="sr-only focus-visible:not-sr-only focus-visible:absolute focus-visible:left-4 focus-visible:top-4 focus-visible:rounded-full focus-visible:bg-white focus-visible:px-4 focus-visible:py-2 focus-visible:text-ink focus-visible:ring-2 focus-visible:ring-signal"
      >
        Skip to main content
      </a>
      <nav aria-label="Main navigation" className="grid h-[92px] grid-cols-[1fr_auto] items-center gap-4 px-6 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-16">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-4 rounded-full pr-2 leading-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#0d0d0c]"
          aria-label="Shaun Whiting home"
          onClick={closeMenu}
        >
          <span className="grid h-12 w-12 place-items-center text-ink dark:text-[#f4f3ef] sm:h-14 sm:w-14">
            <Image src="/sw-mark.svg" alt="" width={54} height={54} priority />
          </span>
          <span className="hidden min-w-0 translate-y-[1px] font-mono text-[clamp(1.3rem,1.85vw,2rem)] font-[500] uppercase leading-none tracking-[0.06em] sm:block">
            Shaun Whiting
          </span>
        </Link>

        <div className="hidden items-center justify-center gap-10 text-[clamp(1rem,1.05vw,1.25rem)] font-[330] tracking-[-0.015em] text-ink dark:text-white lg:flex">
          {primaryLinks.slice(0, 2).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2 py-2 transition duration-200 hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#0d0d0c]"
            >
              {item.label}
            </Link>
          ))}
          <div className="group relative">
            <Link
              href="/#work"
              className="inline-flex items-center gap-1 rounded-full px-2 py-2 transition duration-200 hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#0d0d0c]"
            >
              Work <ChevronDown size={16} strokeWidth={1.8} aria-hidden="true" />
            </Link>
            <div className="invisible absolute left-1/2 top-full w-[340px] -translate-x-1/2 pt-5 opacity-0 transition duration-200 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="rounded-2xl border border-black/10 bg-white p-3 shadow-[0_18px_60px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#151514]">
                {caseStudies.map((study) => {
                  const primaryIndustry = study.slug === "rio" ? "AI Workflows | Energy" : study.industry.split("/")[0]?.trim() ?? study.industry;

                  return (
                    <Link
                      key={study.slug}
                      href={`/case-study/${study.slug}`}
                      onClick={() => handleCaseStudyClick(study.slug, study.shortTitle ?? study.title, "Work dropdown")}
                      className="block rounded-xl px-4 py-3 transition duration-200 hover:bg-mist hover:text-signal dark:hover:bg-white/10"
                    >
                      <span className="block text-sm font-[540] tracking-[-0.01em]">{study.shortTitle ?? study.title}</span>
                      <span className="mt-1 block font-mono text-[0.64rem] uppercase tracking-[0.14em] text-black/46 dark:text-white/46">
                        {primaryIndustry}
                      </span>
                    </Link>
                  );
                })}
                <Link
                  href={journeyPrototype.href}
                  onClick={() => handleJourneyPrototypeClick("Work dropdown")}
                  className="block rounded-xl px-4 py-3 transition duration-200 hover:bg-mist hover:text-signal dark:hover:bg-white/10"
                >
                  <span className="block text-sm font-[540] tracking-[-0.01em]">{journeyPrototype.label}</span>
                  <span className="mt-1 block font-mono text-[0.64rem] uppercase tracking-[0.14em] text-black/46 dark:text-white/46">
                    {journeyPrototype.detail}
                  </span>
                </Link>
              </div>
            </div>
          </div>
          {primaryLinks.slice(2).map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-full px-2 py-2 transition duration-200 hover:text-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:focus-visible:ring-offset-[#0d0d0c]"
            >
              {item.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center justify-end gap-3 sm:gap-5">
          <Link
            href="/resume.pdf"
            onClick={() =>
              trackEvent("cv_download_clicked", {
                cta_label: "Resume",
                destination_url: "/resume.pdf",
                location: "desktop_navigation",
              })
            }
            className="hidden min-h-11 items-center justify-center rounded-full border border-ink bg-white px-5 text-[15px] font-[480] tracking-[-0.01em] text-ink transition duration-200 hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white dark:bg-transparent dark:text-white dark:hover:bg-white/10 sm:inline-flex"
          >
            Resume
          </Link>
          <a
            href="mailto:sw@shaunwhiting.com"
            onClick={() =>
              trackEvent("email_contact_clicked", {
                cta_label: "Contact",
                destination_url: "mailto:sw@shaunwhiting.com",
                location: "desktop_navigation",
              })
            }
            className="hidden min-h-11 items-center justify-center rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:bg-white dark:text-ink dark:hover:bg-mist dark:focus-visible:ring-offset-[#0d0d0c] sm:inline-flex"
          >
            Contact
          </a>
          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-ink text-ink transition duration-200 hover:bg-mist focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-signal focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white dark:text-white dark:hover:bg-white/10 lg:hidden"
            aria-label={menuOpen ? "Close menu" : "Open menu"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            {menuOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </nav>

      {menuOpen ? (
        <div className="border-t border-hairline bg-white px-6 py-5 shadow-[0_18px_60px_rgba(0,0,0,0.08)] dark:border-white/10 dark:bg-[#0d0d0c] lg:hidden">
          <div className="grid gap-2">
            {primaryLinks.slice(0, 2).map((item) => (
              <MobileLink key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </MobileLink>
            ))}
            <MobileLink href="/#work" onClick={closeMenu}>
              Work
            </MobileLink>
            <div className="grid gap-1 border-l border-black/10 pl-4 dark:border-white/10">
              {caseStudies.map((study) => (
                <MobileLink
                  key={study.slug}
                  href={`/case-study/${study.slug}`}
                  onClick={() => {
                    handleCaseStudyClick(study.slug, study.shortTitle ?? study.title, "Mobile work menu");
                    closeMenu();
                  }}
                  small
                >
                  {study.shortTitle ?? study.title}
                </MobileLink>
              ))}
              <MobileLink
                href={journeyPrototype.href}
                onClick={() => {
                  handleJourneyPrototypeClick("Mobile work menu");
                  closeMenu();
                }}
                small
              >
                {journeyPrototype.label} <span className="font-mono text-[0.62rem] uppercase tracking-[0.12em] text-black/46 dark:text-white/46">· {journeyPrototype.detail}</span>
              </MobileLink>
            </div>
            {primaryLinks.slice(2).map((item) => (
              <MobileLink key={item.href} href={item.href} onClick={closeMenu}>
                {item.label}
              </MobileLink>
            ))}
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link
                href="/resume.pdf"
                onClick={() => {
                  trackEvent("cv_download_clicked", {
                    cta_label: "Resume",
                    destination_url: "/resume.pdf",
                    location: "mobile_navigation",
                  });
                  closeMenu();
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-ink transition duration-200 hover:bg-mist dark:border-white dark:text-white dark:hover:bg-white/10"
              >
                Resume
              </Link>
              <a
                href="mailto:sw@shaunwhiting.com"
                onClick={() => {
                  trackEvent("email_contact_clicked", {
                    cta_label: "Contact",
                    destination_url: "mailto:sw@shaunwhiting.com",
                    location: "mobile_navigation",
                  });
                  closeMenu();
                }}
                className="inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-5 text-[15px] font-[480] tracking-[-0.01em] text-white transition duration-200 hover:bg-signal dark:bg-white dark:text-ink"
              >
                Contact
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MobileLink({
  href,
  children,
  onClick,
  small = false,
}: {
  href: string;
  children: React.ReactNode;
  onClick: () => void;
  small?: boolean;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`rounded-xl px-3 py-3 tracking-[-0.01em] transition duration-200 hover:bg-mist hover:text-signal dark:hover:bg-white/10 ${
        small ? "text-base font-[420]" : "text-xl font-[430]"
      }`}
    >
      {children}
    </Link>
  );
}
