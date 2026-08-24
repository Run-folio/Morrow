import posthog, { type CaptureResult, type Properties } from "posthog-js";

export type AnalyticsPrimitive = string | number | boolean | null | undefined;
export type AnalyticsEventProperties = Record<string, AnalyticsPrimitive>;

type TripSource = "homepage" | "dashboard" | "builder" | "route";
type SaveState = "local" | "cloud";
type WorkspaceView = "overview" | "itinerary" | "map" | "prep";
type RouteMode = "shell" | "focused";
type StampStatus = "unmarked" | "visited" | "want";
type StampStatusSource = "map" | "explorer" | "country_card";

export type LaunchAnalyticsEventMap = {
  route_started: { route_id: string; stop_count: number; duration_days: number; placement: "hero" | "final" };
  homepage_prompt_started: { source: "homepage"; input_method: "text" | "voice"; is_authenticated: boolean };
  trip_generation_started: { trip_source: TripSource; has_dates: boolean; traveller_count: number; is_authenticated: boolean };
  trip_intent_created: { traveller_count: number; stop_count: number; duration_days: number; dates_flexible: boolean; fixed_commitment_count: number; avoid_driving: boolean };
  route_generated: { stop_count: number; duration_days: number; has_recommendation: boolean; shortfall_days: number; has_fixed_commitments: boolean };
  route_accepted: { method: string; stop_count: number; duration_days: number; has_recommendation?: boolean };
  trip_refined: { change_type: string; affected_stop_count: number };
  health_check_shown: { blocking_count: number; caution_count: number; issue_count: number };
  health_issue_resolved: { rule: string };
  trip_ready: { stop_count: number; duration_days: number };
  trip_generated: { trip_source: TripSource; trip_id?: string; stop_count: number; duration_days?: number; traveller_count: number; has_dates: boolean; save_state: "local"; result: "usable" };
  trip_generation_failed: { trip_source: TripSource; error_type: "capture" | "network" | "invalid_result" | "unknown"; is_authenticated: boolean };
  trip_saved: { trip_source: TripSource; trip_id?: string; save_state: SaveState; stop_count?: number; is_authenticated: boolean };
  trip_save_failed: { trip_source: TripSource; trip_id?: string; save_state: SaveState; error_type: "auth" | "network" | "conflict" | "repository" | "unknown"; is_authenticated: boolean };
  trip_overview_viewed: { trip_id?: string; workspace_view: "overview"; route_mode: RouteMode; stop_count?: number };
  trip_itinerary_viewed: { trip_id?: string; workspace_view: "itinerary"; route_mode: RouteMode; stop_count?: number };
  trip_map_viewed: { trip_id?: string; workspace_view: "map"; route_mode: RouteMode; stop_count?: number };
  trip_prep_viewed: { trip_id?: string; workspace_view: "prep"; route_mode: RouteMode; stop_count?: number };
  affiliate_click: { category: string; provider: string; trip_id?: string; stop_id?: string; placement?: string; workspace_view?: WorkspaceView; destination_count?: number };
  trip_edit_started: { trip_id?: string; source: "dashboard" | "workspace" };
  trip_reopened: { trip_id?: string; source: "dashboard"; save_state: "cloud"; stop_count?: number };
  route_repair_applied: { trip_id?: string; repair_count: number; repair_category: string; had_hard_issue?: boolean; source: "map" };
  accommodation_search_started: { source: "map" | "itinerary" | "prep"; destination_count: number; has_dates: boolean; provider?: string };
  stamp_status_changed: { previous_status: StampStatus; next_status: StampStatus; source: StampStatusSource; is_authenticated: boolean };
  stamp_note_added: { source: "country_card"; is_authenticated: boolean };
};

export type LegacyAnalyticsEventName =
  | "cv_download_clicked" | "email_contact_clicked" | "linkedin_clicked" | "case_study_opened"
  | "case_study_cta_clicked" | "journey_prototype_clicked" | "scroll_depth_reached" | "copy_email_clicked"
  | "book_call_clicked" | "booking_attributed"
  | "trip_shared" | "collaborator_joined" | "decision_resolved" | "budget_viewed" | "accommodation_action_viewed"
  | "accommodation_map_opened" | "attraction_refinement_viewed" | "attraction_selected" | "attraction_removed"
  | "attraction_filter_used" | "attraction_map_opened" | "easyt_trip_capture_place_resolved"
  | "easyt_featured_route_opened" | "easyt_finder_started" | "easyt_trip_quality_reviewed"
  | "easyt_stamps_opened" | "easyt_trip_saved" | "easyt_trip_exported" | "easyt_share_created" | "easyt_error_shown";

export type AnalyticsEventName = keyof LaunchAnalyticsEventMap | LegacyAnalyticsEventName;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    clarity?: (...args: unknown[]) => void;
  }
}

const isBrowser = () => typeof window !== "undefined";
const ANALYTICS_CONSENT_KEY = "easyt-analytics-consent";
const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST;
const STATIC_JOURNEY_ROUTES = new Set([
  "admin", "affiliate-disclosure", "dashboard", "discover", "forgot-password", "gift", "home", "login",
  "new", "passport", "plan", "plan-next", "prep", "privacy", "profile", "reset-password", "routes", "stamped", "trip",
]);

let postHogInitialized = false;
let pendingAnalyticsUserId: string | null = null;

/** Optional analytics must not run, or leave analytics-only browser state, without consent. */
export function hasAnalyticsConsent() {
  if (!isBrowser()) return false;
  try { return window.localStorage.getItem(ANALYTICS_CONSENT_KEY) === "granted"; } catch { return false; }
}

export function analyticsEnvironment(): "production" | "preview" | "development" {
  const configured = process.env.NEXT_PUBLIC_ANALYTICS_ENVIRONMENT;
  if (configured === "production" || configured === "preview" || configured === "development") return configured;
  return process.env.NODE_ENV === "production" ? "production" : "development";
}

export function cleanAnalyticsProperties(properties: AnalyticsEventProperties = {}) {
  return Object.fromEntries(Object.entries(properties).filter(([, value]) => value !== undefined && value !== null && value !== ""));
}

export function classifyAnalyticsSaveError(error: unknown): "auth" | "network" | "conflict" | "repository" | "unknown" {
  if (error instanceof TypeError) return "network";
  if (error instanceof Error && error.name === "EasyTTripAuthError") return "auth";
  if (error instanceof Error && (error.name === "EasyTTripPromotionConflictError" || error.name === "EasyTTripSaveConflictError")) return "conflict";
  const message = error instanceof Error ? error.message.toLocaleLowerCase() : "";
  if (/auth|unauthor|sign.?in/.test(message)) return "auth";
  if (/conflict|ownership/.test(message)) return "conflict";
  if (/save|repository|database|persist/.test(message)) return "repository";
  return "unknown";
}

/** Remove query strings and collapse opaque shared-workspace trip IDs. */
export function normalizeAnalyticsPath(value: string) {
  const rawPath = value.split(/[?#]/, 1)[0] || "/";
  const segments = rawPath.split("/");
  if (segments[1] !== "journey" || !segments[2] || STATIC_JOURNEY_ROUTES.has(segments[2])) return rawPath;
  return ["", "journey", "[tripId]", ...segments.slice(3)].join("/");
}

/** Keep route shape for internal links and only the provider origin for external links. */
export function sanitizeAnalyticsDestination(value: string, currentOrigin = isBrowser() ? window.location.origin : "https://morrovia.invalid") {
  try {
    const url = new URL(value, currentOrigin);
    if (url.origin !== currentOrigin) return url.origin;
    return normalizeAnalyticsPath(url.pathname);
  } catch {
    return "";
  }
}

export function getPagePath() {
  return isBrowser() ? normalizeAnalyticsPath(window.location.pathname) : "";
}

function sanitizePostHogEvent(event: CaptureResult | null): CaptureResult | null {
  if (!event || !isBrowser()) return event;
  const properties: Properties = { ...event.properties };
  const pagePath = getPagePath();
  properties.page_path = pagePath;
  properties.$pathname = pagePath;
  properties.$current_url = `${window.location.origin}${pagePath}`;
  delete properties.$referrer;
  delete properties.$initial_referrer;
  delete properties.$initial_current_url;
  for (const [key, value] of Object.entries(properties)) {
    if (typeof value === "string" && /(destination_url|source_url|href)$/i.test(key)) {
      properties[key] = sanitizeAnalyticsDestination(value);
    }
  }
  return { ...event, properties };
}

function ensurePostHogInitialized() {
  if (!isBrowser() || postHogInitialized || !POSTHOG_KEY || !POSTHOG_HOST || !hasAnalyticsConsent()) return postHogInitialized;
  try {
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      autocapture: false,
      capture_pageview: false,
      capture_pageleave: false,
      disable_session_recording: true,
      disable_surveys: true,
      person_profiles: "identified_only",
      opt_out_capturing_by_default: true,
      opt_out_persistence_by_default: true,
      before_send: sanitizePostHogEvent,
    });
    posthog.opt_in_capturing({ captureEventName: false });
    postHogInitialized = true;
    if (pendingAnalyticsUserId) posthog.identify(pendingAnalyticsUserId);
    return true;
  } catch { return false; }
}

export function initializeAnalytics() { ensurePostHogInitialized(); }

export function updateAnalyticsConsent(value: "granted" | "declined") {
  if (!isBrowser()) return;
  try {
    if (value === "granted") {
      ensurePostHogInitialized();
      if (postHogInitialized) posthog.opt_in_capturing({ captureEventName: false });
    } else if (postHogInitialized) posthog.opt_out_capturing();
  } catch { /* Consent controls must remain usable if a vendor fails. */ }
}

export function identifyAnalyticsUser(userId: string) {
  const previousUserId = pendingAnalyticsUserId;
  pendingAnalyticsUserId = userId;
  if (!hasAnalyticsConsent() || !ensurePostHogInitialized()) return;
  try {
    if (previousUserId && previousUserId !== userId) {
      posthog.reset();
      posthog.opt_in_capturing({ captureEventName: false });
    }
    posthog.identify(userId);
  } catch { /* Identity analytics must never affect authentication. */ }
}

export function resetAnalyticsIdentity() {
  pendingAnalyticsUserId = null;
  if (!postHogInitialized) return;
  try {
    posthog.reset();
    if (hasAnalyticsConsent()) posthog.opt_in_capturing({ captureEventName: false });
  } catch { /* Logout must succeed even when analytics cannot reset. */ }
}

export function pageView(path = getPagePath()) {
  if (!hasAnalyticsConsent()) return;
  const normalizedPath = normalizeAnalyticsPath(path);
  try {
    const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
    if (measurementId) window.gtag?.("config", measurementId, { page_path: normalizedPath });
    if (ensurePostHogInitialized()) {
      posthog.capture("$pageview", {
        page_path: normalizedPath,
        $pathname: normalizedPath,
        $current_url: `${window.location.origin}${normalizedPath}`,
        environment: analyticsEnvironment(),
      });
    }
  } catch { /* Pageview failures must never affect navigation. */ }
}

export function trackEvent<EventName extends keyof LaunchAnalyticsEventMap>(eventName: EventName, properties: LaunchAnalyticsEventMap[EventName]): void;
export function trackEvent(eventName: LegacyAnalyticsEventName, properties?: AnalyticsEventProperties): void;
export function trackEvent(eventName: AnalyticsEventName, properties: AnalyticsEventProperties = {}) {
  if (!hasAnalyticsConsent()) return;
  const payload = cleanAnalyticsProperties({ page_path: getPagePath(), environment: analyticsEnvironment(), ...properties });
  try {
    window.gtag?.("event", eventName, payload);
    if (ensurePostHogInitialized()) posthog.capture(eventName, payload);
    window.clarity?.("set", "last_portfolio_event", eventName);
  } catch { /* Analytics should never affect Morrovia UX. */ }
}
