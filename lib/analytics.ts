export type AnalyticsEventName =
  | "cv_download_clicked"
  | "email_contact_clicked"
  | "linkedin_clicked"
  | "case_study_opened"
  | "case_study_cta_clicked"
  | "journey_prototype_clicked"
  | "scroll_depth_reached"
  | "copy_email_clicked"
  | "book_call_clicked"
  | "easyt_trip_started"
  | "trip_intent_created"
  | "route_generated"
  | "route_accepted"
  | "trip_refined"
  | "health_check_shown"
  | "health_issue_resolved"
  | "trip_ready"
  | "affiliate_click"
  | "booking_attributed"
  | "trip_shared"
  | "collaborator_joined"
  | "decision_resolved"
  | "budget_viewed"
  | "accommodation_action_viewed"
  | "accommodation_map_opened"
  | "attraction_refinement_viewed"
  | "attraction_selected"
  | "attraction_removed"
  | "attraction_filter_used"
  | "attraction_map_opened"
  | "easyt_trip_capture_reviewed"
  | "easyt_trip_capture_place_resolved"
  | "easyt_trip_capture_place_unresolved"
  | "easyt_trip_capture_failed"
  | "easyt_featured_route_opened"
  | "easyt_finder_started"
  | "easyt_accommodation_inventory_viewed"
  | "easyt_accommodation_affiliate_clicked"
  | "easyt_readiness_affiliate_clicked"
  | "easyt_trip_quality_reviewed"
  | "easyt_stamps_opened"
  | "easyt_trip_saved"
  | "easyt_trip_exported"
  | "easyt_share_created"
  | "easyt_error_shown";

export type AnalyticsEventProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

const isBrowser = () => typeof window !== "undefined";
const ANALYTICS_CONSENT_KEY = "easyt-analytics-consent";

/** Optional analytics must not run, or leave analytics-only browser state, without consent. */
export function hasAnalyticsConsent() {
  if (!isBrowser()) return false;
  try {
    return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted";
  } catch {
    return false;
  }
}

function cleanProperties(properties: AnalyticsEventProperties = {}) {
  return Object.fromEntries(
    Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
}

export function getPagePath() {
  if (!isBrowser()) {
    return "";
  }

  return `${window.location.pathname}${window.location.search}`;
}

export function pageView(path = getPagePath()) {
  if (!hasAnalyticsConsent() || !window.gtag) {
    return;
  }

  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  if (!measurementId) {
    return;
  }

  window.gtag("config", measurementId, {
    page_path: path,
  });
}

export function trackEvent(eventName: AnalyticsEventName, properties: AnalyticsEventProperties = {}) {
  if (!hasAnalyticsConsent()) {
    return;
  }

  const payload = cleanProperties({
    page_path: getPagePath(),
    ...properties,
  });

  try {
    window.gtag?.("event", eventName, payload);

    // Clarity custom tags are intentionally light-touch: useful for session filtering,
    // while richer event metadata stays in GA4.
    window.clarity?.("set", "last_portfolio_event", eventName);
  } catch {
    // Analytics should never affect portfolio UX.
  }
}
