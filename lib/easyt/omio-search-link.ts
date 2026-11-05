import { countryCodeFor } from './country-registry.ts';

const OMIO_SEARCH_LINK_ID = "626fa8a9-f982-43d0-ace9-9a13f6b14612";
export const OMIO_TRACKING_BASE = "https://omio.sjv.io/c/7643967/409973/7385";

export type OmioRouteSearchInput = {
  mode: string;
  originName: string;
  originCountry: string;
  destinationName: string;
  destinationCountry: string;
  departureDate: string | null | undefined;
  returnDate?: string;
  currency?: string;
  now?: Date;
};

export type OmioHandoffIssue = 'unverified-text-handoff' | 'departure-airport-required' | 'rail-date-outside-sales-window';

/** Observed text-handoff limitations, not route coverage or availability rules.
 * Evidence: docs/qa/2026-11-04-omio-handoff-limitations.md. Airport segments
 * supplied by the planner remain distinct from these city/station strings. */
export function omioHandoffIssue(input: OmioRouteSearchInput): OmioHandoffIssue | null {
  const normalized = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').trim().toLocaleLowerCase();
  const from = normalized(input.originName), to = normalized(input.destinationName);
  const fromCountry = countryCodeFor(input.originCountry), toCountry = countryCodeFor(input.destinationCountry);
  if (input.mode === 'flight') {
    if (fromCountry === 'JP' && ['matsumoto', 'matsumoto station'].includes(from)) return 'departure-airport-required';
    if (fromCountry === 'US' && from === 'honolulu' && toCountry === 'MX' && to === 'mexico city') return 'unverified-text-handoff';
  }
  if (input.mode === 'train' && fromCountry === 'CN' && from === 'zhangjiajie' && toCountry === 'HK' && to === 'hong kong') {
    const now = input.now ?? new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    // Beyond 15 calendar days is outside the ordinary sale window. Within it
    // is deliberately not treated as proof tickets are released or available.
    if (validOmioDepartureDate(input.departureDate, now) && Date.parse(`${input.departureDate}T00:00:00Z`) - today > 15 * 86400000) return 'rail-date-outside-sales-window';
  }
  return null;
}

export function validOmioDepartureDate(value: string | null | undefined, now: Date) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) return false;
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return parsed >= today;
}

/** Builds only train and flight search forms verified in Omio using the existing Impact tracking contract. */
export function buildOmioRouteSearchLink(input: OmioRouteSearchInput): string | null {
  if ((input.mode !== "flight" && input.mode !== "train") || !validOmioDepartureDate(input.departureDate, input.now ?? new Date())) return null;
  if (input.returnDate !== undefined && (input.mode !== "flight" || !validOmioDepartureDate(input.returnDate, input.now ?? new Date()) || input.returnDate <= input.departureDate!)) return null;
  const originName = input.originName.trim();
  const originCountry = input.originCountry.trim();
  const destinationName = input.destinationName.trim();
  const destinationCountry = input.destinationCountry.trim();
  if (!originName || !originCountry || !destinationName || !destinationCountry) return null;
  if (`${originName}, ${originCountry}`.toLocaleLowerCase() === `${destinationName}, ${destinationCountry}`.toLocaleLowerCase()) return null;
  const issue = omioHandoffIssue(input);
  if (issue === 'unverified-text-handoff' || issue === 'departure-airport-required') return null;

  const search = new URL(`https://www.omio.com/links/${OMIO_SEARCH_LINK_ID}`);
  search.searchParams.set("departurePosTerm", `${originName}, ${originCountry}`);
  search.searchParams.set("arrivalPosTerm", `${destinationName}, ${destinationCountry}`);
  search.searchParams.set("departureDate", input.departureDate!);
  if (input.returnDate !== undefined) search.searchParams.set("returnDate", input.returnDate);
  search.searchParams.set("travelMode", input.mode === "train" ? "TRAIN" : "FLIGHT");
  search.searchParams.set("locale", "en");
  const currency = input.currency?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) search.searchParams.set("currency", currency);

  const tracked = new URL(OMIO_TRACKING_BASE);
  tracked.searchParams.set("u", search.toString());
  return tracked.toString();
}
