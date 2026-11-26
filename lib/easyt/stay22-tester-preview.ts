import { parsePrivacyConsent } from "../privacy-consent.ts";
import { buildStay22MapUrl, type Stay22MapInput, type Stay22MapView } from "./stay22-map-pilot.ts";

export const STAY22_TESTER_ORIGIN = "https://staging.morrovia.com";

export function isStay22TesterHost(configuredOrigin: string | undefined, requestOrigin: string) {
  return configuredOrigin === STAY22_TESTER_ORIGIN && requestOrigin === STAY22_TESTER_ORIGIN;
}

export function isStay22Tester(
  user: { id?: string; email?: string; emailVerified?: boolean } | null | undefined,
  testerEmail: string | undefined,
) {
  const approved = testerEmail?.trim().toLowerCase();
  return Boolean(approved && user?.id && user.emailVerified === true && user.email?.trim().toLowerCase() === approved);
}

// UI theme from --morrovia-action; provider accepts six hex digits without the hash.
const MAP_ACCENT = "3025ce";
const currencies = new Set<string>(typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : ["GBP", "EUR", "USD"]);

/** The provider view changes presentation only; the validated trip search remains the same. */
export function stay22TesterSearch(input: Omit<Stay22MapInput, "approved"> & { currency: string }, view: Stay22MapView, today = new Date().toISOString().slice(0, 10)) {
  if (!input.checkIn || input.checkIn < today) return null;
  const baseUrl = buildStay22MapUrl({ ...input, approved: true }, view);
  if (!baseUrl) return null;
  const url = new URL(baseUrl);
  url.searchParams.set("maincolor", MAP_ACCENT);
  // The tester browses in place; suppress only Stay22’s generic Allez redirect.
  url.searchParams.set("hideallezbutton", "true");
  if (currencies.has(input.currency)) url.searchParams.set("currency", input.currency);
  return url.href;
}

export function mayLoadStay22TesterMap(raw: string | null) {
  const { record } = parsePrivacyConsent(raw);
  return record?.analytics === true && record.affiliateTracking === true;
}
