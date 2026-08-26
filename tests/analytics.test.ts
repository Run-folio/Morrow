import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyAnalyticsSaveError,
  cleanAnalyticsProperties,
  normalizeCommercialOutboundClick,
  normalizeAnalyticsPath,
  sanitizeAnalyticsDestination,
  trackEvent,
  type LaunchAnalyticsEventMap,
} from "../lib/analytics.ts";

test("analytics paths omit query data and collapse opaque workspace IDs", () => {
  assert.equal(normalizeAnalyticsPath("/journey/home?brief=private"), "/journey/home");
  assert.equal(normalizeAnalyticsPath("/journey/trip-123/map?stay=stop-2"), "/journey/[tripId]/map");
  assert.equal(normalizeAnalyticsPath("/journey/dashboard#trips"), "/journey/dashboard");
});

test("analytics link destinations never retain query data or external paths", () => {
  assert.equal(sanitizeAnalyticsDestination("/journey/trip-123/map?token=private", "https://morrovia.com"), "/journey/[tripId]/map");
  assert.equal(sanitizeAnalyticsDestination("https://partner.example/book/private-reference?email=private", "https://morrovia.com"), "https://partner.example");
});

test("analytics payload cleaning removes empty values without changing safe coarse metadata", () => {
  assert.deepEqual(cleanAnalyticsProperties({
    stop_count: 4,
    has_dates: true,
    workspace_view: "map",
    optional: undefined,
    absent: null,
    empty: "",
  }), {
    stop_count: 4,
    has_dates: true,
    workspace_view: "map",
  });
});

test("save failures are reduced to machine-safe categories", () => {
  assert.equal(classifyAnalyticsSaveError(new TypeError("fetch failed")), "network");
  assert.equal(classifyAnalyticsSaveError(new Error("Authentication required")), "auth");
  assert.equal(classifyAnalyticsSaveError(Object.assign(new Error("Session ended"), { name: "EasyTTripAuthError" })), "auth");
  assert.equal(classifyAnalyticsSaveError(Object.assign(new Error("Cloud changed"), { name: "EasyTTripSaveConflictError" })), "conflict");
  assert.equal(classifyAnalyticsSaveError(new Error("Trip ownership mismatch")), "conflict");
  const promotionConflict = new Error("A newer cloud copy already exists.");
  promotionConflict.name = "EasyTTripPromotionConflictError";
  assert.equal(classifyAnalyticsSaveError(promotionConflict), "conflict");
  assert.equal(classifyAnalyticsSaveError(new Error("Cloud save failed")), "repository");
  assert.equal(classifyAnalyticsSaveError(new Error("Unexpected")), "unknown");
});

test("analytics is a safe no-op outside the browser and without configuration", () => {
  assert.doesNotThrow(() => trackEvent("trip_generated", {
    trip_source: "builder",
    stop_count: 3,
    duration_days: 10,
    traveller_count: 2,
    has_dates: true,
    save_state: "local",
    result: "usable",
  }));
});

function installAnalyticsWindow(consent: "granted" | "declined", calls: unknown[][]) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { pathname: "/journey/routes/andean-highlands", origin: "https://morrovia.com" },
      localStorage: { getItem: (key: string) => key === "easyt-analytics-consent" ? consent : null },
      gtag: (...args: unknown[]) => calls.push(args),
    },
  });
  return () => previous
    ? Object.defineProperty(globalThis, "window", previous)
    : Reflect.deleteProperty(globalThis, "window");
}

test("route_started emits only coarse public route metadata after consent", () => {
  const calls: unknown[][] = [];
  const restore = installAnalyticsWindow("granted", calls);
  try {
    trackEvent("route_started", { route_id: "andean-highlands", stop_count: 3, duration_days: 9, placement: "hero" });
    assert.equal(calls.length, 1);
    const [kind, name, payload] = calls[0] as [string, string, Record<string, unknown>];
    assert.equal(kind, "event");
    assert.equal(name, "route_started");
    assert.deepEqual(Object.keys(payload).sort(), ["duration_days", "environment", "page_path", "placement", "route_id", "stop_count"]);
    assert.equal(payload.page_path, "/journey/routes/andean-highlands");
  } finally {
    restore();
  }
});

test("route_started is a no-op without analytics consent", () => {
  const calls: unknown[][] = [];
  const restore = installAnalyticsWindow("declined", calls);
  try {
    trackEvent("route_started", { route_id: "andean-highlands", stop_count: 3, duration_days: 9, placement: "final" });
  } finally {
    restore();
  }
  assert.deepEqual(calls, []);
});

test("Viator affiliate clicks use the dedicated, privacy-safe event", () => {
  const calls: unknown[][] = [];
  const restore = installAnalyticsWindow("granted", calls);
  try {
    trackEvent("affiliate_link_clicked", {
      partner: "viator",
      placement: "trip_prep_booking_readiness",
      tripId: "trip-123",
      stopId: "stop-456",
    });
    const [kind, name, payload] = calls[0] as [string, string, Record<string, unknown>];
    assert.equal(kind, "event");
    assert.equal(name, "affiliate_link_clicked");
    assert.deepEqual(payload, {
      environment: "development",
      page_path: "/journey/routes/andean-highlands",
      partner: "viator",
      placement: "trip_prep_booking_readiness",
      stopId: "stop-456",
      tripId: "trip-123",
    });
  } finally {
    restore();
  }
});

test("Omio affiliate clicks carry placement and opaque trip-transfer identifiers only", () => {
  const calls: unknown[][] = [];
  const restore = installAnalyticsWindow("granted", calls);
  try {
    trackEvent("affiliate_link_clicked", {
      partner: "omio",
      placement: "itinerary_transfer",
      tripId: "trip-123",
      transferId: "leg-456",
      originStopId: "stop-1",
      destinationStopId: "stop-2",
    });
    const [kind, name, payload] = calls[0] as [string, string, Record<string, unknown>];
    assert.equal(kind, "event");
    assert.equal(name, "affiliate_link_clicked");
    assert.deepEqual(payload, {
      destinationStopId: "stop-2",
      environment: "development",
      originStopId: "stop-1",
      page_path: "/journey/routes/andean-highlands",
      partner: "omio",
      placement: "itinerary_transfer",
      transferId: "leg-456",
      tripId: "trip-123",
    });
  } finally {
    restore();
  }
});

test("commercial click reporting maps either established event to one stable KPI record", () => {
  const booking = normalizeCommercialOutboundClick("affiliate_click", {
    category: "accommodation", provider: "booking-demand", trip_id: "trip-123", stop_id: "stop-456",
    placement: "itinerary_accommodation", workspace_view: "itinerary",
  });
  const omio = normalizeCommercialOutboundClick("affiliate_link_clicked", {
    partner: "omio", placement: "itinerary_transfer", tripId: "trip-123", transferId: "leg-456",
    originStopId: "stop-1", destinationStopId: "stop-2",
  });
  assert.deepEqual(booking, {
    canonical_event: "commercial_outbound_click", source_event: "affiliate_click", partner: "booking_com",
    placement: "itinerary_accommodation", category: "accommodation", trip_id: "trip-123", stop_id: "stop-456", workspace_view: "itinerary",
  });
  assert.deepEqual(omio, {
    canonical_event: "commercial_outbound_click", source_event: "affiliate_link_clicked", partner: "omio",
    placement: "itinerary_transfer", category: "transport", trip_id: "trip-123", transfer_id: "leg-456",
  });
  assert.equal([booking, omio].filter(Boolean).length, 2, "each source click becomes one KPI record, never one per property");
  assert.equal(JSON.stringify(omio).includes("stop-1"), false, "origin/destination stop IDs are not part of the reporting contract");
});

test("commercial clicks remain consent-gated", () => {
  const calls: unknown[][] = [];
  const restore = installAnalyticsWindow("declined", calls);
  try {
    trackEvent("affiliate_click", { category: "connectivity", provider: "saily", placement: "home_footer" });
  } finally {
    restore();
  }
  assert.deepEqual(calls, []);
});

const privacySafeGeneration: LaunchAnalyticsEventMap["trip_generated"] = {
  trip_source: "homepage",
  stop_count: 4,
  traveller_count: 2,
  has_dates: true,
  save_state: "local",
  result: "usable",
};
assert.equal(privacySafeGeneration.stop_count, 4);

const privacySafeIntent: LaunchAnalyticsEventMap["trip_intent_created"] = {
  traveller_count: 2,
  stop_count: 3,
  duration_days: 10,
  dates_flexible: true,
  fixed_commitment_count: 0,
  avoid_driving: false,
};
assert.deepEqual(Object.keys(privacySafeIntent).sort(), [
  "avoid_driving", "dates_flexible", "duration_days", "fixed_commitment_count", "stop_count", "traveller_count",
]);

const privacySafeStampStatus: LaunchAnalyticsEventMap["stamp_status_changed"] = {
  previous_status: "want",
  next_status: "visited",
  source: "country_card",
  is_authenticated: true,
};
assert.deepEqual(Object.keys(privacySafeStampStatus).sort(), [
  "is_authenticated", "next_status", "previous_status", "source",
]);

const privacySafeStampNote: LaunchAnalyticsEventMap["stamp_note_added"] = {
  source: "country_card",
  is_authenticated: false,
};
assert.deepEqual(Object.keys(privacySafeStampNote).sort(), ["is_authenticated", "source"]);

const privacySafeRouteStart: LaunchAnalyticsEventMap["route_started"] = {
  route_id: "andean-highlands",
  stop_count: 3,
  duration_days: 9,
  placement: "hero",
};
assert.deepEqual(Object.keys(privacySafeRouteStart).sort(), ["duration_days", "placement", "route_id", "stop_count"]);

if (false) {
  // @ts-expect-error launch payloads deliberately reject raw prompt text
  trackEvent("trip_generated", { ...privacySafeGeneration, raw_prompt: "private trip text" });
  // @ts-expect-error intent payloads reject prompts, phrases and resolution details
  trackEvent("trip_intent_created", { ...privacySafeIntent, raw_prompt: "private trip text" });
  // @ts-expect-error stamp events deliberately reject country names and identifiers
  trackEvent("stamp_status_changed", { ...privacySafeStampStatus, country_name: "France" });
  // @ts-expect-error stamp-note events deliberately reject raw note or memory text
  trackEvent("stamp_note_added", { ...privacySafeStampNote, raw_note: "private memory text" });
  // @ts-expect-error public route starts reject prompts and personalised trip text
  trackEvent("route_started", { ...privacySafeRouteStart, raw_prompt: "private trip text" });
  // @ts-expect-error commercial events reject raw traveller prompts
  trackEvent("affiliate_click", { category: "accommodation", provider: "booking.com", raw_prompt: "private trip text" });
}
