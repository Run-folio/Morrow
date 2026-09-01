"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { initializeAnalytics, pageView, trackEvent } from "@/lib/analytics";
import { hasAnalyticsConsent, PRIVACY_CONSENT_CHANGE_EVENT } from "@/lib/privacy-consent";

// Keep analytics opt-in per deployment. This prevents local/staging traffic from
// polluting production reporting and makes the launch configuration explicit.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const POSTHOG_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SCROLL_DEPTHS = [50, 75, 90] as const;

export function Analytics() {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    const updateConsent = () => setHasConsent(hasAnalyticsConsent());
    updateConsent();
    window.addEventListener(PRIVACY_CONSENT_CHANGE_EVENT, updateConsent);
    return () => window.removeEventListener(PRIVACY_CONSENT_CHANGE_EVENT, updateConsent);
  }, []);

  const configuredForThisEnvironment = POSTHOG_CONFIGURED || (IS_PRODUCTION && Boolean(GA_MEASUREMENT_ID));
  if (!configuredForThisEnvironment || !hasConsent) {
    return null;
  }

  return (
    <>
      {IS_PRODUCTION && GA_MEASUREMENT_ID ? (
        <>
          <Script id="ga4-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('consent', 'default', { analytics_storage: 'granted', ad_storage: 'denied' });
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', { send_page_view: false });
            `}
          </Script>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
        </>
      ) : null}

      <RouteAnalytics />
    </>
  );
}

function RouteAnalytics() {
  const pathname = usePathname();
  const trackedDepthsRef = useRef(new Set<number>());
  const lastPageViewRef = useRef<string | null>(null);

  useEffect(() => initializeAnalytics(), []);

  useEffect(() => {
    if (lastPageViewRef.current === pathname) return;
    lastPageViewRef.current = pathname;
    let attempts = 0;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    function sendPageView() {
      if (window.gtag || !GA_MEASUREMENT_ID || !IS_PRODUCTION || attempts >= 10) {
        pageView(pathname);
        return;
      }

      attempts += 1;
      timeoutId = setTimeout(sendPageView, 300);
    }

    sendPageView();
    trackedDepthsRef.current = new Set();

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [pathname]);

  useEffect(() => {
    function handleScroll() {
      const scrollableHeight = document.documentElement.scrollHeight - window.innerHeight;

      if (scrollableHeight <= 0) {
        return;
      }

      const scrollPercentage = Math.round((window.scrollY / scrollableHeight) * 100);

      for (const depth of SCROLL_DEPTHS) {
        if (scrollPercentage >= depth && !trackedDepthsRef.current.has(depth)) {
          trackedDepthsRef.current.add(depth);
          trackEvent("scroll_depth_reached", { scroll_percentage: depth });
        }
      }
    }

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });

    return () => window.removeEventListener("scroll", handleScroll);
  }, [pathname]);

  return null;
}
