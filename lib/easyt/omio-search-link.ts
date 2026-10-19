const OMIO_SEARCH_LINK_ID = "626fa8a9-f982-43d0-ace9-9a13f6b14612";
export const OMIO_TRACKING_BASE = "https://omio.sjv.io/c/7643967/409973/7385";

export type OmioRouteSearchInput = {
  mode: string;
  originName: string;
  originCountry: string;
  destinationName: string;
  destinationCountry: string;
  departureDate: string | null | undefined;
  currency?: string;
  now?: Date;
};

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
  const originName = input.originName.trim();
  const originCountry = input.originCountry.trim();
  const destinationName = input.destinationName.trim();
  const destinationCountry = input.destinationCountry.trim();
  if (!originName || !originCountry || !destinationName || !destinationCountry) return null;
  if (`${originName}, ${originCountry}`.toLocaleLowerCase() === `${destinationName}, ${destinationCountry}`.toLocaleLowerCase()) return null;

  const search = new URL(`https://www.omio.com/links/${OMIO_SEARCH_LINK_ID}`);
  search.searchParams.set("departurePosTerm", `${originName}, ${originCountry}`);
  search.searchParams.set("arrivalPosTerm", `${destinationName}, ${destinationCountry}`);
  search.searchParams.set("departureDate", input.departureDate!);
  search.searchParams.set("travelMode", input.mode === "train" ? "TRAIN" : "FLIGHT");
  search.searchParams.set("locale", "en");
  const currency = input.currency?.toUpperCase();
  if (currency && /^[A-Z]{3}$/.test(currency)) search.searchParams.set("currency", currency);

  const tracked = new URL(OMIO_TRACKING_BASE);
  tracked.searchParams.set("u", search.toString());
  return tracked.toString();
}
