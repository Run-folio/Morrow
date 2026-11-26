import { parsePrivacyConsent } from "../privacy-consent.ts";
import { buildStay22MapUrl } from "./stay22-map-pilot.ts";

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

export type Stay22TesterSample = { checkIn: string; checkOut: string; wideUrl: string; narrowUrl: string };

export function stay22TesterSample(affiliateId: string | undefined, now = new Date()): Stay22TesterSample | null {
  const date = (days: number) => new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
  const checkIn = date(30), checkOut = date(32);
  const sample = { approved: true, affiliateId, latitude: 35.0116, longitude: 135.7681, checkIn, checkOut, adults: 2 };
  const wideUrl = buildStay22MapUrl(sample, "all"), narrowUrl = buildStay22MapUrl(sample, "listview");
  return wideUrl && narrowUrl ? { checkIn, checkOut, wideUrl, narrowUrl } : null;
}

export function mayLoadStay22TesterMap(raw: string | null) {
  const { record } = parsePrivacyConsent(raw);
  return record?.analytics === true && record.affiliateTracking === true;
}
