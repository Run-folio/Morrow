"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { initializeAnalytics, pageView, trackEvent } from "@/lib/analytics";

// Keep analytics opt-in per deployment. This prevents local/staging traffic from
// polluting production reporting and makes the launch configuration explicit.
const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
const CLARITY_PROJECT_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
const POSTHOG_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY && process.env.NEXT_PUBLIC_POSTHOG_HOST);
const IS_PRODUCTION = process.env.NODE_ENV === "production";
const SCROLL_DEPTHS = [50, 75, 90] as const;
const ANALYTICS_CONSENT_KEY = "easyt-analytics-consent";

function readAnalyticsConsent() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted";
}

export function Analytics() {
  const [hasConsent, setHasConsent] = useState(false);

  useEffect(() => {
    const updateConsent = () => setHasConsent(readAnalyticsConsent());
    updateConsent();
    window.addEventListener("easyt-analytics-consent-change", updateConsent);
    return () => window.removeEventListener("easyt-analytics-consent-change", updateConsent);
  }, []);

  const configuredForThisEnvironment = POSTHOG_CONFIGURED || (IS_PRODUCTION && Boolean(GA_MEASUREMENT_ID || CLARITY_PROJECT_ID));
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

      {IS_PRODUCTION && CLARITY_PROJECT_ID ? (
        <Script id="microsoft-clarity" strategy="afterInteractive">
          {`
            (function(c,l,a,r,i,t,y){
              c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
              t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
              y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
            })(window, document, "clarity", "script", "${CLARITY_PROJECT_ID}");
          `}
        </Script>
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
